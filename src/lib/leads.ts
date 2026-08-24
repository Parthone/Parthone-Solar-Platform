import {
  addDoc,
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db } from './firebase'

export const LEAD_STATUSES = ['New', 'Contacted', 'Qualified', 'Proposal', 'Negotiation', 'Converted', 'Lost'] as const
export type LeadStatus = typeof LEAD_STATUSES[number]

export type Lead = {
  id: string
  leadId: string
  name: string
  mobile: string
  email: string | null
  village: string | null
  address: string | null
  systemSize: number | null
  source: string | null
  status: LeadStatus
  assignedTo: string | null
  assignedToName: string | null
  nextFollowup: string | null
  nextAction: string | null
  notes: string | null
  expectedValue: number
  convertedCustomerId: string | null
}

export type LeadInput = Omit<Lead, 'id' | 'leadId' | 'convertedCustomerId'> & { leadId?: string }

export type TenantUser = {
  id: string
  fullName: string
  email: string
  role: 'client_admin' | 'employee'
  isActive: boolean
}

function leadsCollection(tenantId: string) {
  return collection(db, 'tenants', tenantId, 'leads')
}

export async function fetchLeads(tenantId: string): Promise<Lead[]> {
  const snapshot = await getDocs(query(leadsCollection(tenantId), orderBy('createdAt', 'desc')))
  return snapshot.docs.map((item) => {
    const data = item.data()
    return {
      id: item.id,
      leadId: data.leadId ?? `LEAD-${item.id.slice(0, 6).toUpperCase()}`,
      name: data.name ?? '',
      mobile: data.mobile ?? '',
      email: data.email ?? null,
      village: data.village ?? null,
      address: data.address ?? null,
      systemSize: data.systemSize ?? null,
      source: data.source ?? null,
      status: data.status ?? 'New',
      assignedTo: data.assignedTo ?? null,
      assignedToName: data.assignedToName ?? null,
      nextFollowup: data.nextFollowup ?? null,
      nextAction: data.nextAction ?? null,
      notes: data.notes ?? null,
      expectedValue: Number(data.expectedValue ?? 0),
      convertedCustomerId: data.convertedCustomerId ?? null,
    } as Lead
  })
}

export async function fetchTenantUsers(tenantId: string): Promise<TenantUser[]> {
  const snapshot = await getDocs(query(collection(db, 'users'), where('tenantId', '==', tenantId)))
  return snapshot.docs
    .map((item) => ({ id: item.id, ...(item.data() as Omit<TenantUser, 'id'>) }))
    .filter((user) => user.role !== ('parthone_super_admin' as TenantUser['role']))
    .map((user) => ({
      id: user.id,
      fullName: user.fullName ?? 'User',
      email: user.email ?? '',
      role: user.role,
      isActive: user.isActive !== false,
    }))
}

export async function createLead(tenantId: string, input: LeadInput) {
  const ref = await addDoc(leadsCollection(tenantId), {
    ...input,
    leadId: input.leadId || null,
    convertedCustomerId: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  if (!input.leadId) await updateDoc(ref, { leadId: `LEAD-${ref.id.slice(0, 6).toUpperCase()}` })
  return ref.id
}

export async function updateLead(tenantId: string, leadId: string, patch: Partial<LeadInput>) {
  await updateDoc(doc(db, 'tenants', tenantId, 'leads', leadId), {
    ...patch,
    updatedAt: serverTimestamp(),
  })
}

export async function convertLeadToCustomer(tenantId: string, lead: Lead) {
  if (lead.convertedCustomerId) return lead.convertedCustomerId

  const customerRef = doc(collection(db, 'tenants', tenantId, 'customers'))
  const leadRef = doc(db, 'tenants', tenantId, 'leads', lead.id)
  const batch = writeBatch(db)
  const customerId = `CUS-${customerRef.id.slice(0, 6).toUpperCase()}`

  batch.set(customerRef, {
    customerId,
    sourceLeadId: lead.id,
    sourceLeadCode: lead.leadId,
    name: lead.name,
    mobile: lead.mobile,
    email: lead.email,
    village: lead.village,
    address: lead.address,
    systemSize: lead.systemSize,
    stage: 'Inquiry',
    leadStatus: 'Converted',
    assignedTo: lead.assignedTo,
    nextFollowup: lead.nextFollowup,
    nextAction: lead.nextAction,
    dealAmount: lead.expectedValue,
    amountReceived: 0,
    installationStatus: 'pending',
    notes: lead.notes,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  batch.update(leadRef, {
    status: 'Converted',
    convertedCustomerId: customerRef.id,
    convertedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  await batch.commit()
  return customerRef.id
}
