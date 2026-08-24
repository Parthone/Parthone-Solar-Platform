import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, CalendarCheck, ClipboardList, Hammer, PackageX, ReceiptIndianRupee, RefreshCw, UserPlus, Wallet } from 'lucide-react'
import { fetchDashboardStats, type DashboardStats } from '../lib/dashboard-search'
import type { EmployeeModuleKey } from '../lib/permissions-targets'

type Props = {
  tenantId: string
  role: 'client_admin' | 'employee'
  employeeModules?: EmployeeModuleKey[]
  onNavigate: (section: string) => void
}

function money(value: number | null) {
  if (value == null) return 'Restricted'
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value)
}

export default function DashboardHome({ tenantId, role, employeeModules, onNavigate }: Props) {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  const load = async () => {
    setLoading(true); setMessage('')
    try { setStats(await fetchDashboardStats(tenantId, role, employeeModules)) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to load dashboard.') }
    finally { setLoading(false) }
  }

  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 60_000); return () => window.clearInterval(timer) }, [tenantId, role, employeeModules])

  const cards = useMemo(() => [
    { label: "Today's Leads", value: stats?.todayLeads, display: null, hint: 'Created today', icon: UserPlus, tone: 'primary', target: 'leads' },
    { label: 'Pending Follow-ups', value: stats?.pendingFollowups, display: null, hint: `${stats?.overdueFollowups ?? 0} overdue`, icon: CalendarCheck, tone: 'secondary', target: 'followups' },
    { label: 'Pending Payments', value: stats?.pendingPaymentCustomers, display: stats?.pendingPaymentAmount == null ? null : money(stats.pendingPaymentAmount), hint: `${stats?.pendingPaymentCustomers ?? 0} customers`, icon: Wallet, tone: 'warning', target: 'customers' },
    { label: 'Pending Installations', value: stats?.pendingInstallations, display: null, hint: 'Awaiting completion', icon: Hammer, tone: 'accent', target: 'customers' },
    { label: 'Employee Tasks', value: stats?.employeeTasks, display: null, hint: role === 'client_admin' ? 'Open target gaps' : 'Admin summary', icon: ClipboardList, tone: 'primary', target: 'task-targets' },
    { label: 'Unpaid Invoices', value: stats?.unpaidInvoices, display: null, hint: stats?.invoiceOutstanding == null ? 'Outstanding amount' : `${money(stats.invoiceOutstanding)} outstanding`, icon: ReceiptIndianRupee, tone: 'warning', target: 'invoices' },
    { label: 'Low Stock Alerts', value: stats?.lowStockItems, display: null, hint: 'Items at/below reorder level', icon: PackageX, tone: 'danger', target: 'inventory-overview' },
  ], [stats, role])

  return <>
    <div className="dashboard-heading dashboard-heading-actions"><div><h1>Dashboard</h1><p>Your solar business at a glance — refreshed every minute.</p></div><button className="ghost dashboard-refresh" onClick={() => void load()} disabled={loading}><RefreshCw size={16}/>{loading ? 'Refreshing…' : 'Refresh'}</button></div>
    {message && <div className="notice">{message}</div>}
    <section className="dashboard-grid">{cards.map((card) => { const Icon = card.icon; const restricted = card.value == null && !loading; return <button className="dashboard-card" key={card.label} onClick={() => !restricted && onNavigate(card.target)} disabled={restricted}><div className={`kpi-icon ${card.tone}`}><Icon size={19}/></div><ArrowRight size={16} className="card-arrow"/><div className="kpi-copy"><strong>{loading && !stats ? '…' : card.display ?? (card.value == null ? '—' : card.value)}</strong><span>{card.label}</span><small>{restricted ? 'No permission' : card.hint}</small></div></button> })}</section>
    <section className="panel dashboard-quick-panel"><div className="panel-title"><div><p className="eyebrow">QUICK ACTIONS</p><h2>Common work</h2></div></div><div className="dashboard-quick-actions"><button onClick={() => onNavigate('add-lead')}>+ Add Lead</button><button onClick={() => onNavigate('customers')}>Customers</button><button onClick={() => onNavigate('quotations')}>New Quotation</button><button onClick={() => onNavigate('expenses')}>Record Expense</button><button onClick={() => onNavigate('inventory-overview')}>Inventory</button></div></section>
  </>
}
