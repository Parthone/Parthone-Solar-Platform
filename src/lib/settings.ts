import { collection, doc, getDocs, orderBy, query } from 'firebase/firestore'
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth'
import { httpsCallable } from 'firebase/functions'
import { auth, db, functions } from './firebase'

export type BankAccount = {
  id: string
  accountLabel: string
  accountHolderName: string
  bankName: string
  accountNumber: string
  ifscCode: string
  branchName: string
  accountType: 'Current' | 'Savings' | 'OD' | 'CC'
  upiId: string | null
  isDefault: boolean
  isActive: boolean
}

export async function fetchBankAccounts(tenantId: string): Promise<BankAccount[]> {
  const snapshot = await getDocs(query(collection(db, 'tenants', tenantId, 'bankAccounts'), orderBy('accountLabel')))
  return snapshot.docs.map((row) => ({ id: row.id, ...(row.data() as Omit<BankAccount, 'id'>) }))
}

const saveBrandingCallable = httpsCallable(functions, 'saveClientBranding')
const saveBankAccountCallable = httpsCallable(functions, 'saveClientBankAccount')

export async function saveBranding(input: {
  companyName: string
  email: string
  phone: string
  address: string
  gstNumber: string
  logoUrl: string
  primaryColor: string
  secondaryColor: string
}) {
  await saveBrandingCallable(input)
}

export async function saveBankAccount(input: Omit<BankAccount, 'id'> & { id?: string }) {
  await saveBankAccountCallable(input)
}

export async function changeOwnPassword(currentPassword: string, newPassword: string) {
  const user = auth.currentUser
  if (!user?.email) throw new Error('Signed-in user email is unavailable.')
  if (newPassword.length < 8) throw new Error('New password must be at least 8 characters.')
  const credential = EmailAuthProvider.credential(user.email, currentPassword)
  await reauthenticateWithCredential(user, credential)
  await updatePassword(user, newPassword)
}

export function maskAccount(value: string) {
  const clean = value.trim()
  if (clean.length <= 4) return clean
  return `${'•'.repeat(Math.max(4, clean.length - 4))}${clean.slice(-4)}`
}
