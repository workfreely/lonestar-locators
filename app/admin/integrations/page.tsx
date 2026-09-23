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
  // Account-level Automated Texting authorization (private/internal rollout),
  // resolved server-side via the same SECURITY DEFINER RPC the Profile page uses.
  // Gates the account-level Automated Texting row in the Mac + iPhone card — an
  // unauthorized account never receives the flag, so the row never renders.
  let automatedTextingAuthorized = false
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("google_connected")
      .eq("id", user.id)
      .maybeSingle()
    googleConnected = !!profile?.google_connected

    const { data: autoTx } = await supabase.rpc("is_automated_texting_authorized", { p_user_id: user.id })
    automatedTextingAuthorized = autoTx === true
  }

  return <IntegrationsClient googleConnected={googleConnected} automatedTextingAuthorized={automatedTextingAuthorized} />
}
