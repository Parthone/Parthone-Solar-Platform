import { type FormEvent, useEffect, useState } from 'react'
import { CheckCircle2, Plus, ShieldCheck, Target, Trash2 } from 'lucide-react'
import { EMPLOYEE_MODULES, deleteTarget, fetchPermissionSettings, fetchTargets, fetchTenantEmployees, savePermissionSettings, saveTarget, type EmployeeModuleKey, type Target as TargetRow } from '../lib/permissions-targets'

type Props = { tenantId: string; mode: 'roles-permissions' | 'stage-targets' | 'task-targets'; isAdmin: boolean }

const moduleLabels: Record<EmployeeModuleKey, string> = {
  dashboard:'Dashboard', customers:'Customers', followups:'Follow-ups', pipeline:'Pipeline', leads:'Leads', quotations:'Quotations', invoices:'Invoices', inventory:'Inventory', expenses:'Expenses', 'external-links':'External Links', 'live-tracking':'Live Tracking', profile:'My Profile', reports:'Reports', 'bank-accounts':'Bank Accounts', 'change-password':'Change Password'
}

export default function PermissionsTargetsModule({ tenantId, mode, isAdmin }: Props) {
  if (!isAdmin) return <section className="panel"><ShieldCheck size={24}/><h2>Admin Only</h2><p className="muted">Only Client Admins can manage permissions and targets.</p></section>
  return mode === 'roles-permissions' ? <Permissions tenantId={tenantId} /> : <Targets tenantId={tenantId} kind={mode === 'stage-targets' ? 'stage' : 'task'} />
}

function Permissions({ tenantId }: { tenantId: string }) {
  const [enabled, setEnabled] = useState<EmployeeModuleKey[]>([])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  useEffect(() => { fetchPermissionSettings(tenantId).then((v) => setEnabled(v.employeeModules)).catch((e) => setMessage(e.message)) }, [tenantId])
  const toggle = (key: EmployeeModuleKey) => setEnabled((prev) => key === 'dashboard' ? prev : prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key])
  const save = async () => { setSaving(true); setMessage(''); try { await savePermissionSettings(enabled); setMessage('Employee permissions saved.') } catch (e) { setMessage(e instanceof Error ? e.message : 'Unable to save permissions.') } finally { setSaving(false) } }
  return <div className="module-stack"><div className="module-head"><div><h1>Role & Permissions</h1><p>Choose which modules normal employees can access. Client Admins always keep full access.</p></div></div>{message && <div className="notice">{message}</div>}<section className="permission-grid">{EMPLOYEE_MODULES.map((key) => <button key={key} className={`permission-card ${enabled.includes(key) ? 'on' : ''}`} onClick={() => toggle(key)} disabled={key === 'dashboard'}><CheckCircle2 size={18}/><span>{moduleLabels[key]}</span><small>{enabled.includes(key) ? 'Allowed' : 'Blocked'}</small></button>)}</section><div><button className="primary tenant-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Permissions'}</button></div></div>
}

function Targets({ tenantId, kind }: { tenantId: string; kind: 'stage' | 'task' }) {
  const [rows, setRows] = useState<TargetRow[]>([])
  const [employees, setEmployees] = useState<Array<{id:string;fullName:string;isActive:boolean}>>([])
  const [message, setMessage] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<TargetRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ title:'', stage:'Inquiry', employeeId:'', employeeName:'', target:0, achieved:0, period:new Date().toISOString().slice(0,7), isActive:true })
  const load = async () => { try { const [t,e] = await Promise.all([fetchTargets(tenantId, kind), fetchTenantEmployees(tenantId)]); setRows(t); setEmployees(e.filter((x)=>x.isActive)) } catch (e) { setMessage(e instanceof Error ? e.message : 'Unable to load targets.') } }
  useEffect(() => { void load() }, [tenantId, kind])
  const openCreate = () => { setEditing(null); setForm({ title:'', stage:'Inquiry', employeeId:'', employeeName:'', target:0, achieved:0, period:new Date().toISOString().slice(0,7), isActive:true }); setShowForm(true) }
  const openEdit = (r: TargetRow) => { setEditing(r); setForm({ title:r.title, stage:r.stage || 'Inquiry', employeeId:r.employeeId || '', employeeName:r.employeeName || '', target:r.target, achieved:r.achieved, period:r.period, isActive:r.isActive }); setShowForm(true) }
  const submit = async (event: FormEvent) => { event.preventDefault(); setSaving(true); setMessage(''); try { await saveTarget({ id: editing?.id, kind, title: form.title.trim(), stage: kind==='stage'?form.stage:null, employeeId: form.employeeId || null, employeeName: form.employeeName || null, target:Number(form.target), achieved:Number(form.achieved), period:form.period, isActive:form.isActive }); setShowForm(false); await load() } catch (e) { setMessage(e instanceof Error ? e.message : 'Unable to save target.') } finally { setSaving(false) } }
  const remove = async (id:string) => { if (!confirm('Delete this target?')) return; await deleteTarget(id); await load() }
  const title = kind === 'stage' ? 'Stage Targets' : 'Task Targets'
  return <div className="module-stack"><div className="module-head"><div><h1>{title}</h1><p>Set monthly targets and compare target vs achieved.</p></div><button className="primary tenant-primary" onClick={openCreate}><Plus size={16}/> Add Target</button></div>{message && <div className="notice">{message}</div>}<div className="target-grid">{rows.map((r) => { const pct = r.target > 0 ? Math.min(100, Math.round((r.achieved/r.target)*100)) : 0; return <article className="panel target-card" key={r.id}><div className="target-top"><div><Target size={18}/><strong>{r.title}</strong></div><span className={`status-chip ${r.isActive?'active':'inactive'}`}>{r.isActive?'Active':'Inactive'}</span></div><p>{kind==='stage' ? `Stage: ${r.stage}` : (r.employeeName ? `Employee: ${r.employeeName}` : 'Team target')}</p><div className="target-numbers"><span><small>Target</small><strong>{r.target}</strong></span><span><small>Achieved</small><strong>{r.achieved}</strong></span><span><small>Period</small><strong>{r.period}</strong></span></div><div className="progress"><span style={{width:`${pct}%`}}/></div><small>{pct}% achieved</small><div className="bank-actions"><button className="ghost" onClick={()=>openEdit(r)}>Edit</button><button className="ghost danger-text" onClick={()=>remove(r.id)}><Trash2 size={14}/> Delete</button></div></article> })}</div>{showForm && <div className="modal-backdrop" onMouseDown={()=>setShowForm(false)}><section className="modal" onMouseDown={(e)=>e.stopPropagation()}><div className="panel-title"><h2>{editing?'Edit':'Add'} {kind==='stage'?'Stage':'Task'} Target</h2><button className="ghost" onClick={()=>setShowForm(false)}>Close</button></div><form className="form-grid" onSubmit={submit}><label>Title<input value={form.title} onChange={(e)=>setForm({...form,title:e.target.value})} required/></label>{kind==='stage' && <label>Stage<select value={form.stage} onChange={(e)=>setForm({...form,stage:e.target.value})}>{['Inquiry','Site Visit','Quotation','Order Confirmed','Installation','Completed'].map((s)=><option key={s}>{s}</option>)}</select></label>}<label>Employee<select value={form.employeeId} onChange={(e)=>{const x=employees.find((u)=>u.id===e.target.value);setForm({...form,employeeId:e.target.value,employeeName:x?.fullName||''})}}><option value="">Whole Team</option>{employees.map((e)=><option value={e.id} key={e.id}>{e.fullName}</option>)}</select></label><label>Period<input type="month" value={form.period} onChange={(e)=>setForm({...form,period:e.target.value})} required/></label><label>Target<input type="number" min="0" value={form.target} onChange={(e)=>setForm({...form,target:Number(e.target.value)})}/></label><label>Achieved<input type="number" min="0" value={form.achieved} onChange={(e)=>setForm({...form,achieved:Number(e.target.value)})}/></label><label>Status<select value={form.isActive?'active':'inactive'} onChange={(e)=>setForm({...form,isActive:e.target.value==='active'})}><option value="active">Active</option><option value="inactive">Inactive</option></select></label><div className="form-actions"><button type="button" className="ghost" onClick={()=>setShowForm(false)}>Cancel</button><button className="primary tenant-primary" disabled={saving}>{saving?'Saving…':'Save Target'}</button></div></form></section></div>}</div>
}
