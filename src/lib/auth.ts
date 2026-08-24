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
  tenantEmail: string | null
  tenantPhone: string | null
  tenantAddress: string | null
  tenantGstNumber: string | null
  customDomain: string | null
  logoUrl: string | null
  primaryColor: string
  secondaryColor: string
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
  let tenantEmail: string | null = null
  let tenantPhone: string | null = null
  let tenantAddress: string | null = null
  let tenantGstNumber: string | null = null
  let customDomain: string | null = null
  let logoUrl: string | null = null
  let primaryColor = '#1769d2'
  let secondaryColor = '#0f243f'

  if (profile.tenantId) {
    const tenantSnapshot = await getDoc(doc(db, 'tenants', profile.tenantId))
    if (tenantSnapshot.exists()) {
      const tenant = tenantSnapshot.data()
      tenantName = tenant.name ?? null
      tenantSlug = tenant.slug ?? null
      tenantStatus = tenant.status ?? null
      planStatus = tenant.planStatus ?? null
      tenantEmail = tenant.email ?? null
      tenantPhone = tenant.phone ?? null
      tenantAddress = tenant.address ?? null
      tenantGstNumber = tenant.gstNumber ?? null
      customDomain = tenant.customDomain ?? null
      logoUrl = tenant.branding?.logoUrl ?? null
      primaryColor = tenant.branding?.primaryColor ?? '#1769d2'
      secondaryColor = tenant.branding?.secondaryColor ?? '#0f243f'
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
    tenantEmail,
    tenantPhone,
    tenantAddress,
    tenantGstNumber,
    customDomain,
    logoUrl,
    primaryColor,
    secondaryColor,
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
