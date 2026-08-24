import { FormEvent, useEffect, useMemo, useState } from 'react'
import { ExternalLink as ExternalLinkIcon, Plus, Search, ShieldCheck, Trash2 } from 'lucide-react'
import {
  deleteExternalLink,
  fetchAuditLogs,
  fetchExternalLinks,
  saveExternalLink,
  type AuditLog,
  type ExternalLink,
} from '../lib/audit-external-links'

type Props = { tenantId: string; mode: 'audit-log' | 'external-links'; isAdmin: boolean }

function formatDate(value: AuditLog['createdAt']) {
  try {
    const date = value?.toDate?.()
    return date ? date.toLocaleString('en-IN') : '—'
  } catch { return '—' }
}

function safeUrl(url: string) {
  const value = url.trim()
  if (!/^https?:\/\//i.test(value)) throw new Error('URL must start with http:// or https://')
  return value
}

export default function AuditExternalLinksModule({ tenantId, mode, isAdmin }: Props) {
  const [audit, setAudit] = useState<AuditLog[]>([])
  const [links, setLinks] = useState<ExternalLink[]>([])
  const [term, setTerm] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<ExternalLink | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', category: 'General', url: '', isActive: true })
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    setMessage('')
    try {
      if (mode === 'audit-log') setAudit(await fetchAuditLogs(tenantId))
      else setLinks(await fetchExternalLinks(tenantId))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load data.')
    } finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [tenantId, mode])

  const filteredAudit = useMemo(() => {
    const q = term.trim().toLowerCase()
    if (!q) return audit
    return audit.filter((row) => [row.userName || '', row.module, row.action, row.previousValue || '', row.newValue || ''].join(' ').toLowerCase().includes(q))
  }, [audit, term])

  const visibleLinks = useMemo(() => links.filter((link) => isAdmin || link.isActive), [links, isAdmin])

  if (mode === 'audit-log') {
    if (!isAdmin) return <section className="panel"><ShieldCheck size={24}/><h2>Audit Log</h2><p className="muted">Only Client Admins can view tenant audit history.</p></section>
    return <div className="module-stack">
      <div className="module-head"><div><h1>Audit Log</h1><p>Track important user and admin actions across your company workspace.</p></div></div>
      <div className="search-box"><Search size={17}/><input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search by user, module, action or change" /></div>
      {message && <div className="notice">{message}</div>}
      <div className="audit-list">{filteredAudit.map((row) => <article className="panel audit-card" key={row.id}><div className="audit-top"><strong>{row.module} · {row.action}</strong><small>{formatDate(row.createdAt)}</small></div><p>{row.userName || 'System'}</p>{(row.previousValue || row.newValue) && <div className="audit-change"><span>{row.previousValue || '—'}</span><b>→</b><span>{row.newValue || '—'}</span></div>}</article>)}{!loading && filteredAudit.length === 0 && <section className="panel empty-state"><ShieldCheck size={28}/><h3>No audit activity yet</h3></section>}</div>
    </div>
  }

  const openCreate = () => {
    setEditing(null)
    setForm({ name: '', category: 'General', url: '', isActive: true })
    setShowForm(true)
  }

  const openEdit = (link: ExternalLink) => {
    setEditing(link)
    setForm({ name: link.name, category: link.category, url: link.url, isActive: link.isActive })
    setShowForm(true)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setMessage('')
    try {
      await saveExternalLink({ id: editing?.id, name: form.name.trim(), category: form.category.trim() || 'General', url: safeUrl(form.url), isActive: form.isActive })
      setShowForm(false); setEditing(null); await load()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to save link.') }
    finally { setSaving(false) }
  }

  const remove = async (link: ExternalLink) => {
    if (!confirm(`Delete ${link.name}?`)) return
    setMessage('')
    try { await deleteExternalLink(link.id); await load() }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to delete link.') }
  }

  return <div className="module-stack">
    <div className="module-head"><div><h1>External Links</h1><p>Keep frequently used websites and portals in one place.</p></div>{isAdmin && <button className="primary tenant-primary" onClick={openCreate}><Plus size={16}/> Add External Link</button>}</div>
    {message && <div className="notice">{message}</div>}
    <div className="external-link-grid">{visibleLinks.map((link) => <article className="panel external-link-card" key={link.id}><div><span className="link-category">{link.category}</span><h3>{link.name}</h3><p>{link.url}</p></div><div className="external-link-actions"><a className="ghost" href={link.url} target="_blank" rel="noopener noreferrer"><ExternalLinkIcon size={15}/> Open</a>{isAdmin && <button className="ghost" onClick={() => openEdit(link)}>Edit</button>}{isAdmin && <button className="ghost danger-text" onClick={() => remove(link)}><Trash2 size={15}/> Delete</button>}</div>{isAdmin && <span className={`status-chip ${link.isActive ? 'active' : 'inactive'}`}>{link.isActive ? 'Active' : 'Inactive'}</span>}</article>)}{!loading && visibleLinks.length === 0 && <section className="panel empty-state"><ExternalLinkIcon size={28}/><h3>No external links saved</h3></section>}</div>
    {showForm && <div className="modal-backdrop" onMouseDown={() => setShowForm(false)}><section className="modal" onMouseDown={(e) => e.stopPropagation()}><div className="panel-title"><div><p className="eyebrow">WORKSPACE LINK</p><h2>{editing ? 'Edit External Link' : 'Add External Link'}</h2></div><button className="ghost" onClick={() => setShowForm(false)}>Close</button></div><form className="form-grid" onSubmit={submit}><label>Link Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label><label>Category<input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></label><label className="full-field">URL<input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://example.com" required /></label><label>Status<select value={form.isActive ? 'active' : 'inactive'} onChange={(e) => setForm({ ...form, isActive: e.target.value === 'active' })}><option value="active">Active</option><option value="inactive">Inactive</option></select></label><div className="form-actions"><button type="button" className="ghost" onClick={() => setShowForm(false)}>Cancel</button><button className="primary tenant-primary" disabled={saving}>{saving ? 'Saving…' : 'Save Link'}</button></div></form></section></div>}
  </div>
}
