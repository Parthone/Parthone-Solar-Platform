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

async function requireClientAdmin(uid: string) {
  const snapshot = await adminDb.collection('users').doc(uid).get()
  const data = snapshot.data()
  if (!snapshot.exists || data?.role !== 'client_admin' || data?.isActive === false || !data?.tenantId) {
    throw new HttpsError('permission-denied', 'Client Admin access required.')
  }
  const tenant = await adminDb.collection('tenants').doc(data.tenantId).get()
  const tenantData = tenant.data()
  if (!tenant.exists || tenantData?.status !== 'active' || tenantData?.planStatus === 'inactive') {
    throw new HttpsError('failed-precondition', 'Company access is not active.')
  }
  return { tenantId: String(data.tenantId), tenantData: tenantData ?? {}, userData: data }
}

function employeeRole(value: unknown): 'client_admin' | 'employee' {
  return value === 'client_admin' ? 'client_admin' : 'employee'
}

async function writeAudit(input: {
  tenantId: string
  userId: string | null
  userName: string | null
  module: string
  action: string
  previousValue?: string | null
  newValue?: string | null
}) {
  await adminDb.collection('auditLogs').add({
    tenantId: input.tenantId,
    userId: input.userId,
    userName: input.userName,
    module: input.module,
    action: input.action,
    previousValue: input.previousValue ?? null,
    newValue: input.newValue ?? null,
    createdAt: FieldValue.serverTimestamp(),
  })
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

export const createClientUser = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.')
  const { tenantId, tenantData, userData } = await requireClientAdmin(request.auth.uid)

  const fullName = String(request.data?.fullName ?? '').trim()
  const email = String(request.data?.email ?? '').trim().toLowerCase()
  const password = String(request.data?.password ?? '')
  const mobile = String(request.data?.mobile ?? '').trim()
  const designation = String(request.data?.designation ?? '').trim()
  const role = employeeRole(request.data?.role)

  if (!fullName || !email || password.length < 8) throw new HttpsError('invalid-argument', 'Name, email and an 8+ character password are required.')

  const userLimit = Number(tenantData?.userLimit ?? 0)
  if (Number.isFinite(userLimit) && userLimit > 0) {
    const existingUsers = await adminDb.collection('users').where('tenantId', '==', tenantId).get()
    if (existingUsers.size >= userLimit) throw new HttpsError('resource-exhausted', `User limit reached (${userLimit}).`)
  }

  try {
    await adminAuth.getUserByEmail(email)
    throw new HttpsError('already-exists', 'This email already has an account.')
  } catch (error: any) {
    if (error instanceof HttpsError) throw error
    if (error?.code !== 'auth/user-not-found') throw error
  }

  let createdUser: Awaited<ReturnType<typeof adminAuth.createUser>> | null = null
  try {
    createdUser = await adminAuth.createUser({ email, password, displayName: fullName, disabled: false })
    await adminDb.collection('users').doc(createdUser.uid).set({
      tenantId,
      fullName,
      email,
      mobile: mobile || null,
      designation: designation || null,
      role,
      isActive: true,
      createdBy: request.auth.uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    await writeAudit({ tenantId, userId: request.auth.uid, userName: String(userData.fullName ?? 'Client Admin'), module: 'Users', action: 'Create User', newValue: `${fullName} · ${role}` })
    return { success: true, uid: createdUser.uid }
  } catch (error) {
    if (createdUser) {
      try { await adminAuth.deleteUser(createdUser.uid) } catch { /* best-effort rollback */ }
    }
    if (error instanceof HttpsError) throw error
    console.error('createClientUser failed', error)
    throw new HttpsError('internal', 'Unable to create employee.')
  }
})

export const updateClientUser = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.')
  const { tenantId, userData } = await requireClientAdmin(request.auth.uid)
  const uid = String(request.data?.uid ?? '').trim()
  if (!uid) throw new HttpsError('invalid-argument', 'User ID is required.')

  const targetRef = adminDb.collection('users').doc(uid)
  const targetSnapshot = await targetRef.get()
  const target = targetSnapshot.data()
  if (!targetSnapshot.exists || target?.tenantId !== tenantId || target?.role === 'parthone_super_admin') {
    throw new HttpsError('not-found', 'Employee not found in your company.')
  }

  const fullName = String(request.data?.fullName ?? target.fullName ?? '').trim()
  const mobile = String(request.data?.mobile ?? '').trim()
  const designation = String(request.data?.designation ?? '').trim()
  const role = employeeRole(request.data?.role ?? target.role)
  const isActive = request.data?.isActive !== false

  if (!fullName) throw new HttpsError('invalid-argument', 'Full name is required.')
  if (uid === request.auth.uid && (!isActive || role !== 'client_admin')) {
    throw new HttpsError('failed-precondition', 'You cannot deactivate or remove your own Client Admin role here.')
  }

  if (target.role === 'client_admin' && (!isActive || role !== 'client_admin')) {
    const admins = await adminDb.collection('users')
      .where('tenantId', '==', tenantId)
      .where('role', '==', 'client_admin')
      .where('isActive', '==', true)
      .get()
    if (admins.docs.filter((row) => row.id !== uid).length === 0) {
      throw new HttpsError('failed-precondition', 'At least one active Client Admin must remain.')
    }
  }

  await Promise.all([
    adminAuth.updateUser(uid, { displayName: fullName, disabled: !isActive }),
    targetRef.update({
      fullName,
      mobile: mobile || null,
      designation: designation || null,
      role,
      isActive,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: request.auth.uid,
    }),
  ])

  await writeAudit({ tenantId, userId: request.auth.uid, userName: String(userData.fullName ?? 'Client Admin'), module: 'Users', action: 'Update User', previousValue: `${target.fullName ?? ''} · ${target.role ?? ''} · ${target.isActive === false ? 'Inactive' : 'Active'}`, newValue: `${fullName} · ${role} · ${isActive ? 'Active' : 'Inactive'}` })
  return { success: true }
})

export const resetClientUserPassword = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.')
  const { tenantId, userData } = await requireClientAdmin(request.auth.uid)
  const uid = String(request.data?.uid ?? '').trim()
  const password = String(request.data?.password ?? '')
  if (!uid || password.length < 8) throw new HttpsError('invalid-argument', 'User and an 8+ character password are required.')

  const target = await adminDb.collection('users').doc(uid).get()
  const data = target.data()
  if (!target.exists || data?.tenantId !== tenantId || data?.role === 'parthone_super_admin') {
    throw new HttpsError('not-found', 'Employee not found in your company.')
  }

  await adminAuth.updateUser(uid, { password })
  await target.ref.update({ passwordResetAt: FieldValue.serverTimestamp(), passwordResetBy: request.auth.uid, updatedAt: FieldValue.serverTimestamp() })
  await writeAudit({ tenantId, userId: request.auth.uid, userName: String(userData.fullName ?? 'Client Admin'), module: 'Users', action: 'Reset Password', newValue: String(data.fullName ?? data.email ?? uid) })
  return { success: true }
})

export const saveExternalLink = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.')
  const { tenantId, userData } = await requireClientAdmin(request.auth.uid)
  const id = String(request.data?.id ?? '').trim()
  const name = String(request.data?.name ?? '').trim()
  const category = String(request.data?.category ?? 'General').trim() || 'General'
  const url = String(request.data?.url ?? '').trim()
  const isActive = request.data?.isActive !== false
  if (!name || !/^https?:\/\//i.test(url)) throw new HttpsError('invalid-argument', 'Name and a valid http(s) URL are required.')

  const ref = id ? adminDb.collection('externalLinks').doc(id) : adminDb.collection('externalLinks').doc()
  const previous = id ? await ref.get() : null
  if (previous && previous.exists && previous.data()?.tenantId !== tenantId) throw new HttpsError('permission-denied', 'Link does not belong to your company.')

  await ref.set({
    tenantId,
    name,
    category,
    url,
    isActive,
    createdBy: previous?.data()?.createdBy ?? request.auth.uid,
    createdAt: previous?.data()?.createdAt ?? FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: request.auth.uid,
  }, { merge: true })

  await writeAudit({
    tenantId,
    userId: request.auth.uid,
    userName: String(userData.fullName ?? 'Client Admin'),
    module: 'External Links',
    action: id ? 'Update Link' : 'Create Link',
    previousValue: previous?.exists ? `${previous.data()?.name ?? ''} · ${previous.data()?.url ?? ''}` : null,
    newValue: `${name} · ${url} · ${isActive ? 'Active' : 'Inactive'}`,
  })
  return { success: true, id: ref.id }
})

export const deleteExternalLink = onCall(async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in required.')
  const { tenantId, userData } = await requireClientAdmin(request.auth.uid)
  const id = String(request.data?.id ?? '').trim()
  if (!id) throw new HttpsError('invalid-argument', 'Link ID is required.')
  const ref = adminDb.collection('externalLinks').doc(id)
  const snapshot = await ref.get()
  const data = snapshot.data()
  if (!snapshot.exists || data?.tenantId !== tenantId) throw new HttpsError('not-found', 'Link not found in your company.')
  await ref.delete()
  await writeAudit({ tenantId, userId: request.auth.uid, userName: String(userData.fullName ?? 'Client Admin'), module: 'External Links', action: 'Delete Link', previousValue: `${data?.name ?? ''} · ${data?.url ?? ''}` })
  return { success: true }
})
