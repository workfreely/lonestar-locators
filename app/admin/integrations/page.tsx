export const dynamic = "force-dynamic"

import IntegrationsClient from "@/components/crm/integrations/IntegrationsClient"
import { createClient } from "@/lib/supabase/server"

export default async function IntegrationsPage() {
  // Reflect the agent's existing Google connection so the Integrations page can
  // label the action Connect vs Reconnect. Read-only — the source of truth is
  // profiles.google_connected, set by the existing /api/google/callback.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let googleConnected = false
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("google_connected")
      .eq("id", user.id)
      .maybeSingle()
    googleConnected = !!profile?.google_connected
  }

  return <IntegrationsClient googleConnected={googleConnected} />
}
