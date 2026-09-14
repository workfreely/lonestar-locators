export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin"
import { generateInviteToken, hashInviteToken, INVITE_TTL_MS, destinationInvitePath } from "@/lib/social/destinationInvite"

// Destination-authorization invitations. Platform-admin ONLY.
//
// POST → mint a single-use invitation. The RAW token is generated here, hashed, and only the hash
// is stored (sa_create_destination_invitation). The raw token + full link are returned EXACTLY
// ONCE in this response (the admin copies the link to send). They are never persisted in plaintext
// and cannot be recovered later — a lost link must be revoked and re-issued.
//
// GET → list the admin's own invitations (safe fields only; RLS-scoped). Never returns tokens.

export async function POST(request: Request) {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response
  const { supabase } = guard

  let body: { label?: unknown; ttlMs?: unknown; agentUserId?: unknown } = {}
  try {
    body = await request.json()
  } catch {
    /* empty body allowed */
  }
  const label = typeof body.label === "string" ? body.label.slice(0, 120) : null
  // Optional selected Locator Beast agent (profiles.id). Stored on the invitation and later copied
  // onto the connection; the RPC validates admin + owner binding. Basic uuid shape check only.
  const agentUserId =
    typeof body.agentUserId === "string" && /^[0-9a-f-]{36}$/i.test(body.agentUserId) ? body.agentUserId : null
  const ttlMs =
    typeof body.ttlMs === "number" && body.ttlMs > 0 && body.ttlMs <= 30 * 24 * 60 * 60 * 1000
      ? body.ttlMs
      : INVITE_TTL_MS
  const expiresAt = new Date(Date.now() + ttlMs).toISOString()

  const rawToken = generateInviteToken()
  const tokenHash = hashInviteToken(rawToken)

  const { data: id, error } = await supabase.rpc("sa_create_destination_invitation", {
    p_token_hash: tokenHash,
    p_label: label,
    p_expires_at: expiresAt,
    p_agent_user_id: agentUserId,
  })
  if (error || !id) return NextResponse.json({ error: "create_failed" }, { status: 500 })

  const { origin } = new URL(request.url)
  const path = destinationInvitePath(rawToken)
  // The raw token / link is surfaced only in THIS response body — never stored, never logged.
  return NextResponse.json({
    ok: true,
    id,
    label,
    expiresAt,
    link: `${origin}${path}`,
    path,
  })
}

export async function GET() {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response
  const { supabase } = guard

  // RLS restricts this to the caller's own invitations; token_hash is intentionally omitted.
  const { data, error } = await supabase
    .from("social_destination_invitations")
    .select("id, label, created_at, expires_at, used_at, revoked_at, consumed_connection_id")
    .order("created_at", { ascending: false })
  if (error) return NextResponse.json({ error: "list_failed" }, { status: 500 })

  const now = Date.now()
  const invitations = (data ?? []).map((r) => {
    const row = r as {
      id: string
      label: string | null
      created_at: string
      expires_at: string
      used_at: string | null
      revoked_at: string | null
      consumed_connection_id: string | null
    }
    const status = row.revoked_at
      ? "revoked"
      : row.used_at
        ? "used"
        : new Date(row.expires_at).getTime() <= now
          ? "expired"
          : "valid"
    return { ...row, status }
  })
  return NextResponse.json({ ok: true, invitations })
}
