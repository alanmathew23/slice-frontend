import { useEffect, type ReactNode } from "react"
import { useNavigate } from "react-router"
import { useApp } from "./context"

/** Wrap any page that requires a signed-in user. Redirects to "/" if
 *  there's no valid session, and shows nothing while we're still
 *  checking localStorage for an existing one on first load. */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { currentUser, authLoading } = useApp()
  const navigate = useNavigate()

  useEffect(() => {
    if (!authLoading && !currentUser) {
      navigate("/", { replace: true })
    }
  }, [authLoading, currentUser, navigate])

  if (authLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "#0d0d12", color: "#7c7a99" }}
      >
        Loading…
      </div>
    )
  }

  if (!currentUser) return null // brief flash before the redirect effect above fires

  return <>{children}</>
}
