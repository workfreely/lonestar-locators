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

// Business Overview (formerly the CRM Dashboard's "Dashboard Metrics")
// moved here as part of the Analytics Page Refactor — its cards must keep
// computing from the exact same data scope they always did (the CRM
// Dashboard's own 100-lead query, see app/admin/leads/page.tsx's
// getLeads()), not this page's own 500-lead window used by every other
// Analytics section. Fetched separately so neither scope leaks into the
// other and no calculation actually changes.
async function getDashboardLeads() {
  const { data, error } = await supabaseAdmin
    .from("leads")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100)

  if (error) {
    console.error("Error fetching leads for Business Overview:", error.message)
    return []
  }

  return dedupeLeads(data || [])
}

export default async function PerformancePage() {
  const [leads, dashboardLeads] = await Promise.all([getLeads(), getDashboardLeads()])

  return <PerformanceClient leads={leads} dashboardLeads={dashboardLeads} />
}
