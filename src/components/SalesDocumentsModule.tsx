import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { Banknote, FileText, Plus, Printer, ReceiptIndianRupee, Search, Share2, X } from 'lucide-react'
import { fetchCustomers, type Customer } from '../lib/customers'
import {
  calculateDocumentTotals,
  convertQuotationToInvoice,
  createQuotation,
  fetchCompanyDocumentProfile,
  fetchDefaultBankAccount,
  fetchInvoicePaymentHistory,
  fetchInvoices,
  fetchQuotations,
  recordInvoicePayment,
  updateQuotationStatus,
  type CompanyDocumentProfile,
  type Invoice,
  type LineItem,
  type PaymentHistory,
  type PaymentMethod,
  type Quotation,
  type QuotationStatus,
} from '../lib/sales-documents'
import type { BankAccount } from '../lib/settings'
import '../sales-documents.css'

type Props = { tenantId: string; mode: 'quotations' | 'invoices' | 'invoice-reports' }
type PrintableDocument = { kind: 'quotation'; row: Quotation } | { kind: 'invoice'; row: Invoice }

const blankItem: LineItem = { description: '', hsnSac: '', unit: 'Nos', quantity: 1, rate: 0, discountPercent: 0, taxPercent: 18 }
const defaultTerms = 'Prices are subject to the terms mentioned above. Warranty and installation scope are as mutually agreed.'

function money(value: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(value || 0)
}

function today() { return new Date().toISOString().slice(0, 10) }

export default function SalesDocumentsModule({ tenantId, mode }: Props) {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [quotations, setQuotations] = useState<Quotation[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [company, setCompany] = useState<CompanyDocumentProfile | null>(null)
  const [defaultBank, setDefaultBank] = useState<BankAccount | null>(null)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [term, setTerm] = useState('')
  const [showQuote, setShowQuote] = useState(false)
  const [customerId, setCustomerId] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [notes, setNotes] = useState('')
  const [terms, setTerms] = useState(defaultTerms)
  const [roundOff, setRoundOff] = useState(0)
  const [items, setItems] = useState<LineItem[]>([{ ...blankItem }])
  const [saving, setSaving] = useState(false)
  const [printable, setPrintable] = useState<PrintableDocument | null>(null)
  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null)
  const [paymentHistory, setPaymentHistory] = useState<PaymentHistory[]>([])
  const [paymentForm, setPaymentForm] = useState({ amount: '', method: 'Bank Transfer' as PaymentMethod, reference: '', paymentDate: today(), notes: '' })

  const load = async () => {
    setLoading(true); setMessage('')
    try {
      const [customerRows, quoteRows, invoiceRows, companyProfile, bank] = await Promise.all([
        fetchCustomers(tenantId), fetchQuotations(tenantId), fetchInvoices(tenantId), fetchCompanyDocumentProfile(tenantId), fetchDefaultBankAccount(tenantId).catch(() => null),
      ])
      setCustomers(customerRows); setQuotations(quoteRows); setInvoices(invoiceRows); setCompany(companyProfile); setDefaultBank(bank)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to load sales documents.') }
    finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [tenantId])

  const selectedCustomer = customers.find((customer) => customer.id === customerId)
  const totals = useMemo(() => calculateDocumentTotals(items, roundOff), [items, roundOff])
  const filteredQuotes = useMemo(() => quotations.filter((row) => { const q = term.trim().toLowerCase(); return !q || [row.quotationNumber, row.customerName, row.customerMobile || '', row.status].some((value) => value.toLowerCase().includes(q)) }), [quotations, term])
  const filteredInvoices = useMemo(() => invoices.filter((row) => { const q = term.trim().toLowerCase(); return !q || [row.invoiceNumber, row.customerName, row.customerMobile || '', row.status].some((value) => value.toLowerCase().includes(q)) }), [invoices, term])

  const updateItem = (index: number, patch: Partial<LineItem>) => setItems(items.map((row, i) => i === index ? { ...row, ...patch } : row))

  const submitQuotation = async (event: FormEvent) => {
    event.preventDefault()
    if (!selectedCustomer) return
    const cleanItems = items.filter((item) => item.description.trim() && item.quantity > 0)
    if (!cleanItems.length) { setMessage('Add at least one quotation item.'); return }
    setSaving(true); setMessage('')
    try {
      await createQuotation(tenantId, {
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.name,
        customerMobile: selectedCustomer.mobile,
        customerEmail: selectedCustomer.email,
        customerAddress: selectedCustomer.address || selectedCustomer.village,
        validUntil: validUntil || null,
        notes: notes.trim() || null,
        terms: terms.trim() || null,
        roundOff,
        items: cleanItems,
      })
      setShowQuote(false); setCustomerId(''); setValidUntil(''); setNotes(''); setTerms(defaultTerms); setRoundOff(0); setItems([{ ...blankItem }]); await load()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to create quotation.') }
    finally { setSaving(false) }
  }

  const convert = async (quotation: Quotation) => {
    const dueDate = window.prompt('Invoice due date (YYYY-MM-DD). Leave blank for no due date:', '')
    if (dueDate === null) return
    try { await convertQuotationToInvoice(tenantId, quotation, dueDate || null, defaultBank); await load() }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to create invoice.') }
  }

  const changeQuoteStatus = async (quotation: Quotation, status: QuotationStatus) => {
    try { await updateQuotationStatus(tenantId, quotation.id, status); await load() }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to update quotation.') }
  }

  const openPayment = async (invoice: Invoice) => {
    setPaymentInvoice(invoice)
    setPaymentForm({ amount: String(invoice.balanceDue || ''), method: 'Bank Transfer', reference: '', paymentDate: today(), notes: '' })
    try { setPaymentHistory(await fetchInvoicePaymentHistory(tenantId, invoice.id)) }
    catch { setPaymentHistory([]) }
  }

  const submitPayment = async (event: FormEvent) => {
    event.preventDefault()
    if (!paymentInvoice) return
    const amount = Number(paymentForm.amount)
    if (!Number.isFinite(amount) || amount <= 0) { setMessage('Enter a valid payment amount.'); return }
    setSaving(true); setMessage('')
    try {
      await recordInvoicePayment(tenantId, paymentInvoice.id, { amount, method: paymentForm.method, reference: paymentForm.reference || null, paymentDate: paymentForm.paymentDate, notes: paymentForm.notes || null })
      const history = await fetchInvoicePaymentHistory(tenantId, paymentInvoice.id)
      setPaymentHistory(history); await load(); setPaymentInvoice(null)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to record payment.') }
    finally { setSaving(false) }
  }

  const shareDocument = async (doc: PrintableDocument) => {
    const row = doc.row
    const number = doc.kind === 'quotation' ? row.quotationNumber : row.invoiceNumber
    const text = `${company?.name || 'Solar Company'}\n${doc.kind === 'quotation' ? 'Quotation' : 'Invoice'} ${number}\nCustomer: ${row.customerName}\nTotal: ${money(row.total)}`
    try {
      if (navigator.share) await navigator.share({ title: `${number} · ${company?.name || 'Solar Company'}`, text })
      else { await navigator.clipboard.writeText(text); setMessage('Document summary copied to clipboard.') }
    } catch { /* sharing cancelled */ }
  }

  const printDocument = (doc: PrintableDocument) => {
    setPrintable(doc)
    window.setTimeout(() => window.print(), 100)
  }

  if (mode === 'invoice-reports') {
    const totalBilled = invoices.reduce((sum, row) => sum + row.total, 0)
    const totalReceived = invoices.reduce((sum, row) => sum + row.amountPaid, 0)
    const outstanding = invoices.reduce((sum, row) => sum + row.balanceDue, 0)
    const overdue = invoices.filter((row) => row.balanceDue > 0 && row.dueDate && row.dueDate < today()).length
    return <div className="module-stack"><div className="module-head"><div><h1>Invoice Reports</h1><p>Commercial billing summary for this solar company.</p></div></div><div className="journey-stage-grid"><article><span>Total Billed</span><strong>{money(totalBilled)}</strong><small>{invoices.length} invoice(s)</small></article><article><span>Received</span><strong>{money(totalReceived)}</strong><small>Recorded payments</small></article><article><span>Outstanding</span><strong>{money(outstanding)}</strong><small>Pending collection</small></article><article><span>Overdue</span><strong>{overdue}</strong><small>Past due date</small></article></div></div>
  }

  return <div className="module-stack">
    <div className="module-head"><div><h1>{mode === 'quotations' ? 'Quotations' : 'Invoices'}</h1><p>{loading ? 'Loading…' : mode === 'quotations' ? `${quotations.length} quotation(s)` : `${invoices.length} invoice(s)`}</p></div>{mode === 'quotations' && <button className="primary tenant-primary" onClick={() => setShowQuote(true)}><Plus size={16}/> Create Quotation</button>}</div>
    <div className="search-box"><Search size={17}/><input value={term} onChange={(e) => setTerm(e.target.value)} placeholder={`Search ${mode}...`} /></div>
    {message && <div className="notice">{message}</div>}

    {mode === 'quotations' ? <div className="document-list">{filteredQuotes.map((quotation) => <article className="document-card" key={quotation.id}><div className="document-card-head"><div><FileText size={20}/><span><strong>{quotation.quotationNumber}</strong><small>{quotation.customerName}</small></span></div><span className={`document-status ${quotation.status}`}>{quotation.status}</span></div><div className="document-grid"><span><small>Total</small><strong>{money(quotation.total)}</strong></span><span><small>GST</small><strong>{money(quotation.taxAmount)}</strong></span><span><small>Discount</small><strong>{money(quotation.discountAmount)}</strong></span><span><small>Valid Until</small><strong>{quotation.validUntil || '—'}</strong></span><span><small>Items</small><strong>{quotation.items.length}</strong></span></div><div className="document-actions multi"><select value={quotation.status} disabled={quotation.status === 'converted'} onChange={(e) => void changeQuoteStatus(quotation, e.target.value as QuotationStatus)}><option value="draft">Draft</option><option value="sent">Sent</option><option value="accepted">Accepted</option><option value="rejected">Rejected</option><option value="converted">Converted</option></select><button className="ghost" onClick={() => setPrintable({ kind:'quotation', row:quotation })}>View</button><button className="ghost" onClick={() => printDocument({ kind:'quotation', row:quotation })}><Printer size={15}/> Print / PDF</button><button className="ghost" onClick={() => void shareDocument({ kind:'quotation', row:quotation })}><Share2 size={15}/> Share</button><button className="primary tenant-primary" disabled={Boolean(quotation.convertedInvoiceId)} onClick={() => void convert(quotation)}>{quotation.convertedInvoiceId ? 'Invoice Created' : 'Convert to Invoice'}</button></div></article>)}{!loading && filteredQuotes.length === 0 && <section className="panel empty-state"><FileText size={28}/><h3>No quotations found</h3><p className="muted">Create the first quotation for a customer.</p></section>}</div>
    : <div className="document-list">{filteredInvoices.map((invoice) => <article className="document-card" key={invoice.id}><div className="document-card-head"><div><ReceiptIndianRupee size={20}/><span><strong>{invoice.invoiceNumber}</strong><small>{invoice.customerName}</small></span></div><span className={`document-status ${invoice.status}`}>{invoice.status}</span></div><div className="document-grid"><span><small>Total</small><strong>{money(invoice.total)}</strong></span><span><small>Received</small><strong>{money(invoice.amountPaid)}</strong></span><span><small>Balance</small><strong>{money(invoice.balanceDue)}</strong></span><span><small>Due Date</small><strong>{invoice.dueDate || '—'}</strong></span><span><small>GST</small><strong>{money(invoice.taxAmount)}</strong></span></div><div className="document-actions multi"><button className="ghost" onClick={() => setPrintable({ kind:'invoice', row:invoice })}>View</button><button className="ghost" onClick={() => printDocument({ kind:'invoice', row:invoice })}><Printer size={15}/> Print / PDF</button><button className="ghost" onClick={() => void shareDocument({ kind:'invoice', row:invoice })}><Share2 size={15}/> Share</button><button className="primary tenant-primary" disabled={invoice.status === 'paid' || invoice.status === 'cancelled'} onClick={() => void openPayment(invoice)}><Banknote size={15}/> Record Payment</button></div></article>)}{!loading && filteredInvoices.length === 0 && <section className="panel empty-state"><ReceiptIndianRupee size={28}/><h3>No invoices found</h3><p className="muted">Convert an accepted quotation to create an invoice.</p></section>}</div>}

    {showQuote && <div className="modal-backdrop" onMouseDown={() => setShowQuote(false)}><section className="modal commercial-modal" onMouseDown={(e) => e.stopPropagation()}><div className="panel-title"><div><p className="eyebrow">SALES DOCUMENT</p><h2>Create Quotation</h2></div><button className="ghost" onClick={() => setShowQuote(false)}>Close</button></div><form className="form-grid" onSubmit={submitQuotation}><label>Customer<select value={customerId} onChange={(e) => setCustomerId(e.target.value)} required><option value="">Select customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} · {customer.customerId}</option>)}</select></label><label>Valid until<input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /></label><div className="full-field quotation-items"><div className="panel-title"><h3>Line Items</h3><button type="button" className="ghost" onClick={() => setItems([...items, { ...blankItem }])}><Plus size={15}/> Add Item</button></div>{items.map((item, index) => <div className="commercial-item" key={index}><input className="description" placeholder="Description" value={item.description} onChange={(e) => updateItem(index,{description:e.target.value})}/><input placeholder="HSN/SAC" value={item.hsnSac} onChange={(e) => updateItem(index,{hsnSac:e.target.value})}/><input placeholder="Unit" value={item.unit} onChange={(e) => updateItem(index,{unit:e.target.value})}/><input type="number" min="0.01" step="0.01" placeholder="Qty" value={item.quantity} onChange={(e) => updateItem(index,{quantity:Number(e.target.value)})}/><input type="number" min="0" step="0.01" placeholder="Rate" value={item.rate} onChange={(e) => updateItem(index,{rate:Number(e.target.value)})}/><input type="number" min="0" max="100" step="0.01" placeholder="Disc %" value={item.discountPercent} onChange={(e) => updateItem(index,{discountPercent:Number(e.target.value)})}/><input type="number" min="0" max="100" step="0.01" placeholder="GST %" value={item.taxPercent} onChange={(e) => updateItem(index,{taxPercent:Number(e.target.value)})}/><button type="button" className="ghost" disabled={items.length === 1} onClick={() => setItems(items.filter((_, i) => i !== index))}>Remove</button></div>)}<div className="document-total-box"><span>Subtotal <strong>{money(totals.subtotal)}</strong></span><span>Discount <strong>- {money(totals.discountAmount)}</strong></span><span>Taxable <strong>{money(totals.taxableAmount)}</strong></span><span>GST <strong>{money(totals.taxAmount)}</strong></span><label>Round-off<input type="number" step="0.01" value={roundOff} onChange={(e)=>setRoundOff(Number(e.target.value))}/></label><span className="grand-total">Grand Total <strong>{money(totals.total)}</strong></span></div></div><label className="full-field">Terms<textarea value={terms} onChange={(e) => setTerms(e.target.value)} /></label><label className="full-field">Notes<textarea value={notes} onChange={(e) => setNotes(e.target.value)} /></label><div className="form-actions"><button type="button" className="ghost" onClick={() => setShowQuote(false)}>Cancel</button><button className="primary tenant-primary" disabled={saving}>{saving ? 'Saving…' : 'Create Quotation'}</button></div></form></section></div>}

    {paymentInvoice && <div className="modal-backdrop" onMouseDown={() => setPaymentInvoice(null)}><section className="modal" onMouseDown={(e)=>e.stopPropagation()}><div className="panel-title"><div><p className="eyebrow">PAYMENT</p><h2>{paymentInvoice.invoiceNumber}</h2></div><button className="ghost" onClick={()=>setPaymentInvoice(null)}>Close</button></div><div className="payment-summary"><span>Invoice Total <strong>{money(paymentInvoice.total)}</strong></span><span>Already Received <strong>{money(paymentInvoice.amountPaid)}</strong></span><span>Balance <strong>{money(paymentInvoice.balanceDue)}</strong></span></div><form className="form-grid" onSubmit={submitPayment}><label>Amount<input type="number" min="0.01" max={paymentInvoice.balanceDue} step="0.01" value={paymentForm.amount} onChange={(e)=>setPaymentForm({...paymentForm,amount:e.target.value})} required/></label><label>Method<select value={paymentForm.method} onChange={(e)=>setPaymentForm({...paymentForm,method:e.target.value as PaymentMethod})}>{['Cash','Bank Transfer','UPI','Cheque','Card','Other'].map((m)=><option key={m}>{m}</option>)}</select></label><label>Payment Date<input type="date" value={paymentForm.paymentDate} onChange={(e)=>setPaymentForm({...paymentForm,paymentDate:e.target.value})} required/></label><label>Reference<input value={paymentForm.reference} onChange={(e)=>setPaymentForm({...paymentForm,reference:e.target.value})} placeholder="UTR / cheque no."/></label><label className="full-field">Notes<input value={paymentForm.notes} onChange={(e)=>setPaymentForm({...paymentForm,notes:e.target.value})}/></label><div className="form-actions"><button className="primary tenant-primary" disabled={saving}>{saving?'Saving…':'Record Payment'}</button></div></form>{paymentHistory.length>0&&<section className="payment-history"><h3>Payment History</h3>{paymentHistory.map((p)=><div key={p.id}><span>{p.paymentDate} · {p.method}{p.reference?` · ${p.reference}`:''}</span><strong>{money(p.amount)}</strong></div>)}</section>}</section></div>}

    {printable && <DocumentPreview doc={printable} company={company} fallbackBank={defaultBank} onClose={()=>setPrintable(null)} onPrint={()=>window.print()} onShare={()=>void shareDocument(printable)} />}
  </div>
}

function DocumentPreview({ doc, company, fallbackBank, onClose, onPrint, onShare }: { doc: PrintableDocument; company: CompanyDocumentProfile | null; fallbackBank: BankAccount | null; onClose:()=>void; onPrint:()=>void; onShare:()=>void }) {
  const row = doc.row as Quotation & Invoice
  const bank = doc.kind === 'invoice' ? (doc.row.bankAccount || fallbackBank) : fallbackBank
  const number = doc.kind === 'quotation' ? doc.row.quotationNumber : doc.row.invoiceNumber
  return <div className="modal-backdrop document-preview-backdrop" onMouseDown={onClose}><section className="document-preview-shell" onMouseDown={(e)=>e.stopPropagation()}><div className="preview-toolbar no-print"><button className="ghost" onClick={onClose}><X size={16}/> Close</button><div><button className="ghost" onClick={onShare}><Share2 size={15}/> Share</button><button className="primary tenant-primary" onClick={onPrint}><Printer size={15}/> Print / Save PDF</button></div></div><article className="print-document"><header><div>{company?.logoUrl&&<img src={company.logoUrl} alt="Company logo"/>}<h1>{company?.name || 'Solar Company'}</h1><p>{company?.address}</p><p>{[company?.phone,company?.email].filter(Boolean).join(' · ')}</p>{company?.gstNumber&&<p>GSTIN: {company.gstNumber}</p>}</div><div className="doc-title"><strong>{doc.kind==='quotation'?'QUOTATION':'TAX INVOICE'}</strong><span>{number}</span><small>Date: {row.createdAt ? row.createdAt.toLocaleDateString('en-IN') : today()}</small>{doc.kind==='quotation'&&row.validUntil&&<small>Valid Until: {row.validUntil}</small>}{doc.kind==='invoice'&&row.dueDate&&<small>Due Date: {row.dueDate}</small>}</div></header><section className="bill-to"><span>BILL TO</span><strong>{row.customerName}</strong><p>{row.customerAddress || '—'}</p><p>{[row.customerMobile,row.customerEmail].filter(Boolean).join(' · ')}</p></section><table><thead><tr><th>#</th><th>Description</th><th>HSN/SAC</th><th>Qty</th><th>Rate</th><th>Disc.</th><th>GST</th><th>Amount</th></tr></thead><tbody>{row.items.map((item,i)=>{const gross=item.quantity*item.rate;const discounted=gross*(1-item.discountPercent/100);const lineTotal=discounted*(1+item.taxPercent/100);return <tr key={i}><td>{i+1}</td><td>{item.description}<small>{item.unit}</small></td><td>{item.hsnSac||'—'}</td><td>{item.quantity}</td><td>{money(item.rate)}</td><td>{item.discountPercent}%</td><td>{item.taxPercent}%</td><td>{money(lineTotal)}</td></tr>})}</tbody></table><section className="print-totals"><span>Subtotal <strong>{money(row.subtotal)}</strong></span><span>Discount <strong>- {money(row.discountAmount)}</strong></span><span>Taxable Amount <strong>{money(row.taxableAmount)}</strong></span><span>GST <strong>{money(row.taxAmount)}</strong></span><span>Round-off <strong>{money(row.roundOff)}</strong></span><span className="grand">Grand Total <strong>{money(row.total)}</strong></span>{doc.kind==='invoice'&&<><span>Received <strong>{money(row.amountPaid)}</strong></span><span className="grand">Balance Due <strong>{money(row.balanceDue)}</strong></span></>}</section>{bank&&<section className="bank-print"><strong>Bank Details</strong><p>{bank.accountHolderName} · {bank.bankName}</p><p>A/C: {bank.accountNumber} · IFSC: {bank.ifscCode}</p>{bank.upiId&&<p>UPI: {bank.upiId}</p>}</section>}{row.terms&&<section className="terms-print"><strong>Terms & Conditions</strong><p>{row.terms}</p></section>}{row.notes&&<section className="terms-print"><strong>Notes</strong><p>{row.notes}</p></section>}<footer><span>For {company?.name || 'Solar Company'}</span><strong>Authorized Signatory</strong></footer></article></section></div>
}
