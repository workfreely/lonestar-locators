"use client"

// Grouped table of leads by utm_campaign + source. No spend/ROI data —
// that's explicitly Phase 2. Existing leads (pre-attribution-tracking)
// have no utm_campaign, so they roll into a "(no campaign data)" bucket
// rather than being silently dropped from the count — but that bucket is
// still split per source, so leads.utm_campaign is never used alone as
// the group key: a source is a first-class part of the grouping, not a
// label slapped on afterward, otherwise mixed-source leads sharing one
// campaign bucket (most commonly "(no campaign data)") would report a
// single arbitrary source for a count that spans every source in it.

import { getSourceStyle } from "@/lib/leads/sourceStyles"
import CollapsibleSection from "@/components/crm/CollapsibleSection"

export default function CampaignTable({ leads }: { leads: any[] }) {
  const groups: Record<string, { campaign: string; source: string | null; count: number }> = {}

  for (const l of leads) {
    const campaign = l.utm_campaign || "(no campaign data)"
    const source = l.utm_source || l.source || null
    const key = `${campaign} ${source ?? ""}`
    if (!groups[key]) groups[key] = { campaign, source, count: 0 }
    groups[key].count += 1
  }

  const rows = Object.values(groups).sort((a, b) => b.count - a.count)

  return (
    <CollapsibleSection title="Campaigns" storageKey="campaigns-expanded" defaultOpen={false}>
      <div className="p-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-widest text-[var(--crm-text-muted)] border-b border-[var(--crm-border-soft)]">
              <th className="pb-2 font-semibold">Campaign</th>
              <th className="pb-2 font-semibold">Source</th>
              <th className="pb-2 font-semibold text-right">Leads</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const style = getSourceStyle(row.source)
              return (
                <tr key={`${row.campaign} ${row.source ?? ""}`} className="border-b border-[var(--crm-border-soft)] last:border-0">
                  <td className="py-2 text-[var(--crm-text-primary)]">{row.campaign}</td>
                  <td className="py-2">
                    <span
                      className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full border ${style.badgeClassName}`}
                    >
                      {style.label}
                    </span>
                  </td>
                  <td className="py-2 text-right font-semibold text-[var(--crm-text-primary)]">{row.count}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </CollapsibleSection>
  )
}
