import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { isAgentBetaUser } from "@/lib/social/agentBeta"
import AgentSocialClient from "@/components/crm/social/agent/AgentSocialClient"

export const dynamic = "force-dynamic"

// SOCIAL BEAST — THE AGENT VIEW.
//
// A SEPARATE PAGE FROM /admin/social-autopilot, not a variant of it. The admin surface keeps its
// editor, its templates, its property controls and its scheduler; this one is read-only and
// agent-scoped. Sharing a page and branching on a role is how an admin control ends up one
// forgotten condition away from an agent's screen.
//
// THE GATE HERE IS NOT THE PROTECTION. It redirects early so a non-beta user gets the CRM instead
// of an empty dashboard, but every byte this page goes on to show arrives through /api/agent/*,
// and each of those routes re-runs requireSocialAgent for itself. Deleting this check would be
// untidy; it would not expose anything.
export default async function AgentSocialPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")
  if (!isAgentBetaUser(user.id)) redirect("/admin/leads")
  return <AgentSocialClient />
}
