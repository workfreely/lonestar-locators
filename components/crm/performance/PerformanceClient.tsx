"use client"

import Link from "next/link"
import DashboardStats from "@/components/crm/DashboardStats"
import PerformanceStats from "./PerformanceStats"
import LeadSourcesCard from "./LeadSourcesCard"
import CampaignTable from "./CampaignTable"
import LandingPageTable from "./LandingPageTable"
import LeadsByCityCard from "./LeadsByCityCard"
import ClosedDealsByCityCard from "./ClosedDealsByCityCard"
import MonthlyPerformanceHistory from "./MonthlyPerformanceHistory"
import CollapsibleSection from "@/components/crm/CollapsibleSection"
import AppHeader from "@/components/crm/AppHeader"
import { CRM_SECONDARY_BUTTON } from "@/lib/crmButtonStyles"

// Composes the Phase 1 Performance page from the reusable pieces above.
// Deliberately thin — Phase 2 (ROI, spend, charts, funnels) adds new
// components here rather than growing this file or touching
// DashboardClient.tsx.

export default function PerformanceClient({
  leads,
  dashboardLeads,
  monthlyGoal,
  avgCommission,
}: {
  leads: any[]
  dashboardLeads: any[]
  monthlyGoal?: number
  avgCommission?: number
}) {
  return (
    <div className="relative h-screen w-full flex flex-col bg-gradient-to-b from-zinc-100 to-zinc-200 dark:from-[var(--crm-workspace)] dark:to-[var(--crm-workspace)]">

      {/* ─── TOP NAVIGATION BAR — the shared app header ─── */}
      <AppHeader variant="dark">
        <Link href="/admin/leads" className={CRM_SECONDARY_BUTTON}>
          ← Back to Dashboard
        </Link>
      </AppHeader>

      {/* ─── BODY ─── */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Business Overview — relocated here from the CRM Dashboard
            (Analytics Page Refactor). Same cards, same collapse/expand
            behavior and localStorage key as before; only its container
            styling now matches this page's own cards instead of the
            Dashboard's edge-to-edge treatment, since it no longer sits
            directly under a flex-col header. */}
        {/* Sales Overview — the high-level numbers locators check daily
            (Monthly Goal, Active Pipeline, Leads This Month, Projected
            Commission, Closed This Month); expanded by default and stays at
            the top. */}
        <CollapsibleSection title="Sales Overview" storageKey="dashboard-metrics-expanded" defaultOpen={true}>
          <DashboardStats leads={dashboardLeads} monthlyGoal={monthlyGoal} avgCommission={avgCommission} />
        </CollapsibleSection>

        {/* Operational metrics — cities, lead sources, landing pages. Most
            valuable in the daily workflow, so they sit directly under Sales
            Overview rather than behind the Marketing Analytics summary. */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <LeadsByCityCard leads={leads} />
          <ClosedDealsByCityCard leads={leads} />
        </div>

        <div className="grid grid-cols-2 gap-5">
          <LeadSourcesCard leads={leads} />
          <LandingPageTable leads={leads} />
        </div>

        {/* Marketing Analytics — a deeper, secondary marketing summary. Sales
            Overview already gives the high-level marketing numbers up top, so
            this is moved below the operational metrics and collapsed by
            default; users expand it when they want a deeper analysis. */}
        <CollapsibleSection title="Marketing Analytics" storageKey="performance-metrics-expanded" defaultOpen={false}>
          <div className="p-4">
            <PerformanceStats leads={leads} />
          </div>
        </CollapsibleSection>

        <CampaignTable leads={leads} />

        <MonthlyPerformanceHistory leads={leads} />
      </div>
    </div>
  )
}
