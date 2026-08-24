import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Building2, LogOut, Pencil, Plus, RefreshCw, ShieldCheck, Users } from 'lucide-react'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { collection, doc, getDoc, getDocs, orderBy, query, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { auth, db, functions } from './lib/firebase'

type TenantStatus = 'active' | 'suspended' | 'inactive'

type Tenant = {
  id: string
  name: string
  slug: string
  status: TenantStatus
  email?: string
  phone?: string
  address?: string
  gstNumber?: string
  customDomain?: string
  planName: string
  planStatus: 'active' | 'inactive'
  userLimit?: number | null
  storageLimitMb?: number | null
  branding?: { logoUrl?: string | null; primaryColor?: string | null; secondaryColor?: string | null }
}

type UserRecord = {
  id: string
  tenantId: string | null
  fullName?: string
  email?: string
  role: 'parthone_super_admin' | 'client_admin' | 'employee'
  isActive: boolean
}

const blankTenant = {
  companyName: '',
  slug: '',
  companyEmail: '',
  phone: '',
  address: '',
  gstNumber: '',
  customDomain: '',
  planName: 'standard',
  userLimit: '',
  logoUrl: '',
  primaryColor: '#2563eb',
  secondaryColor: '#0f243f',
  adminName: '',
  adminEmail: '',
  adminPassword: '',
}

export default function App() {
  const [booting, setBooting] = useState(true)
  const [authorized, setAuthorized] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [users, setUsers] = useState<UserRecord[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Tenant | null>(null)
  const [tenantForm, setTenantForm] = useState(blankTenant)
  const [saving, setSaving] = useState(false)

  const loadAdminData = async () => {
    const currentUser = auth.currentUser
    if (!currentUser) {
      setAuthorized(false)
      setTenants([])
      setUsers([])
      return
    }

    const userSnapshot = await getDoc(doc(db, 'users', currentUser.uid))
    const userData = userSnapshot.data()
    const isSuperAdmin = userSnapshot.exists() && userData?.role === 'parthone_super_admin' && userData?.isActive !== false
    setAuthorized(isSuperAdmin)
    if (!isSuperAdmin) return

    const [tenantSnapshot, usersSnapshot] = await Promise.all([
      getDocs(query(collection(db, 'tenants'), orderBy('name'))),
      getDocs(collection(db, 'users')),
    ])

    setTenants(tenantSnapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<Tenant, 'id'>) })))
    setUsers(usersSnapshot.docs.map((item) => ({ id: item.id, ...(item.data() as Omit<UserRecord, 'id'>) })))
  }

  useEffect(() => onAuthStateChanged(auth, async () => {
    try { await loadAdminData() }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to load platform data.') }
    finally { setBooting(false) }
  }), [])

  const userCounts = useMemo(() => {
    const counts = new Map<string, number>()
    users.forEach((user) => { if (user.tenantId) counts.set(user.tenantId, (counts.get(user.tenantId) ?? 0) + 1) })
    return counts
  }, [users])

  const login = async (event: FormEvent) => {
    event.preventDefault()
    setMessage('')
    try { await signInWithEmailAndPassword(auth, email.trim(), password) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to sign in.') }
  }

  const openCreate = () => {
    setEditing(null)
    setTenantForm(blankTenant)
    setShowForm(true)
  }

  const openEdit = (tenant: Tenant) => {
    setEditing(tenant)
    setTenantForm({
      companyName: tenant.name,
      slug: tenant.slug,
      companyEmail: tenant.email ?? '',
      phone: tenant.phone ?? '',
      address: tenant.address ?? '',
      gstNumber: tenant.gstNumber ?? '',
      customDomain: tenant.customDomain ?? '',
      planName: tenant.planName ?? 'standard',
      userLimit: tenant.userLimit ? String(tenant.userLimit) : '',
      logoUrl: tenant.branding?.logoUrl ?? '',
      primaryColor: tenant.branding?.primaryColor ?? '#2563eb',
      secondaryColor: tenant.branding?.secondaryColor ?? '#0f243f',
      adminName: '',
      adminEmail: '',
      adminPassword: '',
    })
    setShowForm(true)
  }

  const saveTenant = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setMessage('')

    try {
      if (editing) {
        const companyName = tenantForm.companyName.trim()
        const slug = tenantForm.slug.trim().toLowerCase()
        const companyEmail = tenantForm.companyEmail.trim() || null
        const phone = tenantForm.phone.trim() || null
        const address = tenantForm.address.trim() || null
        const gstNumber = tenantForm.gstNumber.trim().toUpperCase() || null
        const customDomain = tenantForm.customDomain.trim().toLowerCase() || null
        const logoUrl = tenantForm.logoUrl.trim() || null
        const primaryColor = tenantForm.primaryColor || '#2563eb'
        const secondaryColor = tenantForm.secondaryColor || '#0f243f'

        await updateDoc(doc(db, 'tenants', editing.id), {
          name: companyName,
          slug,
          email: companyEmail,
          phone,
          address,
          gstNumber,
          customDomain,
          planName: tenantForm.planName.trim() || 'standard',
          userLimit: tenantForm.userLimit ? Number(tenantForm.userLimit) : null,
          branding: { logoUrl, primaryColor, secondaryColor },
          updatedAt: serverTimestamp(),
        })

        await setDoc(doc(db, 'publicTenantBranding', editing.id), {
          tenantId: editing.id,
          companyName,
          slug,
          customDomain,
          logoUrl,
          primaryColor,
          secondaryColor,
          email: companyEmail,
          phone,
          address,
          gstNumber,
          updatedAt: serverTimestamp(),
        }, { merge: true })

        setMessage(`Client ${companyName} updated.`)
      } else {
        const onboardClient = httpsCallable(functions, 'onboardClient')
        const result = await onboardClient({ ...tenantForm, userLimit: tenantForm.userLimit ? Number(tenantForm.userLimit) : null })
        const data = result.data as { companyName?: string }
        setMessage(`Client ${data.companyName || tenantForm.companyName} onboarded successfully.`)
      }

      setShowForm(false)
      setEditing(null)
      setTenantForm(blankTenant)
      await loadAdminData()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save client.')
    } finally {
      setSaving(false)
    }
  }

  const changeStatus = async (tenant: Tenant, status: TenantStatus) => {
    try { await updateDoc(doc(db, 'tenants', tenant.id), { status, updatedAt: serverTimestamp() }); await loadAdminData() }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to update status.') }
  }

  const changePlanStatus = async (tenant: Tenant, planStatus: 'active' | 'inactive') => {
    try { await updateDoc(doc(db, 'tenants', tenant.id), { planStatus, updatedAt: serverTimestamp() }); await loadAdminData() }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to update plan.') }
  }

  if (booting) return <div className="center-screen">Loading platform…</div>

  if (!auth.currentUser) {
    return (
      <main className="auth-shell"><section className="auth-card">
        <div className="brand-mark"><ShieldCheck size={28} /></div>
        <p className="eyebrow">PARTHONE SOLAR PLATFORM</p><h1>Super Admin</h1>
        <p className="muted">Central Firebase control panel for all solar clients.</p>
        <form className="stack" onSubmit={login}>
          <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
          <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
          <button className="primary" type="submit">Sign in</button>
        </form>
        {message && <p className="error">{message}</p>}
      </section></main>
    )
  }

  if (!authorized) {
    return <div className="center-screen stack narrow"><ShieldCheck size={42} /><h2>Super Admin access required</h2><p className="muted">This Firebase account is not registered as a Parthone Super Admin.</p><button onClick={() => signOut(auth)}>Sign out</button></div>
  }

  const activeClients = tenants.filter((tenant) => tenant.status === 'active').length
  const clientUsers = users.filter((user) => user.tenantId).length

  return (
    <div className="app-shell">
      <aside><div><div className="sidebar-brand"><ShieldCheck size={24} /><span>Parthone Solar</span></div><nav><a className="active"><Building2 size={18} /> Clients</a><a><Users size={18} /> Client Users</a></nav></div><button className="ghost" onClick={() => signOut(auth)}><LogOut size={17} /> Sign out</button></aside>
      <main className="content">
        <header className="topbar"><div><p className="eyebrow">FIREBASE SUPER ADMIN</p><h1>Solar Clients</h1></div><div className="top-actions"><button className="ghost" onClick={loadAdminData}><RefreshCw size={17} /> Refresh</button><button className="primary" onClick={openCreate}><Plus size={17} /> Onboard Client</button></div></header>
        <section className="stats-grid"><article><span>Total Clients</span><strong>{tenants.length}</strong></article><article><span>Active Clients</span><strong>{activeClients}</strong></article><article><span>Client Users</span><strong>{clientUsers}</strong></article></section>
        {message && <div className="notice">{message}</div>}
        <section className="panel"><div className="panel-title"><div><h2>Companies</h2><p className="muted">Manage each tenant, branding, plan, domain and access status.</p></div></div><div className="table-wrap"><table><thead><tr><th>Company</th><th>Domain</th><th>Plan</th><th>Users</th><th>Company Status</th><th>Plan Status</th><th></th></tr></thead><tbody>
          {tenants.map((tenant) => <tr key={tenant.id}><td><strong>{tenant.name}</strong><small>{tenant.email || tenant.slug}</small></td><td>{tenant.customDomain || 'Not connected'}</td><td>{tenant.planName || 'standard'}</td><td>{userCounts.get(tenant.id) ?? 0}{tenant.userLimit ? ` / ${tenant.userLimit}` : ''}</td><td><select value={tenant.status} onChange={(e) => changeStatus(tenant, e.target.value as TenantStatus)}><option value="active">Active</option><option value="suspended">Suspended</option><option value="inactive">Inactive</option></select></td><td><select value={tenant.planStatus || 'active'} onChange={(e) => changePlanStatus(tenant, e.target.value as 'active' | 'inactive')}><option value="active">Active</option><option value="inactive">Inactive</option></select></td><td><button className="ghost" onClick={() => openEdit(tenant)}><Pencil size={16} /> Edit</button></td></tr>)}
          {tenants.length === 0 && <tr><td colSpan={7} className="empty">No solar clients added yet.</td></tr>}
        </tbody></table></div></section>
      </main>

      {showForm && <div className="modal-backdrop" onMouseDown={() => setShowForm(false)}><section className="modal" onMouseDown={(e) => e.stopPropagation()}><div className="panel-title"><div><p className="eyebrow">MODULE 4F</p><h2>{editing ? 'Edit Client & Branding' : 'Onboard Solar Client'}</h2></div><button className="ghost" onClick={() => setShowForm(false)}>Close</button></div><form className="form-grid" onSubmit={saveTenant}>
        <label>Company name<input value={tenantForm.companyName} onChange={(e) => setTenantForm({ ...tenantForm, companyName: e.target.value })} required /></label>
        <label>Slug<input value={tenantForm.slug} onChange={(e) => setTenantForm({ ...tenantForm, slug: e.target.value })} placeholder="supreme-solar" required /></label>
        <label>Company email<input type="email" value={tenantForm.companyEmail} onChange={(e) => setTenantForm({ ...tenantForm, companyEmail: e.target.value })} /></label>
        <label>Phone<input value={tenantForm.phone} onChange={(e) => setTenantForm({ ...tenantForm, phone: e.target.value })} /></label>
        <label>Address<input value={tenantForm.address} onChange={(e) => setTenantForm({ ...tenantForm, address: e.target.value })} /></label>
        <label>GST number<input value={tenantForm.gstNumber} onChange={(e) => setTenantForm({ ...tenantForm, gstNumber: e.target.value })} /></label>
        <label>Custom domain<input value={tenantForm.customDomain} onChange={(e) => setTenantForm({ ...tenantForm, customDomain: e.target.value })} placeholder="crm.client.com" /></label>
        <label>Plan<input value={tenantForm.planName} onChange={(e) => setTenantForm({ ...tenantForm, planName: e.target.value })} /></label>
        <label>User limit<input type="number" min="1" value={tenantForm.userLimit} onChange={(e) => setTenantForm({ ...tenantForm, userLimit: e.target.value })} /></label>
        <label>Logo URL<input value={tenantForm.logoUrl} onChange={(e) => setTenantForm({ ...tenantForm, logoUrl: e.target.value })} /></label>
        <label>Primary color<input type="color" value={tenantForm.primaryColor} onChange={(e) => setTenantForm({ ...tenantForm, primaryColor: e.target.value })} /></label>
        <label>Secondary color<input type="color" value={tenantForm.secondaryColor} onChange={(e) => setTenantForm({ ...tenantForm, secondaryColor: e.target.value })} /></label>
        {!editing && <><label>First Client Admin name<input value={tenantForm.adminName} onChange={(e) => setTenantForm({ ...tenantForm, adminName: e.target.value })} required /></label><label>First Client Admin email<input type="email" value={tenantForm.adminEmail} onChange={(e) => setTenantForm({ ...tenantForm, adminEmail: e.target.value })} required /></label><label>Temporary password<input type="password" minLength={8} value={tenantForm.adminPassword} onChange={(e) => setTenantForm({ ...tenantForm, adminPassword: e.target.value })} required /></label></>}
        <div className="form-actions"><button type="button" className="ghost" onClick={() => setShowForm(false)}>Cancel</button><button type="submit" className="primary" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save Changes' : 'Create Client + Admin'}</button></div>
      </form></section></div>}
    </div>
  )
}
