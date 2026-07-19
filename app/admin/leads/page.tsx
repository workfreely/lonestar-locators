
export const dynamic = "force-dynamic"

import DashboardClient from "@/components/crm/DashboardClient"
import { supabaseAdmin } from "@/lib/supabase/admin"

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

export default async function Page() {
  const [leads, nextActions, favorites] = await Promise.all([
    getLeads(),
    getOpenNextActions(),
    getFavorites(),
  ])

  return <DashboardClient leads={leads} nextActions={nextActions} favorites={favorites} />
}