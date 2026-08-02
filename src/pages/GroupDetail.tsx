import { useState } from "react"
import { useNavigate, useParams } from "react-router"
import { useApp } from "../context"
import { Avatar, Button, Card, Modal, Input, EmptyState, Badge, SectionLabel, Divider } from "../ui"
import { avatarColor } from "../ui"
import type { SplitType, SplitEntry, Expense } from "../store"
import { computeBalances } from "../store"

// ─── Add Member Modal ────────────────────────────────────────────────────────

function AddMemberModal({ groupId, existingIds, onClose }: { groupId: string; existingIds: string[]; onClose: () => void }) {
  const { users, addMember } = useApp()
  const [query, setQuery] = useState("")
  const [added, setAdded] = useState<string[]>([])

  const eligible = users.filter(
    (u) => !existingIds.includes(u.id) && !added.includes(u.id) &&
      (u.name.toLowerCase().includes(query.toLowerCase()) || u.email.toLowerCase().includes(query.toLowerCase()))
  )

  const handleAdd = (userId: string) => {
    addMember(groupId, userId)
    setAdded((prev) => [...prev, userId])
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="text-lg font-bold mb-4" style={{ fontFamily: "var(--font-display)" }}>Add member</h2>
      <p className="text-xs mb-4" style={{ color: "#7c7a99" }}>
        Only existing Slice accounts can be added.
      </p>
      <Input
        placeholder="Search by name or email…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />
      <div className="mt-3 space-y-1 max-h-48 overflow-y-auto">
        {eligible.length === 0 ? (
          <p className="text-xs text-center py-4" style={{ color: "#4a4866" }}>No matching accounts</p>
        ) : (
          eligible.map((u) => (
            <div key={u.id} className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-white/5 transition-all">
              <Avatar label={u.name} id={u.id} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{u.name}</p>
                <p className="text-xs truncate" style={{ color: "#7c7a99" }}>{u.email}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => handleAdd(u.id)}>Add</Button>
            </div>
          ))
        )}
      </div>
      <div className="mt-4">
        <Button variant="ghost" className="w-full" onClick={onClose}>Done</Button>
      </div>
    </Modal>
  )
}

// ─── Add / Edit Expense Modal ────────────────────────────────────────────────

function ExpenseModal({
  groupId,
  memberIds,
  editing,
  onClose,
}: {
  groupId: string
  memberIds: string[]
  editing?: Expense
  onClose: () => void
}) {
  const { users, addExpense, updateExpense, currentUser } = useApp()
  const members = memberIds.map((id) => users.find((u) => u.id === id)!).filter(Boolean)

  const [description, setDescription] = useState(editing?.description ?? "")
  const [amount, setAmount] = useState(editing ? String(editing.amount) : "")
  const [paidBy, setPaidBy] = useState(editing?.paidBy ?? currentUser!.id)
  const [splitType, setSplitType] = useState<SplitType>(editing?.splitType ?? "equal")
  const [splitValues, setSplitValues] = useState<Record<string, string>>(
    () => {
      const init: Record<string, string> = {}
      members.forEach((m) => {
        const existing = editing?.splits.find((s) => s.userId === m.id)
        init[m.id] = existing ? String(existing.value) : ""
      })
      return init
    }
  )
  const [splitMembers, setSplitMembers] = useState<string[]>(
    editing ? editing.splits.map((s) => s.userId) : memberIds
  )

  const toggleMember = (id: string) => {
    setSplitMembers((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const computedSplits = (): SplitEntry[] => {
    const selected = members.filter((m) => splitMembers.includes(m.id))
    if (selected.length === 0) return []
    const total = parseFloat(amount) || 0
    if (splitType === "equal") {
      const share = total / selected.length
      return selected.map((m) => ({ userId: m.id, value: parseFloat(share.toFixed(2)) }))
    }
    return selected.map((m) => ({ userId: m.id, value: parseFloat(splitValues[m.id] || "0") }))
  }

  const totalCheck = () => {
    const splits = computedSplits()
    const total = parseFloat(amount) || 0
    if (splitType === "equal") return true
    if (splitType === "unequal") {
      const sum = splits.reduce((s, x) => s + x.value, 0)
      return Math.abs(sum - total) < 0.02
    }
    if (splitType === "percentage") {
      const sum = splits.reduce((s, x) => s + x.value, 0)
      return Math.abs(sum - 100) < 0.5
    }
    return true
  }

  const valid = description.trim() && parseFloat(amount) > 0 && computedSplits().length > 0 && totalCheck()

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!valid) return
    const splits = computedSplits()
    if (editing) {
      updateExpense(editing.id, { description, amount: parseFloat(amount), paidBy, splitType, splits })
    } else {
      addExpense({ groupId, description, amount: parseFloat(amount), paidBy, splitType, splits, createdBy: currentUser!.id })
    }
    onClose()
  }

  const SPLIT_LABELS: Record<SplitType, string> = {
    equal: "Equal",
    unequal: "Custom $",
    percentage: "Percentage %",
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="text-lg font-bold mb-5" style={{ fontFamily: "var(--font-display)" }}>
        {editing ? "Edit expense" : "Add expense"}
      </h2>
      <form onSubmit={submit} className="space-y-4">
        <Input label="Description" placeholder="Dinner, Uber, tickets…" value={description} onChange={(e) => setDescription(e.target.value)} autoFocus />
        <Input label="Amount ($)" type="number" min="0.01" step="0.01" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />

        {/* Paid by */}
        <div>
          <p className="text-xs font-medium mb-2" style={{ color: "#7c7a99" }}>Paid by</p>
          <div className="flex flex-wrap gap-2">
            {members.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setPaidBy(m.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-all"
                style={{
                  background: paidBy === m.id ? avatarColor(m.id) + "25" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${paidBy === m.id ? avatarColor(m.id) + "60" : "transparent"}`,
                  color: paidBy === m.id ? avatarColor(m.id) : "#7c7a99",
                }}
              >
                {m.name}
              </button>
            ))}
          </div>
        </div>

        {/* Split type */}
        <div>
          <p className="text-xs font-medium mb-2" style={{ color: "#7c7a99" }}>Split type</p>
          <div className="grid grid-cols-3 gap-1.5">
            {(["equal", "unequal", "percentage"] as SplitType[]).map((t) => (
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

        {/* Who's splitting */}
        <div>
          <p className="text-xs font-medium mb-2" style={{ color: "#7c7a99" }}>Split between</p>
          <div className="space-y-2">
            {members.map((m) => {
              const included = splitMembers.includes(m.id)
              const color = avatarColor(m.id)
              return (
                <div key={m.id} className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => toggleMember(m.id)}
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
                    <span className="text-sm" style={{ color: included ? "#f0eef8" : "#7c7a99" }}>{m.name}</span>
                  </button>

                  {included && splitType !== "equal" && (
                    <input
                      type="number"
                      min="0"
                      step={splitType === "percentage" ? "1" : "0.01"}
                      placeholder={splitType === "percentage" ? "%" : "$"}
                      value={splitValues[m.id]}
                      onChange={(e) => setSplitValues((prev) => ({ ...prev, [m.id]: e.target.value }))}
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
              {splitType === "unequal"
                ? `Amounts must add up to $${parseFloat(amount || "0").toFixed(2)}`
                : "Percentages must add up to 100%"}
            </p>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose} className="flex-1">Cancel</Button>
          <Button type="submit" variant="primary" className="flex-1" disabled={!valid}>
            {editing ? "Save" : "Add expense"}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Tab: Expenses ────────────────────────────────────────────────────────────

function ExpensesTab({ groupId, memberIds }: { groupId: string; memberIds: string[] }) {
  const { expenses, deleteExpense, users } = useApp()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Expense | undefined>()

  const groupExpenses = expenses
    .filter((e) => e.groupId === groupId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  const SPLIT_COLOR: Record<SplitType, string> = {
    equal: "#34d399",
    unequal: "#38bdf8",
    percentage: "#e879f9",
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <SectionLabel>EXPENSES</SectionLabel>
        <Button variant="primary" size="sm" onClick={() => setAdding(true)}>+ Add</Button>
      </div>

      {groupExpenses.length === 0 ? (
        <EmptyState icon="🧾" title="No expenses yet" sub="Add the first one" />
      ) : (
        <div className="space-y-2">
          {groupExpenses.map((e) => {
            const payer = users.find((u) => u.id === e.paidBy)
            const date = new Date(e.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
            return (
              <Card key={e.id} className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium text-sm">{e.description}</p>
                      <Badge color={SPLIT_COLOR[e.splitType]}>{e.splitType}</Badge>
                    </div>
                    <p className="text-xs mt-1" style={{ color: "#7c7a99" }}>
                      Paid by {payer?.name} · {e.splits.length} people · {date}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="pill-amount font-semibold">${e.amount.toFixed(2)}</p>
                    <div className="flex gap-1 mt-1 justify-end">
                      <button
                        onClick={() => setEditing(e)}
                        className="text-[10px] px-2 py-0.5 rounded-lg transition-all hover:bg-white/5"
                        style={{ color: "#7c7a99" }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteExpense(e.id)}
                        className="text-[10px] px-2 py-0.5 rounded-lg transition-all"
                        style={{ color: "#f87171" }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {(adding || editing) && (
        <ExpenseModal
          groupId={groupId}
          memberIds={memberIds}
          editing={editing}
          onClose={() => { setAdding(false); setEditing(undefined) }}
        />
      )}
    </div>
  )
}

// ─── Tab: Balances ────────────────────────────────────────────────────────────

function BalancesTab({ groupId, memberIds }: { groupId: string; memberIds: string[] }) {
  const { expenses, settlements, settleUp, users, currentUser } = useApp()
  const [showHistory, setShowHistory] = useState(false)

  const groupExpenses = expenses.filter((e) => e.groupId === groupId)
  const groupSettlements = settlements.filter((s) => s.groupId === groupId)

  const balances = computeBalances(groupExpenses, groupSettlements)

  const groupMembers = memberIds.map((id) => users.find((u) => u.id === id)!).filter(Boolean)

  // Per-person net
  const netPerPerson = groupMembers.map((m) => {
    const paid = groupExpenses.filter((e) => e.paidBy === m.id).reduce((s, e) => s + e.amount, 0)
    const share = groupExpenses.flatMap((e) => {
      const sp = e.splits.find((s) => s.userId === m.id)
      if (!sp) return []
      if (e.splitType === "percentage") return [(sp.value / 100) * e.amount]
      return [sp.value]
    }).reduce((s, x) => s + x, 0)
    return { user: m, net: paid - share }
  })

  const handleSettle = (fromId: string, toId: string, amount: number) => {
    settleUp(groupId, fromId, toId, amount)
  }

  return (
    <div className="space-y-5">
      {/* Net per person */}
      <div>
        <SectionLabel>NET BALANCE</SectionLabel>
        <div className="space-y-2">
          {netPerPerson.map(({ user: u, net }) => (
            <Card key={u.id} className="px-4 py-3 flex items-center gap-3">
              <Avatar label={u.name} id={u.id} size="sm" />
              <span className="text-sm font-medium flex-1">{u.name}{u.id === currentUser!.id ? " (you)" : ""}</span>
              <div className="text-right">
                <p
                  className="pill-amount text-sm font-semibold"
                  style={{ color: net >= 0 ? "#34d399" : "#e879f9" }}
                >
                  {net >= 0 ? "+" : ""}${net.toFixed(2)}
                </p>
                <p className="text-[10px]" style={{ color: "#7c7a99" }}>
                  {net >= 0 ? "gets back" : "owes"}
                </p>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <Divider />

      {/* Who owes whom */}
      <div>
        <SectionLabel>SETTLEMENTS NEEDED</SectionLabel>
        {balances.length === 0 ? (
          <EmptyState icon="✅" title="All settled up!" sub="No outstanding balances" />
        ) : (
          <div className="space-y-2">
            {balances.map((b, i) => {
              const from = users.find((u) => u.id === b.fromUserId)!
              const to = users.find((u) => u.id === b.toUserId)!
              return (
                <Card key={i} className="px-4 py-3 flex items-center gap-3">
                  <Avatar label={from.name} id={from.id} size="sm" />
                  <div className="flex-1 min-w-0 text-sm">
                    <span style={{ color: avatarColor(from.id) }}>{from.name}</span>
                    <span style={{ color: "#7c7a99" }}> owes </span>
                    <span style={{ color: avatarColor(to.id) }}>{to.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="pill-amount text-sm font-semibold">${b.amount.toFixed(2)}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleSettle(b.fromUserId, b.toUserId, b.amount)}
                    >
                      Settle
                    </Button>
                  </div>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* Settlement history */}
      {groupSettlements.length > 0 && (
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
              {groupSettlements.map((s) => {
                const from = users.find((u) => u.id === s.fromUserId)!
                const to = users.find((u) => u.id === s.toUserId)!
                const date = new Date(s.settledAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                return (
                  <Card key={s.id} className="px-4 py-3 flex items-center gap-3">
                    <span className="text-base">✅</span>
                    <div className="flex-1 min-w-0 text-sm" style={{ color: "#7c7a99" }}>
                      {from.name} paid {to.name} · {date}
                    </div>
                    <span className="pill-amount text-sm" style={{ color: "#34d399" }}>${s.amount.toFixed(2)}</span>
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

// ─── Tab: Members ────────────────────────────────────────────────────────────

function MembersTab({ groupId, memberIds, createdBy }: { groupId: string; memberIds: string[]; createdBy: string }) {
  const { users, currentUser } = useApp()
  const [adding, setAdding] = useState(false)

  const members = memberIds.map((id) => users.find((u) => u.id === id)!).filter(Boolean)

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <SectionLabel>MEMBERS ({members.length})</SectionLabel>
        {currentUser!.id === createdBy || memberIds.includes(currentUser!.id) ? (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>+ Add</Button>
        ) : null}
      </div>
      <div className="space-y-2">
        {members.map((m) => (
          <Card key={m.id} className="px-4 py-3 flex items-center gap-3">
            <Avatar label={m.name} id={m.id} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">
                {m.name}{m.id === currentUser!.id ? " (you)" : ""}
              </p>
              <p className="text-xs truncate" style={{ color: "#7c7a99" }}>{m.email}</p>
            </div>
            {m.id === createdBy && <Badge color="#a78bfa">owner</Badge>}
          </Card>
        ))}
      </div>
      {adding && (
        <AddMemberModal groupId={groupId} existingIds={memberIds} onClose={() => setAdding(false)} />
      )}
    </div>
  )
}

// ─── Group Detail Page ────────────────────────────────────────────────────────

const TABS = ["Expenses", "Balances", "Members"] as const
type Tab = (typeof TABS)[number]

export default function GroupDetail() {
  const { groupId } = useParams<{ groupId: string }>()
  const navigate = useNavigate()
  const { groups, expenses, currentUser } = useApp()

  const group = groups.find((g) => g.id === groupId)
  if (!group) return <div className="p-8 text-center" style={{ color: "#7c7a99" }}>Group not found.</div>

  // Permission gate: only members
  if (!group.memberIds.includes(currentUser!.id)) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0d0d12" }}>
        <EmptyState icon="🔒" title="Members only" sub="You're not in this group." />
      </div>
    )
  }

  const [activeTab, setActiveTab] = useState<Tab>("Expenses")

  const total = expenses.filter((e) => e.groupId === groupId).reduce((s, e) => s + e.amount, 0)

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
            {group.emoji}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold truncate" style={{ fontFamily: "var(--font-display)" }}>{group.name}</h1>
            <p className="text-xs" style={{ color: "#7c7a99" }}>{group.memberIds.length} members</p>
          </div>
          <div className="text-right shrink-0">
            <p className="pill-amount text-xl font-bold">${total.toFixed(0)}</p>
            <p className="text-xs" style={{ color: "#7c7a99" }}>total</p>
          </div>
        </div>

        {/* Tab bar */}
        <div
          className="flex rounded-2xl p-1 mb-6"
          style={{ background: "#15141f", border: "1px solid rgba(167,139,250,0.1)" }}
        >
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

        {/* Tab content */}
        {activeTab === "Expenses" && <ExpensesTab groupId={group.id} memberIds={group.memberIds} />}
        {activeTab === "Balances" && <BalancesTab groupId={group.id} memberIds={group.memberIds} />}
        {activeTab === "Members" && (
          <MembersTab groupId={group.id} memberIds={group.memberIds} createdBy={group.createdBy} />
        )}
      </div>
    </div>
  )
}
