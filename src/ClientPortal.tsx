import { FormEvent, useEffect, useState } from 'react'
import { LogOut, ShieldAlert, SolarPanel, UserRound } from 'lucide-react'
import { supabase } from './lib/supabase'
import { canAccessClientApp, getAuthContext, type AuthContext } from './lib/auth'

export default function ClientPortal() {
  const [context, setContext] = useState<AuthContext | null>(null)
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')

  const load = async () => {
    setLoading(true)
    setContext(await getAuthContext())
    setLoading(false)
  }

  useEffect(() => {
    load()
    const { data } = supabase.auth.onAuthStateChange(() => load())
    return () => data.subscription.unsubscribe()
  }, [])

  const signIn = async (event: FormEvent) => {
    event.preventDefault()
    setMessage('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setMessage(error.message)
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  if (loading) return <div className="center-screen">Loading account…</div>

  if (!context) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <div className="brand-mark"><SolarPanel size={28} /></div>
          <p className="eyebrow">SOLAR BUSINESS SOFTWARE</p>
          <h1>Client Login</h1>
          <p className="muted">Sign in with your company account.</p>
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

  if (context.role === 'parthone_super_admin') {
    return (
      <div className="center-screen stack narrow">
        <ShieldAlert size={42} />
        <h2>Use the Super Admin portal</h2>
        <p className="muted">This account belongs to Parthone platform administration.</p>
        <button onClick={signOut}>Sign out</button>
      </div>
    )
  }

  if (!canAccessClientApp(context)) {
    return (
      <div className="center-screen stack narrow">
        <ShieldAlert size={42} />
        <h2>Company access unavailable</h2>
        <p className="muted">Your company account is suspended, inactive, or not assigned correctly. Contact Parthone support.</p>
        <button onClick={signOut}>Sign out</button>
      </div>
    )
  }

  return (
    <div className="client-shell">
      <header className="client-topbar">
        <div>
          <p className="eyebrow">{context.role === 'client_admin' ? 'CLIENT ADMIN' : 'EMPLOYEE'}</p>
          <h1>{context.tenantName}</h1>
        </div>
        <button className="ghost" onClick={signOut}><LogOut size={17} /> Sign out</button>
      </header>

      <section className="panel client-welcome">
        <div className="brand-mark"><UserRound size={26} /></div>
        <div>
          <h2>Welcome, {context.fullName || context.email}</h2>
          <p className="muted">Tenant: {context.tenantSlug} · Role: {context.role.replace('_', ' ')}</p>
        </div>
      </section>

      <section className="stats-grid">
        <article><span>Company</span><strong>{context.tenantName}</strong></article>
        <article><span>Role</span><strong>{context.role === 'client_admin' ? 'Admin' : 'Employee'}</strong></article>
        <article><span>Status</span><strong>Active</strong></article>
      </section>

      <section className="panel">
        <h2>Dashboard foundation ready</h2>
        <p className="muted">MSUK solar business modules will be added here module-by-module, with all data automatically scoped to this tenant.</p>
      </section>
    </div>
  )
}
