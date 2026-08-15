"use client"

import { SectionCard } from "./LeadPanelSections"
import PropertyThumb from "./PropertyThumb"

// Recommended Properties (Phase 1 placeholder).
//
// Conceptually distinct from Favorite Properties:
//   • Recommended Properties = properties Locator Beast RECOMMENDS for this
//     client based on their criteria (AI-ranked). NOT built/enabled here.
//   • Favorite Properties    = properties the locator INTENTIONALLY saved.
//
// This is a visual placeholder ONLY to establish the workspace hierarchy — it
// does not re-enable or build the property-matching engine (see
// SHOW_PROPERTY_MATCHES in LeadInsights). Static sample rows, no data source.
// The `image` is intentionally absent for now → the shared PropertyThumb renders
// its clean placeholder; when the recommendation engine is live it will carry a
// real image the same way a Favorite does (and carry through if saved).
const SAMPLE_MATCHES: { name: string; area: string; score: number; image?: string }[] = [
  { name: "The Sample Residences", area: "Sample Heights", score: 94 },
  { name: "Placeholder Park Apartments", area: "Demo District", score: 89 },
  { name: "Example Flats at Northgate", area: "Sample Heights", score: 85 },
]

export default function BestMatches(_props: { lead: any }) {
  return (
    <SectionCard title="Recommended Properties" collapsible defaultOpen storageKey="best-matches">
      <p className="mb-2 text-[11px] text-[var(--crm-text-muted)]">
        Sample preview — recommended properties based on this client&rsquo;s criteria will appear here.
      </p>
      <div className="space-y-1.5">
        {SAMPLE_MATCHES.map((m) => (
          <div
            key={m.name}
            className="flex items-center gap-2.5 rounded-lg border border-dashed border-[var(--crm-border)] bg-[var(--crm-inset)] px-3 py-2 opacity-80"
          >
            <PropertyThumb src={m.image} alt={m.name} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-semibold text-[var(--crm-text-primary)]">{m.name}</p>
              <p className="truncate text-[11px] text-[var(--crm-text-muted)]">{m.area}</p>
            </div>
            <span className="flex-none rounded-full bg-[var(--crm-accent)]/15 px-2 py-0.5 text-[11px] font-semibold text-[var(--crm-accent)]">
              {m.score}% match
            </span>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}
