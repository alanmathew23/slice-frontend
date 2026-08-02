import { useState } from "react"
import { useNavigate } from "react-router"
import { useApp } from "../context"
import { Card, Button, Input, Modal, EmptyState, Avatar, Badge } from "../ui"

const GROUP_EMOJIS = ["🌆", "🏔", "🗼", "🎉", "🍕", "🏖", "🎵", "🚗", "🍸", "🌴", "🎢", "⛷"]

function CreateGroupModal({ onClose }: { onClose: () => void }) {
  const { createGroup } = useApp()
  const navigate = useNavigate()
  const [name, setName] = useState("")
  const [emoji, setEmoji] = useState("🎉")

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    const g = createGroup(name.trim(), emoji)
    navigate(`/groups/${g.id}`)
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
          <p className="text-xs font-medium mb-2" style={{ color: "#7c7a99" }}>Emoji</p>
          <div className="flex flex-wrap gap-2">
            {GROUP_EMOJIS.map((em) => (
              <button
                key={em}
                type="button"
                onClick={() => setEmoji(em)}
                className="w-10 h-10 rounded-xl text-xl transition-all hover:scale-110"
                style={{
                  background: emoji === em ? "rgba(167,139,250,0.2)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${emoji === em ? "rgba(167,139,250,0.4)" : "transparent"}`,
                }}
              >
                {em}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose} className="flex-1">Cancel</Button>
          <Button type="submit" variant="primary" className="flex-1" disabled={!name.trim()}>Create</Button>
        </div>
      </form>
    </Modal>
  )
}

export default function Groups() {
  const { groups, expenses, currentUser, users, signOut } = useApp()
  const navigate = useNavigate()
  const [creating, setCreating] = useState(false)

  const myGroups = groups.filter((g) => g.memberIds.includes(currentUser!.id))

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
              <p className="text-xs" style={{ color: "#7c7a99" }}>{currentUser!.email}</p>
            </div>
            <Avatar label={currentUser!.name} id={currentUser!.id} size="sm" />
            <Button variant="ghost" size="sm" onClick={() => { signOut(); navigate("/") }}>Sign out</Button>
          </div>
        </div>

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Your groups</h2>
          <Button variant="primary" size="sm" onClick={() => setCreating(true)}>+ New group</Button>
        </div>

        {myGroups.length === 0 ? (
          <EmptyState icon="👯" title="No groups yet" sub="Create one and invite your friends" />
        ) : (
          <div className="space-y-3">
            {myGroups.map((g) => {
              const groupExpenses = expenses.filter((e) => e.groupId === g.id)
              const total = groupExpenses.reduce((s, e) => s + e.amount, 0)
              const members = g.memberIds.map((id) => users.find((u) => u.id === id)!).filter(Boolean)
              return (
                <button
                  key={g.id}
                  onClick={() => navigate(`/groups/${g.id}`)}
                  className="w-full text-left"
                >
                  <Card className="p-4 card-hover">
                    <div className="flex items-center gap-4">
                      <div
                        className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0"
                        style={{ background: "rgba(167,139,250,0.1)" }}
                      >
                        {g.emoji}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold truncate">{g.name}</p>
                          {g.createdBy === currentUser!.id && (
                            <Badge color="#a78bfa">owner</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex -space-x-1.5">
                            {members.slice(0, 4).map((m) => (
                              <div
                                key={m.id}
                                className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ring-1 ring-[#15141f]"
                                style={{ background: "#a78bfa20", color: "#a78bfa" }}
                              >
                                {m.avatar}
                              </div>
                            ))}
                          </div>
                          <span className="text-xs" style={{ color: "#7c7a99" }}>
                            {members.length} member{members.length !== 1 ? "s" : ""}
                          </span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="pill-amount text-lg font-bold">${total.toFixed(0)}</p>
                        <p className="text-xs" style={{ color: "#7c7a99" }}>{groupExpenses.length} expenses</p>
                      </div>
                    </div>
                  </Card>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {creating && <CreateGroupModal onClose={() => setCreating(false)} />}
    </div>
  )
}
