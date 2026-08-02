import { useState } from "react"
import { useNavigate } from "react-router"
import { useApp } from "../context"
import { Input, Button } from "../ui"

const PENDING_INVITE_KEY = "slice_pending_invite_token"

export default function Auth() {
  const { signIn, signUp } = useApp()
  const navigate = useNavigate()
  const [mode, setMode] = useState<"signin" | "signup">("signin")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [name, setName] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (mode === "signup" && !name.trim()) {
      setError("Name is required.")
      return
    }

    setLoading(true)

    const result =
      mode === "signin"
        ? await signIn(email, password)
        : await signUp(email, password, name)

    if (result.ok) {
      // If they arrived here via an invite link, resume it instead of
      // going to the default dashboard.
      const pendingToken = localStorage.getItem(PENDING_INVITE_KEY)
      navigate(pendingToken ? `/join/${pendingToken}` : "/groups")
      return
    }

    setError(result.error || "Something went wrong. Please try again.")
    setLoading(false)
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{
        background:
          "radial-gradient(ellipse 80% 60% at 20% 10%, rgba(167,139,250,0.08) 0%, transparent 60%), radial-gradient(ellipse 60% 50% at 80% 80%, rgba(232,121,249,0.06) 0%, transparent 60%), #0d0d12",
      }}
    >
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-2 mb-2">
            <span className="text-2xl float">✦</span>
            <h1
              className="text-4xl font-bold tracking-tight"
              style={{ fontFamily: "var(--font-display)", color: "#f0eef8" }}
            >
              slice
            </h1>
          </div>
          <p className="text-sm" style={{ color: "#7c7a99" }}>
            Split expenses. Stay friends.
          </p>
        </div>

        {/* Card */}
        <div
          className="rounded-3xl p-6 border"
          style={{ background: "#15141f", borderColor: "rgba(167,139,250,0.15)" }}
        >
          {/* Mode toggle */}
          <div
            className="flex rounded-xl p-1 mb-6"
            style={{ background: "#0d0d12" }}
          >
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError("") }}
                className="flex-1 text-sm font-semibold py-2 rounded-lg transition-all"
                style={
                  mode === m
                    ? { background: "#a78bfa", color: "#0d0d12" }
                    : { color: "#7c7a99" }
                }
              >
                {m === "signin" ? "Sign in" : "Sign up"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === "signup" && (
              <Input
                label="Full name"
                type="text"
                placeholder="Maya Chen"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            )}
            <Input
              label="Email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              label="Password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {mode === "signup" && (
              <p className="text-xs" style={{ color: "#7c7a99" }}>
                At least 8 characters, with uppercase, lowercase, a number, and a symbol.
              </p>
            )}

            {error && (
              <p className="text-xs text-red-400 text-center">{error}</p>
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full mt-2"
              disabled={loading}
            >
              {loading ? "…" : mode === "signin" ? "Sign in" : "Create account"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
