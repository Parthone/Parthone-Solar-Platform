import { useEffect, useState } from 'react'
import { FileText, Search, UserRound, Users } from 'lucide-react'
import { searchTenant, type GlobalSearchResult } from '../lib/dashboard-search'
import type { EmployeeModuleKey } from '../lib/permissions-targets'

type Props = {
  tenantId: string
  role: 'client_admin' | 'employee'
  employeeModules?: EmployeeModuleKey[]
  onNavigate: (section: string) => void
}

export default function GlobalSearch({ tenantId, role, employeeModules, onNavigate }: Props) {
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<GlobalSearchResult[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const query = term.trim()
    if (query.length < 2) { setResults([]); setLoading(false); return }
    let active = true
    const timer = window.setTimeout(async () => {
      setLoading(true)
      try { const next = await searchTenant(tenantId, query, role, employeeModules); if (active) setResults(next) }
      catch { if (active) setResults([]) }
      finally { if (active) setLoading(false) }
    }, 250)
    return () => { active = false; window.clearTimeout(timer) }
  }, [tenantId, term, role, employeeModules])

  const choose = (row: GlobalSearchResult) => { onNavigate(row.section); setTerm(''); setResults([]) }

  return <div className="global-search global-search-live"><Search size={18}/><input value={term} onChange={(e)=>setTerm(e.target.value)} placeholder="Search customers, leads, invoices..." />{term.trim().length >= 2 && <div className="search-dropdown">{loading && <p className="search-state">Searching…</p>}{!loading && results.length === 0 && <p className="search-state">No matching records</p>}{results.map((row) => { const Icon = row.type === 'customer' ? UserRound : row.type === 'lead' ? Users : FileText; return <button key={`${row.type}-${row.id}`} onClick={() => choose(row)}><Icon size={17}/><span><strong>{row.title}</strong><small>{row.subtitle}</small></span></button> })}</div>}</div>
}
