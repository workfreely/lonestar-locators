"use client"

import Link from "next/link"
import PerformanceStats from "./PerformanceStats"
import LeadSourcesCard from "./LeadSourcesCard"
import CampaignTable from "./CampaignTable"
import LandingPageTable from "./LandingPageTable"

// Composes the Phase 1 Performance page from the reusable pieces above.
// Deliberately thin — Phase 2 (ROI, spend, charts, funnels) adds new
// components here rather than growing this file or touching
// DashboardClient.tsx.

export default function PerformanceClient({ leads }: { leads: any[] }) {
  return (
    <div className="relative h-screen w-full flex flex-col bg-gradient-to-b from-zinc-100 to-zinc-200">

      {/* ─── TOP NAVIGATION BAR — same language as DashboardClient's header ─── */}
      <header className="relative z-30 flex-none h-10 bg-white border-b border-gray-200 flex items-center px-5 gap-4 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
        <div className="flex items-center gap-2.5 mr-4">
          <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 10L7 4L12 10" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <span className="font-bold text-[18px] text-gray-900 tracking-tight">Performance</span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/admin/leads"
            className="inline-flex items-center gap-1.5 text-gray-600 hover:text-gray-900 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            ← Leads
          </Link>
        </div>
      </header>

      {/* ─── BODY ─── */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        <PerformanceStats leads={leads} />

        <div className="grid grid-cols-2 gap-5">
          <LeadSourcesCard leads={leads} />
          <LandingPageTable leads={leads} />
        </div>

        <CampaignTable leads={leads} />
      </div>
    </div>
  )
}
