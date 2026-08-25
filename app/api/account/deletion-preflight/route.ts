export const runtime = "nodejs"

import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// What WOULD happen if this user deleted their account. Pure read — the
// confirmation dialog cannot state consequences truthfully without it.
//
// The RPC takes no user argument and resolves auth.uid() itself, so a caller
// can only ever inspect their own account.
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })

  const { data, error } = await supabase.rpc("lb_account_deletion_preflight")
  if (error) {
    console.error("[account/deletion-preflight]", error.message)
    return NextResponse.json({ error: "Could not load account details" }, { status: 500 })
  }
  return NextResponse.json(data)
}
