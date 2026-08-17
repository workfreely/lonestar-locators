import { SectionCard } from "../lead/primitives";

// Properties view — PHASE 1 VISUAL SHELL ONLY.
//
// This renders the layout/hierarchy for the future Properties experience so the
// spacing, density, and accordion behavior can be reviewed. It is deliberately
// inert: it does NOT read the page, detect the current property, touch CRM
// Favorites/Recommendations, query Supabase, or persist anything. The rows below
// are ISOLATED, COMPANION-ONLY presentation mock values (no ids, no data model)
// that cannot be mistaken for real property records — real data arrives in a
// later phase. The shared client identity header (LeadIdentityHeader) is rendered
// by PanelApp ABOVE this view for BOTH tabs, so this view intentionally shows NO
// client summary of its own.

// Companion-only visual placeholders. NOT persisted, NOT a data model.
const SAMPLE_RECOMMENDATIONS: { name: string; sub: string }[] = [
  { name: "The Catherine", sub: "$1,642 avg · 12 min" },
  { name: "Bell South Lamar", sub: "$1,777 avg · 9 min" },
  { name: "Windsor SoCo", sub: "$1,698 avg · 16 min" },
];
const SAMPLE_FAVORITES: { name: string; sub: string }[] = [
  { name: "The Waller", sub: "$1,585 avg · 11 min" },
  { name: "Éilan", sub: "$1,720 avg · 18 min" },
];

function PropertyRow({ name, sub }: { name: string; sub: string }) {
  return (
    <div className="bc-prop-row">
      <span className="bc-prop-name">{name}</span>
      <span className="bc-prop-sub">{sub}</span>
    </div>
  );
}

export function PropertiesView() {
  return (
    <div className="bc-props">
      {/* Current Property — visual placeholder only (no page detection in Phase 1). */}
      <SectionCard title="Current Property" defaultOpen={false}>
        <p className="bc-props-placeholder">
          The property you&apos;re viewing will appear here.
        </p>
      </SectionCard>

      {/* Recommendations — open by default for the visual review. Sample rows only. */}
      <SectionCard title="Recommendations" defaultOpen>
        <div className="bc-prop-list">
          {SAMPLE_RECOMMENDATIONS.map((p) => (
            <PropertyRow key={p.name} name={p.name} sub={p.sub} />
          ))}
        </div>
      </SectionCard>

      {/* Favorite Properties — collapsed by default. Sample rows only. */}
      <SectionCard title="Favorite Properties" defaultOpen={false}>
        <div className="bc-prop-list">
          {SAMPLE_FAVORITES.map((p) => (
            <PropertyRow key={p.name} name={p.name} sub={p.sub} />
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
