import { Flame } from 'lucide-react'

export default function ClientPortal() {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="brand-mark"><Flame size={28} /></div>
        <p className="eyebrow">PARTHONE SOLAR PLATFORM</p>
        <h1>Client portal foundation</h1>
        <p className="muted">Client login and role handling will be rebuilt on Firebase in Module 3F.</p>
      </section>
    </main>
  )
}
