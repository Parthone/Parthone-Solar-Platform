import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from './firebase'
import type { PlatformRole } from './tenant'

export type AuthContext = {
  userId: string
  email: string | null
  fullName: string | null
  role: PlatformRole
  tenantId: string | null
  tenantName: string | null
  tenantSlug: string | null
  tenantStatus: 'active' | 'suspended' | 'inactive' | null
  planStatus: string | null
}

export async function getAuthContext(): Promise<AuthContext | null> {
  const user = auth.currentUser
  if (!user) return null

  const userSnapshot = await getDoc(doc(db, 'users', user.uid))
  if (!userSnapshot.exists()) return null

  const profile = userSnapshot.data()
  if (profile.isActive === false) return null

  let tenantName: string | null = null
  let tenantSlug: string | null = null
  let tenantStatus: AuthContext['tenantStatus'] = null
  let planStatus: string | null = null

  if (profile.tenantId) {
    const tenantSnapshot = await getDoc(doc(db, 'tenants', profile.tenantId))
    if (tenantSnapshot.exists()) {
      const tenant = tenantSnapshot.data()
      tenantName = tenant.name ?? null
      tenantSlug = tenant.slug ?? null
      tenantStatus = tenant.status ?? null
      planStatus = tenant.planStatus ?? null
    }
  }

  return {
    userId: user.uid,
    email: user.email,
    fullName: profile.fullName ?? null,
    role: profile.role as PlatformRole,
    tenantId: profile.tenantId ?? null,
    tenantName,
    tenantSlug,
    tenantStatus,
    planStatus,
  }
}

export function canAccessClientApp(context: AuthContext) {
  if (context.role === 'parthone_super_admin') return true
  return context.tenantStatus === 'active' && context.planStatus !== 'inactive' && Boolean(context.tenantId)
}

export function isClientAdmin(context: AuthContext) {
  return context.role === 'client_admin'
}

export function isEmployee(context: AuthContext) {
  return context.role === 'employee'
}
