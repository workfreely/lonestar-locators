"use client"

import { SectionCard } from "./LeadPanelSections"
import PropertyThumb from "./PropertyThumb"

// Recommended Properties — the canonical per-client Recommendations collection
// (lead_recommendations). Conceptually distinct from Favorite Properties:
//   • Recommended Properties = properties Locator Beast RECOMMENDS for this client.
//   • Favorite Properties    = properties the locator INTENTIONALLY saved.
//
// Reads the SAME canonical collection the Beast Companion shows (one dataset, two
// interfaces), filtered to the active client. Real clients render their rows
// (empty → "No recommendations yet."); demo clients render DEMO_RECOMMENDATIONS
// fed through the same recommendations state/payload path. Read-only here — the
// section is unchanged; only its data source moved from a static sample to the
// canonical model. The `property_image_url` (nullable) drives the shared thumbnail.

export default function BestMatches({ lead, recommendations = [] }: { lead: any; recommendations?: any[] }) {
  const leadRecommendations = (recommendations || []).filter(
    (r) => String(r.lead_id) === String(lead?.id),
  )
  return (
    <SectionCard title="Recommended Properties" collapsible defaultOpen storageKey="best-matches">
      {leadRecommendations.length === 0 ? (
        <p className="text-[11px] text-[var(--crm-text-muted)]">No recommendations yet.</p>
      ) : (
        <div className="space-y-1.5">
          {leadRecommendations.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-2.5 rounded-lg border border-[var(--crm-border)] bg-[var(--crm-inset)] px-3 py-2"
            >
              <PropertyThumb src={r.property_image_url} alt={r.property_name} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-semibold text-[var(--crm-text-primary)]">{r.property_name}</p>
                {r.property_address && (
                  <p className="truncate text-[11px] text-[var(--crm-text-muted)]">{r.property_address}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}
