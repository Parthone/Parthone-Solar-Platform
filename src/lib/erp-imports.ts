import { collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore'
import { db } from './firebase'

export type MasterType = 'panel_brand' | 'panel_model' | 'inverter_brand' | 'inverter_model' | 'lead_source' | 'customer_category' | 'inventory_category'
export type MasterItem = { id: string; type: MasterType; name: string; code: string | null; isActive: boolean; sortOrder: number }
export type ErpConfig = { leadAutoAssign: boolean; defaultTaxPercent: number; quotationValidityDays: number; invoiceDueDays: number; currency: 'INR'; fiscalYearStartMonth: number }
export type ImportKind = 'customers' | 'leads' | 'inventory'
export type ImportResult = { success: boolean; imported: number; skipped: number; errors: Array<{ row: number; message: string }> }

export async function fetchMasterData(tenantId: string): Promise<MasterItem[]> {
  const snap = await getDocs(query(collection(db, 'tenants', tenantId, 'masterData'), orderBy('sortOrder'), orderBy('name')))
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MasterItem, 'id'>) }))
}

export async function fetchErpConfig(tenantId: string): Promise<ErpConfig> {
  const snap = await getDoc(doc(db, 'tenants', tenantId, 'erpConfig', 'defaults'))
  const row = snap.data() || {}
  return { leadAutoAssign: row.leadAutoAssign === true, defaultTaxPercent: Number(row.defaultTaxPercent ?? 18), quotationValidityDays: Number(row.quotationValidityDays ?? 15), invoiceDueDays: Number(row.invoiceDueDays ?? 7), currency: 'INR', fiscalYearStartMonth: Number(row.fiscalYearStartMonth ?? 4) }
}

export async function saveMasterData(tenantId: string, input: Partial<MasterItem> & Pick<MasterItem, 'type' | 'name'>) {
  if (!input.name.trim()) throw new Error('Name is required.')
  const ref = input.id ? doc(db, 'tenants', tenantId, 'masterData', input.id) : doc(collection(db, 'tenants', tenantId, 'masterData'))
  await setDoc(ref, { type: input.type, name: input.name.trim(), code: input.code?.trim() || null, isActive: input.isActive !== false, sortOrder: Number(input.sortOrder ?? 0), updatedAt: serverTimestamp(), ...(input.id ? {} : { createdAt: serverTimestamp() }) }, { merge: true })
}

export async function deleteMasterData(tenantId: string, id: string) { await deleteDoc(doc(db, 'tenants', tenantId, 'masterData', id)) }
export async function saveErpConfig(tenantId: string, input: ErpConfig) { await setDoc(doc(db, 'tenants', tenantId, 'erpConfig', 'defaults'), { ...input, currency: 'INR', updatedAt: serverTimestamp() }, { merge: true }) }

function v(row: Record<string,string>, key: string) { return String(row[key] ?? '').trim() }
export async function importCsvRows(tenantId: string, kind: ImportKind, rows: Record<string,string>[]): Promise<ImportResult> {
  if (rows.length > 500) throw new Error('Import up to 500 rows at a time.')
  const result: ImportResult = { success:true, imported:0, skipped:0, errors:[] }
  const valid: Array<{ref: ReturnType<typeof doc>; data: Record<string,unknown>}> = []
  rows.forEach((row,i)=>{
    const rowNo=i+2, name=v(row,'name')
    if(!name){result.skipped++;result.errors.push({row:rowNo,message:'Name is required.'});return}
    if(kind==='customers'||kind==='leads'){
      const mobile=v(row,'mobile'); if(!mobile){result.skipped++;result.errors.push({row:rowNo,message:'Mobile is required.'});return}
      const target=kind==='customers'?'customers':'leads'
      valid.push({ref:doc(collection(db,'tenants',tenantId,target)),data:kind==='customers'?{name,mobile,email:v(row,'email')||null,city:v(row,'city')||null,source:v(row,'source')||'Import',stage:v(row,'stage')||'Inquiry',dealAmount:Number(v(row,'deal_amount')||0),amountReceived:Number(v(row,'amount_received')||0),notes:v(row,'notes')||null,createdAt:serverTimestamp(),updatedAt:serverTimestamp(),importedAt:serverTimestamp()}:{name,mobile,email:v(row,'email')||null,city:v(row,'city')||null,source:v(row,'source')||'Import',status:v(row,'status')||'New',expectedValue:Number(v(row,'expected_value')||0),assignedTo:v(row,'assigned_to')||null,notes:v(row,'notes')||null,createdAt:serverTimestamp(),updatedAt:serverTimestamp(),importedAt:serverTimestamp()}})
      return
    }
    const category=v(row,'category'); if(!category){result.skipped++;result.errors.push({row:rowNo,message:'Category is required.'});return}
    valid.push({ref:doc(collection(db,'tenants',tenantId,'inventoryItems')),data:{itemCode:v(row,'item_code')||null,name,category,brand:v(row,'brand')||null,model:v(row,'model')||null,unit:v(row,'unit')||'Nos',currentStock:Number(v(row,'current_stock')||0),reservedStock:0,reorderLevel:Number(v(row,'reorder_level')||0),minStock:Number(v(row,'min_stock')||0),lastUnitPrice:Number(v(row,'unit_price')||0),warehouseLocation:v(row,'warehouse_location')||null,serialised:['true','yes','1'].includes(v(row,'serialised').toLowerCase()),createdAt:serverTimestamp(),updatedAt:serverTimestamp(),importedAt:serverTimestamp()}})
  })
  for(let i=0;i<valid.length;i+=400){const batch=writeBatch(db);valid.slice(i,i+400).forEach((x)=>batch.set(x.ref,x.data));await batch.commit()}
  result.imported=valid.length; return result
}

export function parseCsv(text: string): Record<string,string>[] {
  const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter((line)=>line.trim()); if(lines.length<2)return[]
  const parseLine=(line:string)=>{const out:string[]=[];let cur='',quoted=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'&&quoted&&line[i+1]==='"'){cur+='"';i++;continue}if(ch==='"'){quoted=!quoted;continue}if(ch===','&&!quoted){out.push(cur.trim());cur='';continue}cur+=ch}out.push(cur.trim());return out}
  const headers=parseLine(lines[0]).map((h)=>h.trim().toLowerCase().replace(/\s+/g,'_'))
  return lines.slice(1).map((line)=>{const values=parseLine(line),row:Record<string,string>={};headers.forEach((h,i)=>{row[h]=values[i]??''});return row})
}
