import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from './firebase'

export type TrackingStatus = 'online' | 'offline' | 'travelling' | 'at_customer' | 'location_disabled'

export type EmployeeLocation = {
  id: string
  tenantId: string
  userId: string
  employeeName: string
  designation: string | null
  latitude: number | null
  longitude: number | null
  accuracy: number | null
  status: TrackingStatus
  sharingEnabled: boolean
  currentCustomer: string | null
  lastUpdatedAt: Date | null
}

export type EmployeeProfile = {
  id: string
  fullName: string
  email: string
  mobile: string | null
  designation: string | null
  role: 'client_admin' | 'employee'
  isActive: boolean
}

function trackingId(tenantId: string, userId: string) {
  return `${tenantId}_${userId}`
}

function asDate(value: any): Date | null {
  if (!value) return null
  if (typeof value.toDate === 'function') return value.toDate()
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export async function fetchEmployeeLocations(tenantId: string): Promise<EmployeeLocation[]> {
  const snapshot = await getDocs(query(collection(db, 'employeeTracking'), where('tenantId', '==', tenantId)))
  return snapshot.docs.map((row) => {
    const data = row.data()
    return {
      id: row.id,
      tenantId: data.tenantId ?? tenantId,
      userId: data.userId ?? '',
      employeeName: data.employeeName ?? 'Employee',
      designation: data.designation ?? null,
      latitude: data.latitude == null ? null : Number(data.latitude),
      longitude: data.longitude == null ? null : Number(data.longitude),
      accuracy: data.accuracy == null ? null : Number(data.accuracy),
      status: data.status ?? 'offline',
      sharingEnabled: data.sharingEnabled === true,
      currentCustomer: data.currentCustomer ?? null,
      lastUpdatedAt: asDate(data.lastUpdatedAt),
    }
  })
}

export async function fetchOwnTracking(tenantId: string, userId: string): Promise<EmployeeLocation | null> {
  const snapshot = await getDoc(doc(db, 'employeeTracking', trackingId(tenantId, userId)))
  if (!snapshot.exists()) return null
  const data = snapshot.data()
  return {
    id: snapshot.id,
    tenantId: data.tenantId ?? tenantId,
    userId: data.userId ?? userId,
    employeeName: data.employeeName ?? 'Employee',
    designation: data.designation ?? null,
    latitude: data.latitude == null ? null : Number(data.latitude),
    longitude: data.longitude == null ? null : Number(data.longitude),
    accuracy: data.accuracy == null ? null : Number(data.accuracy),
    status: data.status ?? 'offline',
    sharingEnabled: data.sharingEnabled === true,
    currentCustomer: data.currentCustomer ?? null,
    lastUpdatedAt: asDate(data.lastUpdatedAt),
  }
}

export async function publishLocation(input: {
  tenantId: string
  userId: string
  employeeName: string
  designation?: string | null
  latitude: number
  longitude: number
  accuracy?: number | null
  status?: TrackingStatus
  currentCustomer?: string | null
}) {
  const ref = doc(db, 'employeeTracking', trackingId(input.tenantId, input.userId))
  await setDoc(ref, {
    tenantId: input.tenantId,
    userId: input.userId,
    employeeName: input.employeeName,
    designation: input.designation ?? null,
    latitude: input.latitude,
    longitude: input.longitude,
    accuracy: input.accuracy ?? null,
    status: input.status ?? 'online',
    sharingEnabled: true,
    currentCustomer: input.currentCustomer ?? null,
    lastUpdatedAt: serverTimestamp(),
  }, { merge: true })
}

export async function setLocationSharing(input: {
  tenantId: string
  userId: string
  employeeName: string
  designation?: string | null
  enabled: boolean
}) {
  const ref = doc(db, 'employeeTracking', trackingId(input.tenantId, input.userId))
  await setDoc(ref, {
    tenantId: input.tenantId,
    userId: input.userId,
    employeeName: input.employeeName,
    designation: input.designation ?? null,
    sharingEnabled: input.enabled,
    status: input.enabled ? 'online' : 'location_disabled',
    lastUpdatedAt: serverTimestamp(),
  }, { merge: true })
}

export async function updateTrackingWorkStatus(tenantId: string, userId: string, status: TrackingStatus, currentCustomer?: string | null) {
  await updateDoc(doc(db, 'employeeTracking', trackingId(tenantId, userId)), {
    status,
    currentCustomer: currentCustomer ?? null,
    lastUpdatedAt: serverTimestamp(),
  })
}

export async function fetchEmployeeProfile(userId: string): Promise<EmployeeProfile | null> {
  const snapshot = await getDoc(doc(db, 'users', userId))
  if (!snapshot.exists()) return null
  const data = snapshot.data()
  return {
    id: snapshot.id,
    fullName: data.fullName ?? 'Employee',
    email: data.email ?? '',
    mobile: data.mobile ?? null,
    designation: data.designation ?? null,
    role: data.role === 'client_admin' ? 'client_admin' : 'employee',
    isActive: data.isActive !== false,
  }
}

export function locationFreshness(location: EmployeeLocation) {
  if (!location.lastUpdatedAt) return 'No update yet'
  const minutes = Math.max(0, Math.floor((Date.now() - location.lastUpdatedAt.getTime()) / 60000))
  if (minutes < 1) return 'Just now'
  if (minutes === 1) return '1 min ago'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ago`
}

export function mapsUrl(latitude: number, longitude: number) {
  return `https://www.google.com/maps?q=${latitude},${longitude}`
}
