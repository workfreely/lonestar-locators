"use client"

// Meta Sales Analytics — sales-outcome view of Meta ad spend attributed to
// canonical CRM leads. Hierarchy: Overview → Campaign → Ad Set → Ad. Columns are
// deliberately outcome-focused (Spend, Leads, CPL, Tours, Applications, Closed,
// Estimated Commission, ROAS) — NOT an Ads Manager clone.
//
// Honesty: "Estimated Commission" is the frozen per-lead close snapshot, never
// actual/paid revenue. ROAS is blank when there's no spend. The Facebook/Instagram
// breakdown is a LEAD-side split (spend has no publisher-platform breakdown in the
// synced data), so it shows leads/closed/commission only — never spend or ROAS.

import { useState } from "react"
import CollapsibleSection from "@/components/crm/CollapsibleSection"
import type { MetaSalesAnalytics, MetaSalesRow, MetaSalesMetrics } from "@/lib/meta/salesAnalytics"

function money(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`
}
function int(n: number): string {
  return Math.round(n).toLocaleString("en-US")
}
function cpl(n: number | null): string {
  return n === null ? "—" : money(n)
}
function roas(n: number | null): string {
  return n === null ? "—" : `${n.toFixed(2)}×`
}

function fmtSynced(iso: string | null): string {
  if (!iso) return "not synced yet"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "not synced yet"
  return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
}

const HEAD = ["Spend", "Leads", "CPL", "Tours", "Apps", "Closed", "Est. Commission", "ROAS"]

function MetricCells({ m }: { m: MetaSalesMetrics }) {
  return (
    <>
      <td className="py-2 px-3 text-right tabular-nums">{money(m.spend)}</td>
      <td className="py-2 px-3 text-right tabular-nums">{int(m.leads)}</td>
      <td className="py-2 px-3 text-right tabular-nums">{cpl(m.costPerLead)}</td>
      <td className="py-2 px-3 text-right tabular-nums">{int(m.tours)}</td>
      <td className="py-2 px-3 text-right tabular-nums">{int(m.applications)}</td>
      <td className="py-2 px-3 text-right tabular-nums">{int(m.closed)}</td>
      <td className="py-2 px-3 text-right tabular-nums font-semibold text-[var(--crm-text-primary)]">{money(m.estimatedCommission)}</td>
      <td className="py-2 px-3 text-right tabular-nums font-semibold">{roas(m.roas)}</td>
    </>
  )
}

export default function MetaSalesAnalytics({ data }: { data: MetaSalesAnalytics | null | undefined }) {
  const [openCampaigns, setOpenCampaigns] = useState<Set<string>>(new Set())
  const [openAdsets, setOpenAdsets] = useState<Set<string>>(new Set())

  const toggle = (set: Set<string>, id: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set)
    next.has(id) ? next.delete(id) : next.add(id)
    setter(next)
  }

  const hasData = !!data && (data.overview.leads > 0 || data.overview.spend > 0)

  return (
    <CollapsibleSection title="Meta Sales Analytics" storageKey="meta-sales-analytics-expanded" defaultOpen={true}>
      <div className="p-4">
        {/* Freshness */}
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-[11px] text-[var(--crm-text-muted)]">
            Estimated Commission is projected from your Sales Goals (not actual paid commission).
          </p>
          <p className="text-[11px] text-[var(--crm-text-muted)] whitespace-nowrap">
            Synced {fmtSynced(data?.lastSyncedAt ?? null)}
          </p>
        </div>

        {!hasData ? (
          <div className="rounded-lg border border-dashed border-[var(--crm-border)] px-4 py-8 text-center">
            <p className="text-sm text-[var(--crm-text-secondary)]">No attributed Meta ad activity yet.</p>
            <p className="mt-1 text-[12px] text-[var(--crm-text-muted)]">
              Connect Meta and use your ad link so clicks carry campaign, ad, and platform attribution
              into your leads. Spend and closed-lease commission will roll up here automatically.
            </p>
          </div>
        ) : (
          <>
            {/* Overview cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              {[
                { label: "Spend", value: money(data!.overview.spend) },
                { label: "Leads", value: int(data!.overview.leads) },
                { label: "Cost / Lead", value: cpl(data!.overview.costPerLead) },
                { label: "Closed", value: int(data!.overview.closed) },
                { label: "Cost / Close", value: cpl(data!.overview.costPerClose) },
                { label: "Est. Commission", value: money(data!.overview.estimatedCommission) },
                { label: "ROAS", value: roas(data!.overview.roas) },
                { label: "Applications", value: int(data!.overview.applications) },
              ].map((c) => (
                <div key={c.label} className="bg-[var(--crm-panel)] rounded-xl border border-[var(--crm-border)] px-4 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--crm-text-muted)]">{c.label}</p>
                  <p className="mt-1 text-lg font-bold text-[var(--crm-text-primary)] tabular-nums">{c.value}</p>
                </div>
              ))}
            </div>

            {/* Hierarchy: Campaign → Ad Set → Ad */}
            <div className="overflow-x-auto rounded-lg border border-[var(--crm-border-soft)]">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-widest text-[var(--crm-text-muted)] border-b border-[var(--crm-border-soft)]">
                    <th className="py-2 px-3 font-semibold">Campaign / Ad Set / Ad</th>
                    {HEAD.map((h) => (
                      <th key={h} className="py-2 px-3 font-semibold text-right whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data!.campaigns.map((camp) => {
                    const campOpen = openCampaigns.has(camp.externalId)
                    const childAdsets = data!.adsets.filter((a) => a.parentExternalId === camp.externalId)
                    return (
                      <FragmentRows key={camp.externalId}>
                        <tr className="border-b border-[var(--crm-border-soft)] bg-[var(--crm-inset)]/40">
                          <td className="py-2 px-3">
                            <button
                              type="button"
                              onClick={() => toggle(openCampaigns, camp.externalId, setOpenCampaigns)}
                              className="flex items-center gap-1.5 font-semibold text-[var(--crm-text-primary)] text-left"
                            >
                              <Chevron open={campOpen} dim={childAdsets.length === 0} />
                              {camp.name || "(unknown campaign)"}
                            </button>
                          </td>
                          <MetricCells m={camp} />
                        </tr>

                        {campOpen &&
                          childAdsets.map((adset) => {
                            const adsetOpen = openAdsets.has(adset.externalId)
                            const childAds = data!.ads.filter((ad) => ad.parentExternalId === adset.externalId)
                            return (
                              <FragmentRows key={adset.externalId}>
                                <tr className="border-b border-[var(--crm-border-soft)]">
                                  <td className="py-2 px-3 pl-8">
                                    <button
                                      type="button"
                                      onClick={() => toggle(openAdsets, adset.externalId, setOpenAdsets)}
                                      className="flex items-center gap-1.5 text-[var(--crm-text-secondary)] text-left"
                                    >
                                      <Chevron open={adsetOpen} dim={childAds.length === 0} />
                                      {adset.name || "(unknown ad set)"}
                                    </button>
                                  </td>
                                  <MetricCells m={adset} />
                                </tr>
                                {adsetOpen &&
                                  childAds.map((ad) => (
                                    <tr key={ad.externalId} className="border-b border-[var(--crm-border-soft)] last:border-0">
                                      <td className="py-2 px-3 pl-14 text-[var(--crm-text-secondary)]">{ad.name || "(unnamed ad)"}</td>
                                      <MetricCells m={ad} />
                                    </tr>
                                  ))}
                              </FragmentRows>
                            )
                          })}
                      </FragmentRows>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {data!.unattributedLeads > 0 && (
              <p className="mt-2 text-[11px] text-[var(--crm-text-muted)]">
                {int(data!.unattributedLeads)} attributed{" "}
                {data!.unattributedLeads === 1 ? "lead is" : "leads are"} campaign-level only (no specific ad);
                their totals roll into the campaign and overview figures.
              </p>
            )}

            {/* Publisher-platform breakdown (lead-side only) */}
            {data!.platforms.length > 0 && (
              <div className="mt-5">
                <h3 className="text-[10px] font-semibold uppercase tracking-widest text-[var(--crm-text-muted)] mb-2">
                  By Publisher Platform
                </h3>
                <div className="overflow-x-auto rounded-lg border border-[var(--crm-border-soft)]">
                  <table className="w-full min-w-[360px] text-sm">
                    <thead>
                      <tr className="text-left text-[10px] uppercase tracking-widest text-[var(--crm-text-muted)] border-b border-[var(--crm-border-soft)]">
                        <th className="py-2 px-3 font-semibold">Platform</th>
                        <th className="py-2 px-3 font-semibold text-right">Leads</th>
                        <th className="py-2 px-3 font-semibold text-right">Closed</th>
                        <th className="py-2 px-3 font-semibold text-right">Est. Commission</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data!.platforms.map((p) => (
                        <tr key={p.key} className="border-b border-[var(--crm-border-soft)] last:border-0">
                          <td className="py-2 px-3 text-[var(--crm-text-primary)]">{p.label}</td>
                          <td className="py-2 px-3 text-right tabular-nums">{int(p.leads)}</td>
                          <td className="py-2 px-3 text-right tabular-nums">{int(p.closed)}</td>
                          <td className="py-2 px-3 text-right tabular-nums font-semibold">{money(p.estimatedCommission)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-1.5 text-[11px] text-[var(--crm-text-muted)]">
                  Spend has no platform breakdown in Meta's synced data, so platform ROAS isn't shown.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </CollapsibleSection>
  )
}

function FragmentRows({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

function Chevron({ open, dim }: { open: boolean; dim: boolean }) {
  return (
    <svg
      width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
      strokeLinecap="round" strokeLinejoin="round"
      className={`flex-none transition-transform ${open ? "rotate-90" : ""} ${dim ? "opacity-25" : "opacity-70"}`}
      aria-hidden
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}
