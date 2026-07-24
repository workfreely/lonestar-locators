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
import MarketingToolsCard from "./MarketingToolsCard"
import CollapsibleSection from "@/components/crm/CollapsibleSection"
import Logo from "@/components/crm/Logo"
import ProfileAvatarMenu from "@/components/crm/ProfileAvatarMenu"
import { CRM_SECONDARY_BUTTON } from "@/lib/crmButtonStyles"

// Composes the Phase 1 Performance page from the reusable pieces above.
// Deliberately thin — Phase 2 (ROI, spend, charts, funnels) adds new
// components here rather than growing this file or touching
// DashboardClient.tsx.

export default function PerformanceClient({ leads, dashboardLeads }: { leads: any[]; dashboardLeads: any[] }) {
  return (
    <div className="relative h-screen w-full flex flex-col bg-gradient-to-b from-zinc-100 to-zinc-200 dark:from-[var(--crm-workspace)] dark:to-[var(--crm-workspace)]">

      {/* ─── TOP NAVIGATION BAR — same shell as DashboardClient's header ─── */}
      <header className="crm-header relative z-30 flex-none py-2 bg-[var(--crm-panel)] border-b border-[var(--crm-border)] flex items-center px-5 gap-4 shadow-[0_1px_3px_rgba(var(--crm-shadow-color),0.06)]">
        <Logo />

        <div className="ml-auto flex items-center gap-2">
          <Link href="/admin/leads" className={CRM_SECONDARY_BUTTON}>
            ← Back to Dashboard
          </Link>
          <ProfileAvatarMenu />
        </div>
      </header>

      {/* ─── BODY ─── */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Business Overview — relocated here from the CRM Dashboard
            (Analytics Page Refactor). Same cards, same collapse/expand
            behavior and localStorage key as before; only its container
            styling now matches this page's own cards instead of the
            Dashboard's edge-to-edge treatment, since it no longer sits
            directly under a flex-col header. */}
        <CollapsibleSection title="Business Overview" storageKey="dashboard-metrics-expanded">
          <DashboardStats leads={dashboardLeads} />
        </CollapsibleSection>

        <CollapsibleSection title="Performance Analytics" storageKey="performance-metrics-expanded">
          <div className="p-4">
            <PerformanceStats leads={leads} />
          </div>
        </CollapsibleSection>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <LeadsByCityCard leads={leads} />
          <ClosedDealsByCityCard leads={leads} />
        </div>

        <div className="grid grid-cols-2 gap-5">
          <LeadSourcesCard leads={leads} />
          <LandingPageTable leads={leads} />
        </div>

        <CampaignTable leads={leads} />

        <MonthlyPerformanceHistory leads={leads} />

        <MarketingToolsCard />
      </div>
    </div>
  )
}
