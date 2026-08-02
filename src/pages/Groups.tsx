import { useState, useEffect } from "react"
import { useNavigate } from "react-router"
import { useApp } from "../context"
import { apiGetGroups, apiCreateGroup, apiAddMember, apiGetMembers, apiGetExpenses, type ApiGroup, type ApiMember } from "../api"
import { Card, Button, Input, Modal, EmptyState, Avatar, Badge } from "../ui"

const GROUP_EMOJIS = ["🌆", "🏔", "🗼", "🎉", "🍕", "🏖", "🎵", "🚗", "🍸", "🌴", "🎢", "⛷"]

type GroupCardData = {
  groupId: string
  groupName: string
  createdAt: string
  members: ApiMember[]
  expenseCount: number
  totalCents: number
}

function CreateGroupModal({ onClose, onCreated }: { onClose: () => void; onCreated: (groupId: string) => void }) {
  const { currentUser } = useApp()
  const [name, setName] = useState("")
  const [emoji, setEmoji] = useState("🎉")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const g = await apiCreateGroup(name.trim())
      // Bootstrap: creator isn't auto-added as a member, so add them now.
      await apiAddMember(g.groupId, currentUser!.id, currentUser!.name)
      onCreated(g.groupId)
    } catch {
      setError("Couldn't create the group. Please try again.")
      setSubmitting(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="text-lg font-bold mb-5" style={{ fontFamily: "var(--font-display)" }}>New group</h2>
      <form onSubmit={submit} className="space-y-4">
        <Input
          label="Group name"
          placeholder="Weekend trip, Dinner club…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
        />
        <div>
          <p className="text-xs font-medium mb-2" style={{ color: "#7c7a8a" }}>Emoji</p>
          <div className="flex flex-wrap gap-2">
            {GROUP_EMOJIS.map((em) => (
              <button
                key={em}
                type="button"
                onClick={() => setEmoji(em)}
                className="w-10 h-10 rounded-xl text-xl transition-all hover:scale-110"
                style={{
                  background: emoji === em ? "rgba(245,197,24,0.2)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${emoji === em ? "rgba(245,197,24,0.4)" : "transparent"}`,
                }}
              >
                {em}
              </button>
            ))}
          </div>
        </div>
        {error && <p className="text-xs" style={{ color: "#f87171" }}>{error}</p>}
        <div className="flex gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose} className="flex-1">Cancel</Button>
          <Button type="submit" variant="primary" className="flex-1" disabled={!name.trim() || submitting}>
            {submitting ? "Creating…" : "Create"}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

export default function Groups() {
  const { currentUser, signOut } = useApp()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cards, setCards] = useState<GroupCardData[]>([])

  const loadGroups = async () => {
    setLoading(true)
    setError(null)
    try {
      const groups: ApiGroup[] = await apiGetGroups()
      const enriched = await Promise.all(
        groups.map(async (g) => {
          const [members, expenses] = await Promise.all([
            apiGetMembers(g.groupId),
            apiGetExpenses(g.groupId),
          ])
          return {
            groupId: g.groupId,
            groupName: g.groupName,
            createdAt: g.createdAt,
            members,
            expenseCount: expenses.length,
            totalCents: expenses.reduce((s, e) => s + e.amountCents, 0),
          }
        })
      )
      setCards(enriched)
    } catch {
      setError("Couldn't load your groups. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadGroups()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="mesh-bg min-h-screen" style={{ fontFamily: "var(--font-body)" }}>
      <div className="max-w-lg mx-auto px-4 pt-10 pb-24">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-2">
            <span className="text-xl float">✦</span>
            <h1 className="text-2xl font-bold" style={{ fontFamily: "var(--font-display)" }}>slice</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-right mr-1">
              <p className="text-sm font-medium">{currentUser!.name}</p>
              <p className="text-xs" style={{ color: "#7c7a8a" }}>{currentUser!.email}</p>
            </div>
            <Avatar label={currentUser!.name} id={currentUser!.id} size="sm" />
            <Button variant="ghost" size="sm" onClick={() => { signOut(); navigate("/") }}>Sign out</Button>
          </div>
        </div>

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Your groups</h2>
          <Button variant="primary" size="sm" onClick={() => setCreating(true)}>+ New group</Button>
        </div>

        {loading ? (
          <p className="text-sm" style={{ color: "#7c7a8a" }}>Loading groups…</p>
        ) : error ? (
          <div className="space-y-3">
            <p className="text-sm" style={{ color: "#f87171" }}>{error}</p>
            <Button variant="ghost" size="sm" onClick={loadGroups}>Retry</Button>
          </div>
        ) : cards.length === 0 ? (
          <EmptyState icon="👯" title="No groups yet" sub="Create one and invite your friends" />
        ) : (
          <div className="space-y-3">
            {cards.map((g) => (
              <button
                key={g.groupId}
                onClick={() => navigate(`/groups/${g.groupId}`)}
                className="w-full text-left"
              >
                <Card className="p-4 card-hover">
                  <div className="flex items-center gap-4">
                    <div
                      className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0"
                      style={{ background: "rgba(245,197,24,0.1)" }}
                    >
                      🎉
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold truncate">{g.groupName}</p>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex -space-x-1.5">
                          {g.members.slice(0, 4).map((m) => (
                            <div
                              key={m.userId}
                              className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ring-1 ring-[#0f0e13]"
                              style={{ background: "#F5C51820", color: "#F5C518" }}
                            >
                              {m.userName?.[0]?.toUpperCase() || "?"}
                            </div>
                          ))}
                        </div>
                        <span className="text-xs" style={{ color: "#7c7a8a" }}>
                          {g.members.length} member{g.members.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="pill-amount text-lg font-bold">₹{(g.totalCents / 100).toFixed(0)}</p>
                      <p className="text-xs" style={{ color: "#7c7a8a" }}>{g.expenseCount} expenses</p>
                    </div>
                  </div>
                </Card>
              </button>
            ))}
          </div>
        )}
      </div>

      {creating && (
        <CreateGroupModal
          onClose={() => setCreating(false)}
          onCreated={(groupId) => navigate(`/groups/${groupId}`)}
        />
      )}
    </div>
  )
}
