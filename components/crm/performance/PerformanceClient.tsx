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
import { useFocusMode } from "@/lib/ui/useFocusMode"
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

  // Focus Mode — same pattern and same control Social Beast uses; its own per-tab key so the two
  // surfaces do not toggle each other.
  const { focus, toggle: toggleFocus } = useFocusMode("lb-analytics-focus")

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

      {/* ─── TOP NAVIGATION BAR — the shared app header ───
          Hidden in Focus Mode so the workspace reclaims the space, matching SocialAutopilotShell.
          Back to Lead Board lives here and is untouched; leaving Focus restores it. */}
      {!focus && (
        <AppHeader variant="dark" fullBleed>
          <BackToDashboard />
        </AppHeader>
      )}

      {/* ─── BODY ─── */}
      <div className={"beast-ai-clearance flex-1 overflow-y-auto space-y-5 " + (focus ? "px-5 pt-3 pb-5" : "p-5")}>

        {/* Top-level tabs, sticky against THIS scroll container. */}
        <AnalyticsTabs tab={tab} onChange={selectTab} focus={focus} onToggleFocus={toggleFocus} />

        {/* ─── SALES OVERVIEW ───────────────────────────────────────────────────────────────
            DashboardStats' own root is `bg-[var(--crm-card)] border-b ... px-5 pt-3 pb-5` — the
            Dashboard's EDGE-TO-EDGE strip. On this page it was always wrapped in a container that
            turned that strip into a page card; rendering it bare (as the first tab revision did)
            dropped the panel background, the side borders, the rounding and the shadow, so the KPI
            row read as a flat band against the workspace while every card below it stayed rounded.
            This restores that container verbatim — the same classes CollapsibleSection applies —
            WITHOUT the "Sales Overview" header, which the tab already provides.

            Nothing inside DashboardStats is touched: the icons, source dots, platform colors,
            typography, spacing and progress bars are its own and were never modified. (The legend
            dots render grey when a tracked source has no leads THIS MONTH — `s.count === 0 ?
            "#d1d5db" : s.barColor` — which is existing data-driven behaviour, not styling that
            went missing.) */}
        {tab === "overview" && (
          <>
            <div className="bg-[var(--crm-panel)] border border-[var(--crm-border)] rounded-xl overflow-hidden shadow-[0_1px_4px_rgba(var(--crm-shadow-color),0.07)]">
              <DashboardStats leads={dashboardLeads} monthlyGoal={monthlyGoal} avgCommission={avgCommission} projectionMethod={projectionMethod} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <LeadsByCityCard leads={leads} />
              <ClosedDealsByCityCard leads={leads} />
            </div>
          </>
        )}

        {/* ─── MARKETING ANALYTICS ──────────────────────────────────────────────────────────
            Summary FIRST — it is the read-at-a-glance answer, so it leads rather than sitting
            below two tables. Then the source/landing detail, then Meta. Same components, same
            props, same calculations; only their order changed. Paid vs Organic / Channel
            Performance land after Meta when they exist. */}
        {tab === "marketing" && (
          <>
            <CollapsibleSection title="Summary" storageKey="performance-metrics-expanded" defaultOpen={true}>
              <div className="p-4">
                <PerformanceStats leads={leads} />
              </div>
            </CollapsibleSection>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <LeadSourcesCard leads={leads} />
              <LandingPageTable leads={leads} />
            </div>
            {/* Meta Sales Analytics — spend → attributed lead → close → estimated commission →
                ROAS, plus a Facebook/Instagram lead breakdown. */}
            <MetaSalesAnalytics data={metaSales} />
          </>
        )}

        {/* ─── CAMPAIGNS ────────────────────────────────────────────────────────────────────
            Promoted out of Marketing Analytics to its own tab. The component is MOVED, not
            copied — same instance, same leads prop, same grouping. Future campaign-level metrics
            belong here; nothing new is built in this pass. */}
        {tab === "campaigns" && <CampaignTable leads={leads} />}

        {/* ─── MONTHLY PERFORMANCE ──────────────────────────────────────────────────────────── */}
        {tab === "monthly" && <MonthlyPerformanceHistory leads={leads} />}

      </div>
    </div>
  )
}
