import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, ExternalLink, LocateFixed, MapPin, Navigation, Search, ShieldCheck, Smartphone, UserRound, WifiOff } from 'lucide-react'
import {
  fetchEmployeeLocations,
  fetchEmployeeProfile,
  fetchOwnTracking,
  locationFreshness,
  mapsUrl,
  publishLocation,
  setLocationSharing,
  updateTrackingWorkStatus,
  type EmployeeLocation,
  type EmployeeProfile,
  type TrackingStatus,
} from '../lib/tracking'

type Mode = 'live-tracking' | 'profile' | 'mobile-app'
type Props = {
  tenantId: string
  userId: string
  fullName: string
  designation?: string | null
  role: 'client_admin' | 'employee'
  mode: Mode
}

const statuses: Array<{ value: TrackingStatus; label: string }> = [
  { value: 'online', label: 'Working' },
  { value: 'travelling', label: 'Travelling' },
  { value: 'at_customer', label: 'At Customer' },
  { value: 'offline', label: 'Offline' },
]

function statusLabel(status: TrackingStatus) {
  if (status === 'location_disabled') return 'Location Disabled'
  if (status === 'at_customer') return 'At Customer'
  if (status === 'travelling') return 'Travelling'
  if (status === 'offline') return 'Offline'
  return 'Working'
}

export default function TrackingProfileModule({ tenantId, userId, fullName, designation, role, mode }: Props) {
  const [locations, setLocations] = useState<EmployeeLocation[]>([])
  const [ownTracking, setOwnTracking] = useState<EmployeeLocation | null>(null)
  const [profile, setProfile] = useState<EmployeeProfile | null>(null)
  const [term, setTerm] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [watching, setWatching] = useState(false)
  const [workStatus, setWorkStatus] = useState<TrackingStatus>('online')
  const [customer, setCustomer] = useState('')
  const watchId = useRef<number | null>(null)

  const load = async () => {
    setLoading(true)
    setMessage('')
    try {
      const [profileRow, ownRow, locationRows] = await Promise.all([
        fetchEmployeeProfile(userId),
        fetchOwnTracking(tenantId, userId),
        role === 'client_admin' ? fetchEmployeeLocations(tenantId) : Promise.resolve([]),
      ])
      setProfile(profileRow)
      setOwnTracking(ownRow)
      setLocations(locationRows)
      if (ownRow) {
        setWorkStatus(ownRow.status === 'location_disabled' ? 'online' : ownRow.status)
        setCustomer(ownRow.currentCustomer || '')
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load tracking data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [tenantId, userId, role])
  useEffect(() => () => { if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current) }, [])

  const filtered = useMemo(() => locations.filter((row) => {
    const q = term.trim().toLowerCase()
    return !q || [row.employeeName, row.designation || '', row.currentCustomer || '', statusLabel(row.status)]
      .some((value) => value.toLowerCase().includes(q))
  }), [locations, term])

  const startSharing = async () => {
    if (!navigator.geolocation) return setMessage('Location is not supported on this device.')
    setMessage('')
    try {
      await setLocationSharing({ tenantId, userId, employeeName: fullName, designation, enabled: true })
      watchId.current = navigator.geolocation.watchPosition(async (position) => {
        try {
          await publishLocation({
            tenantId,
            userId,
            employeeName: fullName,
            designation,
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            status: workStatus,
            currentCustomer: customer.trim() || null,
          })
          setOwnTracking(await fetchOwnTracking(tenantId, userId))
          if (role === 'client_admin') setLocations(await fetchEmployeeLocations(tenantId))
        } catch (error) {
          setMessage(error instanceof Error ? error.message : 'Unable to update location.')
        }
      }, (error) => {
        setMessage(error.message || 'Location permission is required.')
        setWatching(false)
      }, { enableHighAccuracy: true, maximumAge: 30000, timeout: 20000 })
      setWatching(true)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to start sharing.')
    }
  }

  const stopSharing = async () => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current)
    watchId.current = null
    setWatching(false)
    try {
      await setLocationSharing({ tenantId, userId, employeeName: fullName, designation, enabled: false })
      setOwnTracking(await fetchOwnTracking(tenantId, userId))
      if (role === 'client_admin') setLocations(await fetchEmployeeLocations(tenantId))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to stop sharing.')
    }
  }

  const saveStatus = async (status: TrackingStatus) => {
    setWorkStatus(status)
    try {
      await updateTrackingWorkStatus(tenantId, userId, status, customer.trim() || null)
      setOwnTracking(await fetchOwnTracking(tenantId, userId))
      if (role === 'client_admin') setLocations(await fetchEmployeeLocations(tenantId))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to update status.')
    }
  }

  if (mode === 'profile') {
    return <div className="module-stack">
      <div className="module-head"><div><h1>My Profile</h1><p>Your account, role and field activity summary.</p></div></div>
      {message && <div className="notice">{message}</div>}
      {loading ? <section className="panel">Loading profile…</section> : profile ? <>
        <section className="panel profile-hero"><div className="employee-avatar large">{profile.fullName.charAt(0).toUpperCase()}</div><div><h2>{profile.fullName}</h2><p>{profile.email}</p><small>{profile.designation || 'No designation'}</small></div><span className={`status-chip ${profile.isActive ? 'active' : 'inactive'}`}>{profile.isActive ? 'Active' : 'Inactive'}</span></section>
        <section className="profile-grid"><article><span>Role</span><strong>{profile.role === 'client_admin' ? 'Client Admin' : 'Employee'}</strong></article><article><span>Mobile</span><strong>{profile.mobile || '—'}</strong></article><article><span>Location Sharing</span><strong>{ownTracking?.sharingEnabled ? 'Enabled' : 'Disabled'}</strong></article><article><span>Work Status</span><strong>{ownTracking ? statusLabel(ownTracking.status) : 'No status'}</strong></article><article><span>Last Location</span><strong>{ownTracking ? locationFreshness(ownTracking) : '—'}</strong></article><article><span>Current Customer</span><strong>{ownTracking?.currentCustomer || '—'}</strong></article></section>
        <section className="panel"><div className="panel-title"><h2>Access Summary</h2><ShieldCheck size={18}/></div><p className="muted">{profile.role === 'client_admin' ? 'Can manage company users and view tenant-wide tracking.' : 'Can access assigned company modules and manage own field location sharing.'}</p></section>
      </> : <section className="panel">Profile unavailable.</section>}
    </div>
  }

  if (mode === 'mobile-app') {
    return <div className="module-stack mobile-field-page">
      <div className="module-head"><div><h1>Mobile Field App</h1><p>Quick field controls for employees on phone.</p></div><Smartphone size={28}/></div>
      {message && <div className="notice">{message}</div>}
      <section className="panel mobile-location-card"><LocateFixed size={28}/><h2>{watching || ownTracking?.sharingEnabled ? 'Live Location Sharing On' : 'Location Sharing Off'}</h2><p className="muted">Share your location only while doing field work.</p><div className="mobile-actions">{watching ? <button className="ghost" onClick={() => void stopSharing()}>Stop Sharing</button> : <button className="primary tenant-primary" onClick={() => void startSharing()}>Start Sharing</button>}</div></section>
      <section className="panel"><h3>Work Status</h3><div className="status-buttons">{statuses.map((row) => <button key={row.value} className={workStatus === row.value ? 'active' : ''} onClick={() => void saveStatus(row.value)}>{row.label}</button>)}</div><label className="field-label">Current Customer<input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Optional customer name" /></label></section>
      {ownTracking?.latitude != null && ownTracking.longitude != null && <a className="primary tenant-primary map-link-button" href={mapsUrl(ownTracking.latitude, ownTracking.longitude)} target="_blank" rel="noreferrer"><MapPin size={16}/> Open My Location</a>}
    </div>
  }

  return <div className="module-stack">
    <div className="module-head"><div><h1>Employee Live Tracking</h1><p>{role === 'client_admin' ? 'View tenant field-team location status and last updates.' : 'Share your own field location and work status.'}</p></div>{role === 'client_admin' && <button className="ghost" onClick={() => void load()}>Refresh</button>}</div>
    {message && <div className="notice">{message}</div>}

    <section className="tracking-self panel"><div><h2>My Location Sharing</h2><p className="muted">Browser location is shared only after you start it.</p></div><div className="tracking-self-actions">{watching ? <button className="ghost" onClick={() => void stopSharing()}><WifiOff size={16}/> Stop Sharing</button> : <button className="primary tenant-primary" onClick={() => void startSharing()}><LocateFixed size={16}/> Start Sharing</button>}</div><div className="tracking-controls"><select value={workStatus} onChange={(e) => void saveStatus(e.target.value as TrackingStatus)}>{statuses.map((row) => <option key={row.value} value={row.value}>{row.label}</option>)}</select><input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="Current customer (optional)" /></div>{ownTracking && <small>{statusLabel(ownTracking.status)} · {locationFreshness(ownTracking)}</small>}</section>

    {role === 'client_admin' && <>
      <div className="tracking-stats"><article><span>Employees Seen</span><strong>{locations.length}</strong></article><article><span>Sharing Location</span><strong>{locations.filter((row) => row.sharingEnabled).length}</strong></article><article><span>At Customer</span><strong>{locations.filter((row) => row.status === 'at_customer').length}</strong></article><article><span>Location Disabled</span><strong>{locations.filter((row) => row.status === 'location_disabled').length}</strong></article></div>
      <div className="search-box"><Search size={17}/><input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search employee, designation, customer or status" /></div>
      <div className="tracking-list">{filtered.map((row) => <article className="tracking-card" key={row.id}><div className="tracking-person"><div className="employee-avatar">{row.employeeName.charAt(0).toUpperCase()}</div><div><strong>{row.employeeName}</strong><small>{row.designation || 'Employee'}</small></div></div><span className={`tracking-status ${row.status}`}>{statusLabel(row.status)}</span><div className="tracking-meta"><span><Activity size={15}/> {locationFreshness(row)}</span><span><Navigation size={15}/> {row.accuracy ? `±${Math.round(row.accuracy)}m` : 'No accuracy'}</span>{row.currentCustomer && <span><UserRound size={15}/> {row.currentCustomer}</span>}</div>{row.latitude != null && row.longitude != null ? <a href={mapsUrl(row.latitude, row.longitude)} target="_blank" rel="noreferrer" className="ghost"><ExternalLink size={15}/> Open in Maps</a> : <span className="muted">No location available</span>}</article>)}{!loading && filtered.length === 0 && <section className="panel empty-state"><MapPin size={28}/><h3>No tracking records yet</h3><p className="muted">Employees will appear after they start location sharing.</p></section>}</div>
    </>}
  </div>
}
