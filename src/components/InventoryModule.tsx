import { FormEvent, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Boxes, PackagePlus, Search, Truck, Undo2, UsersRound } from 'lucide-react'
import '../inventory.css'
import {
  availableStock,
  createInventoryItem,
  createSupplier,
  fetchInventoryItems,
  fetchStockMovements,
  fetchSuppliers,
  inventorySummary,
  recordStockMovement,
  type InventoryItem,
  type StockMovement,
  type Supplier,
} from '../lib/inventory'

type InventoryMode =
  | 'inventory-overview'
  | 'purchases'
  | 'panel-inventory'
  | 'issues'
  | 'reservations'
  | 'movements'
  | 'suppliers'

type Props = { tenantId: string; mode: InventoryMode }

function money(value: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value || 0)
}

const blankItem = {
  name: '', category: 'Solar Panels', brand: '', model: '', unit: 'Nos', reorderLevel: '0', minStock: '0', warehouseLocation: '', serialised: false,
}

export default function InventoryModule({ tenantId, mode }: Props) {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [movements, setMovements] = useState<StockMovement[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [term, setTerm] = useState('')
  const [showItem, setShowItem] = useState(false)
  const [showSupplier, setShowSupplier] = useState(false)
  const [itemForm, setItemForm] = useState(blankItem)
  const [supplierForm, setSupplierForm] = useState({ name: '', contactPerson: '', phone: '', email: '', gstNumber: '', address: '' })

  const load = async () => {
    setLoading(true)
    setMessage('')
    try {
      const [stockRows, supplierRows, movementRows] = await Promise.all([
        fetchInventoryItems(tenantId),
        fetchSuppliers(tenantId),
        fetchStockMovements(tenantId),
      ])
      setItems(stockRows)
      setSuppliers(supplierRows)
      setMovements(movementRows)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load inventory.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [tenantId])

  const filtered = useMemo(() => items.filter((item) => {
    const q = term.trim().toLowerCase()
    const panelOnly = mode === 'panel-inventory' ? item.category.toLowerCase().includes('panel') : true
    return panelOnly && (!q || [item.itemCode, item.name, item.category, item.brand || '', item.model || ''].some((value) => value.toLowerCase().includes(q)))
  }), [items, term, mode])

  const summary = inventorySummary(items)

  const createItem = async (event: FormEvent) => {
    event.preventDefault()
    try {
      await createInventoryItem(tenantId, {
        name: itemForm.name.trim(),
        category: itemForm.category.trim() || 'Other',
        brand: itemForm.brand.trim() || null,
        model: itemForm.model.trim() || null,
        unit: itemForm.unit.trim() || 'Nos',
        reorderLevel: Number(itemForm.reorderLevel || 0),
        minStock: Number(itemForm.minStock || 0),
        warehouseLocation: itemForm.warehouseLocation.trim() || null,
        serialised: itemForm.serialised,
      })
      setShowItem(false)
      setItemForm(blankItem)
      await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to create inventory item.')
    }
  }

  const createVendor = async (event: FormEvent) => {
    event.preventDefault()
    try {
      await createSupplier(tenantId, {
        name: supplierForm.name.trim(),
        contactPerson: supplierForm.contactPerson.trim() || null,
        phone: supplierForm.phone.trim() || null,
        email: supplierForm.email.trim() || null,
        gstNumber: supplierForm.gstNumber.trim() || null,
        address: supplierForm.address.trim() || null,
      })
      setShowSupplier(false)
      setSupplierForm({ name: '', contactPerson: '', phone: '', email: '', gstNumber: '', address: '' })
      await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to create supplier.')
    }
  }

  const transact = async (item: InventoryItem, type: StockMovement['type']) => {
    const qtyRaw = window.prompt(type === 'reservation_release' ? 'Release quantity:' : 'Quantity:', '1')
    if (qtyRaw === null) return
    const quantity = Number(qtyRaw)
    if (!Number.isFinite(quantity) || quantity <= 0) return setMessage('Enter a valid quantity.')

    let unitPrice = 0
    if (type === 'purchase') {
      const priceRaw = window.prompt('Unit purchase price:', String(item.lastUnitPrice || 0))
      if (priceRaw === null) return
      unitPrice = Number(priceRaw)
      if (!Number.isFinite(unitPrice) || unitPrice < 0) return setMessage('Enter a valid price.')
    }

    const reference = window.prompt('Reference / customer / note (optional):', '')
    try {
      await recordStockMovement(tenantId, item, {
        type,
        quantity,
        unitPrice,
        reference: reference?.trim() || null,
        customerName: type === 'issue' || type === 'reservation' ? reference?.trim() || null : null,
      })
      await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to update stock.')
    }
  }

  if (mode === 'suppliers') {
    return <div className="module-stack"><div className="module-head"><div><h1>Suppliers</h1><p>{suppliers.length} supplier(s)</p></div><button className="primary tenant-primary" onClick={() => setShowSupplier(true)}>+ Add Supplier</button></div>{message && <div className="notice">{message}</div>}<div className="supplier-grid">{suppliers.map((supplier) => <article className="panel supplier-card" key={supplier.id}><Truck size={20}/><h3>{supplier.name}</h3><p>{supplier.contactPerson || 'No contact person'}</p><small>{supplier.phone || supplier.email || 'No contact details'}</small>{supplier.gstNumber && <small>GST: {supplier.gstNumber}</small>}</article>)}{!loading && suppliers.length === 0 && <section className="panel empty-state"><UsersRound size={28}/><h3>No suppliers yet</h3></section>}</div>{showSupplier && <SupplierModal form={supplierForm} setForm={setSupplierForm} onSubmit={createVendor} onClose={() => setShowSupplier(false)} />}</div>
  }

  if (mode === 'movements') {
    return <div className="module-stack"><div className="module-head"><div><h1>Stock Movements</h1><p>Permanent movement history for this tenant.</p></div></div>{message && <div className="notice">{message}</div>}<div className="table-wrap panel"><table><thead><tr><th>Item</th><th>Type</th><th>Qty</th><th>Reference</th><th>Rate</th></tr></thead><tbody>{movements.map((movement) => <tr key={movement.id}><td>{movement.itemName}</td><td><span className="badge active">{movement.type.replace('_', ' ')}</span></td><td>{movement.quantity}</td><td>{movement.reference || '—'}</td><td>{money(movement.unitPrice)}</td></tr>)}</tbody></table>{!loading && movements.length === 0 && <p className="empty">No movements recorded yet.</p>}</div></div>
  }

  const title = mode === 'purchases' ? 'Purchases' : mode === 'panel-inventory' ? 'Panel Inventory' : mode === 'issues' ? 'Stock Issues' : mode === 'reservations' ? 'Reservations' : 'Inventory Management'
  const subtitle = mode === 'purchases' ? 'Receive purchased stock into inventory.' : mode === 'issues' ? 'Issue available material to customers or installation teams.' : mode === 'reservations' ? 'Reserve available stock before installation.' : 'Purchase to installation — every movement is recorded.'

  return <div className="module-stack">
    <div className="module-head"><div><h1>{title}</h1><p>{subtitle}</p></div>{mode === 'inventory-overview' && <button className="primary tenant-primary" onClick={() => setShowItem(true)}><PackagePlus size={16}/> New Item</button>}</div>
    {mode === 'inventory-overview' && <div className="inventory-stats"><article><span>Stock Value</span><strong>{money(summary.stockValue)}</strong></article><article><span>Items Tracked</span><strong>{summary.totalItems}</strong></article><article className={summary.lowStock.length ? 'warn' : ''}><span>Low Stock</span><strong>{summary.lowStock.length}</strong></article><article className={summary.outOfStock.length ? 'danger' : ''}><span>Out of Stock</span><strong>{summary.outOfStock.length}</strong></article><article><span>Reserved Units</span><strong>{summary.reservedUnits}</strong></article></div>}
    <div className="search-box"><Search size={17}/><input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search item, code, category, brand or model" /></div>
    {message && <div className="notice">{message}</div>}
    {summary.lowStock.length > 0 && mode === 'inventory-overview' && <div className="inventory-alert"><AlertTriangle size={18}/><span>{summary.lowStock.length} item(s) are at or below reorder level.</span></div>}
    <div className="inventory-list">{filtered.map((item) => <article className="inventory-card" key={item.id}><div className="inventory-card-head"><div><Boxes size={19}/><span><strong>{item.name}</strong><small>{item.itemCode} · {item.category}</small></span></div><span className={availableStock(item) <= item.reorderLevel ? 'stock-pill low' : 'stock-pill'}>{availableStock(item)} {item.unit} available</span></div><div className="inventory-grid"><span><small>Total Stock</small><strong>{item.currentStock}</strong></span><span><small>Reserved</small><strong>{item.reservedStock}</strong></span><span><small>Reorder At</small><strong>{item.reorderLevel}</strong></span><span><small>Last Rate</small><strong>{money(item.lastUnitPrice)}</strong></span></div><div className="inventory-actions">{mode === 'purchases' && <button className="primary tenant-primary" onClick={() => void transact(item, 'purchase')}>Receive Purchase</button>}{mode === 'issues' && <button className="primary tenant-primary" onClick={() => void transact(item, 'issue')}>Issue Stock</button>}{mode === 'reservations' && <><button className="primary tenant-primary" onClick={() => void transact(item, 'reservation')}>Reserve</button><button className="ghost" onClick={() => void transact(item, 'reservation_release')}><Undo2 size={15}/> Release</button></>}{mode === 'inventory-overview' && <><button className="ghost" onClick={() => void transact(item, 'purchase')}>+ Stock In</button><button className="ghost" onClick={() => void transact(item, 'issue')}>- Stock Out</button></>}</div></article>)}{!loading && filtered.length === 0 && <section className="panel empty-state"><Boxes size={28}/><h3>No inventory items found</h3><p className="muted">Add an item or change the search.</p></section>}</div>
    {showItem && <ItemModal form={itemForm} setForm={setItemForm} onSubmit={createItem} onClose={() => setShowItem(false)} />}
  </div>
}

function ItemModal({ form, setForm, onSubmit, onClose }: { form: typeof blankItem; setForm: (value: typeof blankItem) => void; onSubmit: (event: FormEvent) => void; onClose: () => void }) {
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal" onMouseDown={(e) => e.stopPropagation()}><div className="panel-title"><div><p className="eyebrow">INVENTORY MASTER</p><h2>Add Inventory Item</h2></div><button className="ghost" onClick={onClose}>Close</button></div><form className="form-grid" onSubmit={onSubmit}><label>Item name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label><label>Category<input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} required /></label><label>Brand<input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></label><label>Model<input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></label><label>Unit<input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></label><label>Reorder level<input type="number" value={form.reorderLevel} onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })} /></label><label>Minimum stock<input type="number" value={form.minStock} onChange={(e) => setForm({ ...form, minStock: e.target.value })} /></label><label>Warehouse / rack<input value={form.warehouseLocation} onChange={(e) => setForm({ ...form, warehouseLocation: e.target.value })} /></label><label className="full-field checkbox-row"><input type="checkbox" checked={form.serialised} onChange={(e) => setForm({ ...form, serialised: e.target.checked })} /> Serial-number tracking</label><div className="form-actions"><button type="button" className="ghost" onClick={onClose}>Cancel</button><button className="primary tenant-primary">Save Item</button></div></form></section></div>
}

function SupplierModal({ form, setForm, onSubmit, onClose }: { form: { name: string; contactPerson: string; phone: string; email: string; gstNumber: string; address: string }; setForm: (value: { name: string; contactPerson: string; phone: string; email: string; gstNumber: string; address: string }) => void; onSubmit: (event: FormEvent) => void; onClose: () => void }) {
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal" onMouseDown={(e) => e.stopPropagation()}><div className="panel-title"><h2>Add Supplier</h2><button className="ghost" onClick={onClose}>Close</button></div><form className="form-grid" onSubmit={onSubmit}><label>Supplier name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label><label>Contact person<input value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} /></label><label>Phone<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label><label>Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label><label>GST number<input value={form.gstNumber} onChange={(e) => setForm({ ...form, gstNumber: e.target.value })} /></label><label className="full-field">Address<textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label><div className="form-actions"><button type="button" className="ghost" onClick={onClose}>Cancel</button><button className="primary tenant-primary">Save Supplier</button></div></form></section></div>
}
