
export const dynamic = "force-dynamic"

import DashboardClient from "@/components/crm/DashboardClient"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { DEMO_ALL_LEADS, DEMO_NEXT_ACTIONS, DEMO_FAVORITES } from "@/lib/demo/demoWorkspace"

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
  const { data, error } = await supabaseAdmin
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
  const { data, error } = await supabaseAdmin
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

// Favorites Phase 1 — manual only, no filtering by status (there isn't
// one yet), just every saved favorite across all leads.
async function getFavorites() {
  const { data, error } = await supabaseAdmin
    .from("lead_favorites")
    .select("*")
    .order("created_at", { ascending: true })

  if (error) {
    console.error("Error fetching favorites:", error.message)
    return []
  }

  return data || []
}

// When the signed-in user's profile has demo_mode on, the CRM opens on a
// fully populated sample workspace (client-side fixtures) instead of the real
// shared leads — nothing is written to the leads table. See lib/demo.
// first_name personalizes the demo welcome banner.
type AgentProfile = { name: string; brokerage: string; phone: string; email: string }

async function getProfileContext(): Promise<{ demoMode: boolean; firstName: string; googleConnected: boolean; agent: AgentProfile }> {
  const emptyAgent: AgentProfile = { name: "", brokerage: "", phone: "", email: "" }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { demoMode: false, firstName: "", googleConnected: false, agent: emptyAgent }
  const { data: profile } = await supabase
    .from("profiles")
    .select("demo_mode, first_name, last_name, preferred_name, email, brokerage, phone_number, google_connected")
    .eq("id", user.id)
    .single()
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
  return {
    demoMode: !!profile?.demo_mode,
    firstName: preferred || (profile?.first_name ?? ""),
    googleConnected: !!profile?.google_connected,
    agent,
  }
}

export default async function Page() {
  const { demoMode, firstName, googleConnected, agent } = await getProfileContext()

  if (demoMode) {
    return (
      <DashboardClient
        leads={DEMO_ALL_LEADS}
        nextActions={DEMO_NEXT_ACTIONS}
        favorites={DEMO_FAVORITES}
        demoMode
        firstName={firstName}
        googleConnected={googleConnected}
        agent={agent}
      />
    )
  }

  const [leads, nextActions, favorites] = await Promise.all([
    getLeads(),
    getOpenNextActions(),
    getFavorites(),
  ])

  return <DashboardClient leads={leads} nextActions={nextActions} favorites={favorites} agent={agent} />
}