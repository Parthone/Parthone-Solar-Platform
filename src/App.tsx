import { FormEvent, useEffect, useMemo, useState } from 'react'
import { Building2, LogOut, Plus, RefreshCw, ShieldCheck, Users } from 'lucide-react'
import { supabase } from './lib/supabase'

type TenantStatus = 'active' | 'suspended' | 'inactive'

type Tenant = {
  id: string
  name: string
  slug: string
  status: TenantStatus
  email: string | null
  phone: string | null
  custom_domain: string | null
  plan_name: string
  plan_status: string
  user_limit: number | null
  storage_limit_mb: number | null
  created_at: string
}

type Profile = {
  id: string
  tenant_id: string | null
  full_name: string | null
  role: 'parthone_super_admin' | 'client_admin' | 'employee'
  is_active: boolean
}

const emptyTenant = {
  name: '',
  slug: '',
  email: '',
  phone: '',
  custom_domain: '',
  plan_name: 'standard',
}

export default function App() {
  const [loading, setLoading] = useState(true)
  const [sessionReady, setSessionReady] = useState(false)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [newTenant, setNewTenant] = useState(emptyTenant)

  const loadAdminData = async () => {
    setLoading(true)
    const { data: auth } = await supabase.auth.getUser()
    const user = auth.user
    if (!user) {
      setSessionReady(false)
      setIsSuperAdmin(false)
      setLoading(false)
      return
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id,tenant_id,full_name,role,is_active')
      .eq('id', user.id)
      .maybeSingle()

    const allowed = profile?.role === 'parthone_super_admin' && profile?.is_active
    setSessionReady(true)
    setIsSuperAdmin(Boolean(allowed))

    if (allowed) {
      const [{ data: tenantRows }, { data: profileRows }] = await Promise.all([
        supabase.from('tenants').select('*').order('created_at', { ascending: false }),
        supabase.from('profiles').select('id,tenant_id,full_name,role,is_active'),
      ])
      setTenants((tenantRows ?? []) as Tenant[])
      setProfiles((profileRows ?? []) as Profile[])
    }
    setLoading(false)
  }

  useEffect(() => {
    loadAdminData()
    const { data } = supabase.auth.onAuthStateChange(() => loadAdminData())
    return () => data.subscription.unsubscribe()
  }, [])

  const userCount = useMemo(() => {
    const map = new Map<string, number>()
    profiles.forEach((profile) => {
      if (profile.tenant_id) map.set(profile.tenant_id, (map.get(profile.tenant_id) ?? 0) + 1)
    })
    return map
  }, [profiles])

  const signIn = async (event: FormEvent) => {
    event.preventDefault()
    setMessage('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setMessage(error.message)
  }

  const addTenant = async (event: FormEvent) => {
    event.preventDefault()
    setMessage('')
    const payload = {
      name: newTenant.name.trim(),
      slug: newTenant.slug.trim().toLowerCase(),
      email: newTenant.email.trim() || null,
      phone: newTenant.phone.trim() || null,
      custom_domain: newTenant.custom_domain.trim() || null,
      plan_name: newTenant.plan_name.trim() || 'standard',
      status: 'active' as TenantStatus,
    }
    const { error } = await supabase.from('tenants').insert(payload)
    if (error) return setMessage(error.message)
    setNewTenant(emptyTenant)
    setShowAdd(false)
    await loadAdminData()
  }

  const changeStatus = async (tenant: Tenant, status: TenantStatus) => {
    const { error } = await supabase.from('tenants').update({ status }).eq('id', tenant.id)
    if (error) return setMessage(error.message)
    await loadAdminData()
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  if (loading && !sessionReady) {
    return <div className="center-screen">Loading platform…</div>
  }

  if (!sessionReady) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <div className="brand-mark"><ShieldCheck size={28} /></div>
          <p className="eyebrow">PARTHONE SOLAR PLATFORM</p>
          <h1>Super Admin</h1>
          <p className="muted">Central control for all solar client companies.</p>
          <form onSubmit={signIn} className="stack">
            <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
            <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
            <button className="primary" type="submit">Sign in</button>
          </form>
          {message && <p className="error">{message}</p>}
        </section>
      </main>
    )
  }

  if (!isSuperAdmin) {
    return (
      <div className="center-screen stack narrow">
        <ShieldCheck size={42} />
        <h2>Super Admin access required</h2>
        <p className="muted">This account is not authorized for Parthone platform administration.</p>
        <button onClick={signOut}>Sign out</button>
      </div>
    )
  }

  const activeCount = tenants.filter((t) => t.status === 'active').length
  const totalUsers = profiles.filter((p) => p.tenant_id).length

  return (
    <div className="app-shell">
      <aside>
        <div>
          <div className="sidebar-brand"><ShieldCheck size={24} /><span>Parthone Solar</span></div>
          <nav>
            <a className="active"><Building2 size={18} /> Clients</a>
            <a><Users size={18} /> Client Users</a>
          </nav>
        </div>
        <button className="ghost" onClick={signOut}><LogOut size={17} /> Sign out</button>
      </aside>

      <main className="content">
        <header className="topbar">
          <div><p className="eyebrow">SUPER ADMIN</p><h1>Solar Clients</h1></div>
          <div className="top-actions">
            <button className="ghost" onClick={loadAdminData}><RefreshCw size={17} /> Refresh</button>
            <button className="primary" onClick={() => setShowAdd(true)}><Plus size={17} /> Add Client</button>
          </div>
        </header>

        <section className="stats-grid">
          <article><span>Total Clients</span><strong>{tenants.length}</strong></article>
          <article><span>Active Clients</span><strong>{activeCount}</strong></article>
          <article><span>Client Users</span><strong>{totalUsers}</strong></article>
        </section>

        {message && <div className="notice">{message}</div>}

        <section className="panel">
          <div className="panel-title"><div><h2>Companies</h2><p className="muted">Manage status, plan and access for every solar client.</p></div></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Company</th><th>Domain</th><th>Plan</th><th>Users</th><th>Status</th><th>Action</th></tr></thead>
              <tbody>
                {tenants.map((tenant) => (
                  <tr key={tenant.id}>
                    <td><strong>{tenant.name}</strong><small>{tenant.email || tenant.slug}</small></td>
                    <td>{tenant.custom_domain || 'Not connected'}</td>
                    <td>{tenant.plan_name}</td>
                    <td>{userCount.get(tenant.id) ?? 0}{tenant.user_limit ? ` / ${tenant.user_limit}` : ''}</td>
                    <td><span className={`badge ${tenant.status}`}>{tenant.status}</span></td>
                    <td>
                      <select value={tenant.status} onChange={(e) => changeStatus(tenant, e.target.value as TenantStatus)}>
                        <option value="active">Active</option>
                        <option value="suspended">Suspended</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </td>
                  </tr>
                ))}
                {tenants.length === 0 && <tr><td colSpan={6} className="empty">No solar clients added yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {showAdd && (
        <div className="modal-backdrop" onMouseDown={() => setShowAdd(false)}>
          <section className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="panel-title"><div><p className="eyebrow">NEW TENANT</p><h2>Add Solar Client</h2></div><button className="ghost" onClick={() => setShowAdd(false)}>Close</button></div>
            <form onSubmit={addTenant} className="form-grid">
              <label>Company name<input value={newTenant.name} onChange={(e) => setNewTenant({ ...newTenant, name: e.target.value })} required /></label>
              <label>Slug<input value={newTenant.slug} onChange={(e) => setNewTenant({ ...newTenant, slug: e.target.value })} placeholder="supreme-solar" required /></label>
              <label>Email<input type="email" value={newTenant.email} onChange={(e) => setNewTenant({ ...newTenant, email: e.target.value })} /></label>
              <label>Phone<input value={newTenant.phone} onChange={(e) => setNewTenant({ ...newTenant, phone: e.target.value })} /></label>
              <label>Custom domain<input value={newTenant.custom_domain} onChange={(e) => setNewTenant({ ...newTenant, custom_domain: e.target.value })} placeholder="crm.client.com" /></label>
              <label>Plan<input value={newTenant.plan_name} onChange={(e) => setNewTenant({ ...newTenant, plan_name: e.target.value })} /></label>
              <div className="form-actions"><button type="button" className="ghost" onClick={() => setShowAdd(false)}>Cancel</button><button className="primary" type="submit">Create Client</button></div>
            </form>
          </section>
        </div>
      )}
    </div>
  )
}
