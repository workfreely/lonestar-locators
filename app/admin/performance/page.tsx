export const dynamic = "force-dynamic"

import PerformanceClient from "@/components/crm/performance/PerformanceClient"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { dedupeLeads } from "@/lib/leads/dedupeLeads"
import {
  DEMO_ALL_LEADS,
  DEFAULT_MONTHLY_COMMISSION_GOAL,
  DEFAULT_AVG_COMMISSION_PER_LEASE,
} from "@/lib/demo/demoWorkspace"

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

// Read the signed-in user's demo flag + commission goals so analytics are
// goal-driven and reflect the sample workspace when demo_mode is on.
async function getProfileContext() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { demoMode: false, monthlyGoal: DEFAULT_MONTHLY_COMMISSION_GOAL, avgCommission: DEFAULT_AVG_COMMISSION_PER_LEASE }
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("demo_mode, monthly_commission_goal, avg_commission_per_lease")
    .eq("id", user.id)
    .single()
  return {
    demoMode: !!profile?.demo_mode,
    monthlyGoal: profile?.monthly_commission_goal ?? DEFAULT_MONTHLY_COMMISSION_GOAL,
    avgCommission: profile?.avg_commission_per_lease ?? DEFAULT_AVG_COMMISSION_PER_LEASE,
  }
}

export default async function PerformancePage() {
  const { demoMode, monthlyGoal, avgCommission } = await getProfileContext()

  if (demoMode) {
    return (
      <PerformanceClient
        leads={DEMO_ALL_LEADS}
        dashboardLeads={DEMO_ALL_LEADS}
        monthlyGoal={monthlyGoal}
        avgCommission={avgCommission}
      />
    )
  }

  const [leads, dashboardLeads] = await Promise.all([getLeads(), getDashboardLeads()])

  return (
    <PerformanceClient
      leads={leads}
      dashboardLeads={dashboardLeads}
      monthlyGoal={monthlyGoal}
      avgCommission={avgCommission}
    />
  )
}
