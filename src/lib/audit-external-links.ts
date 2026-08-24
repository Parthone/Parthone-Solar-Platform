import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from './firebase'

export type AuditLog = {
  id: string
  tenantId: string
  userId: string | null
  userName: string | null
  module: string
  action: string
  previousValue: string | null
  newValue: string | null
  createdAt: { toDate?: () => Date } | null
}

export type ExternalLink = {
  id: string
  tenantId: string
  name: string
  category: string
  url: string
  isActive: boolean
  createdBy: string | null
}

export async function fetchAuditLogs(tenantId: string): Promise<AuditLog[]> {
  const snapshot = await getDocs(query(
    collection(db, 'auditLogs'),
    where('tenantId', '==', tenantId),
    orderBy('createdAt', 'desc'),
    limit(200),
  ))
  return snapshot.docs.map((row) => ({ id: row.id, ...(row.data() as Omit<AuditLog, 'id'>) }))
}

export async function fetchExternalLinks(tenantId: string): Promise<ExternalLink[]> {
  const snapshot = await getDocs(query(collection(db, 'externalLinks'), where('tenantId', '==', tenantId)))
  return snapshot.docs
    .map((row) => ({ id: row.id, ...(row.data() as Omit<ExternalLink, 'id'>) }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

const saveExternalLinkCallable = httpsCallable(functions, 'saveExternalLink')
const deleteExternalLinkCallable = httpsCallable(functions, 'deleteExternalLink')

export async function saveExternalLink(input: { id?: string; name: string; category: string; url: string; isActive: boolean }) {
  await saveExternalLinkCallable(input)
}

export async function deleteExternalLink(id: string) {
  await deleteExternalLinkCallable({ id })
}
