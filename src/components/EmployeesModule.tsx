import { FormEvent, useEffect, useMemo, useState } from 'react'
import { KeyRound, Plus, Search, ShieldCheck, UserCog, UserRoundCheck, UserRoundX } from 'lucide-react'
import {
  createEmployee,
  fetchEmployees,
  resetEmployeePassword,
  updateEmployee,
  type Employee,
  type EmployeeRole,
} from '../lib/employees'

type Props = {
  tenantId: string
  currentUserId: string
}

const blank = {
  fullName: '',
  email: '',
  password: '',
  mobile: '',
  designation: '',
  role: 'employee' as EmployeeRole,
}

export default function EmployeesModule({ tenantId, currentUserId }: Props) {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [term, setTerm] = useState('')
  const [message, setMessage] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState(blank)
  const [editing, setEditing] = useState<Employee | null>(null)
  const [resetting, setResetting] = useState<Employee | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    setMessage('')
    try {
      setEmployees(await fetchEmployees(tenantId))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load employees.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [tenantId])

  const filtered = useMemo(() => employees.filter((employee) => {
    const q = term.trim().toLowerCase()
    return !q || [employee.fullName, employee.email, employee.mobile || '', employee.designation || '', employee.role]
      .some((value) => value.toLowerCase().includes(q))
  }), [employees, term])

  const stats = useMemo(() => ({
    total: employees.length,
    active: employees.filter((employee) => employee.isActive).length,
    admins: employees.filter((employee) => employee.role === 'client_admin' && employee.isActive).length,
    inactive: employees.filter((employee) => !employee.isActive).length,
  }), [employees])

  const submitCreate = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    try {
      await createEmployee({
        fullName: form.fullName.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        mobile: form.mobile.trim(),
        designation: form.designation.trim(),
        role: form.role,
      })
      setForm(blank)
      setShowCreate(false)
      await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to create employee.')
    } finally {
      setSaving(false)
    }
  }

  const saveEdit = async (event: FormEvent) => {
    event.preventDefault()
    if (!editing) return
    setSaving(true)
    setMessage('')
    try {
      await updateEmployee({
        uid: editing.id,
        fullName: editing.fullName.trim(),
        mobile: editing.mobile || '',
        designation: editing.designation || '',
        role: editing.role,
        isActive: editing.isActive,
      })
      setEditing(null)
      await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to update employee.')
    } finally {
      setSaving(false)
    }
  }

  const resetPassword = async (event: FormEvent) => {
    event.preventDefault()
    if (!resetting) return
    setSaving(true)
    setMessage('')
    try {
      await resetEmployeePassword(resetting.id, newPassword)
      setResetting(null)
      setNewPassword('')
      setMessage(`Password reset for ${resetting.fullName}.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to reset password.')
    } finally {
      setSaving(false)
    }
  }

  return <div className="module-stack">
    <div className="module-head"><div><h1>User Management</h1><p>Create employee logins, assign access roles and control account status.</p></div><button className="primary tenant-primary" onClick={() => setShowCreate(true)}><Plus size={16}/> Add Employee</button></div>
    <div className="employee-stats"><article><span>Total Users</span><strong>{stats.total}</strong></article><article><span>Active</span><strong>{stats.active}</strong></article><article><span>Client Admins</span><strong>{stats.admins}</strong></article><article><span>Inactive</span><strong>{stats.inactive}</strong></article></div>
    <div className="search-box"><Search size={17}/><input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search name, email, mobile, designation or role" /></div>
    {message && <div className="notice">{message}</div>}
    <div className="employee-list">{filtered.map((employee) => <article className="employee-card" key={employee.id}>
      <div className="employee-main"><div className="employee-avatar">{employee.fullName.charAt(0).toUpperCase()}</div><div><strong>{employee.fullName}</strong><small>{employee.email}</small><p>{employee.designation || 'No designation'}{employee.mobile ? ` · ${employee.mobile}` : ''}</p></div></div>
      <div className="employee-badges"><span className={`role-chip ${employee.role}`}>{employee.role === 'client_admin' ? 'Client Admin' : 'Employee'}</span><span className={`status-chip ${employee.isActive ? 'active' : 'inactive'}`}>{employee.isActive ? 'Active' : 'Inactive'}</span></div>
      <div className="employee-actions"><button className="ghost" onClick={() => setEditing({ ...employee })}><UserCog size={15}/> Edit</button><button className="ghost" onClick={() => { setResetting(employee); setNewPassword('') }}><KeyRound size={15}/> Reset Password</button>{employee.id === currentUserId && <span className="self-chip"><ShieldCheck size={14}/> You</span>}</div>
    </article>)}{!loading && filtered.length === 0 && <section className="panel empty-state"><UserCog size={28}/><h3>No employees found</h3></section>}</div>

    {showCreate && <div className="modal-backdrop" onMouseDown={() => setShowCreate(false)}><section className="modal" onMouseDown={(e) => e.stopPropagation()}><div className="panel-title"><div><p className="eyebrow">CLIENT ADMIN</p><h2>Add Employee</h2></div><button className="ghost" onClick={() => setShowCreate(false)}>Close</button></div><form className="form-grid" onSubmit={submitCreate}><label>Full Name<input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required /></label><label>Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label><label>Password<input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} minLength={8} required /></label><label>Mobile<input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} /></label><label>Designation<input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} /></label><label>Role<select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as EmployeeRole })}><option value="employee">Employee</option><option value="client_admin">Client Admin</option></select></label><div className="form-actions"><button type="button" className="ghost" onClick={() => setShowCreate(false)}>Cancel</button><button className="primary tenant-primary" disabled={saving}>{saving ? 'Creating…' : 'Create Employee'}</button></div></form></section></div>}

    {editing && <div className="modal-backdrop" onMouseDown={() => setEditing(null)}><section className="modal" onMouseDown={(e) => e.stopPropagation()}><div className="panel-title"><div><p className="eyebrow">USER ACCESS</p><h2>Edit Employee</h2></div><button className="ghost" onClick={() => setEditing(null)}>Close</button></div><form className="form-grid" onSubmit={saveEdit}><label>Full Name<input value={editing.fullName} onChange={(e) => setEditing({ ...editing, fullName: e.target.value })} required /></label><label>Email<input value={editing.email} disabled /></label><label>Mobile<input value={editing.mobile || ''} onChange={(e) => setEditing({ ...editing, mobile: e.target.value })} /></label><label>Designation<input value={editing.designation || ''} onChange={(e) => setEditing({ ...editing, designation: e.target.value })} /></label><label>Role<select value={editing.role} onChange={(e) => setEditing({ ...editing, role: e.target.value as EmployeeRole })}><option value="employee">Employee</option><option value="client_admin">Client Admin</option></select></label><label>Status<select value={editing.isActive ? 'active' : 'inactive'} onChange={(e) => setEditing({ ...editing, isActive: e.target.value === 'active' })}><option value="active">Active</option><option value="inactive">Inactive</option></select></label><div className="full-field access-note">{editing.isActive ? <UserRoundCheck size={18}/> : <UserRoundX size={18}/>}<span>{editing.isActive ? 'User can sign in.' : 'Firebase Auth login will be disabled.'}</span></div><div className="form-actions"><button type="button" className="ghost" onClick={() => setEditing(null)}>Cancel</button><button className="primary tenant-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</button></div></form></section></div>}

    {resetting && <div className="modal-backdrop" onMouseDown={() => setResetting(null)}><section className="modal narrow-modal" onMouseDown={(e) => e.stopPropagation()}><div className="panel-title"><div><p className="eyebrow">LOGIN ACCESS</p><h2>Reset Password</h2></div><button className="ghost" onClick={() => setResetting(null)}>Close</button></div><p className="muted">Set a new password for <strong>{resetting.fullName}</strong>.</p><form className="stack" onSubmit={resetPassword}><label>New Password<input type="password" minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required /></label><button className="primary tenant-primary" disabled={saving}>{saving ? 'Resetting…' : 'Reset Password'}</button></form></section></div>}
  </div>
}
