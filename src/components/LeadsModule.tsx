import { FormEvent, useEffect, useMemo, useState } from 'react'
import { CalendarClock, CheckCircle2, Filter, Phone, Plus, Search, UserRound } from 'lucide-react'
import {
  LEAD_STATUSES,
  convertLeadToCustomer,
  createLead,
  fetchLeads,
  fetchTenantUsers,
  updateLead,
  type Lead,
  type LeadStatus,
  type TenantUser,
} from '../lib/leads'

const blankForm = {
  name: '',
  mobile: '',
  email: '',
  village: '',
  address: '',
  systemSize: '',
  source: '',
  status: 'New' as LeadStatus,
  assignedTo: '',
  nextFollowup: '',
  nextAction: '',
  notes: '',
  expectedValue: '',
}

function money(value: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value || 0)
}

export default function LeadsModule({ tenantId, isAdmin, startInAddMode = false }: { tenantId: string; isAdmin: boolean; startInAddMode?: boolean }) {
  const [leads, setLeads] = useState<Lead[]>([])
  const [users, setUsers] = useState<TenantUser[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [term, setTerm] = useState('')
  const [status, setStatus] = useState<'all' | LeadStatus>('all')
  const [showAdd, setShowAdd] = useState(startInAddMode)
  const [selected, setSelected] = useState<Lead | null>(null)
  const [form, setForm] = useState(blankForm)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    setMessage('')
    try {
      const nextLeads = await fetchLeads(tenantId)
      setLeads(nextLeads)
      if (isAdmin) {
        try { setUsers((await fetchTenantUsers(tenantId)).filter((user) => user.isActive)) } catch { setUsers([]) }
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load leads.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [tenantId, isAdmin])
  useEffect(() => { if (startInAddMode) setShowAdd(true) }, [startInAddMode])

  const filtered = useMemo(() => leads.filter((lead) => {
    const q = term.trim().toLowerCase()
    const matchesSearch = !q || [lead.name, lead.leadId, lead.mobile, lead.village || '', lead.source || ''].some((value) => value.toLowerCase().includes(q))
    const matchesStatus = status === 'all' || lead.status === status
    return matchesSearch && matchesStatus
  }), [leads, term, status])

  const stats = useMemo(() => ({
    total: leads.length,
    open: leads.filter((lead) => !['Converted', 'Lost'].includes(lead.status)).length,
    followups: leads.filter((lead) => Boolean(lead.nextFollowup)).length,
    converted: leads.filter((lead) => lead.status === 'Converted').length,
  }), [leads])

  const save = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    try {
      const assignedUser = users.find((user) => user.id === form.assignedTo)
      await createLead(tenantId, {
        name: form.name.trim(),
        mobile: form.mobile.trim(),
        email: form.email.trim() || null,
        village: form.village.trim() || null,
        address: form.address.trim() || null,
        systemSize: form.systemSize ? Number(form.systemSize) : null,
        source: form.source.trim() || null,
        status: form.status,
        assignedTo: form.assignedTo || null,
        assignedToName: assignedUser?.fullName || null,
        nextFollowup: form.nextFollowup || null,
        nextAction: form.nextAction.trim() || null,
        notes: form.notes.trim() || null,
        expectedValue: form.expectedValue ? Number(form.expectedValue) : 0,
      })
      setForm(blankForm)
      setShowAdd(false)
      await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save lead.')
    } finally {
      setSaving(false)
    }
  }

  const changeStatus = async (lead: Lead, nextStatus: LeadStatus) => {
    try {
      await updateLead(tenantId, lead.id, { status: nextStatus })
      await load()
      if (selected?.id === lead.id) setSelected({ ...lead, status: nextStatus })
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to update lead.')
    }
  }

  const assign = async (lead: Lead, userId: string) => {
    const user = users.find((item) => item.id === userId)
    try {
      await updateLead(tenantId, lead.id, { assignedTo: userId || null, assignedToName: user?.fullName || null })
      await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to assign lead.')
    }
  }

  const convert = async (lead: Lead) => {
    try {
      await convertLeadToCustomer(tenantId, lead)
      setMessage(`${lead.name} converted to customer.`)
      setSelected(null)
      await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to convert lead.')
    }
  }

  return <div className="module-stack">
    <div className="module-head">
      <div><h1>Leads</h1><p>Capture, assign, follow up and convert solar inquiries.</p></div>
      <button className="primary tenant-primary" onClick={() => setShowAdd(true)}><Plus size={16} /> Add Lead</button>
    </div>

    <section className="lead-stats">
      <article><span>Total Leads</span><strong>{stats.total}</strong></article>
      <article><span>Open</span><strong>{stats.open}</strong></article>
      <article><span>Follow-ups</span><strong>{stats.followups}</strong></article>
      <article><span>Converted</span><strong>{stats.converted}</strong></article>
    </section>

    <div className="customer-filters">
      <div className="search-box"><Search size={17} /><input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search lead, phone, village or source" /></div>
      <div className="filter-select"><Filter size={16} /><select value={status} onChange={(e) => setStatus(e.target.value as 'all' | LeadStatus)}><option value="all">All statuses</option>{LEAD_STATUSES.map((item) => <option key={item}>{item}</option>)}</select></div>
    </div>

    {message && <div className="notice">{message}</div>}

    <div className="lead-list">
      {filtered.map((lead) => <article className="lead-card" key={lead.id}>
        <div className="lead-main" onClick={() => setSelected(lead)}>
          <div><strong>{lead.name}</strong><small>{lead.leadId}{lead.systemSize ? ` · ${lead.systemSize} kW` : ''}</small></div>
          <span className={`lead-status status-${lead.status.toLowerCase().replaceAll(' ', '-')}`}>{lead.status}</span>
        </div>
        <div className="lead-meta">
          <span><Phone size={14} /> {lead.mobile}</span>
          <span><CalendarClock size={14} /> {lead.nextFollowup || 'No follow-up'}</span>
          <span><UserRound size={14} /> {lead.assignedToName || 'Unassigned'}</span>
        </div>
        <div className="lead-bottom">
          <span><small>Expected Value</small><strong>{money(lead.expectedValue)}</strong></span>
          <span><small>Next Action</small><strong>{lead.nextAction || '—'}</strong></span>
          <div className="lead-actions">
            <select value={lead.status} onChange={(e) => void changeStatus(lead, e.target.value as LeadStatus)}>{LEAD_STATUSES.map((item) => <option key={item}>{item}</option>)}</select>
            {isAdmin && <select value={lead.assignedTo || ''} onChange={(e) => void assign(lead, e.target.value)}><option value="">Unassigned</option>{users.map((user) => <option key={user.id} value={user.id}>{user.fullName}</option>)}</select>}
          </div>
        </div>
      </article>)}
      {!loading && filtered.length === 0 && <section className="panel empty-state"><h3>No leads found</h3><p className="muted">Add a new lead or change the filters.</p></section>}
    </div>

    {selected && <div className="modal-backdrop" onMouseDown={() => setSelected(null)}><section className="modal" onMouseDown={(e) => e.stopPropagation()}>
      <div className="panel-title"><div><p className="eyebrow">LEAD DETAILS</p><h2>{selected.name}</h2></div><button className="ghost" onClick={() => setSelected(null)}>Close</button></div>
      <div className="profile-grid">
        <article><span>Lead ID</span><strong>{selected.leadId}</strong></article>
        <article><span>Status</span><strong>{selected.status}</strong></article>
        <article><span>Mobile</span><strong>{selected.mobile}</strong></article>
        <article><span>Assigned</span><strong>{selected.assignedToName || 'Unassigned'}</strong></article>
        <article><span>Follow-up</span><strong>{selected.nextFollowup || '—'}</strong></article>
        <article><span>Expected Value</span><strong>{money(selected.expectedValue)}</strong></article>
      </div>
      <section className="panel inner-panel"><h3>Next Action & Notes</h3><p>{selected.nextAction || 'No next action set.'}</p><p className="muted">{selected.notes || 'No notes yet.'}</p></section>
      <div className="form-actions"><button className="primary tenant-primary" disabled={selected.status === 'Converted'} onClick={() => void convert(selected)}><CheckCircle2 size={16} /> {selected.status === 'Converted' ? 'Already Converted' : 'Convert to Customer'}</button></div>
    </section></div>}

    {showAdd && <div className="modal-backdrop" onMouseDown={() => setShowAdd(false)}><section className="modal" onMouseDown={(e) => e.stopPropagation()}>
      <div className="panel-title"><div><p className="eyebrow">SALES CRM</p><h2>Add Lead</h2></div><button className="ghost" onClick={() => setShowAdd(false)}>Close</button></div>
      <form className="form-grid" onSubmit={save}>
        <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
        <label>Mobile<input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} required /></label>
        <label>Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <label>Village<input value={form.village} onChange={(e) => setForm({ ...form, village: e.target.value })} /></label>
        <label>System size (kW)<input type="number" step="0.1" value={form.systemSize} onChange={(e) => setForm({ ...form, systemSize: e.target.value })} /></label>
        <label>Source<input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="Website / Referral / Walk-in" /></label>
        <label>Status<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as LeadStatus })}>{LEAD_STATUSES.map((item) => <option key={item}>{item}</option>)}</select></label>
        {isAdmin && <label>Assign employee<select value={form.assignedTo} onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}><option value="">Unassigned</option>{users.map((user) => <option key={user.id} value={user.id}>{user.fullName}</option>)}</select></label>}
        <label>Follow-up date<input type="date" value={form.nextFollowup} onChange={(e) => setForm({ ...form, nextFollowup: e.target.value })} /></label>
        <label>Next action<input value={form.nextAction} onChange={(e) => setForm({ ...form, nextAction: e.target.value })} /></label>
        <label>Expected value<input type="number" value={form.expectedValue} onChange={(e) => setForm({ ...form, expectedValue: e.target.value })} /></label>
        <label className="full-field">Address<input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
        <label className="full-field">Notes<textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
        <div className="form-actions"><button type="button" className="ghost" onClick={() => setShowAdd(false)}>Cancel</button><button className="primary tenant-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Lead'}</button></div>
      </form>
    </section></div>}
  </div>
}
