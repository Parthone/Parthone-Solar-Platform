import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from './firebase'
import type { PlatformRole } from './tenant'

export type AuthContext = {
  userId: string
  email: string | null
  fullName: string | null
  role: PlatformRole
  userActive: boolean
  tenantId: string | null
  tenantName: string | null
  tenantSlug: string | null
  tenantStatus: 'active' | 'suspended' | 'inactive' | null
  planStatus: 'active' | 'inactive' | null
}

export type ClientAccessState =
  | 'allowed'
  | 'super_admin'
  | 'user_inactive'
  | 'tenant_missing'
  | 'tenant_suspended'
  | 'tenant_inactive'
  | 'plan_inactive'

export async function getAuthContext(): Promise<AuthContext | null> {
  const user = auth.currentUser
  if (!user) return null

  const userSnapshot = await getDoc(doc(db, 'users', user.uid))
  if (!userSnapshot.exists()) return null

  const profile = userSnapshot.data()
  let tenantName: string | null = null
  let tenantSlug: string | null = null
  let tenantStatus: AuthContext['tenantStatus'] = null
  let planStatus: AuthContext['planStatus'] = null

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
    userActive: profile.isActive !== false,
    tenantId: profile.tenantId ?? null,
    tenantName,
    tenantSlug,
    tenantStatus,
    planStatus,
  }
}

export function getClientAccessState(context: AuthContext): ClientAccessState {
  if (context.role === 'parthone_super_admin') return 'super_admin'
  if (!context.userActive) return 'user_inactive'
  if (!context.tenantId || !context.tenantStatus) return 'tenant_missing'
  if (context.tenantStatus === 'suspended') return 'tenant_suspended'
  if (context.tenantStatus === 'inactive') return 'tenant_inactive'
  if (context.planStatus === 'inactive') return 'plan_inactive'
  return 'allowed'
}

export function canAccessClientApp(context: AuthContext) {
  return getClientAccessState(context) === 'allowed'
}

export function isClientAdmin(context: AuthContext) {
  return context.role === 'client_admin'
}

export function isEmployee(context: AuthContext) {
  return context.role === 'employee'
}
