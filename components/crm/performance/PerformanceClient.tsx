"use client"

import { useCallback, useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import BackToDashboard from "@/components/crm/BackToDashboard"
import DashboardStats from "@/components/crm/DashboardStats"
import PerformanceStats from "./PerformanceStats"
import LeadSourcesCard from "./LeadSourcesCard"
import CampaignTable from "./CampaignTable"
import LandingPageTable from "./LandingPageTable"
import LeadsByCityCard from "./LeadsByCityCard"
import ClosedDealsByCityCard from "./ClosedDealsByCityCard"
import MonthlyPerformanceHistory from "./MonthlyPerformanceHistory"
import MetaSalesAnalytics from "./MetaSalesAnalytics"
import CollapsibleSection from "@/components/crm/CollapsibleSection"
import AnalyticsTabs, { DEFAULT_ANALYTICS_TAB, parseAnalyticsTab, type AnalyticsTabId } from "./AnalyticsTabs"
import AppHeader from "@/components/crm/AppHeader"
import type { ProjectionMethod } from "@/lib/leads/commissionEstimate"
import type { MetaSalesAnalytics as MetaSalesAnalyticsData } from "@/lib/meta/salesAnalytics"

// Composes the Performance page from the reusable pieces above.
// Deliberately thin — new analytics add components here rather than growing this file or touching
// DashboardClient.tsx.
//
// ── TABS ────────────────────────────────────────────────────────────────────────────────────
// The page was one long vertical stack. It is now three tabs over the SAME already-fetched data:
// every component below keeps its exact props, queries and formulas — only which branch renders
// them changed.
//
// WHY CLIENT STATE AND NOT ROUTING. app/admin/analytics/page.tsx is a force-dynamic server
// component that fetches 500 + 100 leads plus the Meta analytics on every render. Route-based tabs
// — and equally router.replace("?tab=…"), which also re-runs that server component — would refetch
// all of it on every tab click. Holding the tab in client state and writing the URL with
// history.replaceState keeps switching instant and the fetch count at one, while the ?tab= value
// stays shareable and survives a refresh.

export default function PerformanceClient({
  leads,
  dashboardLeads,
  monthlyGoal,
  avgCommission,
  projectionMethod,
  metaSales = null,
}: {
  leads: any[]
  dashboardLeads: any[]
  monthlyGoal?: number
  avgCommission?: number
  projectionMethod?: ProjectionMethod
  metaSales?: MetaSalesAnalyticsData | null
}) {
  // Initial tab comes from ?tab= (once, on mount); an absent or unrecognised value falls back to
  // Sales Overview rather than rendering nothing.
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<AnalyticsTabId>(DEFAULT_ANALYTICS_TAB)
  useEffect(() => {
    setTab(parseAnalyticsTab(searchParams?.get("tab")))
  }, [searchParams])

  const selectTab = useCallback((next: AnalyticsTabId) => {
    setTab(next)
    // history.replaceState, NOT router.replace: this updates the address bar without re-entering
    // Next's router, so the force-dynamic server component never re-runs and no data is refetched.
    // replaceState (not pushState) keeps Back leaving the Analytics page rather than walking the
    // user through every tab they happened to click.
    try {
      const url = new URL(window.location.href)
      if (next === DEFAULT_ANALYTICS_TAB) url.searchParams.delete("tab")
      else url.searchParams.set("tab", next)
      window.history.replaceState(null, "", url.toString())
    } catch {
      /* URL manipulation must never break the page — the tab still switches */
    }
  }, [])

  return (
    <div className="relative h-screen w-full flex flex-col bg-gradient-to-b from-zinc-100 to-zinc-200 dark:from-[var(--crm-workspace)] dark:to-[var(--crm-workspace)]">

      {/* ─── TOP NAVIGATION BAR — the shared app header ─── */}
      <AppHeader variant="dark" fullBleed>
        <BackToDashboard />
      </AppHeader>

      {/* ─── BODY ─── */}
      <div className="beast-ai-clearance flex-1 overflow-y-auto p-5 space-y-5">

        {/* Top-level tabs, sticky against THIS scroll container. */}
        <AnalyticsTabs tab={tab} onChange={selectTab} />

        {/* ─── SALES OVERVIEW ───────────────────────────────────────────────────────────────
            The KPI strip renders BARE. It used to sit inside a CollapsibleSection also titled
            "Sales Overview"; behind a tab of the same name that header was a duplicate label and
            a way to hide the page's primary content one click after arriving at it. */}
        {tab === "overview" && (
          <>
            <DashboardStats leads={dashboardLeads} monthlyGoal={monthlyGoal} avgCommission={avgCommission} projectionMethod={projectionMethod} />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <LeadsByCityCard leads={leads} />
              <ClosedDealsByCityCard leads={leads} />
            </div>
          </>
        )}

        {/* ─── MARKETING ANALYTICS ──────────────────────────────────────────────────────────
            Same components as before, same props. The old "Marketing Analytics" CollapsibleSection
            around PerformanceStats is gone for the same reason as above — the tab already carries
            that label — so the summary is visible on arrival. Campaigns and Meta Sales keep their
            own collapsible headers because those are genuinely distinct subsections, but they now
            open by default (see defaultOpen) instead of greeting the tab with a wall of collapsed
            rows. */}
        {tab === "marketing" && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <LeadSourcesCard leads={leads} />
              <LandingPageTable leads={leads} />
            </div>
            <CollapsibleSection title="Summary" storageKey="performance-metrics-expanded" defaultOpen={true}>
              <div className="p-4">
                <PerformanceStats leads={leads} />
              </div>
            </CollapsibleSection>
            <CampaignTable leads={leads} />
            {/* Meta Sales Analytics — spend → attributed lead → close → estimated commission →
                ROAS, plus a Facebook/Instagram lead breakdown. */}
            <MetaSalesAnalytics data={metaSales} />
          </>
        )}

        {/* ─── MONTHLY PERFORMANCE ──────────────────────────────────────────────────────────── */}
        {tab === "monthly" && <MonthlyPerformanceHistory leads={leads} />}

      </div>
    </div>
  )
}
