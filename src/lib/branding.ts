import { collection, getDocs, limit, query, where } from 'firebase/firestore'
import { db } from './firebase'

export type TenantBranding = {
  tenantId: string
  companyName: string
  slug: string
  customDomain: string | null
  logoUrl: string | null
  primaryColor: string
  secondaryColor: string
  email: string | null
  phone: string | null
  address: string | null
  gstNumber: string | null
}

export const defaultBranding: TenantBranding = {
  tenantId: '',
  companyName: 'Solar Business Software',
  slug: '',
  customDomain: null,
  logoUrl: null,
  primaryColor: '#1769d2',
  secondaryColor: '#0f243f',
  email: null,
  phone: null,
  address: null,
  gstNumber: null,
}

export function applyBranding(branding: TenantBranding) {
  const root = document.documentElement
  root.style.setProperty('--tenant-primary', branding.primaryColor || defaultBranding.primaryColor)
  root.style.setProperty('--tenant-secondary', branding.secondaryColor || defaultBranding.secondaryColor)
  document.title = branding.companyName || 'Solar Business Software'
}

export async function resolvePublicBranding(): Promise<TenantBranding | null> {
  const host = window.location.hostname.toLowerCase().replace(/^www\./, '')
  const tenantParam = new URLSearchParams(window.location.search).get('tenant')?.trim().toLowerCase()
  const brandingCollection = collection(db, 'publicTenantBranding')

  const constraints = tenantParam
    ? [where('slug', '==', tenantParam), limit(1)]
    : [where('customDomain', '==', host), limit(1)]

  const snapshot = await getDocs(query(brandingCollection, ...constraints))
  if (snapshot.empty) return null
  return snapshot.docs[0].data() as TenantBranding
}
