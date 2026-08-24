import { collection, doc, getDoc, getDocs, orderBy, query, where } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from './firebase'

export const EMPLOYEE_MODULES = ['dashboard','customers','followups','pipeline','leads','quotations','invoices','inventory','expenses','external-links','live-tracking','profile','reports','bank-accounts','change-password'] as const
export type EmployeeModuleKey = typeof EMPLOYEE_MODULES[number]

export type PermissionSettings = { employeeModules: EmployeeModuleKey[] }
export type Target = {
  id: string
  kind: 'stage' | 'task'
  title: string
  stage?: string | null
  employeeId?: string | null
  employeeName?: string | null
  target: number
  achieved: number
  period: string
  isActive: boolean
}

const savePermissionsCallable = httpsCallable(functions, 'savePermissionSettings')
const saveTargetCallable = httpsCallable(functions, 'saveTarget')
const deleteTargetCallable = httpsCallable(functions, 'deleteTarget')

export async function fetchPermissionSettings(tenantId: string): Promise<PermissionSettings> {
  const snapshot = await getDoc(doc(db, 'tenants', tenantId, 'settings', 'permissions'))
  if (!snapshot.exists()) return { employeeModules: [...EMPLOYEE_MODULES] }
  const modules = Array.isArray(snapshot.data().employeeModules) ? snapshot.data().employeeModules : EMPLOYEE_MODULES
  return { employeeModules: modules.filter((m: string) => (EMPLOYEE_MODULES as readonly string[]).includes(m)) as EmployeeModuleKey[] }
}

export async function savePermissionSettings(employeeModules: EmployeeModuleKey[]) {
  await savePermissionsCallable({ employeeModules })
}

export async function fetchTargets(tenantId: string, kind: 'stage' | 'task'): Promise<Target[]> {
  const snapshot = await getDocs(query(collection(db, 'tenants', tenantId, 'targets'), where('kind', '==', kind), orderBy('period', 'desc')))
  return snapshot.docs.map((row) => ({ id: row.id, ...(row.data() as Omit<Target, 'id'>) }))
}

export async function fetchTenantEmployees(tenantId: string) {
  const snapshot = await getDocs(query(collection(db, 'users'), where('tenantId', '==', tenantId)))
  return snapshot.docs.map((row) => ({ id: row.id, fullName: String(row.data().fullName ?? row.data().email ?? 'Employee'), isActive: row.data().isActive !== false }))
}

export async function saveTarget(input: Omit<Target, 'id'> & { id?: string }) { await saveTargetCallable(input) }
export async function deleteTarget(id: string) { await deleteTargetCallable({ id }) }
