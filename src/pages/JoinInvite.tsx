import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router"
import { useApp } from "../context"
import { apiAcceptInvite } from "../api"
import { Button } from "../ui"

const PENDING_INVITE_KEY = "slice_pending_invite_token"

export default function JoinInvite() {
  const { token } = useParams<{ token: string }>()
  const { currentUser, authLoading } = useApp()
  const navigate = useNavigate()
  const [status, setStatus] = useState<"working" | "error">("working")
  const [error, setError] = useState("")

  useEffect(() => {
    if (authLoading || !token) return

    if (!currentUser) {
      // Not signed in — stash the token and send them to sign in/up.
      // Auth.tsx checks for this after a successful sign-in and resumes here.
      localStorage.setItem(PENDING_INVITE_KEY, token)
      navigate("/", { replace: true })
      return
    }

    apiAcceptInvite(token)
      .then(({ groupId }) => {
        localStorage.removeItem(PENDING_INVITE_KEY)
        navigate(`/groups/${groupId}`, { replace: true })
      })
      .catch((e) => {
        setError(e.message || "This invite link is invalid or has expired.")
        setStatus("error")
      })
  }, [authLoading, currentUser, token, navigate])

  if (status === "error") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 px-4 text-center" style={{ background: "#0d0d12" }}>
        <p className="text-sm" style={{ color: "#f87171" }}>{error}</p>
        <Button variant="ghost" size="sm" onClick={() => navigate("/groups")}>Go to your groups</Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#0d0d12", color: "#7c7a99" }}>
      Joining group…
    </div>
  )
}

export { PENDING_INVITE_KEY }
