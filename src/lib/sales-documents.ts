import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { db } from './firebase'
import { fetchBankAccounts, type BankAccount } from './settings'

export type QuotationStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'converted'
export type InvoiceStatus = 'unpaid' | 'partial' | 'paid' | 'cancelled'
export type PaymentMethod = 'Cash' | 'Bank Transfer' | 'UPI' | 'Cheque' | 'Card' | 'Other'

export type LineItem = {
  description: string
  hsnSac: string
  unit: string
  quantity: number
  rate: number
  discountPercent: number
  taxPercent: number
}

export type DocumentTotals = {
  subtotal: number
  discountAmount: number
  taxableAmount: number
  taxAmount: number
  roundOff: number
  total: number
}

export type Quotation = DocumentTotals & {
  id: string
  quotationNumber: string
  customerId: string
  customerName: string
  customerMobile: string | null
  customerEmail: string | null
  customerAddress: string | null
  validUntil: string | null
  status: QuotationStatus
  notes: string | null
  terms: string | null
  items: LineItem[]
  convertedInvoiceId: string | null
  createdAt: Date | null
}

export type Invoice = DocumentTotals & {
  id: string
  invoiceNumber: string
  customerId: string
  customerName: string
  customerMobile: string | null
  customerEmail: string | null
  customerAddress: string | null
  quotationId: string | null
  dueDate: string | null
  status: InvoiceStatus
  notes: string | null
  terms: string | null
  items: LineItem[]
  amountPaid: number
  balanceDue: number
  bankAccount: BankAccount | null
  createdAt: Date | null
}

export type PaymentHistory = {
  id: string
  amount: number
  method: PaymentMethod
  reference: string | null
  paymentDate: string
  notes: string | null
  createdAt: Date | null
}

export type CompanyDocumentProfile = {
  name: string
  email: string | null
  phone: string | null
  address: string | null
  gstNumber: string | null
  logoUrl: string | null
}

function asDate(value: any): Date | null {
  return typeof value?.toDate === 'function' ? value.toDate() : null
}

function normalizeItems(value: any): LineItem[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => ({
    description: String(item.description ?? ''),
    hsnSac: String(item.hsnSac ?? ''),
    unit: String(item.unit ?? 'Nos'),
    quantity: Number(item.quantity ?? 0),
    rate: Number(item.rate ?? 0),
    discountPercent: Number(item.discountPercent ?? 0),
    taxPercent: Number(item.taxPercent ?? 0),
  }))
}

export function calculateDocumentTotals(items: LineItem[], roundOff = 0): DocumentTotals {
  const subtotal = items.reduce((sum, item) => sum + Math.max(0, item.quantity) * Math.max(0, item.rate), 0)
  const discountAmount = items.reduce((sum, item) => {
    const gross = Math.max(0, item.quantity) * Math.max(0, item.rate)
    return sum + gross * (Math.min(100, Math.max(0, item.discountPercent)) / 100)
  }, 0)
  const taxableAmount = Math.max(0, subtotal - discountAmount)
  const taxAmount = items.reduce((sum, item) => {
    const gross = Math.max(0, item.quantity) * Math.max(0, item.rate)
    const discounted = gross * (1 - Math.min(100, Math.max(0, item.discountPercent)) / 100)
    return sum + discounted * (Math.min(100, Math.max(0, item.taxPercent)) / 100)
  }, 0)
  const safeRoundOff = Number.isFinite(roundOff) ? roundOff : 0
  const total = Math.max(0, taxableAmount + taxAmount + safeRoundOff)
  return { subtotal, discountAmount, taxableAmount, taxAmount, roundOff: safeRoundOff, total }
}

function quotationCollection(tenantId: string) { return collection(db, 'tenants', tenantId, 'quotations') }
function invoiceCollection(tenantId: string) { return collection(db, 'tenants', tenantId, 'invoices') }

function counterRef(tenantId: string, year: number) {
  return doc(db, 'tenants', tenantId, 'documentCounters', String(year))
}

function formatNumber(prefix: 'QT' | 'INV', year: number, sequence: number) {
  return `${prefix}-${year}-${String(sequence).padStart(4, '0')}`
}

export async function fetchCompanyDocumentProfile(tenantId: string): Promise<CompanyDocumentProfile> {
  const snapshot = await getDoc(doc(db, 'tenants', tenantId))
  const data = snapshot.data() ?? {}
  return {
    name: String(data.name ?? 'Solar Company'),
    email: data.email ?? null,
    phone: data.phone ?? null,
    address: data.address ?? null,
    gstNumber: data.gstNumber ?? null,
    logoUrl: data.branding?.logoUrl ?? null,
  }
}

export async function fetchDefaultBankAccount(tenantId: string): Promise<BankAccount | null> {
  const rows = await fetchBankAccounts(tenantId)
  return rows.find((row) => row.isActive && row.isDefault) ?? rows.find((row) => row.isActive) ?? null
}

export async function fetchQuotations(tenantId: string): Promise<Quotation[]> {
  const snapshot = await getDocs(query(quotationCollection(tenantId), orderBy('createdAt', 'desc')))
  return snapshot.docs.map((item) => {
    const data = item.data()
    return {
      id: item.id,
      quotationNumber: data.quotationNumber ?? `QT-${item.id.slice(0, 6).toUpperCase()}`,
      customerId: data.customerId ?? '',
      customerName: data.customerName ?? '',
      customerMobile: data.customerMobile ?? null,
      customerEmail: data.customerEmail ?? null,
      customerAddress: data.customerAddress ?? null,
      validUntil: data.validUntil ?? null,
      status: data.status ?? 'draft',
      notes: data.notes ?? null,
      terms: data.terms ?? null,
      items: normalizeItems(data.items),
      subtotal: Number(data.subtotal ?? 0),
      discountAmount: Number(data.discountAmount ?? 0),
      taxableAmount: Number(data.taxableAmount ?? data.subtotal ?? 0),
      taxAmount: Number(data.taxAmount ?? 0),
      roundOff: Number(data.roundOff ?? 0),
      total: Number(data.total ?? 0),
      convertedInvoiceId: data.convertedInvoiceId ?? null,
      createdAt: asDate(data.createdAt),
    }
  })
}

export async function fetchInvoices(tenantId: string): Promise<Invoice[]> {
  const snapshot = await getDocs(query(invoiceCollection(tenantId), orderBy('createdAt', 'desc')))
  return snapshot.docs.map((item) => {
    const data = item.data()
    return {
      id: item.id,
      invoiceNumber: data.invoiceNumber ?? `INV-${item.id.slice(0, 6).toUpperCase()}`,
      customerId: data.customerId ?? '',
      customerName: data.customerName ?? '',
      customerMobile: data.customerMobile ?? null,
      customerEmail: data.customerEmail ?? null,
      customerAddress: data.customerAddress ?? null,
      quotationId: data.quotationId ?? null,
      dueDate: data.dueDate ?? null,
      status: data.status ?? 'unpaid',
      notes: data.notes ?? null,
      terms: data.terms ?? null,
      items: normalizeItems(data.items),
      subtotal: Number(data.subtotal ?? 0),
      discountAmount: Number(data.discountAmount ?? 0),
      taxableAmount: Number(data.taxableAmount ?? data.subtotal ?? 0),
      taxAmount: Number(data.taxAmount ?? 0),
      roundOff: Number(data.roundOff ?? 0),
      total: Number(data.total ?? 0),
      amountPaid: Number(data.amountPaid ?? 0),
      balanceDue: Number(data.balanceDue ?? data.total ?? 0),
      bankAccount: data.bankAccount ?? null,
      createdAt: asDate(data.createdAt),
    }
  })
}

export async function createQuotation(
  tenantId: string,
  input: {
    customerId: string
    customerName: string
    customerMobile?: string | null
    customerEmail?: string | null
    customerAddress?: string | null
    validUntil?: string | null
    notes?: string | null
    terms?: string | null
    roundOff?: number
    items: LineItem[]
  },
) {
  const items = input.items.map((item) => ({
    ...item,
    hsnSac: item.hsnSac.trim(),
    unit: item.unit.trim() || 'Nos',
    quantity: Math.max(0, Number(item.quantity)),
    rate: Math.max(0, Number(item.rate)),
    discountPercent: Math.min(100, Math.max(0, Number(item.discountPercent))),
    taxPercent: Math.min(100, Math.max(0, Number(item.taxPercent))),
  }))
  const totals = calculateDocumentTotals(items, Number(input.roundOff ?? 0))
  const ref = doc(quotationCollection(tenantId))
  const year = new Date().getFullYear()
  const counter = counterRef(tenantId, year)

  await runTransaction(db, async (tx) => {
    const counterSnapshot = await tx.get(counter)
    const sequence = Number(counterSnapshot.data()?.quotation ?? 0) + 1
    tx.set(counter, { quotation: sequence, updatedAt: serverTimestamp() }, { merge: true })
    tx.set(ref, {
      ...input,
      items,
      ...totals,
      quotationNumber: formatNumber('QT', year, sequence),
      status: 'draft',
      convertedInvoiceId: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  })
  return ref.id
}

export async function updateQuotationStatus(tenantId: string, quotationId: string, status: QuotationStatus) {
  await updateDoc(doc(db, 'tenants', tenantId, 'quotations', quotationId), { status, updatedAt: serverTimestamp() })
}

export async function convertQuotationToInvoice(
  tenantId: string,
  quotation: Quotation,
  dueDate?: string | null,
  bankAccount?: BankAccount | null,
) {
  if (quotation.convertedInvoiceId) return quotation.convertedInvoiceId
  const invoiceRef = doc(invoiceCollection(tenantId))
  const quotationRef = doc(db, 'tenants', tenantId, 'quotations', quotation.id)
  const year = new Date().getFullYear()
  const counter = counterRef(tenantId, year)

  await runTransaction(db, async (tx) => {
    const [counterSnapshot, currentQuote] = await Promise.all([tx.get(counter), tx.get(quotationRef)])
    if (!currentQuote.exists()) throw new Error('Quotation no longer exists.')
    if (currentQuote.data().convertedInvoiceId) throw new Error('Quotation already converted to an invoice.')
    const sequence = Number(counterSnapshot.data()?.invoice ?? 0) + 1
    const invoiceNumber = formatNumber('INV', year, sequence)
    tx.set(counter, { invoice: sequence, updatedAt: serverTimestamp() }, { merge: true })
    tx.set(invoiceRef, {
      invoiceNumber,
      customerId: quotation.customerId,
      customerName: quotation.customerName,
      customerMobile: quotation.customerMobile,
      customerEmail: quotation.customerEmail,
      customerAddress: quotation.customerAddress,
      quotationId: quotation.id,
      quotationNumber: quotation.quotationNumber,
      dueDate: dueDate || null,
      status: 'unpaid',
      notes: quotation.notes,
      terms: quotation.terms,
      items: quotation.items,
      subtotal: quotation.subtotal,
      discountAmount: quotation.discountAmount,
      taxableAmount: quotation.taxableAmount,
      taxAmount: quotation.taxAmount,
      roundOff: quotation.roundOff,
      total: quotation.total,
      amountPaid: 0,
      balanceDue: quotation.total,
      bankAccount: bankAccount ?? null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    tx.update(quotationRef, {
      status: 'converted',
      convertedInvoiceId: invoiceRef.id,
      convertedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
  })
  return invoiceRef.id
}

export async function fetchInvoicePaymentHistory(tenantId: string, invoiceId: string): Promise<PaymentHistory[]> {
  const snapshot = await getDocs(query(
    collection(db, 'tenants', tenantId, 'invoices', invoiceId, 'payments'),
    orderBy('createdAt', 'desc'),
  ))
  return snapshot.docs.map((row) => {
    const data = row.data()
    return {
      id: row.id,
      amount: Number(data.amount ?? 0),
      method: data.method ?? 'Other',
      reference: data.reference ?? null,
      paymentDate: data.paymentDate ?? '',
      notes: data.notes ?? null,
      createdAt: asDate(data.createdAt),
    }
  })
}

export async function recordInvoicePayment(
  tenantId: string,
  invoiceId: string,
  input: { amount: number; method: PaymentMethod; reference?: string | null; paymentDate: string; notes?: string | null },
) {
  const invoiceRef = doc(db, 'tenants', tenantId, 'invoices', invoiceId)
  const paymentRef = doc(collection(invoiceRef, 'payments'))
  await runTransaction(db, async (tx) => {
    const snapshot = await tx.get(invoiceRef)
    if (!snapshot.exists()) throw new Error('Invoice not found.')
    const data = snapshot.data()
    if (data.status === 'cancelled') throw new Error('Cancelled invoice cannot receive payments.')
    const total = Number(data.total ?? 0)
    const currentPaid = Number(data.amountPaid ?? 0)
    const amount = Math.max(0, Number(input.amount))
    if (!amount) throw new Error('Payment amount must be greater than zero.')
    const nextPaid = Math.min(total, currentPaid + amount)
    const acceptedAmount = nextPaid - currentPaid
    if (acceptedAmount <= 0) throw new Error('Invoice is already fully paid.')
    const balanceDue = Math.max(0, total - nextPaid)
    const status: InvoiceStatus = balanceDue <= 0 ? 'paid' : 'partial'
    tx.update(invoiceRef, { amountPaid: nextPaid, balanceDue, status, updatedAt: serverTimestamp() })
    tx.set(paymentRef, {
      amount: acceptedAmount,
      method: input.method,
      reference: input.reference?.trim() || null,
      paymentDate: input.paymentDate,
      notes: input.notes?.trim() || null,
      createdAt: serverTimestamp(),
    })
  })
}

export async function updateInvoicePayment(tenantId: string, invoice: Invoice, amountPaid: number) {
  const delta = Number(amountPaid) - invoice.amountPaid
  if (delta <= 0) throw new Error('Use payment history to add a new positive payment.')
  await recordInvoicePayment(tenantId, invoice.id, {
    amount: delta,
    method: 'Other',
    paymentDate: new Date().toISOString().slice(0, 10),
  })
}
