import { createContext, useContext, useState, useEffect, type ReactNode } from "react"
import {
  type User, type Group, type Expense, type Settlement,
  SEED_USERS, SEED_GROUPS, SEED_EXPENSES, SEED_SETTLEMENTS,
} from "./store"
import { apiSignUp, apiSignIn, storeTokens, clearTokens, getStoredUser } from "./api"

type AuthResult = { ok: boolean; error?: string }

type AppState = {
  currentUser: User | null
  authLoading: boolean // true while we check localStorage for an existing session on first load
  users: User[]
  groups: Group[]
  expenses: Expense[]
  settlements: Settlement[]

  // Auth — now real, async, and can return a specific error message
  signIn: (email: string, password: string) => Promise<AuthResult>
  signUp: (email: string, password: string, name: string) => Promise<AuthResult>
  signOut: () => void

  // Groups
  createGroup: (name: string, emoji: string) => Group
  addMember: (groupId: string, userId: string) => void

  // Expenses
  addExpense: (e: Omit<Expense, "id" | "createdAt">) => void
  deleteExpense: (id: string) => void
  updateExpense: (id: string, updates: Partial<Omit<Expense, "id" | "groupId" | "createdAt">>) => void

  // Settlements
  settleUp: (groupId: string, fromUserId: string, toUserId: string, amount: number) => void
}

const Ctx = createContext<AppState>(null!)
export const useApp = () => useContext(Ctx)

let idCounter = 100
const uid = () => String(++idCounter)

export function AppProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)

  // NOTE: users/groups/expenses/settlements below are still the mock,
  // in-memory seed data from before — only auth is wired to the real
  // backend so far. Groups/expenses/settlements wiring is a separate
  // follow-up pass.
  const [users, setUsers] = useState<User[]>(SEED_USERS)
  const [groups, setGroups] = useState<Group[]>(SEED_GROUPS)
  const [expenses, setExpenses] = useState<Expense[]>(SEED_EXPENSES)
  const [settlements, setSettlements] = useState<Settlement[]>(SEED_SETTLEMENTS)

  // On first load, check localStorage for a still-valid session and
  // restore it — this is what keeps you logged in across a page refresh.
  useEffect(() => {
    const stored = getStoredUser()
    if (stored) {
      setCurrentUser(stored)
      // Make sure the restored user also shows up in the mock `users`
      // list, since other code (e.g. member pickers) reads from it.
      setUsers((prev) => (prev.find((u) => u.id === stored.id) ? prev : [...prev, stored]))
    } else {
      clearTokens() // covers the "expired token left behind" case
    }
    setAuthLoading(false)
  }, [])

  const signIn = async (email: string, password: string): Promise<AuthResult> => {
    const result = await apiSignIn(email, password)
    if (!result.ok) return { ok: false, error: result.error }

    storeTokens(result.tokens)
    const user = getStoredUser()
    if (!user) return { ok: false, error: "Signed in, but couldn't read account details. Please try again." }

    setCurrentUser(user)
    setUsers((prev) => (prev.find((u) => u.id === user.id) ? prev : [...prev, user]))
    return { ok: true }
  }

  const signUp = async (email: string, password: string, name: string): Promise<AuthResult> => {
    const created = await apiSignUp(email, password, name)
    if (!created.ok) return { ok: false, error: created.error }

    // /signup only creates + confirms the account, it doesn't return
    // tokens — so immediately sign in right after to get a session,
    // same as a real user would just be doing two quick steps.
    return signIn(email, password)
  }

  const signOut = () => {
    clearTokens()
    setCurrentUser(null)
  }

  const createGroup = (name: string, emoji: string): Group => {
    const g: Group = {
      id: uid(), name, emoji,
      createdBy: currentUser!.id,
      createdAt: new Date().toISOString(),
      memberIds: [currentUser!.id],
    }
    setGroups((prev) => [g, ...prev])
    return g
  }

  const addMember = (groupId: string, userId: string) => {
    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId && !g.memberIds.includes(userId)
          ? { ...g, memberIds: [...g.memberIds, userId] }
          : g
      )
    )
  }

  const addExpense = (e: Omit<Expense, "id" | "createdAt">) => {
    const exp: Expense = { ...e, id: uid(), createdAt: new Date().toISOString() }
    setExpenses((prev) => [exp, ...prev])
  }

  const deleteExpense = (id: string) => {
    setExpenses((prev) => prev.filter((e) => e.id !== id))
  }

  const updateExpense = (id: string, updates: Partial<Omit<Expense, "id" | "groupId" | "createdAt">>) => {
    setExpenses((prev) => prev.map((e) => e.id === id ? { ...e, ...updates } : e))
  }

  const settleUp = (groupId: string, fromUserId: string, toUserId: string, amount: number) => {
    const s: Settlement = {
      id: uid(), groupId, fromUserId, toUserId, amount,
      settledAt: new Date().toISOString(),
    }
    setSettlements((prev) => [s, ...prev])
  }

  return (
    <Ctx.Provider value={{
      currentUser, authLoading, users, groups, expenses, settlements,
      signIn, signUp, signOut,
      createGroup, addMember,
      addExpense, deleteExpense, updateExpense,
      settleUp,
    }}>
      {children}
    </Ctx.Provider>
  )
}
