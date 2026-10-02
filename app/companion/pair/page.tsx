import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import PairClient from "./PairClient"

// The pairing approve screen the macOS Companion opens in the browser
// (loopback OAuth-style). Requires a logged-in session; on approval the client
// mints a device token and redirects back to the companion's local listener.
//
// WHY THIS PAGE NAMES THE ACCOUNT. Beast Sync opens the system default browser,
// which is not necessarily the browser the locator works in. A Mac paired from
// the wrong signed-in session binds to the wrong workspace, and because the
// device token carries workspace ownership, that Mac would then upload its
// owner's personal iMessages into someone else's CRM. That happened once: a Mac
// paired to Sarah Mitchell's workspace from a Safari session while the locator
// worked in Chrome. It was caught before any sync, but nothing on this screen
// would have revealed it. The identity block below exists so the approval is a
// decision, not an assumption.
export default async function CompanionPairPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const sp = await searchParams
  const port = typeof sp.port === "string" ? sp.port : ""
  const state = typeof sp.state === "string" ? sp.state : ""

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    const qs = new URLSearchParams()
    if (port) qs.set("port", port)
    if (state) qs.set("state", state)
    redirect(`/login?next=${encodeURIComponent(`/companion/pair?${qs.toString()}`)}`)
  }

  // Identity shown on the approval card. Read with the CALLER'S session (RLS), so
  // this can only ever describe the account that is actually signed in here —
  // which is the whole point. All three are presentational; the token is still
  // minted server-side from the session by /api/companion/pair, never from these.
  const { data: profile } = await supabase
    .from("profiles")
    .select("preferred_name, first_name, last_name")
    .eq("id", user.id)
    .maybeSingle()

  // Same membership lookup requireWorkspaceMember performs, so the workspace
  // named here is the one the token will actually be bound to.
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle()

  let workspaceName: string | null = null
  if (membership?.workspace_id) {
    const { data: ws } = await supabase
      .from("workspaces")
      .select("name")
      .eq("id", membership.workspace_id)
      .maybeSingle()
    workspaceName = (ws?.name as string | null) ?? null
  }

  const displayName =
    (profile?.preferred_name as string | null)?.trim() ||
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() ||
    null

  return (
    <PairClient
      port={port}
      state={state}
      email={user.email ?? null}
      displayName={displayName}
      workspaceName={workspaceName}
    />
  )
}
