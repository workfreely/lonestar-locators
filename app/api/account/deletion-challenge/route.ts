export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { rateLimit } from "@/lib/rateLimit"
import { sendNotification, deletionCodeEmail } from "@/lib/notifications"

// Issues the 6-digit code that authorises permanent account deletion.
//
// WHY WE OWN THE CODE: this used to call supabase.auth.reauthenticate() and let
// the delete route "verify" the result with updateUser({ email, nonce }). That
// verification never happened — re-setting the user's own email is a no-op, so
// GoTrue demanded no reauthentication and accepted any code, or none. supabase-js
// has no call that verifies a reauthentication nonce on its own (the nonce is
// only checked alongside a password change, which Google-only accounts cannot
// perform), so the code is ours end to end. That also makes the flow identical
// for password and Google-only accounts.
//
// The code is generated, hashed and stored by lb_create_deletion_challenge; only
// the plaintext returned here is ever sent, and it is never persisted.
export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  // First of two limits. This one is per-process and immediate; the SQL function
  // enforces the durable one (3 codes / 15 min) that survives restarts and spans
  // instances.
  const limit = rateLimit(`deletion-challenge:${user.id}`, 5, 15 * 60_000)
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    )
  }

  // user.id comes from the verified session — never from the request body.
  const { data, error } = await supabaseAdmin.rpc("lb_create_deletion_challenge", { p_user_id: user.id })
  if (error) {
    if (error.message.includes("rate_limited")) {
      return NextResponse.json(
        { error: "Too many codes requested. Please try again later." },
        { status: 429 }
      )
    }
    console.error("[account/deletion-challenge]", error.message)
    return NextResponse.json({ error: "Could not send the confirmation code" }, { status: 500 })
  }

  const code = (data as { code?: string } | null)?.code
  if (!code) {
    console.error("[account/deletion-challenge] no code returned")
    return NextResponse.json({ error: "Could not send the confirmation code" }, { status: 500 })
  }

  const sent = await sendNotification({
    to: user.email ?? "",
    ...deletionCodeEmail({ code, minutes: 10 }),
  })
  if (!sent.ok) {
    // The challenge row already exists; issuing another code simply supersedes
    // it, so there is nothing to roll back.
    console.error("[account/deletion-challenge] send failed:", sent.error)
    return NextResponse.json({ error: "Could not send the confirmation code" }, { status: 500 })
  }

  return NextResponse.json({ sent: true })
}
