import { FormEvent, useEffect, useState } from 'react'
import { LogOut, ShieldAlert, SolarPanel, UserRound } from 'lucide-react'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { auth } from './lib/firebase'
import {
  getAuthContext,
  getClientAccessState,
  type AuthContext,
  type ClientAccessState,
} from './lib/auth'

const accessMessages: Record<Exclude<ClientAccessState, 'allowed' | 'super_admin'>, string> = {
  user_inactive: 'Your user account is inactive. Contact your company administrator.',
  tenant_missing: 'Your account is not assigned to a valid solar company.',
  tenant_suspended: 'Your company access is currently suspended. Contact Parthone support.',
  tenant_inactive: 'Your company account is inactive. Contact Parthone support.',
  plan_inactive: 'Your company plan is inactive. Contact Parthone support.',
}

export default function ClientPortal() {
  const [context, setContext] = useState<AuthContext | null>(null)
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')

  const load = async () => {
    try {
      setContext(await getAuthContext())
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load account.')
      setContext(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    return onAuthStateChanged(auth, async () => {
      setLoading(true)
      await load()
    })
  }, [])

  const login = async (event: FormEvent) => {
    event.preventDefault()
    setMessage('')
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to sign in.')
    }
  }

  const logout = async () => {
    await signOut(auth)
  }

  if (loading) return <div className="center-screen">Loading account…</div>

  if (!auth.currentUser || !context) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <div className="brand-mark"><SolarPanel size={28} /></div>
          <p className="eyebrow">SOLAR BUSINESS SOFTWARE</p>
          <h1>Client Login</h1>
          <p className="muted">Sign in using the account provided by your solar company.</p>
          <form onSubmit={login} className="stack">
            <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
            <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
            <button className="primary" type="submit">Sign in</button>
          </form>
          {message && <p className="error">{message}</p>}
        </section>
      </main>
    )
  }

  const accessState = getClientAccessState(context)

  if (accessState === 'super_admin') {
    return (
      <div className="center-screen stack narrow">
        <ShieldAlert size={42} />
        <h2>Use the Super Admin portal</h2>
        <p className="muted">This account belongs to Parthone platform administration.</p>
        <button onClick={logout}>Sign out</button>
      </div>
    )
  }

  if (accessState !== 'allowed') {
    return (
      <div className="center-screen stack narrow">
        <ShieldAlert size={42} />
        <h2>Company access unavailable</h2>
        <p className="muted">{accessMessages[accessState]}</p>
        <button onClick={logout}>Sign out</button>
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
        <button className="ghost" onClick={logout}><LogOut size={17} /> Sign out</button>
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
        <h2>Client dashboard foundation ready</h2>
        <p className="muted">All upcoming MSUK-style solar modules will load inside this tenant-scoped session and respect Firebase Security Rules.</p>
      </section>
    </div>
  )
}
