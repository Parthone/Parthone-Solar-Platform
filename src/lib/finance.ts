import {
  addDoc,
  collection,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from './firebase'

export type ExpenseStatus = 'recorded' | 'pending' | 'approved' | 'reimbursed'
export type PaymentMode = 'Cash' | 'UPI' | 'Bank Transfer' | 'Card' | 'Cheque' | 'Other'

export type ExpenseCategory = {
  id: string
  name: string
  description: string | null
}

export type Expense = {
  id: string
  expenseCode: string
  expenseDate: string
  category: string
  description: string
  amount: number
  paymentMode: PaymentMode
  vendor: string | null
  reference: string | null
  paidByName: string | null
  customerName: string | null
  status: ExpenseStatus
  notes: string | null
}

export type AccountStatementConfirmation = {
  id: string
  accountName: string
  statementDate: string
  openingBalance: number
  closingBalance: number
  confirmedBy: string
  notes: string | null
}

function tenantCollection(tenantId: string, name: string) {
  return collection(db, 'tenants', tenantId, name)
}

export async function fetchExpenseCategories(tenantId: string): Promise<ExpenseCategory[]> {
  const snapshot = await getDocs(query(tenantCollection(tenantId, 'expenseCategories'), orderBy('name')))
  return snapshot.docs.map((row) => ({ id: row.id, ...(row.data() as Omit<ExpenseCategory, 'id'>) }))
}

export async function createExpenseCategory(tenantId: string, name: string, description?: string | null) {
  if (name.trim().length < 2) throw new Error('Category name is required.')
  return addDoc(tenantCollection(tenantId, 'expenseCategories'), {
    name: name.trim(),
    description: description?.trim() || null,
    createdAt: serverTimestamp(),
  })
}

export async function fetchExpenses(tenantId: string): Promise<Expense[]> {
  const snapshot = await getDocs(query(tenantCollection(tenantId, 'expenses'), orderBy('expenseDate', 'desc')))
  return snapshot.docs.map((row) => {
    const data = row.data()
    return {
      id: row.id,
      expenseCode: data.expenseCode ?? `EXP-${row.id.slice(0, 6).toUpperCase()}`,
      expenseDate: data.expenseDate ?? '',
      category: data.category ?? 'Other',
      description: data.description ?? '',
      amount: Number(data.amount ?? 0),
      paymentMode: data.paymentMode ?? 'Cash',
      vendor: data.vendor ?? null,
      reference: data.reference ?? null,
      paidByName: data.paidByName ?? null,
      customerName: data.customerName ?? null,
      status: data.status ?? 'recorded',
      notes: data.notes ?? null,
    } as Expense
  })
}

export async function createExpense(
  tenantId: string,
  input: Omit<Expense, 'id' | 'expenseCode'>,
) {
  if (!input.description.trim()) throw new Error('Expense description is required.')
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new Error('Expense amount must be greater than zero.')

  const ref = await addDoc(tenantCollection(tenantId, 'expenses'), {
    ...input,
    expenseCode: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  const { updateDoc } = await import('firebase/firestore')
  await updateDoc(ref, { expenseCode: `EXP-${ref.id.slice(0, 6).toUpperCase()}` })
  return ref.id
}

export async function fetchAccountConfirmations(tenantId: string): Promise<AccountStatementConfirmation[]> {
  const snapshot = await getDocs(query(tenantCollection(tenantId, 'accountStatementConfirmations'), orderBy('statementDate', 'desc')))
  return snapshot.docs.map((row) => ({
    id: row.id,
    ...(row.data() as Omit<AccountStatementConfirmation, 'id'>),
    openingBalance: Number(row.data().openingBalance ?? 0),
    closingBalance: Number(row.data().closingBalance ?? 0),
  }))
}

export async function createAccountConfirmation(
  tenantId: string,
  input: Omit<AccountStatementConfirmation, 'id'>,
) {
  return addDoc(tenantCollection(tenantId, 'accountStatementConfirmations'), {
    ...input,
    createdAt: serverTimestamp(),
  })
}

export function expenseSummary(expenses: Expense[]) {
  const now = new Date()
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const today = `${month}-${String(now.getDate()).padStart(2, '0')}`
  const monthRows = expenses.filter((expense) => expense.expenseDate.startsWith(month))

  const byCategory = new Map<string, number>()
  monthRows.forEach((expense) => byCategory.set(expense.category, (byCategory.get(expense.category) ?? 0) + expense.amount))

  return {
    todayTotal: expenses.filter((expense) => expense.expenseDate === today).reduce((sum, expense) => sum + expense.amount, 0),
    monthTotal: monthRows.reduce((sum, expense) => sum + expense.amount, 0),
    allTotal: expenses.reduce((sum, expense) => sum + expense.amount, 0),
    pendingReimbursement: expenses.filter((expense) => expense.status === 'pending').reduce((sum, expense) => sum + expense.amount, 0),
    byCategory: Array.from(byCategory.entries()).sort((a, b) => b[1] - a[1]),
  }
}
