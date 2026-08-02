// Real backend + Cognito wiring — replaces the mock in context.tsx

import type { User } from "./store"

const API_BASE = "https://i003q2t4r8.execute-api.ap-south-1.amazonaws.com/dev"
const COGNITO_REGION = "ap-south-1"
const COGNITO_CLIENT_ID = "23pf0k85v7006rvsh5r1j5pedq"
const COGNITO_ENDPOINT = `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/`

const STORAGE_KEYS = {
  idToken: "slice_id_token",
  accessToken: "slice_access_token",
  refreshToken: "slice_refresh_token",
} as const

// ─── Token storage ────────────────────────────────────────────────────────

export function storeTokens(tokens: { idToken: string; accessToken: string; refreshToken: string }) {
  localStorage.setItem(STORAGE_KEYS.idToken, tokens.idToken)
  localStorage.setItem(STORAGE_KEYS.accessToken, tokens.accessToken)
  localStorage.setItem(STORAGE_KEYS.refreshToken, tokens.refreshToken)
}

export function clearTokens() {
  localStorage.removeItem(STORAGE_KEYS.idToken)
  localStorage.removeItem(STORAGE_KEYS.accessToken)
  localStorage.removeItem(STORAGE_KEYS.refreshToken)
}

export function getIdToken(): string | null {
  return localStorage.getItem(STORAGE_KEYS.idToken)
}

export function getAccessToken(): string | null {
  return localStorage.getItem(STORAGE_KEYS.accessToken)
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(STORAGE_KEYS.refreshToken)
}

// ─── JWT decode (no verification needed client-side — the backend verifies
// every token on every request; this is just to read display claims) ──────

type IdTokenClaims = {
  sub: string
  email: string
  name?: string
  exp: number
}

function decodeIdToken(idToken: string): IdTokenClaims | null {
  try {
    const payload = idToken.split(".")[1]
    // JWTs use base64url, not plain base64 — swap chars before atob
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/")
    const json = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join("")
    )
    return JSON.parse(json)
  } catch {
    return null
  }
}

/** Reads whatever ID token is in localStorage and returns a User if it's
 *  present and not expired, or null otherwise (no session, or expired). */
export function getStoredUser(): User | null {
  const idToken = getIdToken()
  if (!idToken) return null

  const claims = decodeIdToken(idToken)
  if (!claims) return null

  const nowSeconds = Math.floor(Date.now() / 1000)
  if (claims.exp < nowSeconds) {
    // Expired — caller should clear tokens and treat as signed out.
    // (A refresh-token flow could go here later; not built yet.)
    return null
  }

  const name = claims.name || claims.email
  return {
    id: claims.sub,
    email: claims.email,
    name,
    avatar: name[0]?.toUpperCase() || "?",
  }
}

// ─── Sign up (calls our own backend, which auto-confirms server-side) ─────

export async function apiSignUp(
  email: string,
  password: string,
  name: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${API_BASE}/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name }),
    })
    const data = await res.json().catch(() => ({}))

    if (res.status === 201) return { ok: true }
    if (res.status === 409) return { ok: false, error: "An account with that email already exists." }
    return { ok: false, error: data.message || "Sign up failed. Please try again." }
  } catch {
    return { ok: false, error: "Network error — check your connection and try again." }
  }
}

// ─── Sign in (calls Cognito's InitiateAuth directly — public client,
// no secret, so this is a normal browser-safe call) ────────────────────────

export async function apiSignIn(
  email: string,
  password: string
): Promise<
  | { ok: true; tokens: { idToken: string; accessToken: string; refreshToken: string } }
  | { ok: false; error: string }
> {
  try {
    const res = await fetch(COGNITO_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-amz-json-1.1",
        "X-Amz-Target": "AWSCognitoIdentityProviderService.InitiateAuth",
      },
      body: JSON.stringify({
        AuthFlow: "USER_PASSWORD_AUTH",
        ClientId: COGNITO_CLIENT_ID,
        AuthParameters: { USERNAME: email, PASSWORD: password },
      }),
    })

    const data = await res.json().catch(() => ({}))

    if (!res.ok) {
      if (data.__type === "NotAuthorizedException") {
        return { ok: false, error: "Incorrect email or password." }
      }
      if (data.__type === "UserNotFoundException") {
        return { ok: false, error: "No account found with that email." }
      }
      return { ok: false, error: data.message || "Sign in failed. Please try again." }
    }

    const result = data.AuthenticationResult
    if (!result?.IdToken) {
      return { ok: false, error: "Unexpected response from sign in. Please try again." }
    }

    return {
      ok: true,
      tokens: {
        idToken: result.IdToken,
        accessToken: result.AccessToken,
        refreshToken: result.RefreshToken,
      },
    }
  } catch {
    return { ok: false, error: "Network error — check your connection and try again." }
  }
}

// ─── Authenticated fetch helper (for wiring the rest of the app later) ────

export async function apiFetch(path: string, options: RequestInit = {}) {
  const idToken = getIdToken()
  const headers = {
    "Content-Type": "application/json",
    ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
    ...(options.headers || {}),
  }
  return fetch(`${API_BASE}${path}`, { ...options, headers })
}
// ─── Groups / Members / Expenses ───────────────────────────────────────────

export type ApiGroup = {
  groupId: string
  groupName: string
  createdAt: string
  memberIds: string[]
}

export type ApiMember = {
  userId: string
  userName: string
  joinedAt: string
}

export type ApiExpenseSplit = {
  userId: string
  amountOwedCents: number
  isPayer: boolean
}

export type ApiExpense = {
  expenseId: string
  description: string
  amountCents: number
  paidBy: string
  splitType: string
  createdAt: string
  splits: ApiExpenseSplit[]
}

export async function apiGetGroups(): Promise<ApiGroup[]> {
  const res = await apiFetch("/groups")
  if (!res.ok) throw new Error(`Failed to load groups (${res.status})`)
  const data = await res.json()
  return data.groups
}

export async function apiCreateGroup(groupName: string): Promise<{ groupId: string; groupName: string; createdAt: string }> {
  const res = await apiFetch("/groups", {
    method: "POST",
    body: JSON.stringify({ groupName }),
  })
  if (!res.ok) throw new Error(`Failed to create group (${res.status})`)
  return res.json()
}

export async function apiAddMember(groupId: string, userId: string, userName: string): Promise<ApiMember> {
  const res = await apiFetch(`/groups/${groupId}/members`, {
    method: "POST",
    body: JSON.stringify({ userId, userName }),
  })
  if (!res.ok) throw new Error(`Failed to add member (${res.status})`)
  return res.json()
}

export async function apiGetMembers(groupId: string): Promise<ApiMember[]> {
  const res = await apiFetch(`/groups/${groupId}/members`)
  if (!res.ok) throw new Error(`Failed to load members (${res.status})`)
  const data = await res.json()
  return data.members
}

export async function apiGetExpenses(groupId: string): Promise<ApiExpense[]> {
  const res = await apiFetch(`/groups/${groupId}/expenses`)
  if (!res.ok) throw new Error(`Failed to load expenses (${res.status})`)
  const data = await res.json()
  return data.expenses
}

// ─── Expense create/delete ─────────────────────────────────────────────────

export async function apiCreateExpense(
  groupId: string,
  body: {
    description: string
    amountCents: number
    paidBy: string
    splitType: string
    splits: { userId: string; amountOwedCents: number; isPayer: boolean; percentage?: number; amountCents?: number }[]
  }
): Promise<ApiExpense> {
  const payload = {
    ...body,
    participantIds: body.splits.map((s) => s.userId),
  }
  const res = await apiFetch(`/groups/${groupId}/expenses`, {
    method: "POST",
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}))
    throw new Error(errBody.error || `Failed to create expense (${res.status})`)
  }
  return res.json()
}

export async function apiDeleteExpense(groupId: string, expenseId: string): Promise<void> {
  const res = await apiFetch(`/groups/${groupId}/expenses/${expenseId}`, { method: "DELETE" })
  if (!res.ok) throw new Error(`Failed to delete expense (${res.status})`)
}

// ─── Settlements ────────────────────────────────────────────────────────────

export type ApiSettlement = {
  settlementId: string
  groupId: string
  fromUserId: string
  toUserId: string
  amountCents: number
  createdBy: string
  createdAt: string
}

export async function apiGetSettlements(groupId: string): Promise<ApiSettlement[]> {
  const res = await apiFetch(`/groups/${groupId}/settlements`)
  if (!res.ok) throw new Error(`Failed to load settlements (${res.status})`)
  const data = await res.json()
  return data.settlements
}

export async function apiCreateSettlement(
  groupId: string,
  body: { fromUserId: string; toUserId: string; amountCents: number }
): Promise<ApiSettlement> {
  const res = await apiFetch(`/groups/${groupId}/settlements`, {
    method: "POST",
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Failed to create settlement (${res.status})`)
  return res.json()
}

export async function apiDeleteSettlement(groupId: string, settlementId: string): Promise<void> {
  const res = await apiFetch(`/groups/${groupId}/settlements/${settlementId}`, { method: "DELETE" })
  if (!res.ok) throw new Error(`Failed to delete settlement (${res.status})`)
}

// ─── Invites ────────────────────────────────────────────────────────────────

export type ApiInvite = {
  token: string
  groupId: string
  expiresAt: string
}

export async function apiCreateInvite(groupId: string): Promise<ApiInvite> {
  const res = await apiFetch(`/groups/${groupId}/invites`, { method: "POST" })
  if (!res.ok) throw new Error(`Failed to create invite (${res.status})`)
  return res.json()
}

export async function apiAcceptInvite(token: string): Promise<{ groupId: string }> {
  const res = await apiFetch(`/invites/${token}/accept`, { method: "POST" })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Failed to accept invite (${res.status})`)
  }
  return res.json()
}