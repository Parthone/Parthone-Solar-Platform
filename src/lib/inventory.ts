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

export type StockMovement = {
  id: string
  itemId: string
  itemName: string
  type: 'purchase' | 'issue' | 'reservation' | 'reservation_release' | 'adjustment' | 'return'
  quantity: number
  unitPrice: number
  reference: string | null
  customerName: string | null
  note: string | null
  createdAt?: unknown
}

function tenantCollection(tenantId: string, name: string) {
  return collection(db, 'tenants', tenantId, name)
}

export async function fetchInventoryItems(tenantId: string): Promise<InventoryItem[]> {
  const snapshot = await getDocs(query(tenantCollection(tenantId, 'inventoryItems'), orderBy('name')))
  return snapshot.docs.map((row) => {
    const data = row.data()
    return {
      id: row.id,
      itemCode: data.itemCode ?? `ITEM-${row.id.slice(0, 6).toUpperCase()}`,
      name: data.name ?? '',
      category: data.category ?? 'Other',
      brand: data.brand ?? null,
      model: data.model ?? null,
      unit: data.unit ?? 'Nos',
      currentStock: Number(data.currentStock ?? 0),
      reservedStock: Number(data.reservedStock ?? 0),
      reorderLevel: Number(data.reorderLevel ?? 0),
      minStock: Number(data.minStock ?? 0),
      lastUnitPrice: Number(data.lastUnitPrice ?? 0),
      warehouseLocation: data.warehouseLocation ?? null,
      serialised: data.serialised === true,
    }
  })
}

export async function createInventoryItem(tenantId: string, input: Omit<InventoryItem, 'id' | 'itemCode' | 'currentStock' | 'reservedStock' | 'lastUnitPrice'>) {
  const ref = await addDoc(tenantCollection(tenantId, 'inventoryItems'), {
    ...input,
    itemCode: null,
    currentStock: 0,
    reservedStock: 0,
    lastUnitPrice: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  await updateDoc(ref, { itemCode: `ITEM-${ref.id.slice(0, 6).toUpperCase()}` })
  return ref.id
}

export async function fetchSuppliers(tenantId: string): Promise<Supplier[]> {
  const snapshot = await getDocs(query(tenantCollection(tenantId, 'suppliers'), orderBy('name')))
  return snapshot.docs.map((row) => ({ id: row.id, ...(row.data() as Omit<Supplier, 'id'>) }))
}

export async function createSupplier(tenantId: string, input: Omit<Supplier, 'id'>) {
  return addDoc(tenantCollection(tenantId, 'suppliers'), {
    ...input,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
}

export async function fetchStockMovements(tenantId: string): Promise<StockMovement[]> {
  const snapshot = await getDocs(query(tenantCollection(tenantId, 'stockMovements'), orderBy('createdAt', 'desc')))
  return snapshot.docs.map((row) => ({ id: row.id, ...(row.data() as Omit<StockMovement, 'id'>) }))
}

export async function recordStockMovement(
  tenantId: string,
  item: InventoryItem,
  input: {
    type: StockMovement['type']
    quantity: number
    unitPrice?: number
    reference?: string | null
    customerName?: string | null
    note?: string | null
  },
) {
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) throw new Error('Quantity must be greater than zero.')

  const itemRef = doc(db, 'tenants', tenantId, 'inventoryItems', item.id)
  const movementRef = doc(tenantCollection(tenantId, 'stockMovements'))

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(itemRef)
    if (!snapshot.exists()) throw new Error('Inventory item not found.')
    const data = snapshot.data()
    const currentStock = Number(data.currentStock ?? 0)
    const reservedStock = Number(data.reservedStock ?? 0)
    let nextStock = currentStock
    let nextReserved = reservedStock

    if (input.type === 'purchase' || input.type === 'return' || input.type === 'adjustment') nextStock += input.quantity
    if (input.type === 'issue') {
      if (currentStock - reservedStock < input.quantity) throw new Error('Not enough available stock.')
      nextStock -= input.quantity
    }
    if (input.type === 'reservation') {
      if (currentStock - reservedStock < input.quantity) throw new Error('Not enough available stock to reserve.')
      nextReserved += input.quantity
    }
    if (input.type === 'reservation_release') {
      if (reservedStock < input.quantity) throw new Error('Release quantity exceeds reserved stock.')
      nextReserved -= input.quantity
    }

    transaction.update(itemRef, {
      currentStock: nextStock,
      reservedStock: nextReserved,
      ...(input.type === 'purchase' && input.unitPrice ? { lastUnitPrice: input.unitPrice } : {}),
      updatedAt: serverTimestamp(),
    })

    transaction.set(movementRef, {
      itemId: item.id,
      itemName: item.name,
      type: input.type,
      quantity: input.quantity,
      unitPrice: Number(input.unitPrice ?? 0),
      reference: input.reference ?? null,
      customerName: input.customerName ?? null,
      note: input.note ?? null,
      createdAt: serverTimestamp(),
    })
  })
}

export function availableStock(item: InventoryItem) {
  return Math.max(0, item.currentStock - item.reservedStock)
}

export function inventorySummary(items: InventoryItem[]) {
  return {
    totalItems: items.length,
    stockValue: items.reduce((sum, item) => sum + item.currentStock * item.lastUnitPrice, 0),
    lowStock: items.filter((item) => item.currentStock > 0 && availableStock(item) <= item.reorderLevel),
    outOfStock: items.filter((item) => availableStock(item) <= 0),
    reservedUnits: items.reduce((sum, item) => sum + item.reservedStock, 0),
  }
}
