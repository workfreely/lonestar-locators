"use client"

import { useCallback, useEffect, useState } from "react"
import AgentLibraryTab from "./AgentLibraryTab"
import AgentCalendarTab from "./AgentCalendarTab"
import AgentAccountsTab from "./AgentAccountsTab"
import AgentPropertyPanel from "./AgentPropertyPanel"

// SOCIAL BEAST — AGENT DASHBOARD SHELL.
//
// Three tabs, four summary counts, one details panel. Deliberately smaller than the admin shell:
// an agent's whole job here is to look at what is available, decide, and check what is going out.
//
// STAGE 3 IS READ-ONLY. Approve, Skip, Start and Pause are rendered as DISABLED so the shape of
// the finished screen is reviewable, and so a half-wired control cannot write anything before the
// decision routes exist and have been tested. Nothing in this file posts, patches or deletes.
export type AgentVideo = {
  contentId: string
  propertyName: string | null
  city: string | null
  propertyType: string | null
  startingPrice: string | null
  pricingLastVerified: string | null
  durationSeconds: number | null
  status: string
  postId: string | null
  scheduledAt: string | null
}

type Tab = "Library" | "Calendar" | "Accounts"
const TABS: Tab[] = ["Library", "Calendar", "Accounts"]

export default function AgentSocialClient() {
  const [tab, setTab] = useState<Tab>("Library")
  const [videos, setVideos] = useState<AgentVideo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  // The details panel is owned HERE, not by a tab, because both Library and Calendar open the
  // same one — the promise being that a property reads identically wherever it is clicked.
  const [detailsFor, setDetailsFor] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch("/api/agent/social/library")
      if (!res.ok) { setError(res.status === 403 ? "Your account is not enabled for Social Beast." : "Couldn't load your library."); setVideos([]); return }
      const j = (await res.json()) as { videos?: AgentVideo[] }
      setVideos(j.videos ?? [])
    } catch {
      setError("Couldn't load your library.")
      setVideos([])
    }
  }, [])
  useEffect(() => { void load() }, [load])

  const all = videos ?? []
  const counts = {
    available: all.length,
    approved: all.filter((v) => v.status === "Approved" || v.status === "Scheduled" || v.status === "Published").length,
    scheduled: all.filter((v) => v.status === "Scheduled").length,
  }

  return (
    <div className="min-h-screen bg-[var(--crm-workspace)] text-[var(--crm-text-primary)]">
      <div className="mx-auto max-w-6xl px-5 py-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight">Social Beast</h1>
            <p className="text-[12.5px] text-[var(--crm-text-muted)]">Agent Dashboard</p>
          </div>
          {/* Autoposting state is a FACT about the account, so it is shown even though the control
              that changes it is not wired yet. Paused is the honest value today. */}
          <span className="rounded-full border border-[var(--crm-border)] px-3 py-1 text-[11.5px] text-[var(--crm-text-muted)]">
            Autoposting: Paused
          </span>
        </header>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Available videos" value={videos === null ? "—" : String(counts.available)} />
          <Stat label="Approved" value={videos === null ? "—" : String(counts.approved)} />
          <Stat label="Scheduled" value={videos === null ? "—" : String(counts.scheduled)} />
          <Stat label="Autoposting" value="Paused" />
        </div>

        <nav className="mt-5 flex gap-1 rounded-lg bg-[var(--crm-card)] p-1" role="tablist">
          {TABS.map((t) => (
            <button
              key={t} role="tab" aria-selected={tab === t} type="button"
              onClick={() => setTab(t)}
              className={`flex-1 rounded-md px-3 py-2 text-[13px] transition-colors ${
                tab === t ? "bg-[var(--crm-workspace)] font-medium text-[var(--crm-text-primary)]" : "text-[var(--crm-text-muted)] hover:text-[var(--crm-text-primary)]"
              }`}
            >{t}</button>
          ))}
        </nav>

        {error && <p className="mt-4 rounded-md border border-[var(--crm-border)] px-3 py-2 text-[12.5px] text-amber-400">{error}</p>}

        <div className="mt-4">
          {tab === "Library" && <AgentLibraryTab videos={videos} onOpen={setDetailsFor} />}
          {tab === "Calendar" && <AgentCalendarTab videos={all} onOpen={setDetailsFor} />}
          {tab === "Accounts" && <AgentAccountsTab />}
        </div>
      </div>

      {detailsFor && <AgentPropertyPanel contentId={detailsFor} onClose={() => setDetailsFor(null)} />}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--crm-border)] bg-[var(--crm-card)] px-3 py-2.5">
      <div className="text-[10.5px] uppercase tracking-wide text-[var(--crm-text-muted)]">{label}</div>
      <div className="mt-0.5 text-[18px] font-semibold tabular-nums">{value}</div>
    </div>
  )
}
