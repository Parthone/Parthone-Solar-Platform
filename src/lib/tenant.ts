export type PlatformRole =
  | 'parthone_super_admin'
  | 'client_admin'
  | 'employee'

export interface TenantContext {
  tenantId: string | null
  role: PlatformRole
}

export function isSuperAdmin(context: TenantContext) {
  return context.role === 'parthone_super_admin'
}

export function requireTenant(context: TenantContext) {
  if (isSuperAdmin(context)) return null
  if (!context.tenantId) {
    throw new Error('Authenticated client user is missing a tenant assignment.')
  }
  return context.tenantId
}

export function assertSameTenant(
  context: TenantContext,
  recordTenantId: string,
) {
  if (isSuperAdmin(context)) return
  const tenantId = requireTenant(context)
  if (tenantId !== recordTenantId) {
    throw new Error('Cross-tenant access denied.')
  }
}
