
export const dynamic = "force-dynamic"

import DashboardClient from "@/components/crm/DashboardClient"
import { createClient } from "@/lib/supabase/server"
import { resolveAgentIdentityForOwner, type ResolvedAgentIdentity } from "@/lib/notifications/agentSignature"
import { resolveUserTimeZone } from "@/lib/timezone/server"
import { DEFAULT_TIMEZONE } from "@/lib/timezone"
import { DEMO_ALL_LEADS, DEMO_NEXT_ACTIONS, DEMO_FAVORITES, DEMO_RECOMMENDATIONS, DEFAULT_AVG_COMMISSION_PER_LEASE } from "@/lib/demo/demoWorkspace"

// Fallback per-close commission when a profile hasn't set its own — matches
// the dashboard's REVENUE_PER_CLOSE default. Drives Beast Milestone thresholds.
const DEFAULT_AVG_COMMISSION = 1_000

function dedupeLeads(leads: any[]) {
  const seen = new Set()

  return leads.filter((lead) => {
    const key =
      lead.phone ||
      lead.email ||
      `${lead.first_name}-${lead.last_name}-${lead.move_date}`

    if (seen.has(key)) return false

    seen.add(key)
    return true
  })
}

async function getLeads() {
  // Authenticated, RLS-enforced client — scopes to the caller's workspace via
  // is_active_workspace_member(workspace_id). NOT the service-role client.
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100)

  if (error) {
    console.error("Error fetching leads:", error.message)
    return []
  }

  return dedupeLeads(data || [])
}

// Only open (uncompleted) manual Next Actions — completed ones don't
// participate in the unified queue or ranking, so there's no reason to
// ship them to the client on every page load.
async function getOpenNextActions() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("lead_next_actions")
    .select("*")
    .eq("completed", false)
    .order("due_at", { ascending: true })

  if (error) {
    console.error("Error fetching next actions:", error.message)
    return []
  }

  return data || []
}

// Pending-outreach events — the most recent NON-successful outreach per lead
// (a No-Answer call = 'contact_attempt', or a sent-but-unanswered text =
// 'text_sent'). Ordered newest-first so the client keeps the first (latest) it
// sees per lead. This is what turns a still-New lead's Follow Up into "Called —
// No Answer" / "No Answer" vs "Sent Text" / "Waiting for Reply". RLS-scoped.
async function getLatestOutreach() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("lead_timeline")
    .select("lead_id, type, method, occurred_at")
    .in("type", ["contact_attempt", "text_sent"])
    .order("occurred_at", { ascending: false })
    .limit(500)

  if (error) {
    console.error("Error fetching outreach timeline:", error.message)
    return []
  }

  return data || []
}

// Favorites Phase 1 — manual only, no filtering by status (there isn't
// one yet), just every saved favorite across all leads.
async function getFavorites() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("lead_favorites")
    .select("*")
    .order("created_at", { ascending: true })

  if (error) {
    console.error("Error fetching favorites:", error.message)
    return []
  }

  return data || []
}

// Recommendations — canonical per-client lead_recommendations, same read pattern
// as favorites (every saved recommendation across all leads; the UI + Companion
// payload filter by lead_id).
async function getRecommendations() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("lead_recommendations")
    .select("*")
    .order("created_at", { ascending: true })

  if (error) {
    console.error("Error fetching recommendations:", error.message)
    return []
  }

  return data || []
}

// Scheduled tours — the canonical lead_tours appointments (source of truth) used
// read-only in the Workspace to surface "Tour Scheduled" under the linked
// Favorite. Only status='scheduled' rows are fetched; the client picks the
// upcoming one per Favorite (see selectUpcomingTour).
async function getScheduledTours() {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("lead_tours")
    .select("id, lead_id, property_id, scheduled_at, status")
    .eq("status", "scheduled")
    .order("scheduled_at", { ascending: true })

  if (error) {
    console.error("Error fetching tours:", error.message)
    return []
  }

  return data || []
}

// When the signed-in user's profile has demo_mode on, the CRM opens on a
// fully populated sample workspace (client-side fixtures) instead of the real
// shared leads — nothing is written to the leads table. See lib/demo.
// first_name personalizes the demo welcome banner.
type AgentProfile = { name: string; brokerage: string; phone: string; email: string }

async function getProfileContext(): Promise<{ demoMode: boolean; firstName: string; googleConnected: boolean; agent: AgentProfile; signature: ResolvedAgentIdentity | null; avgCommission: number; timeZone: string; companionOwner: string; userId: string }> {
  const emptyAgent: AgentProfile = { name: "", brokerage: "", phone: "", email: "" }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { demoMode: false, firstName: "", googleConnected: false, agent: emptyAgent, signature: null, avgCommission: DEFAULT_AVG_COMMISSION, timeZone: DEFAULT_TIMEZONE, companionOwner: "", userId: "" }
  const { data: profile } = await supabase
    .from("profiles")
    .select("demo_mode, first_name, last_name, preferred_name, email, brokerage, phone_number, google_connected, avg_commission_per_lease")
    .eq("id", user.id)
    .single()

  // Authoritative locator timezone (profiles → workspaces → America/Chicago), so
  // client-created + demo workflow dates AND display use the saved zone — never
  // the browser's device zone. Same resolver the server routes use.
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle()
  // Opaque owner key for Beast Companion. Both halves are server-derived from the
  // authenticated session — never from the browser — so the extension's stored
  // records are bound to an identity the page cannot forge.
  const companionOwner = `${user.id}:${membership?.workspace_id ?? ""}`
  const timeZone = await resolveUserTimeZone(supabase, user.id, membership?.workspace_id ?? null)
  // Preferred Name is the display name shown throughout Locator Beast; the
  // legal first/last name is the fallback when it isn't set.
  const preferred = (profile?.preferred_name ?? "").trim()
  const legalFull = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ")
  const agent: AgentProfile = {
    name: preferred || legalFull,
    brokerage: profile?.brokerage ?? "",
    phone: profile?.phone_number ?? "",
    email: profile?.email ?? user.email ?? "",
  }
  // Full identity for the shared guest-card disclosure + signature, resolved from
  // the signed-in locator (the CORRECT workspace owner for their own guest cards).
  const signature = await resolveAgentIdentityForOwner(supabase, user.id)
  return {
    demoMode: !!profile?.demo_mode,
    firstName: preferred || (profile?.first_name ?? ""),
    googleConnected: !!profile?.google_connected,
    agent,
    signature,
    avgCommission: Number(profile?.avg_commission_per_lease) || DEFAULT_AVG_COMMISSION,
    timeZone,
    companionOwner,
    userId: user.id,
  }
}

// Beast Voice alpha gate. Authorization comes from the SAME source the Beast
// Network admin console uses — the is_platform_admin() SECURITY DEFINER function
// over the platform_admins table, which has no write policy, so a user cannot
// self-elevate. Resolved on the server and passed down as a plain boolean; the
// client never decides who is an admin.
async function isPlatformAdmin(): Promise<boolean> {
  const supabase = await createClient()
  const { data } = await supabase.rpc("is_platform_admin")
  return Boolean(data)
}

export default async function Page() {
  const { demoMode, firstName, googleConnected, agent, signature, avgCommission, timeZone, companionOwner, userId } = await getProfileContext()
  const voiceEnabled = await isPlatformAdmin()

  if (demoMode) {
    return (
      <DashboardClient
        leads={DEMO_ALL_LEADS}
        nextActions={DEMO_NEXT_ACTIONS}
        favorites={DEMO_FAVORITES}
        recommendations={DEMO_RECOMMENDATIONS}
        outreach={[]}
        tours={[]}
        demoMode
        firstName={firstName}
        googleConnected={googleConnected}
        agent={agent}
        signature={signature}
        avgCommission={DEFAULT_AVG_COMMISSION_PER_LEASE}
        timeZone={timeZone}
        voiceEnabled={voiceEnabled}
        companionOwner={companionOwner}
        userId={userId}
      />
    )
  }

  const [leads, nextActions, favorites, recommendations, outreach, tours] = await Promise.all([
    getLeads(),
    getOpenNextActions(),
    getFavorites(),
    getRecommendations(),
    getLatestOutreach(),
    getScheduledTours(),
  ])

  return <DashboardClient leads={leads} nextActions={nextActions} favorites={favorites} recommendations={recommendations} outreach={outreach} tours={tours} agent={agent} signature={signature} avgCommission={avgCommission} timeZone={timeZone} voiceEnabled={voiceEnabled} companionOwner={companionOwner} userId={userId} />
}