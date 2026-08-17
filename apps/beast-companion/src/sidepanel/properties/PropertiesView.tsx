import { SectionCard } from "../lead/primitives";
import type { FavoriteDTO, RecommendationDTO } from "@bc/companion-shared";

// Properties view — Phase 2A + 2 (Recommendations connection).
//
// Both Recommendations (lead_recommendations) and Favorite Properties
// (lead_favorites) now show the ACTIVE client's real canonical records, delivered
// through the EXISTING active-client payload (chrome.storage["lb-active-client"] →
// ProductionPanel → PanelApp → here). Each follows the active client automatically
// (the CRM re-posts the payload on every client switch, filtered per lead) and is
// strictly READ-ONLY — the workspace stays the single source of truth; nothing is
// written back. Current Property stays a Phase-1 placeholder (no page detection).
//
// Rows show ONLY data that reliably exists in the canonical record (property name
// + address). Nothing (rent / commute / match / specials) is fabricated.

function PropertyRow({ name, sub }: { name: string; sub?: string | null }) {
  return (
    <div className="bc-prop-row">
      <span className="bc-prop-name">{name}</span>
      {sub ? <span className="bc-prop-sub">{sub}</span> : null}
    </div>
  );
}

export function PropertiesView({
  favorites,
  recommendations,
}: {
  favorites: FavoriteDTO[];
  recommendations: RecommendationDTO[];
}) {
  return (
    <div className="bc-props">
      {/* Current Property — visual placeholder only (no page detection in this pass). */}
      <SectionCard title="Current Property" defaultOpen={false}>
        <p className="bc-props-placeholder">The property you&apos;re viewing will appear here.</p>
      </SectionCard>

      {/* Recommendations — the active client's canonical lead_recommendations (read-only). */}
      <SectionCard title="Recommendations" defaultOpen>
        {recommendations.length === 0 ? (
          <p className="bc-props-placeholder">No recommendations yet.</p>
        ) : (
          <div className="bc-prop-list">
            {recommendations.map((r) => (
              <PropertyRow key={String(r.id)} name={r.propertyName} sub={r.propertyAddress} />
            ))}
          </div>
        )}
      </SectionCard>

      {/* Favorite Properties — the active client's real lead_favorites (read-only). */}
      <SectionCard title="Favorite Properties" defaultOpen={false}>
        {favorites.length === 0 ? (
          <p className="bc-props-placeholder">No favorite properties yet.</p>
        ) : (
          <div className="bc-prop-list">
            {favorites.map((f) => (
              <PropertyRow key={String(f.id)} name={f.propertyName} sub={f.propertyAddress} />
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
