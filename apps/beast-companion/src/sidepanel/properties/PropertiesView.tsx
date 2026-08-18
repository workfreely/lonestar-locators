import { useMemo } from "react";
import { SectionCard } from "../lead/primitives";
import { PropertyThumb } from "./PropertyThumb";
import { resolveClientContext, evaluateLocationFit, evaluateApproval } from "@bc/companion-shared";
import type { FavoriteDTO, RecommendationDTO, LeadSummaryDTO } from "@bc/companion-shared";
import type { CurrentProperty } from "@/types";

// Current Property Intelligence (V1) — the four compact rows shown ONLY under the
// Current Property (never on Recommendations/Favorites). Each is ONE line:
//   Category: [lead] · [fact] · [fact]   (≤3 pieces after the label; 3 is a MAX)
// The lead word carries the colored state; facts are terse fragments. Deterministic
// — no %, no Maps, no AI call. Location + Approval populate in V1; Amenities and
// Specials have no reliable evidence yet, so their rows self-hide (no noisy filler).
type IntelTone = "good" | "bad" | "unknown" | "moderate" | "none";

function IntelRow({
  category,
  lead,
  tone = "none",
  facts = [],
}: {
  category: string;
  lead?: string | null;
  tone?: IntelTone;
  facts?: (string | null | undefined)[];
}) {
  const clean = facts.filter((f): f is string => !!f);
  if (!lead && clean.length === 0) return null; // no reliable data → render nothing
  return (
    <div className="bc-intel-row">
      <span className="bc-intel-cat">{category}:</span>
      {lead ? <span className={`bc-intel-lead tone-${tone}`}>{lead}</span> : null}
      {clean.map((f, i) => (
        <span key={i} className="bc-intel-fact"> · {f}</span>
      ))}
    </div>
  );
}

// Approval risk → row tone. Low = reassuring (good), Moderate = amber, High =
// alarming (bad), Unverified = muted. V1 never produces High, but the mapping is
// complete so the row is correct if/when stricter evidence lands.
function approvalTone(risk: "Low" | "Moderate" | "High" | "Unverified"): IntelTone {
  return risk === "Low" ? "good" : risk === "Moderate" ? "moderate" : risk === "High" ? "bad" : "unknown";
}

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
  lead,
  favorites,
  recommendations,
  currentProperty,
  onAddRecommendation,
  onAddFavorite,
}: {
  // The active client — its location context (searchCriteria + Locator Notes + AI
  // Insights) is the ONLY input to Location Fit besides the viewed property.
  lead: LeadSummaryDTO;
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

  // Current Client Context (V1, Option A) — resolved ONCE from the active client
  // (Smart Form baseline + Locator Notes/AI Insights override layer) and reused by
  // every property-intelligence evaluator, rather than re-reading the client per row.
  const ctx = useMemo(
    () =>
      resolveClientContext({
        city: lead.searchCriteria?.city,
        desiredAreas: lead.searchCriteria?.desiredAreas,
        interest: lead.searchCriteria?.interest,
        clientNotes: lead.clientNotes,
        locatorNotes: lead.locatorNotes,
        aiInsights: lead.aiInsights,
      }),
    [lead.searchCriteria?.city, lead.searchCriteria?.desiredAreas, lead.searchCriteria?.interest, lead.clientNotes, lead.locatorNotes, lead.aiInsights],
  );

  // Deterministic, read-only intelligence for the property currently on screen.
  // Location: client context vs submarket/name/address. Approval: SAD management vs
  // the locator-supplied intelligence table. Both recomputed cheaply per render.
  const location = currentProperty ? evaluateLocationFit(ctx, currentProperty) : null;
  const approval = currentProperty ? evaluateApproval(currentProperty) : null;

  return (
    <div className="bc-props">
      {/* Current Property — the Smart Apartment Data property currently being viewed
          (page context, read-only). Thumbnail + name + address, with compact
          state-aware add actions. Clears to the placeholder off a property page. */}
      <SectionCard title="Current Property" defaultOpen>
        {currentProperty ? (
          <>
            {/* Identity block — thumbnail aligned to the property NAME, address
                immediately below. The intelligence rows sit outside this block so
                the thumbnail never centers against the whole analysis area. */}
            <div className="bc-current-prop">
              <PropertyThumb src={currentProperty.propertyImageUrl} alt={currentProperty.propertyName} size={40} />
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

            {/* Beast intelligence — four compact rows (~7px below the address). Only
                rows with reliable evidence render; Amenities/Specials are wired but
                self-hide in V1 until their SAD evidence lands. */}
            <div className="bc-cp-intel">
              {location && (
                <IntelRow category="Location" lead={location.fit} tone={location.verdict} facts={[location.detail]} />
              )}
              {approval && (
                <IntelRow category="Approval" lead={approval.risk} tone={approvalTone(approval.risk)} facts={[approval.mgmt, approval.reason]} />
              )}
              {/* Amenities / Specials — no reliable evidence yet → render nothing. */}
              <IntelRow category="Amenities" facts={[]} />
              <IntelRow category="Specials" facts={[]} />
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
