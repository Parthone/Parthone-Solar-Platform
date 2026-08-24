import { FormEvent, useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  CalendarCheck,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Hammer,
  LogOut,
  Menu,
  PackageX,
  ReceiptIndianRupee,
  Search,
  ShieldAlert,
  SolarPanel,
  UserPlus,
  UserRound,
  Wallet,
  X,
} from 'lucide-react'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { auth } from './lib/firebase'
import { getAuthContext, getClientAccessState, type AuthContext, type ClientAccessState } from './lib/auth'
import { applyBranding, defaultBranding, resolvePublicBranding, type TenantBranding } from './lib/branding'
import { visibleClientNavigation } from './lib/client-navigation'
import CustomerJourneyModule from './components/CustomerJourneyModule'
import LeadsModule from './components/LeadsModule'
import SalesDocumentsModule from './components/SalesDocumentsModule'
import InventoryModule from './components/InventoryModule'
import FinanceModule from './components/FinanceModule'
import EmployeesModule from './components/EmployeesModule'
import TrackingProfileModule from './components/TrackingProfileModule'
import AuditExternalLinksModule from './components/AuditExternalLinksModule'
import ReportsModule from './components/ReportsModule'

const accessMessages: Record<Exclude<ClientAccessState, 'allowed' | 'super_admin'>, string> = {
  user_inactive: 'Your user account is inactive. Contact your company administrator.',
  tenant_missing: 'Your account is not assigned to a valid solar company.',
  tenant_suspended: 'Your company access is currently suspended. Contact Parthone support.',
  tenant_inactive: 'Your company account is inactive. Contact Parthone support.',
  plan_inactive: 'Your company plan is inactive. Contact Parthone support.',
}

const dashboardCards = [
  { label: "Today's Leads", value: '—', hint: 'Created today', icon: UserPlus, tone: 'primary' },
  { label: 'Pending Follow-ups', value: '—', hint: '0 overdue', icon: CalendarCheck, tone: 'secondary' },
  { label: 'Pending Payments', value: '—', hint: 'Outstanding Payment', icon: Wallet, tone: 'warning' },
  { label: 'Pending Installations', value: '—', hint: 'Awaiting completion', icon: Hammer, tone: 'accent' },
  { label: 'Employee Tasks', value: '—', hint: 'Workload signals', icon: ClipboardList, tone: 'primary' },
  { label: 'Unpaid Invoices', value: '—', hint: 'Outstanding amount', icon: ReceiptIndianRupee, tone: 'warning' },
  { label: 'Low Stock Alerts', value: '—', hint: 'Items below reorder level', icon: PackageX, tone: 'danger' },
]

const customerModes = new Set(['journey-dashboard', 'customers', 'followups', 'sales-followups', 'pipeline'])
const salesDocumentModes = new Set(['quotations', 'invoices', 'invoice-reports'])
const inventoryModes = new Set(['inventory-overview', 'purchases', 'panel-inventory', 'issues', 'reservations', 'movements', 'suppliers'])
const financeModes = new Set(['expenses', 'expense-categories', 'account-statement-confirmation'])
const trackingModes = new Set(['live-tracking', 'profile', 'mobile-app'])
const reportModes = new Set(['business-reports', 'inventory-reports'])

export default function ClientPortal() {
  const [context, setContext] = useState<AuthContext | null>(null)
  const [publicBranding, setPublicBranding] = useState<TenantBranding>(defaultBranding)
  const [loading, setLoading] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ journey: true, sales: true, inventory: true, finance: true, employees: true, reports: true })
  const [activeSection, setActiveSection] = useState('dashboard')

  useEffect(() => {
    resolvePublicBranding().then((branding) => {
      if (branding) { setPublicBranding(branding); applyBranding(branding) }
    }).catch(() => undefined)
  }, [])

  const load = async () => {
    try {
      const nextContext = await getAuthContext()
      setContext(nextContext)
      if (nextContext?.tenantId) {
        const branding: TenantBranding = {
          tenantId: nextContext.tenantId,
          companyName: nextContext.tenantName || 'Solar Business Software',
          slug: nextContext.tenantSlug || '',
          customDomain: nextContext.customDomain,
          logoUrl: nextContext.logoUrl,
          primaryColor: nextContext.primaryColor,
          secondaryColor: nextContext.secondaryColor,
          email: nextContext.tenantEmail,
          phone: nextContext.tenantPhone,
          address: nextContext.tenantAddress,
          gstNumber: nextContext.tenantGstNumber,
        }
        setPublicBranding(branding)
        applyBranding(branding)
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load account.')
      setContext(null)
    } finally { setLoading(false) }
  }

  useEffect(() => onAuthStateChanged(auth, async () => { setLoading(true); await load() }), [])

  const navigation = useMemo(() => context ? visibleClientNavigation(context.role) : [], [context])

  const login = async (event: FormEvent) => {
    event.preventDefault(); setMessage('')
    try { await signInWithEmailAndPassword(auth, email.trim(), password) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to sign in.') }
  }

  const logout = async () => signOut(auth)

  if (loading) return <div className="center-screen">Loading account…</div>

  if (!auth.currentUser || !context) {
    return <main className="auth-shell branded-auth"><section className="auth-card">
      {publicBranding.logoUrl ? <img className="tenant-logo" src={publicBranding.logoUrl} alt={publicBranding.companyName} /> : <div className="brand-mark"><SolarPanel size={28} /></div>}
      <p className="eyebrow">SOLAR BUSINESS SOFTWARE</p><h1>{publicBranding.companyName || 'Client Login'}</h1><p className="muted">Sign in using the account provided by your solar company.</p>
      <form onSubmit={login} className="stack"><label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label><label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label><button className="primary tenant-primary" type="submit">Sign in</button></form>
      {(publicBranding.phone || publicBranding.email) && <p className="muted company-contact">{publicBranding.phone || publicBranding.email}</p>}{message && <p className="error">{message}</p>}
    </section></main>
  }

  const accessState = getClientAccessState(context)
  if (accessState === 'super_admin') return <div className="center-screen stack narrow"><ShieldAlert size={42} /><h2>Use the Super Admin portal</h2><p className="muted">This account belongs to Parthone platform administration.</p><button onClick={logout}>Sign out</button></div>
  if (accessState !== 'allowed') return <div className="center-screen stack narrow"><ShieldAlert size={42} /><h2>Company access unavailable</h2><p className="muted">{accessMessages[accessState]}</p><button onClick={logout}>Sign out</button></div>

  const customerMode = activeSection === 'sales-followups' ? 'followups' : activeSection
  const isAdmin = context.role === 'client_admin'

  return <div className="msuk-shell">
    {sidebarOpen && <button className="sidebar-overlay" aria-label="Close menu" onClick={() => setSidebarOpen(false)} />}
    <aside className={`msuk-sidebar ${sidebarOpen ? 'open' : ''}`}>
      <div className="msuk-sidebar-head"><button className="mobile-close" onClick={() => setSidebarOpen(false)}><X size={18} /></button><button className="tenant-brand-button" onClick={() => setActiveSection('dashboard')}>
        {context.logoUrl ? <img className="tenant-logo small" src={context.logoUrl} alt={context.tenantName || 'Company'} /> : <div className="brand-mark compact"><SolarPanel size={20} /></div>}
        <span className="tenant-brand-copy"><strong>{context.tenantName}</strong><small>{context.tenantGstNumber ? `GSTIN: ${context.tenantGstNumber}` : context.tenantSlug}</small></span>
      </button></div>
      <nav className="msuk-nav">{navigation.map((section) => { const Icon = section.icon; const isActive = activeSection === section.key; const hasItems = Boolean(section.items?.length); return <div key={section.key} className="nav-block">
        <button className={`nav-main ${isActive ? 'active' : ''}`} onClick={() => { if (hasItems) setExpanded((prev) => ({ ...prev, [section.key]: !prev[section.key] })); else setActiveSection(section.key) }}><Icon size={18} /><span>{section.label}</span>{hasItems && <ChevronRight size={16} className={expanded[section.key] ? 'rotate' : ''} />}</button>
        {hasItems && expanded[section.key] && <div className="nav-sub">{section.items!.map((item) => <button key={item.key} className={activeSection === item.key ? 'active' : ''} onClick={() => { setActiveSection(item.key); setSidebarOpen(false) }}>{item.label}</button>)}</div>}
      </div> })}</nav>
      <div className="sidebar-footer-links"><button onClick={() => setActiveSection('followups')}><CalendarCheck size={17} /> Today's Follow-ups</button><button onClick={() => setActiveSection('profile')}><UserRound size={17} /> {context.fullName || 'Account'}</button></div>
    </aside>

    <div className="msuk-main">
      <header className="msuk-topbar"><button className="menu-trigger" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button><div className="global-search"><Search size={18} /><input placeholder="Search customers, leads, invoices..." /></div><button className="quick-add" onClick={() => setActiveSection('add-lead')}>+ Add Lead</button><div className="profile-wrap"><button className="profile-trigger" onClick={() => setProfileOpen((open) => !open)}><span className="avatar">{(context.fullName || context.email || '?').charAt(0).toUpperCase()}</span><span className="profile-copy"><strong>{context.fullName || 'Account'}</strong><small>{context.role === 'client_admin' ? 'Client Admin' : 'Employee'}</small></span><ChevronDown size={16} /></button>{profileOpen && <div className="profile-menu"><strong>{context.fullName || 'Account'}</strong><small>{context.email}</small><button onClick={() => setActiveSection('profile')}>My Profile</button><button onClick={() => setActiveSection('change-password')}>Change Password</button>{isAdmin && <button onClick={() => setActiveSection('user-management')}>User Management</button>}{isAdmin && <button onClick={() => setActiveSection('branding')}>Branding Settings</button>}<button onClick={logout}><LogOut size={15} /> Logout</button></div>}</div></header>

      <main className="msuk-content">
        {activeSection === 'dashboard' ? <><div className="dashboard-heading"><div><h1>Dashboard</h1><p>Your solar business at a glance — updated every minute.</p></div></div><section className="dashboard-grid">{dashboardCards.map((card) => { const Icon = card.icon; return <button className="dashboard-card" key={card.label}><div className={`kpi-icon ${card.tone}`}><Icon size={19} /></div><ArrowRight size={16} className="card-arrow" /><div className="kpi-copy"><strong>{card.value}</strong><span>{card.label}</span><small>{card.hint}</small></div></button> })}</section></>
        : customerModes.has(activeSection) && context.tenantId ? <CustomerJourneyModule tenantId={context.tenantId} mode={customerMode as 'journey-dashboard' | 'customers' | 'followups' | 'pipeline'} />
        : (activeSection === 'leads' || activeSection === 'add-lead') && context.tenantId ? <LeadsModule tenantId={context.tenantId} isAdmin={isAdmin} startInAddMode={activeSection === 'add-lead'} />
        : salesDocumentModes.has(activeSection) && context.tenantId ? <SalesDocumentsModule tenantId={context.tenantId} mode={activeSection as 'quotations' | 'invoices' | 'invoice-reports'} />
        : inventoryModes.has(activeSection) && context.tenantId ? <InventoryModule tenantId={context.tenantId} mode={activeSection as 'inventory-overview' | 'purchases' | 'panel-inventory' | 'issues' | 'reservations' | 'movements' | 'suppliers'} />
        : financeModes.has(activeSection) && context.tenantId ? <FinanceModule tenantId={context.tenantId} mode={activeSection as 'expenses' | 'expense-categories' | 'account-statement-confirmation'} currentUserName={context.fullName} />
        : activeSection === 'user-management' && context.tenantId && isAdmin ? <EmployeesModule tenantId={context.tenantId} currentUserId={context.userId} />
        : trackingModes.has(activeSection) && context.tenantId ? <TrackingProfileModule tenantId={context.tenantId} userId={context.userId} fullName={context.fullName || context.email || 'Employee'} role={context.role === 'client_admin' ? 'client_admin' : 'employee'} mode={activeSection as 'live-tracking' | 'profile' | 'mobile-app'} />
        : activeSection === 'external-links' && context.tenantId ? <AuditExternalLinksModule tenantId={context.tenantId} mode="external-links" isAdmin={isAdmin} />
        : activeSection === 'audit-log' && context.tenantId ? <AuditExternalLinksModule tenantId={context.tenantId} mode="audit-log" isAdmin={isAdmin} />
        : reportModes.has(activeSection) && context.tenantId ? <ReportsModule tenantId={context.tenantId} mode={activeSection as 'business-reports' | 'inventory-reports'} />
        : <section className="panel module-placeholder"><p className="eyebrow">MODULE BASE</p><h2>{navigation.flatMap((section) => [section, ...(section.items || [])]).find((item) => item.key === activeSection)?.label || 'Module'}</h2><p className="muted">Navigation is ready. This module will be connected to Firebase and rebuilt from the MSUK reference in its dedicated module.</p></section>}
      </main>
      <footer className="client-footer">{context.tenantName} · Solar Business Software</footer>
    </div>
  </div>
}
