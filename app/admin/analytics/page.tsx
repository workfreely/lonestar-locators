export const dynamic = "force-dynamic"

import PerformanceClient from "@/components/crm/performance/PerformanceClient"
import { createClient } from "@/lib/supabase/server"
import { dedupeLeads } from "@/lib/leads/dedupeLeads"
import {
  DEMO_ALL_LEADS,
  DEFAULT_MONTHLY_COMMISSION_GOAL,
  DEFAULT_AVG_COMMISSION_PER_LEASE,
} from "@/lib/demo/demoWorkspace"
import { DEFAULT_PROJECTION_METHOD, type ProjectionMethod } from "@/lib/leads/commissionEstimate"
import { loadMetaSalesAnalytics } from "@/lib/meta/loadSalesAnalytics"

async function getLeads() {
  // Authenticated, RLS-enforced client — scopes to the caller's workspace.
  const supabase = await createClient()
  const { data, error } = await supabase
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
  const supabase = await createClient()
  const { data, error } = await supabase
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

// YEAR-SCOPED set for the Yearly Overview row. A SEPARATE query on purpose — Business Overview's
// own 100-lead window stays exactly as it is, so no monthly calculation changes.
//
// WHY IT CANNOT REUSE EITHER EXISTING SCOPE: both are "newest N by created_at". A year total taken
// from them silently under-counts the moment the workspace passes N leads in a year, with nothing
// on screen to say so. It also misses the case that matters most for revenue — a lead CREATED last
// year that CLOSED this year, which is in neither window but belongs in both yearly totals.
//
// So the filter is an OR on the two dates that define the year's work: created this year, or closed
// this year. `.or()` is a single round trip; the limit is a sanity ceiling, not a window.
async function getYearLeads() {
  const supabase = await createClient()
  const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString()
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .or(`created_at.gte.${yearStart},closed_at.gte.${yearStart}`)
    .order("created_at", { ascending: false })
    .limit(5000)

  if (error) {
    console.error("Error fetching leads for Yearly Overview:", error.message)
    return []
  }

  // Deduped by the same rule as every other scope, so "leads this year" means unique people.
  return dedupeLeads(data || [])
}

// Read the signed-in user's demo flag + commission goals so analytics are
// goal-driven and reflect the sample workspace when demo_mode is on.
async function getProfileContext() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { demoMode: false, monthlyGoal: DEFAULT_MONTHLY_COMMISSION_GOAL, avgCommission: DEFAULT_AVG_COMMISSION_PER_LEASE, projectionMethod: DEFAULT_PROJECTION_METHOD }
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("demo_mode, monthly_commission_goal, avg_commission_per_lease, projection_method")
    .eq("id", user.id)
    .single()
  return {
    demoMode: !!profile?.demo_mode,
    monthlyGoal: profile?.monthly_commission_goal ?? DEFAULT_MONTHLY_COMMISSION_GOAL,
    avgCommission: profile?.avg_commission_per_lease ?? DEFAULT_AVG_COMMISSION_PER_LEASE,
    projectionMethod: (profile?.projection_method as ProjectionMethod) ?? DEFAULT_PROJECTION_METHOD,
  }
}

export default async function PerformancePage() {
  const { demoMode, monthlyGoal, avgCommission, projectionMethod } = await getProfileContext()

  if (demoMode) {
    return (
      <PerformanceClient
        leads={DEMO_ALL_LEADS}
        dashboardLeads={DEMO_ALL_LEADS}
        yearLeads={DEMO_ALL_LEADS}
        monthlyGoal={monthlyGoal}
        avgCommission={avgCommission}
        projectionMethod={projectionMethod}
      />
    )
  }

  const [leads, dashboardLeads, yearLeads] = await Promise.all([getLeads(), getDashboardLeads(), getYearLeads()])

  // Meta Sales Analytics — reuses the RLS-scoped lead set for attribution and
  // reads the workspace's synced Meta performance through the same client.
  const supabase = await createClient()
  const metaSales = await loadMetaSalesAnalytics(supabase, leads, {
    method: projectionMethod,
    avgCommission,
  })

  return (
    <PerformanceClient
      leads={leads}
      dashboardLeads={dashboardLeads}
      yearLeads={yearLeads}
      monthlyGoal={monthlyGoal}
      avgCommission={avgCommission}
      projectionMethod={projectionMethod}
      metaSales={metaSales}
    />
  )
}
