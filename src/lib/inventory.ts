import {
  addDoc,
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db } from './firebase'

export type InventoryItem = {
  id: string
  itemCode: string
  name: string
  category: string
  brand: string | null
  model: string | null
  unit: string
  currentStock: number
  reservedStock: number
  issuedStock: number
  damagedStock: number
  missingStock: number
  reorderLevel: number
  minStock: number
  lastUnitPrice: number
  warehouseLocation: string | null
  serialised: boolean
}

export type Supplier = {
  id: string
  name: string
  contactPerson: string | null
  phone: string | null
  email: string | null
  gstNumber: string | null
  address: string | null
}

export type StockMovementType = 'purchase' | 'issue' | 'reservation' | 'reservation_release' | 'adjustment' | 'return' | 'damage' | 'missing'
export type StockMovement = {
  id: string
  itemId: string
  itemName: string
  type: StockMovementType
  quantity: number
  unitPrice: number
  reference: string | null
  customerId: string | null
  customerName: string | null
  supplierId: string | null
  supplierName: string | null
  purchaseInvoice: string | null
  batchNumber: string | null
  note: string | null
  createdAt?: unknown
}

export type PurchaseBatch = {
  id: string
  itemId: string
  itemName: string
  supplierId: string | null
  supplierName: string | null
  purchaseInvoice: string | null
  batchNumber: string
  quantity: number
  unitPrice: number
  purchaseDate: string
  serialCount: number
}

export type InventorySerialStatus = 'available' | 'reserved' | 'issued' | 'damaged' | 'missing' | 'returned'
export type InventorySerial = {
  id: string
  serialNumber: string
  itemId: string
  itemName: string
  batchId: string | null
  batchNumber: string | null
  supplierName: string | null
  status: InventorySerialStatus
  customerId: string | null
  customerName: string | null
  purchaseDate: string | null
  unitPrice: number
}

export type Reservation = {
  id: string
  itemId: string
  itemName: string
  customerId: string | null
  customerName: string
  quantity: number
  status: 'active' | 'released' | 'issued'
  serialNumbers: string[]
  note: string | null
}

function tenantCollection(tenantId: string, name: string) { return collection(db, 'tenants', tenantId, name) }

export async function fetchInventoryItems(tenantId: string): Promise<InventoryItem[]> {
  const snapshot = await getDocs(query(tenantCollection(tenantId, 'inventoryItems'), orderBy('name')))
  return snapshot.docs.map((row) => {
    const data = row.data()
    return {
      id: row.id,
      itemCode: data.itemCode ?? `ITEM-${row.id.slice(0, 6).toUpperCase()}`,
      name: data.name ?? '', category: data.category ?? 'Other', brand: data.brand ?? null, model: data.model ?? null,
      unit: data.unit ?? 'Nos', currentStock: Number(data.currentStock ?? 0), reservedStock: Number(data.reservedStock ?? 0),
      issuedStock: Number(data.issuedStock ?? 0), damagedStock: Number(data.damagedStock ?? 0), missingStock: Number(data.missingStock ?? 0),
      reorderLevel: Number(data.reorderLevel ?? 0), minStock: Number(data.minStock ?? 0), lastUnitPrice: Number(data.lastUnitPrice ?? 0),
      warehouseLocation: data.warehouseLocation ?? null, serialised: data.serialised === true,
    }
  })
}

export async function createInventoryItem(tenantId: string, input: Omit<InventoryItem, 'id'|'itemCode'|'currentStock'|'reservedStock'|'issuedStock'|'damagedStock'|'missingStock'|'lastUnitPrice'>) {
  const ref = await addDoc(tenantCollection(tenantId, 'inventoryItems'), {
    ...input, itemCode: null, currentStock: 0, reservedStock: 0, issuedStock: 0, damagedStock: 0, missingStock: 0, lastUnitPrice: 0,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  })
  await updateDoc(ref, { itemCode: `ITEM-${ref.id.slice(0, 6).toUpperCase()}` })
  return ref.id
}

export async function fetchSuppliers(tenantId: string): Promise<Supplier[]> {
  const snapshot = await getDocs(query(tenantCollection(tenantId, 'suppliers'), orderBy('name')))
  return snapshot.docs.map((row) => ({ id: row.id, ...(row.data() as Omit<Supplier, 'id'>) }))
}
export async function createSupplier(tenantId: string, input: Omit<Supplier, 'id'>) { return addDoc(tenantCollection(tenantId, 'suppliers'), { ...input, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }) }

export async function fetchStockMovements(tenantId: string): Promise<StockMovement[]> {
  const snapshot = await getDocs(query(tenantCollection(tenantId, 'stockMovements'), orderBy('createdAt', 'desc')))
  return snapshot.docs.map((row) => ({ id: row.id, ...(row.data() as Omit<StockMovement, 'id'>) }))
}

export async function fetchPurchaseBatches(tenantId: string): Promise<PurchaseBatch[]> {
  const snapshot = await getDocs(query(tenantCollection(tenantId, 'purchaseBatches'), orderBy('purchaseDate', 'desc')))
  return snapshot.docs.map((row) => ({ id: row.id, ...(row.data() as Omit<PurchaseBatch, 'id'>) }))
}

export async function fetchInventorySerials(tenantId: string, itemId?: string): Promise<InventorySerial[]> {
  const base = tenantCollection(tenantId, 'inventorySerials')
  const snapshot = itemId ? await getDocs(query(base, where('itemId','==',itemId))) : await getDocs(base)
  return snapshot.docs.map((row)=>({ id: row.id, ...(row.data() as Omit<InventorySerial,'id'>) }))
}

export async function searchInventorySerials(tenantId: string, term: string): Promise<InventorySerial[]> {
  const q = term.trim().toLowerCase(); if (!q) return []
  const rows = await fetchInventorySerials(tenantId)
  return rows.filter((row)=>[row.serialNumber,row.itemName,row.batchNumber||'',row.customerName||'',row.status].some((v)=>String(v).toLowerCase().includes(q))).slice(0,50)
}

export async function fetchReservations(tenantId: string): Promise<Reservation[]> {
  const snapshot = await getDocs(query(tenantCollection(tenantId, 'inventoryReservations'), orderBy('createdAt','desc')))
  return snapshot.docs.map((row)=>({ id:row.id, ...(row.data() as Omit<Reservation,'id'>) }))
}

export async function receivePurchase(tenantId: string, item: InventoryItem, input: {
  quantity: number; unitPrice: number; supplierId?: string|null; supplierName?: string|null; purchaseInvoice?: string|null; batchNumber?: string|null; purchaseDate: string; serialNumbers?: string[]; note?: string|null
}) {
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) throw new Error('Quantity must be greater than zero.')
  const serials = [...new Set((input.serialNumbers ?? []).map((s)=>s.trim()).filter(Boolean))]
  if (item.serialised && serials.length !== input.quantity) throw new Error(`This item requires exactly ${input.quantity} unique serial number(s).`)
  const itemRef = doc(db,'tenants',tenantId,'inventoryItems',item.id)
  const batchRef = doc(tenantCollection(tenantId,'purchaseBatches'))
  const movementRef = doc(tenantCollection(tenantId,'stockMovements'))
  await runTransaction(db, async (tx)=>{
    const snap = await tx.get(itemRef); if (!snap.exists()) throw new Error('Inventory item not found.')
    const currentStock = Number(snap.data().currentStock ?? 0)
    tx.update(itemRef,{currentStock:currentStock+input.quantity,lastUnitPrice:Math.max(0,input.unitPrice),updatedAt:serverTimestamp()})
    const batchNumber = input.batchNumber?.trim() || `BATCH-${batchRef.id.slice(0,6).toUpperCase()}`
    tx.set(batchRef,{itemId:item.id,itemName:item.name,supplierId:input.supplierId??null,supplierName:input.supplierName??null,purchaseInvoice:input.purchaseInvoice?.trim()||null,batchNumber,quantity:input.quantity,unitPrice:Math.max(0,input.unitPrice),purchaseDate:input.purchaseDate,serialCount:serials.length,createdAt:serverTimestamp()})
    tx.set(movementRef,{itemId:item.id,itemName:item.name,type:'purchase',quantity:input.quantity,unitPrice:Math.max(0,input.unitPrice),reference:input.purchaseInvoice?.trim()||batchNumber,customerId:null,customerName:null,supplierId:input.supplierId??null,supplierName:input.supplierName??null,purchaseInvoice:input.purchaseInvoice?.trim()||null,batchNumber,note:input.note?.trim()||null,createdAt:serverTimestamp()})
    for (const serialNumber of serials) {
      const serialRef = doc(tenantCollection(tenantId,'inventorySerials'))
      tx.set(serialRef,{serialNumber,itemId:item.id,itemName:item.name,batchId:batchRef.id,batchNumber,supplierName:input.supplierName??null,status:'available',customerId:null,customerName:null,purchaseDate:input.purchaseDate,unitPrice:Math.max(0,input.unitPrice),createdAt:serverTimestamp(),updatedAt:serverTimestamp()})
    }
  })
}

export async function recordStockMovement(tenantId: string, item: InventoryItem, input: {
  type: StockMovementType; quantity: number; unitPrice?: number; reference?: string|null; customerId?: string|null; customerName?: string|null; supplierId?: string|null; supplierName?: string|null; purchaseInvoice?: string|null; batchNumber?: string|null; note?: string|null
}) {
  if (input.type === 'purchase') return receivePurchase(tenantId,item,{quantity:input.quantity,unitPrice:Number(input.unitPrice??0),supplierId:input.supplierId,supplierName:input.supplierName,purchaseInvoice:input.purchaseInvoice, batchNumber:input.batchNumber,purchaseDate:new Date().toISOString().slice(0,10),note:input.note})
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) throw new Error('Quantity must be greater than zero.')
  const itemRef = doc(db,'tenants',tenantId,'inventoryItems',item.id); const movementRef = doc(tenantCollection(tenantId,'stockMovements'))
  await runTransaction(db,async(tx)=>{
    const snapshot=await tx.get(itemRef); if(!snapshot.exists()) throw new Error('Inventory item not found.')
    const data=snapshot.data(); const current=Number(data.currentStock??0), reserved=Number(data.reservedStock??0), issued=Number(data.issuedStock??0), damaged=Number(data.damagedStock??0), missing=Number(data.missingStock??0)
    let ns=current,nr=reserved,ni=issued,nd=damaged,nm=missing
    if(input.type==='return'||input.type==='adjustment') ns+=input.quantity
    if(input.type==='issue'){if(current-reserved<input.quantity) throw new Error('Not enough available stock.');ns-=input.quantity;ni+=input.quantity}
    if(input.type==='reservation'){if(current-reserved<input.quantity) throw new Error('Not enough available stock to reserve.');nr+=input.quantity}
    if(input.type==='reservation_release'){if(reserved<input.quantity) throw new Error('Release quantity exceeds reserved stock.');nr-=input.quantity}
    if(input.type==='damage'){if(current-reserved<input.quantity) throw new Error('Not enough available stock.');ns-=input.quantity;nd+=input.quantity}
    if(input.type==='missing'){if(current-reserved<input.quantity) throw new Error('Not enough available stock.');ns-=input.quantity;nm+=input.quantity}
    tx.update(itemRef,{currentStock:ns,reservedStock:nr,issuedStock:ni,damagedStock:nd,missingStock:nm,updatedAt:serverTimestamp()})
    tx.set(movementRef,{itemId:item.id,itemName:item.name,type:input.type,quantity:input.quantity,unitPrice:Number(input.unitPrice??0),reference:input.reference??null,customerId:input.customerId??null,customerName:input.customerName??null,supplierId:input.supplierId??null,supplierName:input.supplierName??null,purchaseInvoice:input.purchaseInvoice??null,batchNumber:input.batchNumber??null,note:input.note??null,createdAt:serverTimestamp()})
  })
}

export async function createReservation(tenantId:string,item:InventoryItem,input:{customerId?:string|null;customerName:string;quantity:number;serialNumbers?:string[];note?:string|null}){
  const serialNumbers=[...new Set((input.serialNumbers??[]).map((s)=>s.trim()).filter(Boolean))]
  if(item.serialised&&serialNumbers.length!==input.quantity) throw new Error('Serial count must match reserved quantity.')
  await recordStockMovement(tenantId,item,{type:'reservation',quantity:input.quantity,customerId:input.customerId??null,customerName:input.customerName,reference:input.customerName,note:input.note})
  const ref=await addDoc(tenantCollection(tenantId,'inventoryReservations'),{itemId:item.id,itemName:item.name,customerId:input.customerId??null,customerName:input.customerName,quantity:input.quantity,status:'active',serialNumbers,note:input.note??null,createdAt:serverTimestamp(),updatedAt:serverTimestamp()})
  if(serialNumbers.length){const rows=await fetchInventorySerials(tenantId,item.id);const batch=writeBatch(db);for(const serial of rows.filter((s)=>serialNumbers.includes(s.serialNumber)&&s.status==='available')) batch.update(doc(db,'tenants',tenantId,'inventorySerials',serial.id),{status:'reserved',customerId:input.customerId??null,customerName:input.customerName,updatedAt:serverTimestamp()});await batch.commit()}
  return ref.id
}

export async function releaseReservation(tenantId:string,item:InventoryItem,reservation:Reservation){
  if(reservation.status!=='active') throw new Error('Reservation is not active.')
  await recordStockMovement(tenantId,item,{type:'reservation_release',quantity:reservation.quantity,customerId:reservation.customerId,customerName:reservation.customerName,reference:reservation.customerName})
  await updateDoc(doc(db,'tenants',tenantId,'inventoryReservations',reservation.id),{status:'released',updatedAt:serverTimestamp()})
  if(reservation.serialNumbers.length){const rows=await fetchInventorySerials(tenantId,item.id);const batch=writeBatch(db);for(const serial of rows.filter((s)=>reservation.serialNumbers.includes(s.serialNumber)&&s.status==='reserved')) batch.update(doc(db,'tenants',tenantId,'inventorySerials',serial.id),{status:'available',customerId:null,customerName:null,updatedAt:serverTimestamp()});await batch.commit()}
}

export async function issueReservation(tenantId:string,item:InventoryItem,reservation:Reservation){
  if(reservation.status!=='active') throw new Error('Reservation is not active.')
  const itemRef=doc(db,'tenants',tenantId,'inventoryItems',item.id);const movementRef=doc(tenantCollection(tenantId,'stockMovements'))
  await runTransaction(db,async(tx)=>{const snap=await tx.get(itemRef);if(!snap.exists()) throw new Error('Inventory item not found.');const current=Number(snap.data().currentStock??0),reserved=Number(snap.data().reservedStock??0),issued=Number(snap.data().issuedStock??0);if(reserved<reservation.quantity||current<reservation.quantity) throw new Error('Reserved stock is no longer sufficient.');tx.update(itemRef,{currentStock:current-reservation.quantity,reservedStock:reserved-reservation.quantity,issuedStock:issued+reservation.quantity,updatedAt:serverTimestamp()});tx.update(doc(db,'tenants',tenantId,'inventoryReservations',reservation.id),{status:'issued',updatedAt:serverTimestamp()});tx.set(movementRef,{itemId:item.id,itemName:item.name,type:'issue',quantity:reservation.quantity,unitPrice:0,reference:reservation.customerName,customerId:reservation.customerId,customerName:reservation.customerName,supplierId:null,supplierName:null,purchaseInvoice:null,batchNumber:null,note:'Issued from reservation',createdAt:serverTimestamp()})})
  if(reservation.serialNumbers.length){const rows=await fetchInventorySerials(tenantId,item.id);const batch=writeBatch(db);for(const serial of rows.filter((s)=>reservation.serialNumbers.includes(s.serialNumber))) batch.update(doc(db,'tenants',tenantId,'inventorySerials',serial.id),{status:'issued',customerId:reservation.customerId,customerName:reservation.customerName,updatedAt:serverTimestamp()});await batch.commit()}
}

export async function updateSerialStatus(tenantId:string,serial:InventorySerial,status:InventorySerialStatus,note?:string|null){
  await updateDoc(doc(db,'tenants',tenantId,'inventorySerials',serial.id),{status,updatedAt:serverTimestamp(),note:note?.trim()||null})
}

export function availableStock(item: InventoryItem) { return Math.max(0, item.currentStock - item.reservedStock) }
export function inventorySummary(items: InventoryItem[]) {
  return {
    totalItems: items.length,
    stockValue: items.reduce((sum,item)=>sum+item.currentStock*item.lastUnitPrice,0),
    lowStock: items.filter((item)=>item.currentStock>0&&availableStock(item)<=item.reorderLevel),
    outOfStock: items.filter((item)=>availableStock(item)<=0),
    reservedUnits: items.reduce((sum,item)=>sum+item.reservedStock,0),
    issuedUnits: items.reduce((sum,item)=>sum+item.issuedStock,0),
    damagedUnits: items.reduce((sum,item)=>sum+item.damagedStock,0),
  }
}
