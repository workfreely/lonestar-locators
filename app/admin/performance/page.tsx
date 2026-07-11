export const dynamic = "force-dynamic"

import PerformanceClient from "@/components/crm/performance/PerformanceClient"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { dedupeLeads } from "@/lib/leads/dedupeLeads"

async function getLeads() {
  const { data, error } = await supabaseAdmin
    .from("leads")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500)

  if (error) {
    console.error("Error fetching leads for performance page:", error.message)
    return []
  }

  // Deduped so "Leads" here means unique people, matching the CRM
  // Dashboard's definition — not raw form submissions. A separate "Form
  // Submissions" metric (using the undeduped array) is a Phase 2 addition.
  return dedupeLeads(data || [])
}

export default async function PerformancePage() {
  const leads = await getLeads()

  return <PerformanceClient leads={leads} />
}
