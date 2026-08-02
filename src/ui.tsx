// Shared UI primitives

import type { ReactNode, ButtonHTMLAttributes, InputHTMLAttributes } from "react"

// Kept varied for avatar-color hashing — amber leads since it's now the
// brand accent, rest stay for visual variety across different people.
const AVATAR_COLORS = ["#F5C518", "#e879f9", "#38bdf8", "#34d399", "#fb923c", "#f472b6", "#a78bfa"]

export function avatarColor(id: string) {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}

export function Avatar({
  label,
  id,
  size = "md",
}: {
  label: string
  id: string
  size?: "xs" | "sm" | "md" | "lg"
}) {
  const sz = { xs: "w-6 h-6 text-[10px]", sm: "w-8 h-8 text-xs", md: "w-10 h-10 text-sm", lg: "w-12 h-12 text-base" }
  const color = avatarColor(id)
  return (
    <div
      className={`${sz[size]} rounded-full flex items-center justify-center font-semibold shrink-0`}
      style={{ backgroundColor: color + "22", color }}
    >
      {label[0]?.toUpperCase()}
    </div>
  )
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border ${className}`}
      style={{ background: "#0f0e13", borderColor: "rgba(245,197,24,0.10)" }}
    >
      {children}
    </div>
  )
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "danger" | "outline"
  size?: "sm" | "md" | "lg"
}) {
  const base = "inline-flex items-center justify-center gap-2 font-semibold rounded-xl transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
  const sizes = { sm: "text-xs px-3 py-1.5", md: "text-sm px-4 py-2.5", lg: "text-base px-6 py-3" }
  const variants = {
    primary: "text-[#0a0a0a]",
    ghost: "text-[#7c7a8a] hover:text-[#f0eee8] hover:bg-white/5",
    danger: "bg-red-500/15 text-red-400 hover:bg-red-500/25",
    outline: "border text-[#F5C518] hover:bg-[#F5C518]/10",
  }
  const primaryStyle =
    variant === "primary"
      ? { background: "#F5C518" }
      : variant === "outline"
        ? { borderColor: "rgba(245,197,24,0.3)" }
        : {}

  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} style={primaryStyle} {...props}>
      {children}
    </button>
  )
}

export function Input({
  label,
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-xs font-medium" style={{ color: "#7c7a8a" }}>{label}</label>}
      <input
        className={`w-full rounded-xl px-4 py-2.5 text-sm outline-none transition-all placeholder:text-[#4a4844] focus:ring-1 ${className}`}
        style={{
          background: "#131215",
          border: "1px solid rgba(245,197,24,0.15)",
          color: "#f0eee8",
          // @ts-expect-error css var
          "--tw-ring-color": "#F5C518",
        }}
        {...props}
      />
    </div>
  )
}

export function Select({
  label,
  children,
  className = "",
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-xs font-medium" style={{ color: "#7c7a8a" }}>{label}</label>}
      <select
        className={`w-full rounded-xl px-4 py-2.5 text-sm outline-none transition-all ${className}`}
        style={{
          background: "#131215",
          border: "1px solid rgba(245,197,24,0.15)",
          color: "#f0eee8",
        }}
        {...props}
      >
        {children}
      </select>
    </div>
  )
}

export function Divider({ label }: { label?: string }) {
  if (!label) return <div className="h-px" style={{ background: "rgba(245,197,24,0.1)" }} />
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-px" style={{ background: "rgba(245,197,24,0.1)" }} />
      <span className="text-xs" style={{ color: "#4a4844" }}>{label}</span>
      <div className="flex-1 h-px" style={{ background: "rgba(245,197,24,0.1)" }} />
    </div>
  )
}

export function Badge({ children, color = "#F5C518" }: { children: ReactNode; color?: string }) {
  return (
    <span
      className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider"
      style={{ background: color + "18", color }}
    >
      {children}
    </span>
  )
}

export function EmptyState({ icon, title, sub }: { icon: string; title: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-16 text-center">
      <span className="text-4xl">{icon}</span>
      <p className="font-semibold text-sm mt-1">{title}</p>
      {sub && <p className="text-xs" style={{ color: "#7c7a8a" }}>{sub}</p>}
    </div>
  )
}

export function Modal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.8)", backdropFilter: "blur(4px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-md rounded-3xl p-6 border"
        style={{ background: "#0f0e13", borderColor: "rgba(245,197,24,0.2)" }}
      >
        {children}
      </div>
    </div>
  )
}

export function PageHeader({
  back,
  title,
  subtitle,
  action,
}: {
  back?: () => void
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div className="flex items-center gap-3">
        {back && (
          <button
            onClick={back}
            className="w-9 h-9 rounded-xl flex items-center justify-center transition-all hover:bg-white/5"
            style={{ color: "#7c7a8a" }}
          >
            ←
          </button>
        )}
        <div>
          <h1 className="text-xl font-bold" style={{ fontFamily: "var(--font-display)" }}>{title}</h1>
          {subtitle && <p className="text-xs mt-0.5" style={{ color: "#7c7a8a" }}>{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  )
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs font-semibold mb-2" style={{ color: "#7c7a8a", letterSpacing: "0.1em" }}>
      {children}
    </p>
  )
}

export function StatCard({ label, value, sub, color = "#F5C518" }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="rounded-2xl p-4 border" style={{ background: "#0f0e13", borderColor: "rgba(245,197,24,0.12)" }}>
      <p className="text-xs font-medium" style={{ color: "#7c7a8a" }}>{label}</p>
      <p className="text-2xl font-bold mt-1 pill-amount" style={{ color }}>{value}</p>
      {sub && <p className="text-xs mt-0.5" style={{ color: "#7c7a8a" }}>{sub}</p>}
    </div>
  )
}
