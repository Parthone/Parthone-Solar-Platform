import {
  addDoc,
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { db } from './firebase'

export type QuotationStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'converted'
export type InvoiceStatus = 'unpaid' | 'partial' | 'paid' | 'cancelled'

export type LineItem = {
  description: string
  quantity: number
  rate: number
  taxPercent: number
}

export type Quotation = {
  id: string
  quotationNumber: string
  customerId: string
  customerName: string
  customerMobile: string | null
  validUntil: string | null
  status: QuotationStatus
  notes: string | null
  items: LineItem[]
  subtotal: number
  taxAmount: number
  total: number
  convertedInvoiceId: string | null
}

export type Invoice = {
  id: string
  invoiceNumber: string
  customerId: string
  customerName: string
  customerMobile: string | null
  quotationId: string | null
  dueDate: string | null
  status: InvoiceStatus
  notes: string | null
  items: LineItem[]
  subtotal: number
  taxAmount: number
  total: number
  amountPaid: number
  balanceDue: number
}

function calc(items: LineItem[]) {
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.rate, 0)
  const taxAmount = items.reduce((sum, item) => sum + item.quantity * item.rate * (item.taxPercent / 100), 0)
  return { subtotal, taxAmount, total: subtotal + taxAmount }
}

function quotationCollection(tenantId: string) {
  return collection(db, 'tenants', tenantId, 'quotations')
}

function invoiceCollection(tenantId: string) {
  return collection(db, 'tenants', tenantId, 'invoices')
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
      validUntil: data.validUntil ?? null,
      status: data.status ?? 'draft',
      notes: data.notes ?? null,
      items: Array.isArray(data.items) ? data.items : [],
      subtotal: Number(data.subtotal ?? 0),
      taxAmount: Number(data.taxAmount ?? 0),
      total: Number(data.total ?? 0),
      convertedInvoiceId: data.convertedInvoiceId ?? null,
    } as Quotation
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
      quotationId: data.quotationId ?? null,
      dueDate: data.dueDate ?? null,
      status: data.status ?? 'unpaid',
      notes: data.notes ?? null,
      items: Array.isArray(data.items) ? data.items : [],
      subtotal: Number(data.subtotal ?? 0),
      taxAmount: Number(data.taxAmount ?? 0),
      total: Number(data.total ?? 0),
      amountPaid: Number(data.amountPaid ?? 0),
      balanceDue: Number(data.balanceDue ?? data.total ?? 0),
    } as Invoice
  })
}

export async function createQuotation(
  tenantId: string,
  input: {
    customerId: string
    customerName: string
    customerMobile?: string | null
    validUntil?: string | null
    notes?: string | null
    items: LineItem[]
  },
) {
  const totals = calc(input.items)
  const ref = await addDoc(quotationCollection(tenantId), {
    ...input,
    ...totals,
    quotationNumber: null,
    status: 'draft',
    convertedInvoiceId: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  await updateDoc(ref, { quotationNumber: `QT-${ref.id.slice(0, 6).toUpperCase()}` })
  return ref.id
}

export async function updateQuotationStatus(tenantId: string, quotationId: string, status: QuotationStatus) {
  await updateDoc(doc(db, 'tenants', tenantId, 'quotations', quotationId), {
    status,
    updatedAt: serverTimestamp(),
  })
}

export async function convertQuotationToInvoice(tenantId: string, quotation: Quotation, dueDate?: string | null) {
  if (quotation.convertedInvoiceId) return quotation.convertedInvoiceId

  const invoiceRef = doc(invoiceCollection(tenantId))
  const quotationRef = doc(db, 'tenants', tenantId, 'quotations', quotation.id)
  const batch = writeBatch(db)
  const invoiceNumber = `INV-${invoiceRef.id.slice(0, 6).toUpperCase()}`

  batch.set(invoiceRef, {
    invoiceNumber,
    customerId: quotation.customerId,
    customerName: quotation.customerName,
    customerMobile: quotation.customerMobile,
    quotationId: quotation.id,
    dueDate: dueDate || null,
    status: 'unpaid',
    notes: quotation.notes,
    items: quotation.items,
    subtotal: quotation.subtotal,
    taxAmount: quotation.taxAmount,
    total: quotation.total,
    amountPaid: 0,
    balanceDue: quotation.total,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  batch.update(quotationRef, {
    status: 'converted',
    convertedInvoiceId: invoiceRef.id,
    convertedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  await batch.commit()
  return invoiceRef.id
}

export async function updateInvoicePayment(
  tenantId: string,
  invoice: Invoice,
  amountPaid: number,
) {
  const paid = Math.max(0, Math.min(amountPaid, invoice.total))
  const balanceDue = Math.max(0, invoice.total - paid)
  const status: InvoiceStatus = paid <= 0 ? 'unpaid' : balanceDue <= 0 ? 'paid' : 'partial'

  await updateDoc(doc(db, 'tenants', tenantId, 'invoices', invoice.id), {
    amountPaid: paid,
    balanceDue,
    status,
    updatedAt: serverTimestamp(),
  })
}
