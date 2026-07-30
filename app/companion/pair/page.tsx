import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import PairClient from "./PairClient"

// The pairing approve screen the macOS Companion opens in the browser
// (loopback OAuth-style). Requires a logged-in session; on approval the client
// mints a device token and redirects back to the companion's local listener.
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

  return <PairClient port={port} state={state} />
}
