import { collection, getDocs, orderBy, query } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from './firebase'

export type MasterType = 'panel_brand' | 'panel_model' | 'inverter_brand' | 'inverter_model' | 'lead_source' | 'customer_category' | 'inventory_category'
export type MasterItem = { id: string; type: MasterType; name: string; code: string | null; isActive: boolean; sortOrder: number }
export type ErpConfig = { leadAutoAssign: boolean; defaultTaxPercent: number; quotationValidityDays: number; invoiceDueDays: number; currency: 'INR'; fiscalYearStartMonth: number }
export type ImportKind = 'customers' | 'leads' | 'inventory'
export type ImportResult = { success: boolean; imported: number; skipped: number; errors: Array<{ row: number; message: string }> }

const saveMaster = httpsCallable(functions, 'saveMasterData')
const deleteMaster = httpsCallable(functions, 'deleteMasterData')
const saveErp = httpsCallable(functions, 'saveErpConfig')
const importRows = httpsCallable(functions, 'importCsvRows')

export async function fetchMasterData(tenantId: string): Promise<MasterItem[]> {
  const snap = await getDocs(query(collection(db, 'tenants', tenantId, 'masterData'), orderBy('sortOrder'), orderBy('name')))
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MasterItem, 'id'>) }))
}

export async function fetchErpConfig(tenantId: string): Promise<ErpConfig> {
  const snap = await getDocs(collection(db, 'tenants', tenantId, 'erpConfig'))
  const row = snap.docs[0]?.data() || {}
  return {
    leadAutoAssign: row.leadAutoAssign === true,
    defaultTaxPercent: Number(row.defaultTaxPercent ?? 18),
    quotationValidityDays: Number(row.quotationValidityDays ?? 15),
    invoiceDueDays: Number(row.invoiceDueDays ?? 7),
    currency: 'INR',
    fiscalYearStartMonth: Number(row.fiscalYearStartMonth ?? 4),
  }
}

export async function saveMasterData(input: Partial<MasterItem> & Pick<MasterItem, 'type' | 'name'>) { await saveMaster(input) }
export async function deleteMasterData(id: string) { await deleteMaster({ id }) }
export async function saveErpConfig(input: ErpConfig) { await saveErp(input) }
export async function importCsvRows(kind: ImportKind, rows: Record<string, string>[]): Promise<ImportResult> {
  const result = await importRows({ kind, rows })
  return result.data as ImportResult
}

export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim())
  if (lines.length < 2) return []
  const parseLine = (line: string) => {
    const out: string[] = []; let cur = ''; let quoted = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"' && quoted && line[i + 1] === '"') { cur += '"'; i++; continue }
      if (ch === '"') { quoted = !quoted; continue }
      if (ch === ',' && !quoted) { out.push(cur.trim()); cur = ''; continue }
      cur += ch
    }
    out.push(cur.trim()); return out
  }
  const headers = parseLine(lines[0]).map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'))
  return lines.slice(1).map((line) => {
    const values = parseLine(line); const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h] = values[i] ?? '' })
    return row
  })
}
