import { type FormEvent, useEffect, useState } from 'react'
import { Landmark, LockKeyhole, Palette, Plus, Star } from 'lucide-react'
import {
  changeOwnPassword,
  fetchBankAccounts,
  maskAccount,
  saveBankAccount,
  saveBranding,
  type BankAccount,
} from '../lib/settings'

type Mode = 'branding' | 'bank-accounts' | 'change-password'
type Props = {
  tenantId: string
  mode: Mode
  isAdmin: boolean
  currentBranding: {
    companyName: string
    email: string | null
    phone: string | null
    address: string | null
    gstNumber: string | null
    logoUrl: string | null
    primaryColor: string
    secondaryColor: string
  }
  onBrandingSaved?: () => void
}

const blankBank: Omit<BankAccount, 'id'> = {
  accountLabel: '',
  accountHolderName: '',
  bankName: '',
  accountNumber: '',
  ifscCode: '',
  branchName: '',
  accountType: 'Current',
  upiId: null,
  isDefault: false,
  isActive: true,
}

export default function SettingsModule({ tenantId, mode, isAdmin, currentBranding, onBrandingSaved }: Props) {
  if (mode === 'branding') return <BrandingSettings isAdmin={isAdmin} current={currentBranding} onSaved={onBrandingSaved} />
  if (mode === 'bank-accounts') return <BankAccounts tenantId={tenantId} isAdmin={isAdmin} />
  return <ChangePassword />
}

function BrandingSettings({ isAdmin, current, onSaved }: { isAdmin: boolean; current: Props['currentBranding']; onSaved?: () => void }) {
  const [form, setForm] = useState({
    companyName: current.companyName,
    email: current.email || '',
    phone: current.phone || '',
    address: current.address || '',
    gstNumber: current.gstNumber || '',
    logoUrl: current.logoUrl || '',
    primaryColor: current.primaryColor || '#1769d2',
    secondaryColor: current.secondaryColor || '#0f243f',
  })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  if (!isAdmin) return <section className="panel"><Palette size={24}/><h2>Branding Settings</h2><p className="muted">Only Client Admins can update company branding.</p></section>

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setMessage('')
    try {
      await saveBranding({ ...form, gstNumber: form.gstNumber.trim().toUpperCase() })
      setMessage('Branding updated successfully.')
      onSaved?.()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to update branding.') }
    finally { setSaving(false) }
  }

  return <div className="module-stack">
    <div className="module-head"><div><h1>Branding Settings</h1><p>Company identity used across the app, login page and documents.</p></div></div>
    {message && <div className="notice">{message}</div>}
    <section className="panel"><form className="form-grid" onSubmit={submit}>
      <label>Company Name<input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} required /></label>
      <label>GSTIN<input value={form.gstNumber} onChange={(e) => setForm({ ...form, gstNumber: e.target.value })} /></label>
      <label>Phone<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
      <label>Email<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
      <label className="full-field">Address<textarea value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
      <label className="full-field">Logo URL<input value={form.logoUrl} onChange={(e) => setForm({ ...form, logoUrl: e.target.value })} placeholder="https://..." /></label>
      <label>Primary Color<input type="color" value={form.primaryColor} onChange={(e) => setForm({ ...form, primaryColor: e.target.value })} /></label>
      <label>Secondary Color<input type="color" value={form.secondaryColor} onChange={(e) => setForm({ ...form, secondaryColor: e.target.value })} /></label>
      <div className="branding-preview full-field"><div className="preview-logo">{form.logoUrl ? <img src={form.logoUrl} alt="Company logo preview" /> : <Palette size={26}/>}</div><div><strong>{form.companyName || 'Company Name'}</strong><p>{form.phone || form.email || 'Company contact details'}</p></div><span className="preview-swatch" style={{ background: form.primaryColor }} /></div>
      <div className="form-actions"><button className="primary tenant-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Branding'}</button></div>
    </form></section>
  </div>
}

function BankAccounts({ tenantId, isAdmin }: { tenantId: string; isAdmin: boolean }) {
  const [rows, setRows] = useState<BankAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [editing, setEditing] = useState<BankAccount | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(blankBank)
  const [confirmAccount, setConfirmAccount] = useState('')
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true); setMessage('')
    try { setRows(await fetchBankAccounts(tenantId)) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to load bank accounts.') }
    finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [tenantId])

  const openCreate = () => { setEditing(null); setForm(blankBank); setConfirmAccount(''); setShowForm(true) }
  const openEdit = (row: BankAccount) => { setEditing(row); setForm({ ...row, upiId: row.upiId || null }); setConfirmAccount(row.accountNumber); setShowForm(true) }

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setMessage('')
    if (form.accountNumber.trim() !== confirmAccount.trim()) { setMessage('Account number confirmation does not match.'); return }
    if (!form.accountLabel.trim() || !form.accountHolderName.trim() || !form.bankName.trim() || !form.accountNumber.trim() || !form.ifscCode.trim()) { setMessage('Please fill all required bank details.'); return }
    setSaving(true)
    try {
      await saveBankAccount({ id: editing?.id, ...form, ifscCode: form.ifscCode.trim().toUpperCase(), upiId: form.upiId?.trim() || null })
      setShowForm(false); await load()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to save bank account.') }
    finally { setSaving(false) }
  }

  const quickUpdate = async (row: BankAccount, patch: Partial<BankAccount>) => {
    setMessage('')
    try { await saveBankAccount({ ...row, ...patch, id: row.id }); await load() }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to update bank account.') }
  }

  return <div className="module-stack">
    <div className="module-head"><div><h1>Bank Accounts</h1><p>Accounts that can be used on quotations and invoices.</p></div>{isAdmin && <button className="primary tenant-primary" onClick={openCreate}><Plus size={16}/> Add Bank Account</button>}</div>
    {message && <div className="notice">{message}</div>}
    <div className="bank-grid">{rows.map((row) => <article className="panel bank-card" key={row.id}><div className="bank-top"><div><Landmark size={20}/><strong>{row.accountLabel}</strong></div><div className="bank-tags">{row.isDefault && <span className="role-chip client_admin"><Star size={12}/> Default</span>}<span className={`status-chip ${row.isActive ? 'active' : 'inactive'}`}>{row.isActive ? 'Active' : 'Inactive'}</span></div></div><h3>{row.bankName}</h3><p>{row.accountHolderName}</p><div className="bank-details"><span><small>Account</small><strong>{maskAccount(row.accountNumber)}</strong></span><span><small>IFSC</small><strong>{row.ifscCode}</strong></span><span><small>Branch</small><strong>{row.branchName || '—'}</strong></span><span><small>Type</small><strong>{row.accountType}</strong></span></div>{row.upiId && <p className="muted">UPI: {row.upiId}</p>}{isAdmin && <div className="bank-actions"><button className="ghost" onClick={() => openEdit(row)}>Edit</button>{row.isActive && !row.isDefault && <button className="ghost" onClick={() => quickUpdate(row, { isDefault: true })}>Make Default</button>}<button className="ghost" onClick={() => quickUpdate(row, { isActive: !row.isActive, ...(row.isActive ? { isDefault: false } : {}) })}>{row.isActive ? 'Deactivate' : 'Activate'}</button></div>}</article>)}{!loading && rows.length === 0 && <section className="panel empty-state"><Landmark size={28}/><h3>No bank accounts yet</h3></section>}</div>

    {showForm && <div className="modal-backdrop" onMouseDown={() => setShowForm(false)}><section className="modal" onMouseDown={(e) => e.stopPropagation()}><div className="panel-title"><div><p className="eyebrow">COMPANY BANK</p><h2>{editing ? 'Edit Bank Account' : 'Add Bank Account'}</h2></div><button className="ghost" onClick={() => setShowForm(false)}>Close</button></div><form className="form-grid" onSubmit={submit}><label>Account Label *<input value={form.accountLabel} onChange={(e) => setForm({ ...form, accountLabel: e.target.value })} required /></label><label>Account Holder *<input value={form.accountHolderName} onChange={(e) => setForm({ ...form, accountHolderName: e.target.value })} required /></label><label>Bank Name *<input value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} required /></label><label>Branch Name<input value={form.branchName} onChange={(e) => setForm({ ...form, branchName: e.target.value })} /></label><label>Account Number *<input value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} required /></label><label>Confirm Account Number *<input value={confirmAccount} onChange={(e) => setConfirmAccount(e.target.value)} required /></label><label>IFSC *<input value={form.ifscCode} onChange={(e) => setForm({ ...form, ifscCode: e.target.value.toUpperCase() })} required /></label><label>Account Type<select value={form.accountType} onChange={(e) => setForm({ ...form, accountType: e.target.value as BankAccount['accountType'] })}><option>Current</option><option>Savings</option><option>OD</option><option>CC</option></select></label><label>UPI ID<input value={form.upiId || ''} onChange={(e) => setForm({ ...form, upiId: e.target.value })} /></label><label>Default<select value={form.isDefault ? 'yes' : 'no'} onChange={(e) => setForm({ ...form, isDefault: e.target.value === 'yes' })}><option value="no">No</option><option value="yes">Yes</option></select></label><label>Active<select value={form.isActive ? 'yes' : 'no'} onChange={(e) => setForm({ ...form, isActive: e.target.value === 'yes' })}><option value="yes">Active</option><option value="no">Inactive</option></select></label><div className="form-actions"><button type="button" className="ghost" onClick={() => setShowForm(false)}>Cancel</button><button className="primary tenant-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Account'}</button></div></form></section></div>}
  </div>
}

function ChangePassword() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setMessage('')
    if (newPassword !== confirmPassword) { setMessage('New password and confirmation do not match.'); return }
    setSaving(true)
    try { await changeOwnPassword(currentPassword, newPassword); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); setMessage('Password changed successfully.') }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to change password.') }
    finally { setSaving(false) }
  }

  return <div className="module-stack"><div className="module-head"><div><h1>Change Password</h1><p>Update your own Firebase login password securely.</p></div></div>{message && <div className="notice">{message}</div>}<section className="panel password-panel"><LockKeyhole size={28}/><form className="stack" onSubmit={submit}><label>Current Password<input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required /></label><label>New Password<input type="password" minLength={8} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required /></label><label>Confirm New Password<input type="password" minLength={8} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required /></label><button className="primary tenant-primary" disabled={saving}>{saving ? 'Changing…' : 'Change Password'}</button></form></section></div>
}
