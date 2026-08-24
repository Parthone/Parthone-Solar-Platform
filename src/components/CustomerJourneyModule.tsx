import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { CalendarClock, CheckCircle2, Clock3, MapPin, Phone, Plus, Search, UserRound, Users } from 'lucide-react'
import {
  CUSTOMER_STAGES,
  createCustomer,
  customerOutstanding,
  customerProgress,
  fetchCustomerStageHistory,
  fetchCustomers,
  moveCustomerStage,
  updateCustomerAssignment,
  updateCustomerFinancialStatus,
  updateCustomerFollowup,
  type Customer,
  type CustomerStage,
  type CustomerStageHistory,
} from '../lib/customers'
import { fetchTenantUsers, type TenantUser } from '../lib/leads'

type Mode = 'journey-dashboard' | 'customers' | 'followups' | 'pipeline'
type Props = { tenantId: string; mode: Mode; currentUserId?: string; currentUserName?: string }

type FollowupTab = 'today' | 'overdue' | 'upcoming' | 'all'

const blank = { name:'', mobile:'', email:'', village:'', address:'', systemSize:'', stage:'Inquiry' as CustomerStage, nextFollowup:'', nextAction:'', dealAmount:'', notes:'' }
const money = (v:number) => new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(v||0)
const today = () => new Date().toISOString().slice(0,10)

export default function CustomerJourneyModule({ tenantId, mode, currentUserId, currentUserName }: Props) {
  const [rows,setRows] = useState<Customer[]>([])
  const [users,setUsers] = useState<TenantUser[]>([])
  const [term,setTerm] = useState('')
  const [stage,setStage] = useState<'all'|CustomerStage>('all')
  const [followupTab,setFollowupTab] = useState<FollowupTab>('today')
  const [showAdd,setShowAdd] = useState(false)
  const [selected,setSelected] = useState<Customer|null>(null)
  const [form,setForm] = useState(blank)
  const [saving,setSaving] = useState(false)
  const [loading,setLoading] = useState(true)
  const [message,setMessage] = useState('')
  const [followupForm,setFollowupForm] = useState({nextFollowup:'',nextAction:'',notes:''})
  const [history,setHistory] = useState<CustomerStageHistory[]>([])
  const [historyLoading,setHistoryLoading] = useState(false)
  const [dragged,setDragged] = useState<Customer|null>(null)

  const load = async () => {
    setLoading(true); setMessage('')
    try {
      const [customers, tenantUsers] = await Promise.all([fetchCustomers(tenantId), fetchTenantUsers(tenantId).catch(() => [])])
      setRows(customers); setUsers(tenantUsers.filter((u) => u.isActive))
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Unable to load customers.') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [tenantId])

  const filtered = useMemo(() => rows.filter((c) => {
    const q = term.toLowerCase().trim()
    const ok = !q || [c.name,c.customerId,c.mobile,c.village||'',String(c.systemSize||''),c.assignedToName||''].some((v) => String(v).toLowerCase().includes(q))
    if (!ok) return false
    if (stage !== 'all' && c.stage !== stage) return false
    if (mode === 'pipeline' && c.stage === 'Completed') return false
    if (mode === 'followups') {
      if (!c.nextFollowup) return false
      const d = c.nextFollowup.slice(0,10), t = today()
      if (followupTab === 'today') return d === t
      if (followupTab === 'overdue') return d < t
      if (followupTab === 'upcoming') return d > t
    }
    return true
  }), [rows,term,stage,mode,followupTab])

  const counts = useMemo(() => {
    const t = today()
    return {
      today: rows.filter((c)=>c.nextFollowup?.slice(0,10)===t).length,
      overdue: rows.filter((c)=>c.nextFollowup && c.nextFollowup.slice(0,10)<t).length,
      upcoming: rows.filter((c)=>c.nextFollowup && c.nextFollowup.slice(0,10)>t).length,
      all: rows.filter((c)=>Boolean(c.nextFollowup)).length,
    }
  }, [rows])

  const add = async (e:FormEvent) => {
    e.preventDefault(); setSaving(true); setMessage('')
    try {
      await createCustomer(tenantId, { name:form.name.trim(), mobile:form.mobile.trim(), email:form.email||null, village:form.village||null, address:form.address||null, systemSize:form.systemSize?Number(form.systemSize):null, stage:form.stage, leadStatus:'New', assignedTo:null, assignedToName:null, nextFollowup:form.nextFollowup||null, nextAction:form.nextAction||null, dealAmount:form.dealAmount?Number(form.dealAmount):0, notes:form.notes||null })
      setForm(blank); setShowAdd(false); await load()
    } catch (e) { setMessage(e instanceof Error?e.message:'Unable to add customer.') }
    finally { setSaving(false) }
  }

  const openCustomer = async (customer: Customer) => {
    setSelected(customer)
    setFollowupForm({ nextFollowup: customer.nextFollowup || '', nextAction: customer.nextAction || '', notes: customer.notes || '' })
    setHistory([]); setHistoryLoading(true)
    try { setHistory(await fetchCustomerStageHistory(tenantId, customer.id)) } catch { setHistory([]) }
    finally { setHistoryLoading(false) }
  }

  const saveFollowup = async () => {
    if (!selected) return
    setSaving(true); setMessage('')
    try {
      await updateCustomerFollowup(tenantId, selected.id, { nextFollowup: followupForm.nextFollowup || null, nextAction: followupForm.nextAction || null, notes: followupForm.notes || null })
      const next = { ...selected, nextFollowup: followupForm.nextFollowup || null, nextAction: followupForm.nextAction || null, notes: followupForm.notes || null }
      setSelected(next); setRows((prev)=>prev.map((c)=>c.id===next.id?next:c))
    } catch (e) { setMessage(e instanceof Error?e.message:'Unable to update follow-up.') }
    finally { setSaving(false) }
  }

  const changeStage = async (customer: Customer, toStage: CustomerStage) => {
    if (customer.stage === toStage) return
    setSaving(true); setMessage('')
    try {
      await moveCustomerStage(tenantId, customer, toStage, { id: currentUserId, name: currentUserName })
      await load()
      if (selected?.id === customer.id) {
        const fresh = { ...customer, stage: toStage, installationStatus: toStage === 'Completed' ? 'completed' : toStage === 'Installation' ? 'in_progress' : customer.installationStatus } as Customer
        await openCustomer(fresh)
      }
    } catch (e) { setMessage(e instanceof Error?e.message:'Unable to move customer stage.') }
    finally { setSaving(false) }
  }

  const assign = async (customer: Customer, userId: string) => {
    const user = users.find((u)=>u.id===userId)
    try {
      await updateCustomerAssignment(tenantId, customer.id, user?.id || null, user?.fullName || null)
      await load()
      if (selected?.id === customer.id) setSelected({ ...customer, assignedTo:user?.id||null, assignedToName:user?.fullName||null })
    } catch (e) { setMessage(e instanceof Error?e.message:'Unable to assign employee.') }
  }

  const updateFinancial = async (customer: Customer, amountReceived: number, installationStatus: Customer['installationStatus']) => {
    try {
      await updateCustomerFinancialStatus(tenantId, customer.id, { amountReceived, installationStatus })
      await load()
      if (selected?.id===customer.id) setSelected({ ...customer, amountReceived, installationStatus })
    } catch (e) { setMessage(e instanceof Error?e.message:'Unable to update customer status.') }
  }

  const title = mode==='customers'?'Customers':mode==='followups'?'Follow-ups':mode==='pipeline'?'Pipeline':'Customer Journey'

  return <div className="module-stack">
    <div className="module-head"><div><h1>{title}</h1><p>{mode==='journey-dashboard'?'Track every solar customer from inquiry to completed installation.':loading?'Loading…':`${filtered.length} customer(s)`}</p></div><button className="primary tenant-primary" onClick={()=>setShowAdd(true)}><Plus size={16}/> Add Customer</button></div>

    {mode==='journey-dashboard' && <div className="journey-stage-grid">{CUSTOMER_STAGES.map((s)=><article key={s}><span>{s}</span><strong>{rows.filter((r)=>r.stage===s).length}</strong><small>Journey stage</small></article>)}</div>}

    {mode==='followups' && <div className="followup-tabs">{(['today','overdue','upcoming','all'] as FollowupTab[]).map((key)=><button key={key} className={followupTab===key?'active':''} onClick={()=>setFollowupTab(key)}><span>{key[0].toUpperCase()+key.slice(1)}</span><strong>{counts[key]}</strong></button>)}</div>}

    {mode!=='journey-dashboard' && <div className="customer-filters"><div className="search-box"><Search size={17}/><input value={term} onChange={(e)=>setTerm(e.target.value)} placeholder="Search name, ID, phone, village, employee or kW"/></div><select value={stage} onChange={(e)=>setStage(e.target.value as 'all'|CustomerStage)}><option value="all">All stages</option>{CUSTOMER_STAGES.map((s)=><option key={s}>{s}</option>)}</select></div>}
    {message && <div className="notice">{message}</div>}

    {mode==='pipeline' ? <div className="pipeline-board">{CUSTOMER_STAGES.filter((s)=>s!=='Completed').map((s)=><section className="pipeline-column" key={s} onDragOver={(e)=>e.preventDefault()} onDrop={()=>{ if(dragged) void changeStage(dragged,s); setDragged(null) }}><div className="pipeline-column-head"><strong>{s}</strong><span>{filtered.filter((c)=>c.stage===s).length}</span></div><div className="pipeline-column-list">{filtered.filter((c)=>c.stage===s).map((c)=><button draggable key={c.id} className="pipeline-card" onDragStart={()=>setDragged(c)} onClick={()=>void openCustomer(c)}><strong>{c.name}</strong><small>{c.customerId} · {c.mobile}</small><span>{c.assignedToName || 'Unassigned'}</span><div><small>Outstanding</small><strong>{money(customerOutstanding(c))}</strong></div></button>)}</div></section>)}</div>
    : <div className="customer-list">{(mode==='journey-dashboard'?rows.slice(0,8):filtered).map((c)=><button key={c.id} className={`customer-card ${mode==='followups'&&c.nextFollowup&&c.nextFollowup.slice(0,10)<today()?'overdue-card':''}`} onClick={()=>void openCustomer(c)}><div className="customer-card-top"><div><strong>{c.name}</strong><small>{c.customerId}{c.systemSize?` · ${c.systemSize} kW`:''}</small></div><span className="stage-pill">{c.stage}</span></div><div className="customer-meta"><span><Phone size={14}/>{c.mobile}</span>{c.village&&<span><MapPin size={14}/>{c.village}</span>}<span><CalendarClock size={14}/>{c.nextFollowup||'No follow-up'}</span><span><UserRound size={14}/>{c.assignedToName||'Unassigned'}</span></div><div className="customer-financial"><span><small>Deal</small><strong>{money(c.dealAmount)}</strong></span><span><small>Outstanding</small><strong>{money(customerOutstanding(c))}</strong></span><span><small>Installation</small><strong>{c.installationStatus.replace('_',' ')}</strong></span></div><div className="progress"><span style={{width:`${customerProgress(c)}%`}}/></div></button>)}{!loading&&rows.length===0&&<section className="panel empty-state"><Users size={28}/><h3>No customers yet</h3><p className="muted">Add the first inquiry/customer.</p></section>}</div>}

    {selected && <div className="modal-backdrop" onMouseDown={()=>setSelected(null)}><section className="modal customer-profile workflow-profile" onMouseDown={(e)=>e.stopPropagation()}><div className="panel-title"><div><p className="eyebrow">CUSTOMER WORKFLOW</p><h2>{selected.name}</h2></div><button className="ghost" onClick={()=>setSelected(null)}>Close</button></div>
      <div className="profile-grid"><article><span>Customer ID</span><strong>{selected.customerId}</strong></article><article><span>Mobile</span><strong>{selected.mobile}</strong></article><article><span>Stage</span><strong>{selected.stage}</strong></article><article><span>Employee</span><strong>{selected.assignedToName||'Unassigned'}</strong></article><article><span>Deal</span><strong>{money(selected.dealAmount)}</strong></article><article><span>Outstanding</span><strong>{money(customerOutstanding(selected))}</strong></article></div>

      <section className="panel inner-panel"><h3>Pipeline Stage</h3><div className="stage-action-row">{CUSTOMER_STAGES.map((s)=><button key={s} className={selected.stage===s?'active':''} onClick={()=>void changeStage(selected,s)} disabled={saving||selected.stage===s}>{s}</button>)}</div></section>

      <section className="panel inner-panel"><h3>Follow-up</h3><div className="form-grid compact-form"><label>Next Follow-up<input type="date" value={followupForm.nextFollowup} onChange={(e)=>setFollowupForm({...followupForm,nextFollowup:e.target.value})}/></label><label>Next Action<input value={followupForm.nextAction} onChange={(e)=>setFollowupForm({...followupForm,nextAction:e.target.value})}/></label><label className="full-field">Notes<textarea value={followupForm.notes} onChange={(e)=>setFollowupForm({...followupForm,notes:e.target.value})}/></label><div className="form-actions"><button className="primary tenant-primary" type="button" onClick={()=>void saveFollowup()} disabled={saving}>{saving?'Saving…':'Save Follow-up'}</button></div></div></section>

      <section className="panel inner-panel"><h3>Assignment & Status</h3><div className="form-grid compact-form"><label>Assigned Employee<select value={selected.assignedTo||''} onChange={(e)=>void assign(selected,e.target.value)}><option value="">Unassigned</option>{users.map((u)=><option value={u.id} key={u.id}>{u.fullName}</option>)}</select></label><label>Installation<select value={selected.installationStatus} onChange={(e)=>void updateFinancial(selected,selected.amountReceived,e.target.value as Customer['installationStatus'])}><option value="pending">Pending</option><option value="in_progress">In Progress</option><option value="completed">Completed</option></select></label><label>Amount Received<input type="number" min="0" max={selected.dealAmount||undefined} value={selected.amountReceived} onBlur={(e)=>void updateFinancial(selected,Number(e.target.value),selected.installationStatus)} onChange={(e)=>setSelected({...selected,amountReceived:Number(e.target.value)})}/></label></div></section>

      <section className="panel inner-panel"><h3>Stage History</h3>{historyLoading?<p className="muted">Loading history…</p>:history.length===0?<p className="muted">No stage changes recorded yet.</p>:<div className="stage-history-list">{history.map((h)=><article key={h.id}><CheckCircle2 size={16}/><div><strong>{h.fromStage||'Start'} → {h.toStage}</strong><small>{h.changedByName||'User'} · {h.changedAt?h.changedAt.toLocaleString('en-IN'):'Pending timestamp'}</small>{h.note&&<p>{h.note}</p>}</div></article>)}</div>}</section>

      <section className="panel inner-panel"><h3>Address & Notes</h3><p>{selected.address||selected.village||'No address added.'}</p><p className="muted">{selected.notes||'No notes yet.'}</p></section>
    </section></div>}

    {showAdd && <div className="modal-backdrop" onMouseDown={()=>setShowAdd(false)}><section className="modal" onMouseDown={(e)=>e.stopPropagation()}><div className="panel-title"><div><p className="eyebrow">CUSTOMER JOURNEY</p><h2>Add Inquiry/Customer</h2></div><button className="ghost" onClick={()=>setShowAdd(false)}>Close</button></div><form className="form-grid" onSubmit={add}><label>Name<input value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})} required/></label><label>Mobile<input value={form.mobile} onChange={(e)=>setForm({...form,mobile:e.target.value})} required/></label><label>Email<input type="email" value={form.email} onChange={(e)=>setForm({...form,email:e.target.value})}/></label><label>Village<input value={form.village} onChange={(e)=>setForm({...form,village:e.target.value})}/></label><label>System size (kW)<input type="number" step="0.1" value={form.systemSize} onChange={(e)=>setForm({...form,systemSize:e.target.value})}/></label><label>Stage<select value={form.stage} onChange={(e)=>setForm({...form,stage:e.target.value as CustomerStage})}>{CUSTOMER_STAGES.map((s)=><option key={s}>{s}</option>)}</select></label><label>Next follow-up<input type="date" value={form.nextFollowup} onChange={(e)=>setForm({...form,nextFollowup:e.target.value})}/></label><label>Next action<input value={form.nextAction} onChange={(e)=>setForm({...form,nextAction:e.target.value})}/></label><label>Deal amount<input type="number" value={form.dealAmount} onChange={(e)=>setForm({...form,dealAmount:e.target.value})}/></label><label className="full-field">Address<input value={form.address} onChange={(e)=>setForm({...form,address:e.target.value})}/></label><label className="full-field">Notes<textarea value={form.notes} onChange={(e)=>setForm({...form,notes:e.target.value})}/></label><div className="form-actions"><button type="button" className="ghost" onClick={()=>setShowAdd(false)}>Cancel</button><button className="primary tenant-primary" disabled={saving}>{saving?'Saving…':'Save Customer'}</button></div></form></section></div>}
  </div>
}
