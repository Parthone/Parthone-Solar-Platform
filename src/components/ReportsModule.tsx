import { useEffect, useState } from 'react'
import { BarChart3, Boxes, CircleDollarSign, ReceiptIndianRupee, RefreshCw, Users } from 'lucide-react'
import { fetchBusinessReport, type BusinessReport, type ReportRange } from '../lib/reports'

type Props = { tenantId: string; mode: 'business-reports' | 'inventory-reports' }

function money(value: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value || 0)
}

const emptyReport: BusinessReport = {
  leads: { total: 0, converted: 0, lost: 0, expectedValue: 0 },
  customers: { total: 0, completed: 0, dealValue: 0, received: 0, outstanding: 0 },
  sales: { quotations: 0, acceptedQuotes: 0, invoices: 0, billed: 0, received: 0, outstanding: 0, unpaidInvoices: 0 },
  finance: { expenses: 0, pendingReimbursement: 0, byCategory: [] },
  inventory: { items: 0, stockValue: 0, lowStock: 0, outOfStock: 0, reservedUnits: 0, purchases: 0, issues: 0 },
  employees: { total: 0, active: 0, admins: 0, sharingLocation: 0, online: 0 },
}

export default function ReportsModule({ tenantId, mode }: Props) {
  const [range, setRange] = useState<ReportRange>('30d')
  const [report, setReport] = useState<BusinessReport>(emptyReport)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  const load = async () => {
    setLoading(true)
    setMessage('')
    try { setReport(await fetchBusinessReport(tenantId, range)) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to load reports.') }
    finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [tenantId, range])

  if (mode === 'inventory-reports') {
    return <div className="module-stack">
      <div className="module-head"><div><h1>Inventory Reports</h1><p>Stock valuation, low-stock health and material movement summary.</p></div><div className="report-controls"><Range value={range} onChange={setRange}/><button className="ghost" onClick={() => void load()}><RefreshCw size={15}/> Refresh</button></div></div>
      {message && <div className="notice">{message}</div>}
      <div className="report-kpis"><Kpi label="Items" value={String(report.inventory.items)} icon={Boxes}/><Kpi label="Stock Value" value={money(report.inventory.stockValue)} icon={CircleDollarSign}/><Kpi label="Low Stock" value={String(report.inventory.lowStock)} icon={BarChart3}/><Kpi label="Out of Stock" value={String(report.inventory.outOfStock)} icon={BarChart3}/><Kpi label="Reserved Units" value={String(report.inventory.reservedUnits)} icon={Boxes}/><Kpi label="Purchased Units" value={String(report.inventory.purchases)} icon={Boxes}/><Kpi label="Issued Units" value={String(report.inventory.issues)} icon={Boxes}/></div>
      <section className="panel report-note"><h3>Inventory Health</h3><p>{loading ? 'Loading…' : `${report.inventory.lowStock} item(s) are at/below reorder level and ${report.inventory.outOfStock} item(s) have no available stock.`}</p></section>
    </div>
  }

  return <div className="module-stack">
    <div className="module-head"><div><h1>Business Reports</h1><p>Sales, customers, finance, inventory and team performance in one view.</p></div><div className="report-controls"><Range value={range} onChange={setRange}/><button className="ghost" onClick={() => void load()}><RefreshCw size={15}/> Refresh</button></div></div>
    {message && <div className="notice">{message}</div>}

    <div className="report-section"><h2>Sales & Customers</h2><div className="report-kpis"><Kpi label="Leads" value={String(report.leads.total)} icon={Users}/><Kpi label="Converted Leads" value={String(report.leads.converted)} icon={Users}/><Kpi label="Customers" value={String(report.customers.total)} icon={Users}/><Kpi label="Completed Projects" value={String(report.customers.completed)} icon={Users}/><Kpi label="Quotations" value={String(report.sales.quotations)} icon={ReceiptIndianRupee}/><Kpi label="Invoices" value={String(report.sales.invoices)} icon={ReceiptIndianRupee}/></div></div>

    <div className="report-section"><h2>Revenue & Finance</h2><div className="report-kpis"><Kpi label="Expected Lead Value" value={money(report.leads.expectedValue)} icon={CircleDollarSign}/><Kpi label="Deal Value" value={money(report.customers.dealValue)} icon={CircleDollarSign}/><Kpi label="Billed" value={money(report.sales.billed)} icon={ReceiptIndianRupee}/><Kpi label="Received" value={money(report.sales.received)} icon={CircleDollarSign}/><Kpi label="Outstanding" value={money(report.sales.outstanding)} icon={CircleDollarSign}/><Kpi label="Expenses" value={money(report.finance.expenses)} icon={CircleDollarSign}/></div></div>

    <div className="report-two-col">
      <section className="panel"><h3>Expense by Category</h3><div className="report-list">{report.finance.byCategory.slice(0, 8).map(([name, amount]) => <div key={name}><span>{name}</span><strong>{money(amount)}</strong></div>)}{report.finance.byCategory.length === 0 && <p className="muted">No expenses in selected range.</p>}</div></section>
      <section className="panel"><h3>Employee Activity</h3><div className="report-list"><div><span>Total Users</span><strong>{report.employees.total}</strong></div><div><span>Active Users</span><strong>{report.employees.active}</strong></div><div><span>Client Admins</span><strong>{report.employees.admins}</strong></div><div><span>Sharing Location</span><strong>{report.employees.sharingLocation}</strong></div><div><span>Online Recently</span><strong>{report.employees.online}</strong></div></div></section>
    </div>

    <div className="report-two-col">
      <section className="panel"><h3>Receivables</h3><div className="report-list"><div><span>Customer Outstanding</span><strong>{money(report.customers.outstanding)}</strong></div><div><span>Invoice Outstanding</span><strong>{money(report.sales.outstanding)}</strong></div><div><span>Unpaid / Partial Invoices</span><strong>{report.sales.unpaidInvoices}</strong></div><div><span>Pending Reimbursement</span><strong>{money(report.finance.pendingReimbursement)}</strong></div></div></section>
      <section className="panel"><h3>Inventory Snapshot</h3><div className="report-list"><div><span>Items</span><strong>{report.inventory.items}</strong></div><div><span>Stock Value</span><strong>{money(report.inventory.stockValue)}</strong></div><div><span>Low Stock</span><strong>{report.inventory.lowStock}</strong></div><div><span>Out of Stock</span><strong>{report.inventory.outOfStock}</strong></div></div></section>
    </div>
  </div>
}

function Range({ value, onChange }: { value: ReportRange; onChange: (value: ReportRange) => void }) {
  return <select value={value} onChange={(e) => onChange(e.target.value as ReportRange)}><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="90d">Last 90 days</option><option value="all">All time</option></select>
}

function Kpi({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Users }) {
  return <article className="report-kpi"><div className="kpi-icon primary"><Icon size={18}/></div><span>{label}</span><strong>{value}</strong></article>
}
