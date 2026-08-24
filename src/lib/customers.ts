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

function customerCollection(tenantId: string) {
  return collection(db, 'tenants', tenantId, 'customers')
}

export async function fetchCustomers(tenantId: string): Promise<Customer[]> {
  const snapshot = await getDocs(query(customerCollection(tenantId), orderBy('createdAt', 'desc')))
  return snapshot.docs.map((item) => {
    const data = item.data()
    return {
      id: item.id,
      customerId: data.customerId ?? `CUS-${item.id.slice(0, 6).toUpperCase()}`,
      name: data.name ?? '',
      mobile: data.mobile ?? '',
      email: data.email ?? null,
      village: data.village ?? null,
      address: data.address ?? null,
      systemSize: data.systemSize ?? null,
      stage: data.stage ?? 'Inquiry',
      leadStatus: data.leadStatus ?? 'New',
      assignedTo: data.assignedTo ?? null,
      nextFollowup: data.nextFollowup ?? null,
      nextAction: data.nextAction ?? null,
      dealAmount: Number(data.dealAmount ?? 0),
      amountReceived: Number(data.amountReceived ?? 0),
      installationStatus: data.installationStatus ?? 'pending',
      notes: data.notes ?? null,
    } as Customer
  })
}

export async function fetchCustomer(tenantId: string, customerId: string): Promise<Customer | null> {
  const snapshot = await getDoc(doc(db, 'tenants', tenantId, 'customers', customerId))
  if (!snapshot.exists()) return null
  const data = snapshot.data()
  return {
    id: snapshot.id,
    customerId: data.customerId ?? `CUS-${snapshot.id.slice(0, 6).toUpperCase()}`,
    name: data.name ?? '',
    mobile: data.mobile ?? '',
    email: data.email ?? null,
    village: data.village ?? null,
    address: data.address ?? null,
    systemSize: data.systemSize ?? null,
    stage: data.stage ?? 'Inquiry',
    leadStatus: data.leadStatus ?? 'New',
    assignedTo: data.assignedTo ?? null,
    nextFollowup: data.nextFollowup ?? null,
    nextAction: data.nextAction ?? null,
    dealAmount: Number(data.dealAmount ?? 0),
    amountReceived: Number(data.amountReceived ?? 0),
    installationStatus: data.installationStatus ?? 'pending',
    notes: data.notes ?? null,
  }
}

export async function createCustomer(tenantId: string, input: CustomerInput) {
  const ref = await addDoc(customerCollection(tenantId), {
    ...input,
    customerId: input.customerId || null,
    amountReceived: input.amountReceived ?? 0,
    installationStatus: input.installationStatus ?? 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  if (!input.customerId) {
    await updateDoc(ref, { customerId: `CUS-${ref.id.slice(0, 6).toUpperCase()}` })
  }
  return ref.id
}

export async function updateCustomer(tenantId: string, customerId: string, patch: Partial<CustomerInput>) {
  await updateDoc(doc(db, 'tenants', tenantId, 'customers', customerId), {
    ...patch,
    updatedAt: serverTimestamp(),
  })
}

export function customerOutstanding(customer: Customer) {
  return Math.max(0, customer.dealAmount - customer.amountReceived)
}

export function customerProgress(customer: Customer) {
  const index = CUSTOMER_STAGES.indexOf(customer.stage)
  return index < 0 ? 0 : Math.round(((index + 1) / CUSTOMER_STAGES.length) * 100)
}
