// Mock in-memory store — replace with Supabase calls when ready

export type User = {
  id: string
  email: string
  name: string
  avatar: string
}

export type Group = {
  id: string
  name: string
  emoji: string
  createdBy: string
  createdAt: string
  memberIds: string[]
}

export type SplitType = "equal" | "unequal" | "percentage"

export type SplitEntry = {
  userId: string
  value: number // amount (unequal) or percent (percentage) or ignored (equal)
}

export type Expense = {
  id: string
  groupId: string
  description: string
  amount: number
  paidBy: string
  splitType: SplitType
  splits: SplitEntry[]
  createdAt: string
  createdBy: string
}

export type Settlement = {
  id: string
  groupId: string
  fromUserId: string
  toUserId: string
  amount: number
  settledAt: string
}

// ─── Seed data ───────────────────────────────────────────────────────────────

export const SEED_USERS: User[] = [
  { id: "u1", email: "maya@example.com", name: "Maya", avatar: "M" },
  { id: "u2", email: "jordan@example.com", name: "Jordan", avatar: "J" },
  { id: "u3", email: "priya@example.com", name: "Priya", avatar: "P" },
  { id: "u4", email: "leo@example.com", name: "Leo", avatar: "L" },
  { id: "u5", email: "sam@example.com", name: "Sam", avatar: "S" },
]

export const SEED_GROUPS: Group[] = [
  {
    id: "g1",
    name: "Rooftop July",
    emoji: "🌆",
    createdBy: "u1",
    createdAt: "2024-07-27T20:00:00Z",
    memberIds: ["u1", "u2", "u3", "u4", "u5"],
  },
  {
    id: "g2",
    name: "Weekend Hike",
    emoji: "🏔",
    createdBy: "u1",
    createdAt: "2024-07-10T09:00:00Z",
    memberIds: ["u1", "u3", "u4"],
  },
  {
    id: "g3",
    name: "Tokyo Trip",
    emoji: "🗼",
    createdBy: "u2",
    createdAt: "2024-06-01T00:00:00Z",
    memberIds: ["u1", "u2"],
  },
]

export const SEED_EXPENSES: Expense[] = [
  {
    id: "e1",
    groupId: "g1",
    description: "Dinner at Nobu",
    amount: 320,
    paidBy: "u1",
    splitType: "equal",
    splits: [
      { userId: "u1", value: 64 },
      { userId: "u2", value: 64 },
      { userId: "u3", value: 64 },
      { userId: "u4", value: 64 },
      { userId: "u5", value: 64 },
    ],
    createdAt: "2024-07-28T21:00:00Z",
    createdBy: "u1",
  },
  {
    id: "e2",
    groupId: "g1",
    description: "Rooftop bar tab",
    amount: 180,
    paidBy: "u2",
    splitType: "unequal",
    splits: [
      { userId: "u1", value: 60 },
      { userId: "u2", value: 60 },
      { userId: "u3", value: 60 },
    ],
    createdAt: "2024-07-28T23:00:00Z",
    createdBy: "u2",
  },
  {
    id: "e3",
    groupId: "g1",
    description: "Uber pool ×2",
    amount: 42.5,
    paidBy: "u4",
    splitType: "equal",
    splits: [
      { userId: "u1", value: 14.17 },
      { userId: "u4", value: 14.17 },
      { userId: "u5", value: 14.17 },
    ],
    createdAt: "2024-07-29T01:30:00Z",
    createdBy: "u4",
  },
  {
    id: "e4",
    groupId: "g1",
    description: "VIP tickets",
    amount: 250,
    paidBy: "u3",
    splitType: "percentage",
    splits: [
      { userId: "u1", value: 20 },
      { userId: "u2", value: 20 },
      { userId: "u3", value: 20 },
      { userId: "u4", value: 20 },
      { userId: "u5", value: 20 },
    ],
    createdAt: "2024-07-27T20:30:00Z",
    createdBy: "u3",
  },
  {
    id: "e5",
    groupId: "g1",
    description: "Late night pizza",
    amount: 56,
    paidBy: "u5",
    splitType: "equal",
    splits: [
      { userId: "u1", value: 18.67 },
      { userId: "u3", value: 18.67 },
      { userId: "u5", value: 18.67 },
    ],
    createdAt: "2024-07-27T02:00:00Z",
    createdBy: "u5",
  },
]

export const SEED_SETTLEMENTS: Settlement[] = [
  {
    id: "s1",
    groupId: "g1",
    fromUserId: "u4",
    toUserId: "u3",
    amount: 50,
    settledAt: "2024-07-29T10:00:00Z",
  },
]

// ─── Balance computation ─────────────────────────────────────────────────────

export type Balance = {
  fromUserId: string
  toUserId: string
  amount: number
}

export function computeBalances(expenses: Expense[], settlements: Settlement[]): Balance[] {
  const net: Record<string, Record<string, number>> = {}

  const add = (from: string, to: string, amt: number) => {
    if (from === to) return
    net[from] = net[from] || {}
    net[from][to] = (net[from][to] || 0) + amt
  }

  for (const e of expenses) {
    for (const s of e.splits) {
      if (s.userId !== e.paidBy) {
        let amount = s.value
        if (e.splitType === "percentage") {
          amount = (s.value / 100) * e.amount
        }
        add(s.userId, e.paidBy, amount)
      }
    }
  }

  for (const s of settlements) {
    add(s.toUserId, s.fromUserId, s.amount)
  }

  // Simplify: net out mutual debts
  const result: Balance[] = []
  const seen = new Set<string>()
  for (const from of Object.keys(net)) {
    for (const to of Object.keys(net[from] || {})) {
      const key = [from, to].sort().join(":")
      if (seen.has(key)) continue
      seen.add(key)
      const fwd = net[from]?.[to] || 0
      const bck = net[to]?.[from] || 0
      const diff = fwd - bck
      if (Math.abs(diff) > 0.01) {
        result.push(diff > 0 ? { fromUserId: from, toUserId: to, amount: diff } : { fromUserId: to, toUserId: from, amount: -diff })
      }
    }
  }
  return result
}
