import { supabase } from './supabase'
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
  const { data: auth } = await supabase.auth.getUser()
  const user = auth.user
  if (!user) return null

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id,tenant_id,full_name,role,is_active,tenants(name,slug,status,plan_status)')
    .eq('id', user.id)
    .maybeSingle()

  if (error || !profile || !profile.is_active) return null

  const tenant = Array.isArray(profile.tenants) ? profile.tenants[0] : profile.tenants

  return {
    userId: user.id,
    email: user.email ?? null,
    fullName: profile.full_name,
    role: profile.role,
    tenantId: profile.tenant_id,
    tenantName: tenant?.name ?? null,
    tenantSlug: tenant?.slug ?? null,
    tenantStatus: tenant?.status ?? null,
    planStatus: tenant?.plan_status ?? null,
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
