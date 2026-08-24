import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { onCall, HttpsError } from 'firebase-functions/v2/https'

initializeApp()

const adminAuth = getAuth()
const adminDb = getFirestore()

async function requireSuperAdmin(uid: string) {
  const snapshot = await adminDb.collection('users').doc(uid).get()
  const data = snapshot.data()
  if (!snapshot.exists || data?.role !== 'parthone_super_admin' || data?.isActive === false) {
    throw new HttpsError('permission-denied', 'Parthone Super Admin access required.')
  }
}

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

  if (!bootstrapEmail || !bootstrapSecret) throw new HttpsError('failed-precondition', 'Bootstrap environment is not configured.')
  if (email !== bootstrapEmail || secret !== bootstrapSecret) throw new HttpsError('permission-denied', 'Bootstrap credentials are invalid.')
  if (!fullName || password.length < 8) throw new HttpsError('invalid-argument', 'Name and an 8+ character password are required.')

  const existing = await adminDb.collection('users').where('role', '==', 'parthone_super_admin').limit(1).get()
  if (!existing.empty) throw new HttpsError('already-exists', 'A Parthone Super Admin already exists.')

  let user
  try {
    user = await adminAuth.getUserByEmail(email)
    await adminAuth.updateUser(user.uid, { password, displayName: fullName, disabled: false })
  } catch {
    user = await adminAuth.createUser({ email, password, displayName: fullName, emailVerified: true })
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

export const onboardClient = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.')
  await requireSuperAdmin(request.auth.uid)

  const companyName = String(request.data?.companyName ?? '').trim()
  const slug = String(request.data?.slug ?? '').trim().toLowerCase()
  const companyEmail = String(request.data?.companyEmail ?? '').trim().toLowerCase()
  const phone = String(request.data?.phone ?? '').trim()
  const address = String(request.data?.address ?? '').trim()
  const gstNumber = String(request.data?.gstNumber ?? '').trim().toUpperCase()
  const customDomain = String(request.data?.customDomain ?? '').trim().toLowerCase()
  const planName = String(request.data?.planName ?? 'standard').trim() || 'standard'
  const logoUrl = String(request.data?.logoUrl ?? '').trim()
  const primaryColor = String(request.data?.primaryColor ?? '#2563eb').trim()
  const secondaryColor = String(request.data?.secondaryColor ?? '#0f243f').trim()
  const adminName = String(request.data?.adminName ?? '').trim()
  const adminEmail = String(request.data?.adminEmail ?? '').trim().toLowerCase()
  const adminPassword = String(request.data?.adminPassword ?? '')
  const userLimitRaw = Number(request.data?.userLimit ?? 0)
  const userLimit = Number.isFinite(userLimitRaw) && userLimitRaw > 0 ? userLimitRaw : null

  if (!companyName || !slug || !adminName || !adminEmail || !adminPassword) throw new HttpsError('invalid-argument', 'Company, slug and first admin details are required.')
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new HttpsError('invalid-argument', 'Slug may contain lowercase letters, numbers and hyphens only.')
  if (adminPassword.length < 8) throw new HttpsError('invalid-argument', 'Admin password must be at least 8 characters.')

  const slugMatch = await adminDb.collection('tenants').where('slug', '==', slug).limit(1).get()
  if (!slugMatch.empty) throw new HttpsError('already-exists', 'This company slug is already in use.')

  if (customDomain) {
    const domainMatch = await adminDb.collection('tenants').where('customDomain', '==', customDomain).limit(1).get()
    if (!domainMatch.empty) throw new HttpsError('already-exists', 'This custom domain is already assigned.')
  }

  try {
    await adminAuth.getUserByEmail(adminEmail)
    throw new HttpsError('already-exists', 'This admin email already has an account.')
  } catch (error: any) {
    if (error instanceof HttpsError) throw error
    if (error?.code !== 'auth/user-not-found') throw error
  }

  const tenantRef = adminDb.collection('tenants').doc()
  let createdUser: Awaited<ReturnType<typeof adminAuth.createUser>> | null = null

  try {
    createdUser = await adminAuth.createUser({ email: adminEmail, password: adminPassword, displayName: adminName, emailVerified: true, disabled: false })

    const publicBranding = {
      tenantId: tenantRef.id,
      companyName,
      slug,
      customDomain: customDomain || null,
      logoUrl: logoUrl || null,
      primaryColor: primaryColor || '#2563eb',
      secondaryColor: secondaryColor || '#0f243f',
      email: companyEmail || null,
      phone: phone || null,
      address: address || null,
      gstNumber: gstNumber || null,
      updatedAt: FieldValue.serverTimestamp(),
    }

    const batch = adminDb.batch()
    batch.set(tenantRef, {
      name: companyName,
      slug,
      status: 'active',
      email: companyEmail || null,
      phone: phone || null,
      address: address || null,
      gstNumber: gstNumber || null,
      customDomain: customDomain || null,
      planName,
      planStatus: 'active',
      userLimit,
      storageLimitMb: null,
      branding: { logoUrl: logoUrl || null, primaryColor: primaryColor || '#2563eb', secondaryColor: secondaryColor || '#0f243f' },
      onboardingStatus: 'ready',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    batch.set(adminDb.collection('publicTenantBranding').doc(tenantRef.id), publicBranding)
    batch.set(adminDb.collection('users').doc(createdUser.uid), {
      tenantId: tenantRef.id,
      fullName: adminName,
      email: adminEmail,
      role: 'client_admin',
      isActive: true,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    batch.set(adminDb.collection('platform').doc('onboarding').collection('events').doc(), {
      tenantId: tenantRef.id,
      tenantName: companyName,
      firstAdminId: createdUser.uid,
      firstAdminEmail: adminEmail,
      createdBy: request.auth.uid,
      createdAt: FieldValue.serverTimestamp(),
    })

    await batch.commit()
    return { success: true, tenantId: tenantRef.id, companyName, admin: { uid: createdUser.uid, fullName: adminName, email: adminEmail } }
  } catch (error) {
    if (createdUser) {
      try { await adminAuth.deleteUser(createdUser.uid) } catch { /* best-effort rollback */ }
    }
    if (error instanceof HttpsError) throw error
    console.error('onboardClient failed', error)
    throw new HttpsError('internal', 'Unable to onboard client.')
  }
})
