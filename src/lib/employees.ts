import { collection, getDocs, query, where } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from './firebase'

export type EmployeeRole = 'client_admin' | 'employee'

export type Employee = {
  id: string
  fullName: string
  email: string
  mobile: string | null
  designation: string | null
  role: EmployeeRole
  isActive: boolean
}

export async function fetchEmployees(tenantId: string): Promise<Employee[]> {
  const snapshot = await getDocs(query(collection(db, 'users'), where('tenantId', '==', tenantId)))
  return snapshot.docs
    .map((row) => {
      const data = row.data()
      return {
        id: row.id,
        fullName: data.fullName ?? '',
        email: data.email ?? '',
        mobile: data.mobile ?? null,
        designation: data.designation ?? null,
        role: data.role === 'client_admin' ? 'client_admin' : 'employee',
        isActive: data.isActive !== false,
      } as Employee
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName))
}

export async function createEmployee(input: { fullName: string; email: string; password: string; mobile?: string; designation?: string; role: EmployeeRole }) {
  const callable = httpsCallable(functions, 'createClientUser')
  await callable(input)
}

export async function updateEmployee(input: { uid: string; fullName: string; mobile?: string; designation?: string; role: EmployeeRole; isActive: boolean }) {
  const callable = httpsCallable(functions, 'updateClientUser')
  await callable(input)
}

export async function resetEmployeePassword(uid: string, password: string) {
  const callable = httpsCallable(functions, 'resetClientUserPassword')
  await callable({ uid, password })
}
