import { FormEvent, useEffect, useMemo, useState } from 'react'
import { BadgeIndianRupee, CalendarDays, CheckCircle2, Plus, Search, Tags, Wallet } from 'lucide-react'
import {
  createAccountConfirmation,
  createExpense,
  createExpenseCategory,
  expenseSummary,
  fetchAccountConfirmations,
  fetchExpenseCategories,
  fetchExpenses,
  type AccountStatementConfirmation,
  type Expense,
  type ExpenseCategory,
  type ExpenseStatus,
  type PaymentMode,
} from '../lib/finance'

type Mode = 'expenses' | 'expense-categories' | 'account-statement-confirmation'
type Props = { tenantId: string; mode: Mode; currentUserName?: string | null }

const paymentModes: PaymentMode[] = ['Cash', 'UPI', 'Bank Transfer', 'Card', 'Cheque', 'Other']
const expenseStatuses: ExpenseStatus[] = ['recorded', 'pending', 'approved', 'reimbursed']

function money(value: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value || 0)
}

export default function FinanceModule({ tenantId, mode, currentUserName }: Props) {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [confirmations, setConfirmations] = useState<AccountStatementConfirmation[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [term, setTerm] = useState('')
  const [status, setStatus] = useState<'all' | ExpenseStatus>('all')
  const [category, setCategory] = useState('all')
  const [showExpense, setShowExpense] = useState(false)
  const [showCategory, setShowCategory] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)

  const load = async () => {
    setLoading(true)
    setMessage('')
    try {
      const [expenseRows, categoryRows, confirmationRows] = await Promise.all([
        fetchExpenses(tenantId),
        fetchExpenseCategories(tenantId),
        fetchAccountConfirmations(tenantId),
      ])
      setExpenses(expenseRows)
      setCategories(categoryRows)
      setConfirmations(confirmationRows)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load finance data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [tenantId])

  if (mode === 'expense-categories') {
    return <div className="module-stack">
      <div className="module-head"><div><h1>Expense Categories</h1><p>Manage reusable categories for company expenses.</p></div><button className="primary tenant-primary" onClick={() => setShowCategory(true)}><Plus size={16}/> Add Category</button></div>
      {message && <div className="notice">{message}</div>}
      <div className="category-grid">{categories.map((row) => <article className="panel category-card" key={row.id}><Tags size={18}/><div><h3>{row.name}</h3><p>{row.description || 'No description'}</p></div></article>)}{!loading && categories.length === 0 && <section className="panel empty-state"><Tags size={28}/><h3>No expense categories</h3><p className="muted">Add your first category.</p></section>}</div>
      {showCategory && <CategoryModal tenantId={tenantId} onDone={async () => { setShowCategory(false); await load() }} onClose={() => setShowCategory(false)} />}
    </div>
  }

  if (mode === 'account-statement-confirmation') {
    return <div className="module-stack">
      <div className="module-head"><div><h1>Account Statement Confirmation</h1><p>Record balance confirmation for bank or cash accounts.</p></div><button className="primary tenant-primary" onClick={() => setShowConfirmation(true)}><CheckCircle2 size={16}/> Add Confirmation</button></div>
      {message && <div className="notice">{message}</div>}
      <div className="table-wrap panel"><table><thead><tr><th>Account</th><th>Date</th><th>Opening</th><th>Closing</th><th>Confirmed By</th></tr></thead><tbody>{confirmations.map((row) => <tr key={row.id}><td>{row.accountName}</td><td>{row.statementDate}</td><td>{money(row.openingBalance)}</td><td>{money(row.closingBalance)}</td><td>{row.confirmedBy}</td></tr>)}</tbody></table>{!loading && confirmations.length === 0 && <p className="empty">No confirmations recorded yet.</p>}</div>
      {showConfirmation && <ConfirmationModal tenantId={tenantId} currentUserName={currentUserName || ''} onDone={async () => { setShowConfirmation(false); await load() }} onClose={() => setShowConfirmation(false)} />}
    </div>
  }

  const summary = expenseSummary(expenses)
  const filtered = useMemo(() => expenses.filter((expense) => {
    const q = term.trim().toLowerCase()
    const matchesText = !q || [expense.expenseCode, expense.description, expense.vendor || '', expense.reference || '', expense.category].some((value) => value.toLowerCase().includes(q))
    const matchesStatus = status === 'all' || expense.status === status
    const matchesCategory = category === 'all' || expense.category === category
    return matchesText && matchesStatus && matchesCategory
  }), [expenses, term, status, category])

  return <div className="module-stack">
    <div className="module-head"><div><h1>Company Expenses</h1><p>Record and review day-to-day business spending.</p></div><button className="primary tenant-primary" onClick={() => setShowExpense(true)}><Plus size={16}/> Add Expense</button></div>
    <div className="finance-stats"><article><span>Today's Expenses</span><strong>{money(summary.todayTotal)}</strong></article><article><span>This Month</span><strong>{money(summary.monthTotal)}</strong></article><article><span>Total Recorded</span><strong>{money(summary.allTotal)}</strong></article><article><span>Pending Reimbursement</span><strong>{money(summary.pendingReimbursement)}</strong></article></div>
    <div className="finance-layout">
      <section className="panel"><div className="panel-title"><h2>Monthly Category Summary</h2><BadgeIndianRupee size={18}/></div><div className="category-summary">{summary.byCategory.slice(0, 8).map(([name, amount]) => <div key={name}><span>{name}</span><strong>{money(amount)}</strong></div>)}{summary.byCategory.length === 0 && <p className="muted">No expenses this month.</p>}</div></section>
      <section className="panel finance-tip"><Wallet size={24}/><h3>Expense Control</h3><p>Use categories, payment mode, vendor and reference fields so every payment can be traced later.</p></section>
    </div>
    <div className="finance-filters"><div className="search-box"><Search size={17}/><input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search expense ID, description, vendor or reference" /></div><select value={status} onChange={(e) => setStatus(e.target.value as 'all' | ExpenseStatus)}><option value="all">All statuses</option>{expenseStatuses.map((value) => <option key={value} value={value}>{value}</option>)}</select><select value={category} onChange={(e) => setCategory(e.target.value)}><option value="all">All categories</option>{categories.map((row) => <option key={row.id} value={row.name}>{row.name}</option>)}</select></div>
    {message && <div className="notice">{message}</div>}
    <div className="expense-list">{filtered.map((expense) => <article className="expense-card" key={expense.id}><div><strong>{expense.expenseCode} · {expense.category}</strong><p>{expense.description}</p><small>{expense.expenseDate} · {expense.paymentMode}{expense.vendor ? ` · ${expense.vendor}` : ''}{expense.reference ? ` · ${expense.reference}` : ''}</small></div><div className="expense-right"><strong>{money(expense.amount)}</strong><span className={`expense-status ${expense.status}`}>{expense.status}</span></div></article>)}{!loading && filtered.length === 0 && <section className="panel empty-state"><Wallet size={28}/><h3>No expenses found</h3></section>}</div>
    {showExpense && <ExpenseModal tenantId={tenantId} categories={categories} currentUserName={currentUserName || ''} onDone={async () => { setShowExpense(false); await load() }} onClose={() => setShowExpense(false)} />}
  </div>
}

function ExpenseModal({ tenantId, categories, currentUserName, onDone, onClose }: { tenantId: string; categories: ExpenseCategory[]; currentUserName: string; onDone: () => void; onClose: () => void }) {
  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({ expenseDate: today, category: categories[0]?.name || 'Other', description: '', amount: '', paymentMode: 'Cash' as PaymentMode, vendor: '', reference: '', paidByName: currentUserName, customerName: '', status: 'recorded' as ExpenseStatus, notes: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError('')
    try {
      await createExpense(tenantId, { expenseDate: form.expenseDate, category: form.category, description: form.description.trim(), amount: Number(form.amount), paymentMode: form.paymentMode, vendor: form.vendor.trim() || null, reference: form.reference.trim() || null, paidByName: form.paidByName.trim() || null, customerName: form.customerName.trim() || null, status: form.status, notes: form.notes.trim() || null })
      onDone()
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save expense.') }
    finally { setSaving(false) }
  }

  return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal" onMouseDown={(e) => e.stopPropagation()}><div className="panel-title"><div><p className="eyebrow">FINANCE</p><h2>Add Expense</h2></div><button className="ghost" onClick={onClose}>Close</button></div><form className="form-grid" onSubmit={submit}><label>Date<input type="date" value={form.expenseDate} onChange={(e) => setForm({ ...form, expenseDate: e.target.value })} required /></label><label>Category<select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{categories.map((row) => <option key={row.id}>{row.name}</option>)}{categories.length === 0 && <option>Other</option>}</select></label><label className="full-field">Description<input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} required /></label><label>Amount<input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required /></label><label>Payment Mode<select value={form.paymentMode} onChange={(e) => setForm({ ...form, paymentMode: e.target.value as PaymentMode })}>{paymentModes.map((value) => <option key={value}>{value}</option>)}</select></label><label>Vendor<input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} /></label><label>Reference<input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></label><label>Paid By<input value={form.paidByName} onChange={(e) => setForm({ ...form, paidByName: e.target.value })} /></label><label>Customer / Project<input value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} /></label><label>Status<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as ExpenseStatus })}>{expenseStatuses.map((value) => <option key={value}>{value}</option>)}</select></label><label className="full-field">Notes<textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>{error && <div className="error full-field">{error}</div>}<div className="form-actions"><button type="button" className="ghost" onClick={onClose}>Cancel</button><button className="primary tenant-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Expense'}</button></div></form></section></div>
}

function CategoryModal({ tenantId, onDone, onClose }: { tenantId: string; onDone: () => void; onClose: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const submit = async (event: FormEvent) => { event.preventDefault(); try { await createExpenseCategory(tenantId, name, description); onDone() } catch (e) { setError(e instanceof Error ? e.message : 'Unable to create category.') } }
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal" onMouseDown={(e) => e.stopPropagation()}><div className="panel-title"><h2>Add Expense Category</h2><button className="ghost" onClick={onClose}>Close</button></div><form className="form-grid" onSubmit={submit}><label className="full-field">Name<input value={name} onChange={(e) => setName(e.target.value)} required /></label><label className="full-field">Description<textarea value={description} onChange={(e) => setDescription(e.target.value)} /></label>{error && <div className="error full-field">{error}</div>}<div className="form-actions"><button type="button" className="ghost" onClick={onClose}>Cancel</button><button className="primary tenant-primary">Save Category</button></div></form></section></div>
}

function ConfirmationModal({ tenantId, currentUserName, onDone, onClose }: { tenantId: string; currentUserName: string; onDone: () => void; onClose: () => void }) {
  const [form, setForm] = useState({ accountName: '', statementDate: new Date().toISOString().slice(0, 10), openingBalance: '', closingBalance: '', confirmedBy: currentUserName, notes: '' })
  const [error, setError] = useState('')
  const submit = async (event: FormEvent) => { event.preventDefault(); try { await createAccountConfirmation(tenantId, { accountName: form.accountName.trim(), statementDate: form.statementDate, openingBalance: Number(form.openingBalance || 0), closingBalance: Number(form.closingBalance || 0), confirmedBy: form.confirmedBy.trim() || currentUserName || 'User', notes: form.notes.trim() || null }); onDone() } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save confirmation.') } }
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal" onMouseDown={(e) => e.stopPropagation()}><div className="panel-title"><div><p className="eyebrow">FINANCE CONTROL</p><h2>Account Statement Confirmation</h2></div><button className="ghost" onClick={onClose}>Close</button></div><form className="form-grid" onSubmit={submit}><label>Account Name<input value={form.accountName} onChange={(e) => setForm({ ...form, accountName: e.target.value })} required /></label><label>Date<input type="date" value={form.statementDate} onChange={(e) => setForm({ ...form, statementDate: e.target.value })} required /></label><label>Opening Balance<input type="number" value={form.openingBalance} onChange={(e) => setForm({ ...form, openingBalance: e.target.value })} /></label><label>Closing Balance<input type="number" value={form.closingBalance} onChange={(e) => setForm({ ...form, closingBalance: e.target.value })} /></label><label>Confirmed By<input value={form.confirmedBy} onChange={(e) => setForm({ ...form, confirmedBy: e.target.value })} /></label><label className="full-field">Notes<textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>{error && <div className="error full-field">{error}</div>}<div className="form-actions"><button type="button" className="ghost" onClick={onClose}>Cancel</button><button className="primary tenant-primary">Save Confirmation</button></div></form></section></div>
}
