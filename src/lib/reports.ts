import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from './firebase'

export type ReportRange = '7d' | '30d' | '90d' | 'all'

export type BusinessReport = {
  leads: { total: number; converted: number; lost: number; expectedValue: number }
  customers: { total: number; completed: number; dealValue: number; received: number; outstanding: number }
  sales: { quotations: number; acceptedQuotes: number; invoices: number; billed: number; received: number; outstanding: number; unpaidInvoices: number }
  finance: { expenses: number; pendingReimbursement: number; byCategory: Array<[string, number]> }
  inventory: { items: number; stockValue: number; lowStock: number; outOfStock: number; reservedUnits: number; purchases: number; issues: number }
  employees: { total: number; active: number; admins: number; sharingLocation: number; online: number }
}

type AnyData = Record<string, any>

function startForRange(range: ReportRange) {
  if (range === 'all') return null
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() - (days - 1))
  return date
}

function asDate(value: any): Date | null {
  if (!value) return null
  if (typeof value?.toDate === 'function') return value.toDate()
  if (typeof value === 'string') {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  return null
}

function inRange(data: AnyData, start: Date | null, fields: string[] = ['createdAt']) {
  if (!start) return true
  for (const field of fields) {
    const date = asDate(data[field])
    if (date) return date >= start
  }
  return false
}

async function tenantRows(tenantId: string, name: string) {
  const snapshot = await getDocs(collection(db, 'tenants', tenantId, name))
  return snapshot.docs.map((row) => ({ id: row.id, ...row.data() })) as AnyData[]
}

export async function fetchBusinessReport(tenantId: string, range: ReportRange): Promise<BusinessReport> {
  const start = startForRange(range)
  const [allLeads, allCustomers, allQuotes, allInvoices, allExpenses, inventoryItems, stockMovements, userSnap, trackingSnap] = await Promise.all([
    tenantRows(tenantId, 'leads'),
    tenantRows(tenantId, 'customers'),
    tenantRows(tenantId, 'quotations'),
    tenantRows(tenantId, 'invoices'),
    tenantRows(tenantId, 'expenses'),
    tenantRows(tenantId, 'inventoryItems'),
    tenantRows(tenantId, 'stockMovements'),
    getDocs(query(collection(db, 'users'), where('tenantId', '==', tenantId))),
    getDocs(query(collection(db, 'employeeTracking'), where('tenantId', '==', tenantId))),
  ])

  const leads = allLeads.filter((row) => inRange(row, start))
  const customers = allCustomers.filter((row) => inRange(row, start))
  const quotations = allQuotes.filter((row) => inRange(row, start))
  const invoices = allInvoices.filter((row) => inRange(row, start))
  const expenses = allExpenses.filter((row) => inRange(row, start, ['createdAt', 'expenseDate']))
  const movements = stockMovements.filter((row) => inRange(row, start))
  const users = userSnap.docs.map((row) => ({ id: row.id, ...row.data() })) as AnyData[]
  const tracking = trackingSnap.docs.map((row) => ({ id: row.id, ...row.data() })) as AnyData[]

  const byCategory = new Map<string, number>()
  expenses.forEach((row) => {
    const category = String(row.category ?? 'Other')
    byCategory.set(category, (byCategory.get(category) ?? 0) + Number(row.amount ?? 0))
  })

  const now = Date.now()
  const online = tracking.filter((row) => {
    if (!row.isSharing) return false
    const updated = asDate(row.updatedAt)
    return updated ? now - updated.getTime() <= 15 * 60 * 1000 : false
  }).length

  return {
    leads: {
      total: leads.length,
      converted: leads.filter((row) => String(row.status).toLowerCase() === 'converted').length,
      lost: leads.filter((row) => String(row.status).toLowerCase() === 'lost').length,
      expectedValue: leads.reduce((sum, row) => sum + Number(row.expectedValue ?? 0), 0),
    },
    customers: {
      total: customers.length,
      completed: customers.filter((row) => String(row.stage).toLowerCase() === 'completed').length,
      dealValue: customers.reduce((sum, row) => sum + Number(row.dealAmount ?? 0), 0),
      received: customers.reduce((sum, row) => sum + Number(row.amountReceived ?? 0), 0),
      outstanding: customers.reduce((sum, row) => sum + Math.max(0, Number(row.dealAmount ?? 0) - Number(row.amountReceived ?? 0)), 0),
    },
    sales: {
      quotations: quotations.length,
      acceptedQuotes: quotations.filter((row) => ['accepted', 'converted'].includes(String(row.status).toLowerCase())).length,
      invoices: invoices.length,
      billed: invoices.reduce((sum, row) => sum + Number(row.total ?? 0), 0),
      received: invoices.reduce((sum, row) => sum + Number(row.amountPaid ?? 0), 0),
      outstanding: invoices.reduce((sum, row) => sum + Number(row.balanceDue ?? row.total ?? 0), 0),
      unpaidInvoices: invoices.filter((row) => ['unpaid', 'partial'].includes(String(row.status).toLowerCase())).length,
    },
    finance: {
      expenses: expenses.reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
      pendingReimbursement: expenses.filter((row) => row.status === 'pending').reduce((sum, row) => sum + Number(row.amount ?? 0), 0),
      byCategory: Array.from(byCategory.entries()).sort((a, b) => b[1] - a[1]),
    },
    inventory: {
      items: inventoryItems.length,
      stockValue: inventoryItems.reduce((sum, row) => sum + Number(row.currentStock ?? 0) * Number(row.lastUnitPrice ?? 0), 0),
      lowStock: inventoryItems.filter((row) => Number(row.currentStock ?? 0) > 0 && Math.max(0, Number(row.currentStock ?? 0) - Number(row.reservedStock ?? 0)) <= Number(row.reorderLevel ?? 0)).length,
      outOfStock: inventoryItems.filter((row) => Math.max(0, Number(row.currentStock ?? 0) - Number(row.reservedStock ?? 0)) <= 0).length,
      reservedUnits: inventoryItems.reduce((sum, row) => sum + Number(row.reservedStock ?? 0), 0),
      purchases: movements.filter((row) => row.type === 'purchase').reduce((sum, row) => sum + Number(row.quantity ?? 0), 0),
      issues: movements.filter((row) => row.type === 'issue').reduce((sum, row) => sum + Number(row.quantity ?? 0), 0),
    },
    employees: {
      total: users.length,
      active: users.filter((row) => row.isActive !== false).length,
      admins: users.filter((row) => row.role === 'client_admin' && row.isActive !== false).length,
      sharingLocation: tracking.filter((row) => row.isSharing === true).length,
      online,
    },
  }
}
