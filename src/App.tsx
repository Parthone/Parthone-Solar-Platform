import { Database, Flame, HardDrive, ShieldCheck } from 'lucide-react'

export default function App() {
  return (
    <main className="auth-shell">
      <section className="auth-card" style={{ maxWidth: 620 }}>
        <div className="brand-mark"><Flame size={28} /></div>
        <p className="eyebrow">PARTHONE SOLAR PLATFORM</p>
        <h1>Firebase foundation ready</h1>
        <p className="muted">The centralized solar platform now uses Firebase as its primary backend and hosting stack.</p>
        <div className="stats-grid" style={{ marginTop: 24 }}>
          <article><ShieldCheck size={20} /><span>Authentication</span><strong>Firebase Auth</strong></article>
          <article><Database size={20} /><span>Database</span><strong>Firestore</strong></article>
          <article><HardDrive size={20} /><span>Files</span><strong>Cloud Storage</strong></article>
        </div>
        <p className="muted" style={{ marginTop: 20 }}>Super Admin, client onboarding and client-role screens will be rebuilt on this Firebase foundation in the next modules.</p>
      </section>
    </main>
  )
}
