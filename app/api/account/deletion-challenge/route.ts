export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { rateLimit } from "@/lib/rateLimit"

// Emails a 6-digit nonce the user must echo back to confirm deletion.
//
// WHY A NONCE RATHER THAN A PASSWORD: only 1 of the current 5 accounts has a
// password — the rest signed in with Google and have none. reauthenticate()
// works for any account with an email regardless of provider, so it is the only
// gate that covers everyone. It also proves current control of the mailbox that
// owns the account, which is the property we actually want.
export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const limit = rateLimit(`deletion-challenge:${user.id}`, 5, 15 * 60_000)
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    )
  }

  const { error } = await supabase.auth.reauthenticate()
  if (error) {
    console.error("[account/deletion-challenge]", error.message)
    return NextResponse.json({ error: "Could not send the confirmation code" }, { status: 500 })
  }
  return NextResponse.json({ sent: true })
}
