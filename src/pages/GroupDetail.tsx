import { useState, useEffect, useCallback } from "react"
import { useNavigate, useParams } from "react-router"
import { useApp } from "../context"
import { Avatar, Button, Card, Modal, Input, EmptyState, Badge, SectionLabel, Divider } from "../ui"
import { avatarColor } from "../ui"
import {
  apiGetGroups, apiGetMembers, apiAddMember,
  apiGetExpenses, apiCreateExpense, apiDeleteExpense,
  apiGetSettlements, apiCreateSettlement,
  apiCreateInvite,
  type ApiGroup, type ApiMember, type ApiExpense, type ApiSettlement,
} from "../api"

type SplitType = "equal" | "exact" | "percentage"

// ─── Balance computation (cents-based — amountOwedCents is already the
// dollar-equivalent owed regardless of splitType, so no % conversion needed) ─

type Balance = { fromUserId: string; toUserId: string; amountCents: number }

function computeBalances(expenses: ApiExpense[], settlements: ApiSettlement[]): Balance[] {
  const net: Record<string, Record<string, number>> = {}
  const add = (from: string, to: string, amt: number) => {
    if (from === to || amt <= 0) return
    net[from] = net[from] || {}
    net[from][to] = (net[from][to] || 0) + amt
  }

  for (const e of expenses) {
    for (const s of e.splits) {
      if (s.userId !== e.paidBy) add(s.userId, e.paidBy, s.amountOwedCents)
    }
  }
  for (const s of settlements) {
    add(s.toUserId, s.fromUserId, s.amountCents)
  }

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
      if (Math.abs(diff) > 1) {
        result.push(
          diff > 0
            ? { fromUserId: from, toUserId: to, amountCents: diff }
            : { fromUserId: to, toUserId: from, amountCents: -diff }
        )
      }
    }
  }
  return result
}

const fmt = (cents: number) => (cents / 100).toFixed(2)

// ─── Add Member Modal ────────────────────────────────────────────────────────
// NOTE: there's no "find user by email" endpoint yet, so this takes a raw
// user ID for now. Swap to an email search once that lookup endpoint exists.

function AddMemberModal({
  groupId, existingIds, onClose, onAdded,
}: { groupId: string; existingIds: string[]; onClose: () => void; onAdded: () => void }) {
  const [userId, setUserId] = useState("")
  const [userName, setUserName] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const id = userId.trim()
    const name = userName.trim()
    if (!id || !name || submitting) return
    if (existingIds.includes(id)) {
      setError("That user is already in the group.")
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await apiAddMember(groupId, id, name)
      setUserId("")
      setUserName("")
      onAdded()
    } catch {
      setError("Couldn't add that user — check the ID and that they have a Slice account.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="text-lg font-bold mb-4" style={{ fontFamily: "var(--font-display)" }}>Add member</h2>
      <p className="text-xs mb-4" style={{ color: "#7c7a99" }}>
        Email search isn't available yet — ask the person for their account ID and name for now.
      </p>
      <form onSubmit={submit} className="space-y-3">
        <Input
          placeholder="Their account ID…"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          autoFocus
        />
        <Input
          placeholder="Their name…"
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
        />
        {error && <p className="text-xs" style={{ color: "#f87171" }}>{error}</p>}
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onClose} className="flex-1">Done</Button>
          <Button type="submit" variant="primary" className="flex-1" disabled={!userId.trim() || !userName.trim() || submitting}>
            {submitting ? "Adding…" : "Add"}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Add Expense Modal ───────────────────────────────────────────────────────

function ExpenseModal({
  groupId, members, currentUserId, onClose, onCreated,
}: {
  groupId: string
  members: ApiMember[]
  currentUserId: string
  onClose: () => void
  onCreated: () => void
}) {
  const [description, setDescription] = useState("")
  const [amount, setAmount] = useState("")
  const [paidBy, setPaidBy] = useState(currentUserId)
  const [splitType, setSplitType] = useState<SplitType>("equal")
  const [splitValues, setSplitValues] = useState<Record<string, string>>({})
  const [splitMembers, setSplitMembers] = useState<string[]>(members.map((m) => m.userId))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggleMember = (id: string) => {
    setSplitMembers((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const selected = members.filter((m) => splitMembers.includes(m.userId))
  const totalCents = Math.round((parseFloat(amount) || 0) * 100)

  const computedSplitsCents = (): { userId: string; amountOwedCents: number; percentage?: number }[] => {
    if (selected.length === 0) return []
    if (splitType === "equal") {
      const base = Math.floor(totalCents / selected.length)
      const remainder = totalCents - base * selected.length
      return selected.map((m, i) => ({ userId: m.userId, amountOwedCents: base + (i < remainder ? 1 : 0) }))
    }
    if (splitType === "exact") {
      return selected.map((m) => {
        const cents = Math.round((parseFloat(splitValues[m.userId] || "0")) * 100)
        return { userId: m.userId, amountOwedCents: cents, amountCents: cents }
      })
    }
    // percentage — send both the raw percentage (backend validates against
    // this) and the computed cents (for local display/consistency)
    return selected.map((m) => {
      const pct = parseFloat(splitValues[m.userId] || "0")
      return { userId: m.userId, amountOwedCents: Math.round((pct / 100) * totalCents), percentage: pct }
    })
  }

  const totalCheck = () => {
    if (splitType === "equal") return true
    const splits = computedSplitsCents()
    if (splitType === "exact") {
      const sum = splits.reduce((s, x) => s + x.amountOwedCents, 0)
      return Math.abs(sum - totalCents) < 2
    }
    const sumPct = selected.reduce((s, m) => s + (parseFloat(splitValues[m.userId] || "0")), 0)
    return Math.abs(sumPct - 100) < 0.5
  }

  const valid = description.trim() && totalCents > 0 && selected.length > 0 && totalCheck()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!valid || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const splits = computedSplitsCents().map((s) => ({ ...s, isPayer: s.userId === paidBy }))
      await apiCreateExpense(groupId, {
        description: description.trim(),
        amountCents: totalCents,
        paidBy,
        splitType,
        splits,
      })
      onCreated()
    } catch {
      setError("Couldn't add the expense. Please try again.")
      setSubmitting(false)
    }
  }

  const SPLIT_LABELS: Record<SplitType, string> = { equal: "Equal", exact: "Custom $", percentage: "Percentage %" }

  return (
    <Modal onClose={onClose}>
      <h2 className="text-lg font-bold mb-5" style={{ fontFamily: "var(--font-display)" }}>Add expense</h2>
      <form onSubmit={submit} className="space-y-4">
        <Input label="Description" placeholder="Dinner, Uber, tickets…" value={description} onChange={(e) => setDescription(e.target.value)} autoFocus />
        <Input label="Amount ($)" type="number" min="0.01" step="0.01" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />

        <div>
          <p className="text-xs font-medium mb-2" style={{ color: "#7c7a99" }}>Paid by</p>
          <div className="flex flex-wrap gap-2">
            {members.map((m) => (
              <button
                key={m.userId}
                type="button"
                onClick={() => setPaidBy(m.userId)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-all"
                style={{
                  background: paidBy === m.userId ? avatarColor(m.userId) + "25" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${paidBy === m.userId ? avatarColor(m.userId) + "60" : "transparent"}`,
                  color: paidBy === m.userId ? avatarColor(m.userId) : "#7c7a99",
                }}
              >
                {m.userName}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-medium mb-2" style={{ color: "#7c7a99" }}>Split type</p>
          <div className="grid grid-cols-3 gap-1.5">
            {(["equal", "exact", "percentage"] as SplitType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setSplitType(t)}
                className="px-2 py-2 rounded-xl text-xs font-semibold transition-all"
                style={{
                  background: splitType === t ? "rgba(167,139,250,0.2)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${splitType === t ? "rgba(167,139,250,0.4)" : "transparent"}`,
                  color: splitType === t ? "#a78bfa" : "#7c7a99",
                }}
              >
                {SPLIT_LABELS[t]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-medium mb-2" style={{ color: "#7c7a99" }}>Split between</p>
          <div className="space-y-2">
            {members.map((m) => {
              const included = splitMembers.includes(m.userId)
              const color = avatarColor(m.userId)
              return (
                <div key={m.userId} className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => toggleMember(m.userId)}
                    className="flex items-center gap-2 flex-1 rounded-xl px-3 py-2 transition-all"
                    style={{
                      background: included ? color + "12" : "rgba(255,255,255,0.03)",
                      border: `1px solid ${included ? color + "40" : "transparent"}`,
                    }}
                  >
                    <div
                      className="w-4 h-4 rounded-md border-2 flex items-center justify-center"
                      style={{ borderColor: included ? color : "#4a4866", background: included ? color : "transparent" }}
                    >
                      {included && <span className="text-[10px] text-[#0d0d12] font-bold">✓</span>}
                    </div>
                    <span className="text-sm" style={{ color: included ? "#f0eef8" : "#7c7a99" }}>{m.userName}</span>
                  </button>

                  {included && splitType !== "equal" && (
                    <input
                      type="number"
                      min="0"
                      step={splitType === "percentage" ? "1" : "0.01"}
                      placeholder={splitType === "percentage" ? "%" : "$"}
                      value={splitValues[m.userId] || ""}
                      onChange={(e) => setSplitValues((prev) => ({ ...prev, [m.userId]: e.target.value }))}
                      className="w-20 rounded-lg px-2 py-1.5 text-sm text-right outline-none"
                      style={{ background: "#1a1826", border: "1px solid rgba(167,139,250,0.2)", color: "#f0eef8" }}
                    />
                  )}
                </div>
              )
            })}
          </div>
          {!totalCheck() && (
            <p className="text-xs text-red-400 mt-2">
              {splitType === "exact"
                ? `Amounts must add up to $${(totalCents / 100).toFixed(2)}`
                : "Percentages must add up to 100%"}
            </p>
          )}
        </div>

        {error && <p className="text-xs" style={{ color: "#f87171" }}>{error}</p>}

        <div className="flex gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose} className="flex-1">Cancel</Button>
          <Button type="submit" variant="primary" className="flex-1" disabled={!valid || submitting}>
            {submitting ? "Adding…" : "Add expense"}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Tab: Expenses ────────────────────────────────────────────────────────────

function ExpensesTab({
  groupId, members, currentUserId, expenses, onChanged,
}: {
  groupId: string
  members: ApiMember[]
  currentUserId: string
  expenses: ApiExpense[]
  onChanged: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const sorted = [...expenses].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  const memberName = (id: string) => members.find((m) => m.userId === id)?.userName || "Someone"

  const SPLIT_COLOR: Record<string, string> = { equal: "#34d399", exact: "#38bdf8", percentage: "#e879f9" }

  const handleDelete = async (expenseId: string) => {
    setDeletingId(expenseId)
    try {
      await apiDeleteExpense(groupId, expenseId)
      onChanged()
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <SectionLabel>EXPENSES</SectionLabel>
        <Button variant="primary" size="sm" onClick={() => setAdding(true)}>+ Add</Button>
      </div>

      {sorted.length === 0 ? (
        <EmptyState icon="🧾" title="No expenses yet" sub="Add the first one" />
      ) : (
        <div className="space-y-2">
          {sorted.map((e) => {
            const date = new Date(e.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
            return (
              <Card key={e.expenseId} className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm">{e.description}</p>
                      <Badge color={SPLIT_COLOR[e.splitType] || "#7c7a99"}>{e.splitType}</Badge>
                    </div>
                    <p className="text-xs mt-1" style={{ color: "#7c7a99" }}>
                      Paid by {memberName(e.paidBy)} · {e.splits.length} people · {date}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="pill-amount font-semibold">${fmt(e.amountCents)}</p>
                    <div className="flex gap-1 mt-1 justify-end">
                      <button
                        onClick={() => handleDelete(e.expenseId)}
                        disabled={deletingId === e.expenseId}
                        className="text-[10px] px-2 py-0.5 rounded-lg transition-all"
                        style={{ color: "#f87171" }}
                      >
                        {deletingId === e.expenseId ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {adding && (
        <ExpenseModal
          groupId={groupId}
          members={members}
          currentUserId={currentUserId}
          onClose={() => setAdding(false)}
          onCreated={() => { setAdding(false); onChanged() }}
        />
      )}
    </div>
  )
}

// ─── Tab: Balances ────────────────────────────────────────────────────────────

function BalancesTab({
  groupId, members, currentUserId, expenses, settlements, onChanged,
}: {
  groupId: string
  members: ApiMember[]
  currentUserId: string
  expenses: ApiExpense[]
  settlements: ApiSettlement[]
  onChanged: () => void
}) {
  const [showHistory, setShowHistory] = useState(false)
  const [settlingKey, setSettlingKey] = useState<string | null>(null)

  const balances = computeBalances(expenses, settlements)
  const memberName = (id: string) => members.find((m) => m.userId === id)?.userName || "Someone"

  const netPerPerson = members.map((m) => {
    const paidCents = expenses.filter((e) => e.paidBy === m.userId).reduce((s, e) => s + e.amountCents, 0)
    const shareCents = expenses.flatMap((e) => e.splits.filter((s) => s.userId === m.userId).map((s) => s.amountOwedCents)).reduce((s, x) => s + x, 0)
    // Settling as the payer reduces what you owe (net goes up); settling as
    // the receiver means you've already been paid (net goes down).
    const settledOutCents = settlements.filter((s) => s.fromUserId === m.userId).reduce((s, x) => s + x.amountCents, 0)
    const settledInCents = settlements.filter((s) => s.toUserId === m.userId).reduce((s, x) => s + x.amountCents, 0)
    return { member: m, netCents: paidCents - shareCents + settledOutCents - settledInCents }
  })

  const handleSettle = async (fromId: string, toId: string, amountCents: number) => {
    const key = `${fromId}:${toId}`
    setSettlingKey(key)
    try {
      await apiCreateSettlement(groupId, { fromUserId: fromId, toUserId: toId, amountCents })
      onChanged()
    } finally {
      setSettlingKey(null)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <SectionLabel>NET BALANCE</SectionLabel>
        <div className="space-y-2">
          {netPerPerson.map(({ member: m, netCents }) => (
            <Card key={m.userId} className="px-4 py-3 flex items-center gap-3">
              <Avatar label={m.userName} id={m.userId} size="sm" />
              <span className="text-sm font-medium flex-1">{m.userName}{m.userId === currentUserId ? " (you)" : ""}</span>
              <div className="text-right">
                <p className="pill-amount text-sm font-semibold" style={{ color: netCents >= 0 ? "#34d399" : "#e879f9" }}>
                  {netCents >= 0 ? "+" : "-"}${fmt(Math.abs(netCents))}
                </p>
                <p className="text-[10px]" style={{ color: "#7c7a99" }}>{netCents >= 0 ? "gets back" : "owes"}</p>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <Divider />

      <div>
        <SectionLabel>SETTLEMENTS NEEDED</SectionLabel>
        {balances.length === 0 ? (
          <EmptyState icon="✅" title="All settled up!" sub="No outstanding balances" />
        ) : (
          <div className="space-y-2">
            {balances.map((b, i) => {
              const key = `${b.fromUserId}:${b.toUserId}`
              return (
                <Card key={i} className="px-4 py-3 flex items-center gap-3">
                  <Avatar label={memberName(b.fromUserId)} id={b.fromUserId} size="sm" />
                  <div className="flex-1 min-w-0 text-sm">
                    <span style={{ color: avatarColor(b.fromUserId) }}>{memberName(b.fromUserId)}</span>
                    <span style={{ color: "#7c7a99" }}> owes </span>
                    <span style={{ color: avatarColor(b.toUserId) }}>{memberName(b.toUserId)}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="pill-amount text-sm font-semibold">${fmt(b.amountCents)}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={settlingKey === key}
                      onClick={() => handleSettle(b.fromUserId, b.toUserId, b.amountCents)}
                    >
                      {settlingKey === key ? "Settling…" : "Settle"}
                    </Button>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {settlements.length > 0 && (
        <div>
          <button
            className="text-xs font-semibold mb-2 flex items-center gap-1"
            style={{ color: "#7c7a99", letterSpacing: "0.1em" }}
            onClick={() => setShowHistory((v) => !v)}
          >
            SETTLEMENT HISTORY {showHistory ? "▴" : "▾"}
          </button>
          {showHistory && (
            <div className="space-y-2">
              {settlements.map((s) => {
                const date = new Date(s.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                return (
                  <Card key={s.settlementId} className="px-4 py-3 flex items-center gap-3">
                    <span className="text-base">✅</span>
                    <div className="flex-1 min-w-0 text-sm" style={{ color: "#7c7a99" }}>
                      {memberName(s.fromUserId)} paid {memberName(s.toUserId)} · {date}
                    </div>
                    <span className="pill-amount text-sm" style={{ color: "#34d399" }}>${fmt(s.amountCents)}</span>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function InviteModal({ groupId, onClose }: { groupId: string; onClose: () => void }) {
  const [link, setLink] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    apiCreateInvite(groupId)
      .then((invite) => setLink(`${window.location.origin}/join/${invite.token}`))
      .catch(() => setError("Couldn't create an invite link. Please try again."))
      .finally(() => setLoading(false))
  }, [groupId])

  const copy = async () => {
    if (!link) return
    await navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="text-lg font-bold mb-4" style={{ fontFamily: "var(--font-display)" }}>Invite to group</h2>
      <p className="text-xs mb-4" style={{ color: "#7c7a99" }}>
        Anyone with this link can join — it works for multiple people until it expires.
      </p>
      {loading ? (
        <p className="text-sm" style={{ color: "#7c7a99" }}>Generating link…</p>
      ) : error ? (
        <p className="text-xs" style={{ color: "#f87171" }}>{error}</p>
      ) : (
        <div className="space-y-3">
          <div
            className="rounded-xl px-3 py-2.5 text-xs break-all"
            style={{ background: "#0d0d12", border: "1px solid rgba(167,139,250,0.2)", color: "#f0eef8" }}
          >
            {link}
          </div>
          <Button variant="primary" className="w-full" onClick={copy}>
            {copied ? "Copied!" : "Copy link"}
          </Button>
        </div>
      )}
      <div className="mt-3">
        <Button variant="ghost" className="w-full" onClick={onClose}>Done</Button>
      </div>
    </Modal>
  )
}

// ─── Tab: Members ────────────────────────────────────────────────────────────

function MembersTab({
  groupId, members, currentUserId, onChanged,
}: { groupId: string; members: ApiMember[]; currentUserId: string; onChanged: () => void }) {
  const [adding, setAdding] = useState(false)
  const [inviting, setInviting] = useState(false)

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <SectionLabel>MEMBERS ({members.length})</SectionLabel>
        <div className="flex gap-2">
          <Button size="sm" variant="primary" onClick={() => setInviting(true)}>Invite</Button>
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>+ Add by ID</Button>
        </div>
      </div>
      <div className="space-y-2">
        {members.map((m) => (
          <Card key={m.userId} className="px-4 py-3 flex items-center gap-3">
            <Avatar label={m.userName} id={m.userId} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{m.userName}{m.userId === currentUserId ? " (you)" : ""}</p>
              <p className="text-xs truncate" style={{ color: "#7c7a99" }}>joined {new Date(m.joinedAt).toLocaleDateString()}</p>
            </div>
          </Card>
        ))}
      </div>
      {adding && (
        <AddMemberModal
          groupId={groupId}
          existingIds={members.map((m) => m.userId)}
          onClose={() => setAdding(false)}
          onAdded={() => { setAdding(false); onChanged() }}
        />
      )}
      {inviting && <InviteModal groupId={groupId} onClose={() => setInviting(false)} />}
    </div>
  )
}

// ─── Group Detail Page ────────────────────────────────────────────────────────

const TABS = ["Expenses", "Balances", "Members"] as const
type Tab = (typeof TABS)[number]

export default function GroupDetail() {
  const { groupId } = useParams<{ groupId: string }>()
  const navigate = useNavigate()
  const { currentUser } = useApp()
  const [activeTab, setActiveTab] = useState<Tab>("Expenses")

  const [group, setGroup] = useState<ApiGroup | null | undefined>(undefined) // undefined = loading, null = not found
  const [members, setMembers] = useState<ApiMember[]>([])
  const [expenses, setExpenses] = useState<ApiExpense[]>([])
  const [settlements, setSettlements] = useState<ApiSettlement[]>([])
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!groupId) return
    setError(null)
    try {
      // No GET /groups/{id} endpoint yet, so find it via the list.
      const groups = await apiGetGroups()
      const g = groups.find((x) => x.groupId === groupId) || null
      setGroup(g)
      if (!g) return

      const [m, e, s] = await Promise.all([
        apiGetMembers(groupId),
        apiGetExpenses(groupId),
        apiGetSettlements(groupId),
      ])
      setMembers(m)
      setExpenses(e)
      setSettlements(s)
    } catch {
      setError("Couldn't load this group. Please try again.")
    }
  }, [groupId])

  useEffect(() => { load() }, [load])

  if (group === undefined && !error) {
    return <div className="p-8 text-center" style={{ color: "#7c7a99" }}>Loading…</div>
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3" style={{ background: "#0d0d12" }}>
        <p className="text-sm" style={{ color: "#f87171" }}>{error}</p>
        <Button variant="ghost" size="sm" onClick={load}>Retry</Button>
      </div>
    )
  }

  if (!group) return <div className="p-8 text-center" style={{ color: "#7c7a99" }}>Group not found.</div>

  if (!members.some((m) => m.userId === currentUser!.id)) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0d0d12" }}>
        <EmptyState icon="🔒" title="Members only" sub="You're not in this group." />
      </div>
    )
  }

  const totalCents = expenses.reduce((s, e) => s + e.amountCents, 0)

  return (
    <div className="mesh-bg min-h-screen" style={{ fontFamily: "var(--font-body)" }}>
      <div className="max-w-lg mx-auto px-4 pt-10 pb-24">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => navigate("/groups")}
            className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-white/5 transition-all shrink-0"
            style={{ color: "#7c7a99" }}
          >
            ←
          </button>
          <div
            className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl shrink-0"
            style={{ background: "rgba(167,139,250,0.1)" }}
          >
            🎉
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold truncate" style={{ fontFamily: "var(--font-display)" }}>{group.groupName}</h1>
            <p className="text-xs" style={{ color: "#7c7a99" }}>{members.length} members</p>
          </div>
          <div className="text-right shrink-0">
            <p className="pill-amount text-xl font-bold">${(totalCents / 100).toFixed(0)}</p>
            <p className="text-xs" style={{ color: "#7c7a99" }}>total</p>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex rounded-2xl p-1 mb-6" style={{ background: "#15141f", border: "1px solid rgba(167,139,250,0.1)" }}>
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className="flex-1 text-xs font-semibold py-2 rounded-xl transition-all"
              style={
                activeTab === t
                  ? {
                      background: "linear-gradient(135deg, rgba(167,139,250,0.2) 0%, rgba(232,121,249,0.1) 100%)",
                      color: "#a78bfa",
                      border: "1px solid rgba(167,139,250,0.2)",
                    }
                  : { color: "#7c7a99" }
              }
            >
              {t}
            </button>
          ))}
        </div>

        {activeTab === "Expenses" && (
          <ExpensesTab groupId={group.groupId} members={members} currentUserId={currentUser!.id} expenses={expenses} onChanged={load} />
        )}
        {activeTab === "Balances" && (
          <BalancesTab groupId={group.groupId} members={members} currentUserId={currentUser!.id} expenses={expenses} settlements={settlements} onChanged={load} />
        )}
        {activeTab === "Members" && (
          <MembersTab groupId={group.groupId} members={members} currentUserId={currentUser!.id} onChanged={load} />
        )}
      </div>
    </div>
  )
}
