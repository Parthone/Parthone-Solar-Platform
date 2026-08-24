import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { db } from './firebase'

export type CustomerStage =
  | 'Inquiry'
  | 'Site Visit'
  | 'Quotation'
  | 'Order Confirmed'
  | 'Installation'
  | 'Completed'

export const CUSTOMER_STAGES: CustomerStage[] = [
  'Inquiry',
  'Site Visit',
  'Quotation',
  'Order Confirmed',
  'Installation',
  'Completed',
]

export type Customer = {
  id: string
  customerId: string
  name: string
  mobile: string
  email: string | null
  village: string | null
  address: string | null
  systemSize: number | null
  stage: CustomerStage
  leadStatus: string
  assignedTo: string | null
  assignedToName: string | null
  nextFollowup: string | null
  nextAction: string | null
  dealAmount: number
  amountReceived: number
  installationStatus: 'pending' | 'in_progress' | 'completed'
  notes: string | null
}

export type CustomerInput = Omit<Customer, 'id' | 'customerId' | 'amountReceived' | 'installationStatus'> & {
  customerId?: string
  amountReceived?: number
  installationStatus?: Customer['installationStatus']
}

export type CustomerStageHistory = {
  id: string
  fromStage: CustomerStage | null
  toStage: CustomerStage
  note: string | null
  changedBy: string | null
  changedByName: string | null
  changedAt: Date | null
}

function customerCollection(tenantId: string) {
  return collection(db, 'tenants', tenantId, 'customers')
}

function normalizeCustomer(id: string, data: Record<string, any>): Customer {
  return {
    id,
    customerId: data.customerId ?? `CUS-${id.slice(0, 6).toUpperCase()}`,
    name: data.name ?? '',
    mobile: data.mobile ?? '',
    email: data.email ?? null,
    village: data.village ?? null,
    address: data.address ?? null,
    systemSize: data.systemSize ?? null,
    stage: data.stage ?? 'Inquiry',
    leadStatus: data.leadStatus ?? 'New',
    assignedTo: data.assignedTo ?? null,
    assignedToName: data.assignedToName ?? null,
    nextFollowup: data.nextFollowup ?? null,
    nextAction: data.nextAction ?? null,
    dealAmount: Number(data.dealAmount ?? 0),
    amountReceived: Number(data.amountReceived ?? 0),
    installationStatus: data.installationStatus ?? 'pending',
    notes: data.notes ?? null,
  }
}

export async function fetchCustomers(tenantId: string): Promise<Customer[]> {
  const snapshot = await getDocs(query(customerCollection(tenantId), orderBy('createdAt', 'desc')))
  return snapshot.docs.map((item) => normalizeCustomer(item.id, item.data()))
}

export async function fetchCustomer(tenantId: string, customerId: string): Promise<Customer | null> {
  const snapshot = await getDoc(doc(db, 'tenants', tenantId, 'customers', customerId))
  if (!snapshot.exists()) return null
  return normalizeCustomer(snapshot.id, snapshot.data())
}

export async function createCustomer(tenantId: string, input: CustomerInput) {
  const ref = await addDoc(customerCollection(tenantId), {
    ...input,
    customerId: input.customerId || null,
    assignedToName: input.assignedToName ?? null,
    amountReceived: input.amountReceived ?? 0,
    installationStatus: input.installationStatus ?? 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  if (!input.customerId) await updateDoc(ref, { customerId: `CUS-${ref.id.slice(0, 6).toUpperCase()}` })
  return ref.id
}

export async function updateCustomer(tenantId: string, customerId: string, patch: Partial<CustomerInput>) {
  await updateDoc(doc(db, 'tenants', tenantId, 'customers', customerId), {
    ...patch,
    updatedAt: serverTimestamp(),
  })
}

export async function updateCustomerFollowup(
  tenantId: string,
  customerId: string,
  input: { nextFollowup: string | null; nextAction: string | null; notes?: string | null },
) {
  await updateDoc(doc(db, 'tenants', tenantId, 'customers', customerId), {
    nextFollowup: input.nextFollowup,
    nextAction: input.nextAction,
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
    updatedAt: serverTimestamp(),
  })
}

export async function updateCustomerAssignment(
  tenantId: string,
  customerId: string,
  assignedTo: string | null,
  assignedToName: string | null,
) {
  await updateDoc(doc(db, 'tenants', tenantId, 'customers', customerId), {
    assignedTo,
    assignedToName,
    updatedAt: serverTimestamp(),
  })
}

export async function updateCustomerFinancialStatus(
  tenantId: string,
  customerId: string,
  patch: { amountReceived?: number; installationStatus?: Customer['installationStatus'] },
) {
  await updateDoc(doc(db, 'tenants', tenantId, 'customers', customerId), {
    ...patch,
    updatedAt: serverTimestamp(),
  })
}

export async function moveCustomerStage(
  tenantId: string,
  customer: Customer,
  toStage: CustomerStage,
  actor?: { id?: string | null; name?: string | null },
  note?: string | null,
) {
  if (customer.stage === toStage) return
  const customerRef = doc(db, 'tenants', tenantId, 'customers', customer.id)
  const historyRef = doc(collection(customerRef, 'stageHistory'))
  const batch = writeBatch(db)
  const installationStatus = toStage === 'Completed'
    ? 'completed'
    : toStage === 'Installation'
      ? 'in_progress'
      : customer.installationStatus
  batch.update(customerRef, {
    stage: toStage,
    installationStatus,
    updatedAt: serverTimestamp(),
  })
  batch.set(historyRef, {
    fromStage: customer.stage,
    toStage,
    note: note?.trim() || null,
    changedBy: actor?.id ?? null,
    changedByName: actor?.name ?? null,
    changedAt: serverTimestamp(),
  })
  await batch.commit()
}

export async function fetchCustomerStageHistory(tenantId: string, customerId: string): Promise<CustomerStageHistory[]> {
  const snapshot = await getDocs(query(
    collection(db, 'tenants', tenantId, 'customers', customerId, 'stageHistory'),
    orderBy('changedAt', 'desc'),
  ))
  return snapshot.docs.map((row) => {
    const data = row.data()
    return {
      id: row.id,
      fromStage: data.fromStage ?? null,
      toStage: data.toStage ?? 'Inquiry',
      note: data.note ?? null,
      changedBy: data.changedBy ?? null,
      changedByName: data.changedByName ?? null,
      changedAt: typeof data.changedAt?.toDate === 'function' ? data.changedAt.toDate() : null,
    }
  })
}

export function customerOutstanding(customer: Customer) {
  return Math.max(0, customer.dealAmount - customer.amountReceived)
}

export function customerProgress(customer: Customer) {
  const index = CUSTOMER_STAGES.indexOf(customer.stage)
  return index < 0 ? 0 : Math.round(((index + 1) / CUSTOMER_STAGES.length) * 100)
}
