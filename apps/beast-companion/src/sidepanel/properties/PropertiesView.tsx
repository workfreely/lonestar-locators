import { SectionCard } from "../lead/primitives";
import { PropertyThumb } from "./PropertyThumb";
import type { FavoriteDTO, RecommendationDTO } from "@bc/companion-shared";
import type { CurrentProperty } from "@/types";

// The property name — a link opening the property in a normal browser tab when a
// canonical propertyUrl exists (SAD ViewProperty URL for detected properties), or
// plain text otherwise (never a broken/empty link). The stored URL is never changed.
function PropertyName({ name, url, className }: { name: string; url?: string | null; className: string }) {
  if (url) {
    return (
      <a className={`${className} bc-prop-link`} href={url} target="_blank" rel="noopener noreferrer" title={name}>
        {name}
      </a>
    );
  }
  return <span className={className}>{name}</span>;
}

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

function PropertyRow({ name, sub, url }: { name: string; sub?: string | null; url?: string | null }) {
  return (
    <div className="bc-prop-row">
      <PropertyName name={name} url={url} className="bc-prop-name" />
      {sub ? <span className="bc-prop-sub">{sub}</span> : null}
    </div>
  );
}

export function PropertiesView({
  favorites,
  recommendations,
  currentProperty,
  onAddRecommendation,
  onAddFavorite,
}: {
  favorites: FavoriteDTO[];
  recommendations: RecommendationDTO[];
  currentProperty: CurrentProperty | null;
  onAddRecommendation?: () => void;
  onAddFavorite?: () => void;
}) {
  // Button state comes from the ACTIVE client's real collections (not local button
  // state): the Current Property is "already in" a collection when a row shares its
  // SAD ViewProperty URL (which embeds the stable propertyID). Favorites and
  // Recommendations are independent — a property may be in both.
  const cpUrl = currentProperty?.propertyUrl ?? "";
  const isRecommended = !!cpUrl && recommendations.some((r) => (r.propertyUrl ?? "") === cpUrl);
  const isFavorited = !!cpUrl && favorites.some((f) => (f.propertyUrl ?? "") === cpUrl);

  return (
    <div className="bc-props">
      {/* Current Property — the Smart Apartment Data property currently being viewed
          (page context, read-only). Thumbnail + name + address, with compact
          state-aware add actions. Clears to the placeholder off a property page. */}
      <SectionCard title="Current Property" defaultOpen>
        {currentProperty ? (
          <>
            <div className="bc-current-prop">
              <PropertyThumb src={currentProperty.propertyImageUrl} alt={currentProperty.propertyName} size={46} />
              <div className="bc-current-prop-body">
                <PropertyName
                  name={currentProperty.propertyName}
                  url={currentProperty.propertyUrl}
                  className="bc-current-prop-name"
                />
                {currentProperty.propertyAddress && (
                  <div className="bc-current-prop-addr">{currentProperty.propertyAddress}</div>
                )}
              </div>
            </div>
            <div className="bc-current-prop-actions">
              <button
                type="button"
                className={`bc-cp-action${isRecommended ? " is-on" : ""}`}
                onClick={() => !isRecommended && onAddRecommendation?.()}
                disabled={isRecommended || !onAddRecommendation}
                title={isRecommended ? "Already in Recommendations" : "Add to this client's Recommendations"}
              >
                {isRecommended ? "✓ Recommended" : "+ Recommendation"}
              </button>
              <button
                type="button"
                className={`bc-cp-action${isFavorited ? " is-on" : ""}`}
                onClick={() => !isFavorited && onAddFavorite?.()}
                disabled={isFavorited || !onAddFavorite}
                title={isFavorited ? "Already in Favorites" : "Add to this client's Favorites"}
              >
                {isFavorited ? "♥ Favorited" : "♡ Favorite"}
              </button>
            </div>
          </>
        ) : (
          <p className="bc-props-placeholder">The property you&apos;re viewing will appear here.</p>
        )}
      </SectionCard>

      {/* Recommendations — the active client's canonical lead_recommendations (read-only). */}
      <SectionCard title="Recommendations" defaultOpen>
        {recommendations.length === 0 ? (
          <p className="bc-props-placeholder">No recommendations yet.</p>
        ) : (
          <div className="bc-prop-list">
            {recommendations.map((r) => (
              <PropertyRow key={String(r.id)} name={r.propertyName} sub={r.propertyAddress} url={r.propertyUrl} />
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
              <PropertyRow key={String(f.id)} name={f.propertyName} sub={f.propertyAddress} url={f.propertyUrl} />
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
