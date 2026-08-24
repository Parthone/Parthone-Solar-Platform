import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { onCall, HttpsError } from 'firebase-functions/v2/https'

initializeApp()

const adminAuth = getAuth()
const adminDb = getFirestore()

export const platformHealth = onCall((request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.')
  return { ok: true, uid: request.auth.uid }
})

export const bootstrapSuperAdmin = onCall(async (request) => {
  const bootstrapEmail = process.env.PARTHONE_SUPER_ADMIN_EMAIL?.trim().toLowerCase()
  const bootstrapSecret = process.env.PARTHONE_BOOTSTRAP_SECRET
  const email = String(request.data?.email ?? '').trim().toLowerCase()
  const password = String(request.data?.password ?? '')
  const fullName = String(request.data?.fullName ?? '').trim()
  const secret = String(request.data?.secret ?? '')

  if (!bootstrapEmail || !bootstrapSecret) {
    throw new HttpsError('failed-precondition', 'Bootstrap environment is not configured.')
  }
  if (email !== bootstrapEmail || secret !== bootstrapSecret) {
    throw new HttpsError('permission-denied', 'Bootstrap credentials are invalid.')
  }
  if (!fullName || password.length < 8) {
    throw new HttpsError('invalid-argument', 'Name and an 8+ character password are required.')
  }

  const existing = await adminDb.collection('users').where('role', '==', 'parthone_super_admin').limit(1).get()
  if (!existing.empty) {
    throw new HttpsError('already-exists', 'A Parthone Super Admin already exists.')
  }

  let user
  try {
    user = await adminAuth.getUserByEmail(email)
    await adminAuth.updateUser(user.uid, { password, displayName: fullName, disabled: false })
  } catch {
    user = await adminAuth.createUser({
      email,
      password,
      displayName: fullName,
      emailVerified: true,
    })
  }

  await adminDb.collection('users').doc(user.uid).set({
    tenantId: null,
    fullName,
    email,
    role: 'parthone_super_admin',
    isActive: true,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true })

  return { success: true, uid: user.uid, email }
})
