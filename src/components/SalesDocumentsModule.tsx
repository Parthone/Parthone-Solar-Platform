import { FormEvent, useEffect, useMemo, useState } from 'react'
import { FileText, Plus, ReceiptIndianRupee, Search } from 'lucide-react'
import { fetchCustomers, type Customer } from '../lib/customers'
import {
  createQuotation,
  fetchInvoices,
  fetchQuotations,
  convertQuotationToInvoice,
  updateInvoicePayment,
  updateQuotationStatus,
  type Invoice,
  type LineItem,
  type Quotation,
  type QuotationStatus,
} from '../lib/sales-documents'
import '../sales-documents.css'

type Props = { tenantId: string; mode: 'quotations' | 'invoices' | 'invoice-reports' }

const blankItem: LineItem = { description: '', quantity: 1, rate: 0, taxPercent: 0 }

function money(value: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value || 0)
}

export default function SalesDocumentsModule({ tenantId, mode }: Props) {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [term, setTerm] = useState('')
  const [showQuote, setShowQuote] = useState(false)
  const [customerId, setCustomerId] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<LineItem[]>([{ ...blankItem }])
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    setMessage('')
    try {
      const [customerRows, quoteRows, invoiceRows] = await Promise.all([
        fetchCustomers(tenantId),
        fetchQuotations(tenantId),
        fetchInvoices(tenantId),
      ])
      setCustomers(customerRows)
      setQuotations(quoteRows)
      setInvoices(invoiceRows)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load sales documents.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [tenantId])

  const selectedCustomer = customers.find((customer) => customer.id === customerId)
  const quoteTotal = useMemo(() => items.reduce((sum, item) => sum + item.quantity * item.rate * (1 + item.taxPercent / 100), 0), [items])

  const filteredQuotes = useMemo(() => quotations.filter((row) => {
    const q = term.trim().toLowerCase()
    return !q || [row.quotationNumber, row.customerName, row.customerMobile || '', row.status].some((value) => value.toLowerCase().includes(q))
  }), [quotations, term])

  const filteredInvoices = useMemo(() => invoices.filter((row) => {
    const q = term.trim().toLowerCase()
    return !q || [row.invoiceNumber, row.customerName, row.customerMobile || '', row.status].some((value) => value.toLowerCase().includes(q))
  }), [invoices, term])

  const submitQuotation = async (event: FormEvent) => {
    event.preventDefault()
    if (!selectedCustomer) return
    const cleanItems = items.filter((item) => item.description.trim() && item.quantity > 0)
    if (!cleanItems.length) {
      setMessage('Add at least one quotation item.')
      return
    }
    setSaving(true)
    try {
      await createQuotation(tenantId, {
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.name,
        customerMobile: selectedCustomer.mobile,
        validUntil: validUntil || null,
        notes: notes.trim() || null,
        items: cleanItems,
      })
      setShowQuote(false)
      setCustomerId('')
      setValidUntil('')
      setNotes('')
      setItems([{ ...blankItem }])
      await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to create quotation.')
    } finally {
      setSaving(false)
    }
  }

  const convert = async (quotation: Quotation) => {
    try {
      await convertQuotationToInvoice(tenantId, quotation)
      await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to create invoice.')
    }
  }

  const changeQuoteStatus = async (quotation: Quotation, status: QuotationStatus) => {
    try {
      await updateQuotationStatus(tenantId, quotation.id, status)
      await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to update quotation.')
    }
  }

  const recordPayment = async (invoice: Invoice) => {
    const raw = window.prompt('Total amount received for this invoice:', String(invoice.amountPaid))
    if (raw === null) return
    const amount = Number(raw)
    if (!Number.isFinite(amount) || amount < 0) {
      setMessage('Enter a valid payment amount.')
      return
    }
    try {
      await updateInvoicePayment(tenantId, invoice, amount)
      await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to update payment.')
    }
  }

  if (mode === 'invoice-reports') {
    const totalBilled = invoices.reduce((sum, row) => sum + row.total, 0)
    const totalReceived = invoices.reduce((sum, row) => sum + row.amountPaid, 0)
    const outstanding = invoices.reduce((sum, row) => sum + row.balanceDue, 0)
    return <div className="module-stack"><div className="module-head"><div><h1>Invoice Reports</h1><p>Basic billing summary for this solar company.</p></div></div><div className="journey-stage-grid"><article><span>Total Billed</span><strong>{money(totalBilled)}</strong><small>{invoices.length} invoice(s)</small></article><article><span>Received</span><strong>{money(totalReceived)}</strong><small>Recorded payments</small></article><article><span>Outstanding</span><strong>{money(outstanding)}</strong><small>Pending collection</small></article></div></div>
  }

  return <div className="module-stack">
    <div className="module-head"><div><h1>{mode === 'quotations' ? 'Quotations' : 'Invoices'}</h1><p>{loading ? 'Loading…' : mode === 'quotations' ? `${quotations.length} quotation(s)` : `${invoices.length} invoice(s)`}</p></div>{mode === 'quotations' && <button className="primary tenant-primary" onClick={() => setShowQuote(true)}><Plus size={16}/> Create Quotation</button>}</div>
    <div className="search-box"><Search size={17}/><input value={term} onChange={(e) => setTerm(e.target.value)} placeholder={`Search ${mode}...`} /></div>
    {message && <div className="notice">{message}</div>}

    {mode === 'quotations' ? <div className="document-list">{filteredQuotes.map((quotation) => <article className="document-card" key={quotation.id}><div className="document-card-head"><div><FileText size={20}/><span><strong>{quotation.quotationNumber}</strong><small>{quotation.customerName}</small></span></div><span className={`document-status ${quotation.status}`}>{quotation.status}</span></div><div className="document-grid"><span><small>Total</small><strong>{money(quotation.total)}</strong></span><span><small>Valid Until</small><strong>{quotation.validUntil || '—'}</strong></span><span><small>Items</small><strong>{quotation.items.length}</strong></span></div><div className="document-actions"><select value={quotation.status} disabled={quotation.status === 'converted'} onChange={(e) => void changeQuoteStatus(quotation, e.target.value as QuotationStatus)}><option value="draft">Draft</option><option value="sent">Sent</option><option value="accepted">Accepted</option><option value="rejected">Rejected</option><option value="converted">Converted</option></select><button className="primary tenant-primary" disabled={Boolean(quotation.convertedInvoiceId)} onClick={() => void convert(quotation)}>{quotation.convertedInvoiceId ? 'Invoice Created' : 'Convert to Invoice'}</button></div></article>)}{!loading && filteredQuotes.length === 0 && <section className="panel empty-state"><FileText size={28}/><h3>No quotations found</h3><p className="muted">Create the first quotation for a customer.</p></section>}</div>
    : <div className="document-list">{filteredInvoices.map((invoice) => <article className="document-card" key={invoice.id}><div className="document-card-head"><div><ReceiptIndianRupee size={20}/><span><strong>{invoice.invoiceNumber}</strong><small>{invoice.customerName}</small></span></div><span className={`document-status ${invoice.status}`}>{invoice.status}</span></div><div className="document-grid"><span><small>Total</small><strong>{money(invoice.total)}</strong></span><span><small>Received</small><strong>{money(invoice.amountPaid)}</strong></span><span><small>Balance</small><strong>{money(invoice.balanceDue)}</strong></span></div><div className="document-actions"><span className="muted">Due: {invoice.dueDate || 'Not set'}</span><button className="ghost" onClick={() => void recordPayment(invoice)}>Record Payment</button></div></article>)}{!loading && filteredInvoices.length === 0 && <section className="panel empty-state"><ReceiptIndianRupee size={28}/><h3>No invoices found</h3><p className="muted">Convert an accepted quotation to create an invoice.</p></section>}</div>}

    {showQuote && <div className="modal-backdrop" onMouseDown={() => setShowQuote(false)}><section className="modal" onMouseDown={(e) => e.stopPropagation()}><div className="panel-title"><div><p className="eyebrow">SALES DOCUMENT</p><h2>Create Quotation</h2></div><button className="ghost" onClick={() => setShowQuote(false)}>Close</button></div><form className="form-grid" onSubmit={submitQuotation}><label>Customer<select value={customerId} onChange={(e) => setCustomerId(e.target.value)} required><option value="">Select customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} · {customer.customerId}</option>)}</select></label><label>Valid until<input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /></label><div className="full-field quotation-items"><div className="panel-title"><h3>Items</h3><button type="button" className="ghost" onClick={() => setItems([...items, { ...blankItem }])}><Plus size={15}/> Add Item</button></div>{items.map((item, index) => <div className="quotation-item" key={index}><input placeholder="Description" value={item.description} onChange={(e) => setItems(items.map((row, i) => i === index ? { ...row, description: e.target.value } : row))}/><input type="number" min="1" placeholder="Qty" value={item.quantity} onChange={(e) => setItems(items.map((row, i) => i === index ? { ...row, quantity: Number(e.target.value) } : row))}/><input type="number" min="0" placeholder="Rate" value={item.rate} onChange={(e) => setItems(items.map((row, i) => i === index ? { ...row, rate: Number(e.target.value) } : row))}/><input type="number" min="0" placeholder="Tax %" value={item.taxPercent} onChange={(e) => setItems(items.map((row, i) => i === index ? { ...row, taxPercent: Number(e.target.value) } : row))}/><button type="button" className="ghost" disabled={items.length === 1} onClick={() => setItems(items.filter((_, i) => i !== index))}>Remove</button></div>)}<p className="quotation-total">Quotation Total: <strong>{money(quoteTotal)}</strong></p></div><label className="full-field">Notes<textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></label><div className="form-actions"><button type="button" className="ghost" onClick={() => setShowQuote(false)}>Cancel</button><button className="primary tenant-primary" disabled={saving}>{saving ? 'Saving…' : 'Create Quotation'}</button></div></form></section></div>}
  </div>
}
