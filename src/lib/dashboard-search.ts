import { collection, getDocs } from 'firebase/firestore'
import { db } from './firebase'
import type { EmployeeModuleKey } from './permissions-targets'

export type DashboardStats = {
  todayLeads: number | null
  pendingFollowups: number | null
  overdueFollowups: number | null
  pendingPaymentAmount: number | null
  pendingPaymentCustomers: number | null
  pendingInstallations: number | null
  employeeTasks: number | null
  unpaidInvoices: number | null
  invoiceOutstanding: number | null
  lowStockItems: number | null
}

export type GlobalSearchResult = {
  id: string
  type: 'customer' | 'lead' | 'invoice'
  title: string
  subtitle: string
  section: 'customers' | 'leads' | 'invoices'
}

type Row = Record<string, any> & { id: string }

function canAccess(role: 'client_admin' | 'employee', modules: readonly EmployeeModuleKey[] | undefined, key: EmployeeModuleKey) {
  return role === 'client_admin' || !modules || modules.includes(key)
}

async function rows(tenantId: string, name: string): Promise<Row[]> {
  const snap = await getDocs(collection(db, 'tenants', tenantId, name))
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
}

function dateKey(value: any): string | null {
  if (!value) return null
  const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function todayKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export async function fetchDashboardStats(
  tenantId: string,
  role: 'client_admin' | 'employee',
  modules?: readonly EmployeeModuleKey[],
): Promise<DashboardStats> {
  const today = todayKey()
  const canLeads = canAccess(role, modules, 'leads')
  const canCustomers = canAccess(role, modules, 'customers') || canAccess(role, modules, 'followups')
  const canInvoices = canAccess(role, modules, 'invoices')
  const canInventory = canAccess(role, modules, 'inventory')
  const canTasks = role === 'client_admin'

  const [leads, customers, invoices, inventory, targets] = await Promise.all([
    canLeads ? rows(tenantId, 'leads').catch(() => []) : Promise.resolve([]),
    canCustomers ? rows(tenantId, 'customers').catch(() => []) : Promise.resolve([]),
    canInvoices ? rows(tenantId, 'invoices').catch(() => []) : Promise.resolve([]),
    canInventory ? rows(tenantId, 'inventoryItems').catch(() => []) : Promise.resolve([]),
    canTasks ? rows(tenantId, 'targets').catch(() => []) : Promise.resolve([]),
  ])

  const pendingFollowups = customers.filter((row) => row.nextFollowup && String(row.nextFollowup).slice(0, 10) <= today && row.stage !== 'Completed')
  const outstandingCustomers = customers.filter((row) => Number(row.dealAmount ?? 0) - Number(row.amountReceived ?? 0) > 0)
  const unpaidInvoices = invoices.filter((row) => ['unpaid', 'partial'].includes(String(row.status ?? '').toLowerCase()))
  const activeTaskTargets = targets.filter((row) => row.kind === 'task' && row.isActive !== false && Number(row.achieved ?? 0) < Number(row.target ?? 0))

  return {
    todayLeads: canLeads ? leads.filter((row) => dateKey(row.createdAt) === today).length : null,
    pendingFollowups: canCustomers ? pendingFollowups.length : null,
    overdueFollowups: canCustomers ? pendingFollowups.filter((row) => String(row.nextFollowup).slice(0, 10) < today).length : null,
    pendingPaymentAmount: canCustomers ? outstandingCustomers.reduce((sum, row) => sum + Math.max(0, Number(row.dealAmount ?? 0) - Number(row.amountReceived ?? 0)), 0) : null,
    pendingPaymentCustomers: canCustomers ? outstandingCustomers.length : null,
    pendingInstallations: canCustomers ? customers.filter((row) => row.installationStatus !== 'completed' && ['Order Confirmed', 'Installation'].includes(String(row.stage))).length : null,
    employeeTasks: canTasks ? activeTaskTargets.length : null,
    unpaidInvoices: canInvoices ? unpaidInvoices.length : null,
    invoiceOutstanding: canInvoices ? unpaidInvoices.reduce((sum, row) => sum + Number(row.balanceDue ?? row.total ?? 0), 0) : null,
    lowStockItems: canInventory ? inventory.filter((row) => {
      const available = Math.max(0, Number(row.currentStock ?? 0) - Number(row.reservedStock ?? 0))
      return available <= Number(row.reorderLevel ?? 0)
    }).length : null,
  }
}

export async function searchTenant(
  tenantId: string,
  term: string,
  role: 'client_admin' | 'employee',
  modules?: readonly EmployeeModuleKey[],
): Promise<GlobalSearchResult[]> {
  const q = term.trim().toLowerCase()
  if (q.length < 2) return []
  const [customers, leads, invoices] = await Promise.all([
    canAccess(role, modules, 'customers') ? rows(tenantId, 'customers').catch(() => []) : Promise.resolve([]),
    canAccess(role, modules, 'leads') ? rows(tenantId, 'leads').catch(() => []) : Promise.resolve([]),
    canAccess(role, modules, 'invoices') ? rows(tenantId, 'invoices').catch(() => []) : Promise.resolve([]),
  ])
  const includes = (...values: unknown[]) => values.some((value) => String(value ?? '').toLowerCase().includes(q))

  const result: GlobalSearchResult[] = []
  customers.filter((row) => includes(row.name, row.mobile, row.email, row.customerId, row.village)).slice(0, 6).forEach((row) => result.push({
    id: row.id, type: 'customer', title: String(row.name || row.customerId || 'Customer'), subtitle: `${row.customerId || 'Customer'} · ${row.mobile || 'No mobile'}`, section: 'customers',
  }))
  leads.filter((row) => includes(row.name, row.mobile, row.email, row.leadId, row.source)).slice(0, 6).forEach((row) => result.push({
    id: row.id, type: 'lead', title: String(row.name || row.leadId || 'Lead'), subtitle: `${row.leadId || 'Lead'} · ${row.mobile || 'No mobile'}`, section: 'leads',
  }))
  invoices.filter((row) => includes(row.invoiceNumber, row.customerName, row.customerMobile)).slice(0, 6).forEach((row) => result.push({
    id: row.id, type: 'invoice', title: String(row.invoiceNumber || 'Invoice'), subtitle: `${row.customerName || 'Customer'} · ${String(row.status || 'unpaid')}`, section: 'invoices',
  }))
  return result.slice(0, 12)
}
