export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/admin"

// DISCONNECT the signed-in agent's Google Calendar + Contacts authorization.
//
// ── WHAT THIS IS NOT ────────────────────────────────────────────────────────────────────────
// It is NOT a sign-out. Google Login runs through Supabase Auth on a different OAuth client and
// a different grant; this touches neither, so an agent who signs in with Google stays signed in
// and can still do so afterwards. The only thing revoked is the Calendar/Contacts grant.
//
// ── WHOSE ACCOUNT ───────────────────────────────────────────────────────────────────────────
// Only ever the caller's own. The user id comes from the session — never from the request body —
// so there is no shape of request that disconnects somebody else.
//
// ── ORDER, AND WHY ──────────────────────────────────────────────────────────────────────────
// Revoke at Google FIRST, then delete our copy. Deleting first would discard the only token that
// can revoke the grant, leaving Locator Beast's access alive at Google with nothing left to
// withdraw it — the agent would believe they had disconnected while the grant persisted.
//
// A revocation that FAILS does not become a success. We still delete our credentials (so this
// app stops syncing immediately, which is the thing the agent asked for), but we say plainly
// that the grant may still exist at Google and point them at the page that removes it. Claiming
// a clean disconnect we did not achieve is the one outcome worth refusing.
//
// NOTHING ELSE IS DELETED. Leads, their google_contact_id values, action google_event_id values,
// and the contacts and events already written to the agent's Google account all survive — they
// are the agent's own records of real work, and a disconnect is about future access.

export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const { data: cred } = await supabaseAdmin
    .from("google_credentials")
    .select("refresh_token")
    .eq("user_id", user.id)
    .maybeSingle()

  // Already disconnected — report the end state rather than an error. The flag is still cleared
  // below so a stale profiles.google_connected cannot keep claiming a connection that has no
  // credential behind it.
  let revoked: "revoked" | "no_token" | "failed" = cred?.refresh_token ? "failed" : "no_token"

  if (cred?.refresh_token) {
    try {
      // Google's documented revocation endpoint. Revoking the refresh token revokes the whole
      // grant, including any access tokens derived from it.
      const res = await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: cred.refresh_token }).toString(),
      })
      // 200 is a revocation. 400 invalid_token means the grant is already gone at Google —
      // which is the same end state, so it counts.
      if (res.ok) revoked = "revoked"
      else if (res.status === 400) revoked = "revoked"
      else console.warn(`[google/disconnect] revoke returned ${res.status}`)
    } catch (e) {
      console.warn("[google/disconnect] revoke call failed:", (e as Error).message)
    }
  }

  // OUR COPY GOES REGARDLESS. Whatever Google did, this app must stop using the token — that is
  // what the agent clicked. If this delete fails we report a failure, because a credential we
  // still hold is a connection that still works.
  const { error: delError } = await supabaseAdmin
    .from("google_credentials")
    .delete()
    .eq("user_id", user.id)
  if (delError) {
    console.error("[google/disconnect] credential delete failed:", delError.message)
    return NextResponse.json(
      { error: "We could not remove the stored Google credentials. Nothing was disconnected — please try again." },
      { status: 500 },
    )
  }

  // The UI flag the Integrations page reads. Cleared only after the credential is actually gone,
  // so the page can never show "not connected" while a usable token remains.
  await supabaseAdmin.from("profiles").update({ google_connected: false }).eq("id", user.id)

  return NextResponse.json({
    ok: true,
    // The caller needs to tell the agent the truth about Google's side specifically.
    revoked: revoked === "revoked",
    reason: revoked,
  })
}
