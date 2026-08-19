import { useMemo } from "react";
import { SectionCard } from "../lead/primitives";
import { PropertyThumb } from "./PropertyThumb";
import { resolveClientContext, evaluateLocationFit, evaluateApproval, evaluateAmenities, evaluateSpecials } from "@bc/companion-shared";
import type { FavoriteDTO, RecommendationDTO, LeadSummaryDTO } from "@bc/companion-shared";
import type { CurrentProperty } from "@/types";

// Current Property Intelligence (V1) — the four compact rows shown ONLY under the
// Current Property (never on Recommendations/Favorites). Each is ONE line:
//   Category: [lead] · [fact] · [fact]   (≤3 pieces after the label; 3 is a MAX)
// The lead word carries the colored state; facts are terse fragments. Deterministic
// — no %, no Maps, no AI call. All four rows populate in V1; each self-hides when it
// has nothing reliable to say (no noisy filler).
type IntelTone = "good" | "bad" | "unknown" | "moderate" | "none";

// A fact is either a bare fragment ("Second chance") or a LABELLED pair rendered as
// "Mgmt: Avenue5" — the label carries the same bold treatment as the row category so
// the row reads as bold labels + regular values throughout.
type IntelFact = string | { label: string; value: string };

function IntelRow({
  category,
  lead,
  tone = "none",
  facts = [],
}: {
  category: string;
  lead?: string | null;
  tone?: IntelTone;
  facts?: (IntelFact | null | undefined)[];
}) {
  const clean = facts.filter((f): f is IntelFact => !!f);
  if (!lead && clean.length === 0) return null; // no reliable data → render nothing
  return (
    <div className="bc-intel-row">
      <span className="bc-intel-cat">{category}:</span>
      {lead ? <span className={`bc-intel-lead tone-${tone}`}>{lead}</span> : null}
      {clean.map((f, i) => (
        <span key={i} className="bc-intel-fact">
          {lead || i > 0 ? " · " : null}
          {typeof f === "string" ? (
            f
          ) : (
            <>
              <span className="bc-intel-fact-label">{f.label}:</span>
              {f.value}
            </>
          )}
        </span>
      ))}
    </div>
  );
}

/**
 * Management company — DISPLAY casing ONLY. SAD renders some management names in all
 * caps ("AVENUE5", "WILLOW BRIDGE"); the panel shows normal brand capitalization
 * ("Avenue5", "Willow Bridge"). Applied only when the value has NO lowercase letter,
 * so a deliberately-cased name (Approval's own "Mgmt Support", or a real "LaSalle")
 * passes through untouched. The raw extracted value on CurrentProperty and the
 * Approval evaluator are never modified — this is presentation at the last step.
 */
function displayMgmt(name: string): string {
  if (/[a-z]/.test(name)) return name; // already mixed-case → trust it as authored
  return name.replace(/[A-Z][A-Z0-9'&.-]*/g, (w) => w.charAt(0) + w.slice(1).toLowerCase());
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
        mustHaveAmenities: lead.searchCriteria?.mustHaveAmenities,
      }),
    [lead.searchCriteria?.city, lead.searchCriteria?.desiredAreas, lead.searchCriteria?.interest, lead.clientNotes, lead.locatorNotes, lead.aiInsights, lead.searchCriteria?.mustHaveAmenities],
  );

  // Deterministic, read-only intelligence for the property currently on screen.
  // Location: client context vs submarket/name/address. Approval: SAD management vs
  // the locator-supplied intelligence table. Both recomputed cheaply per render.
  const location = currentProperty ? evaluateLocationFit(ctx, currentProperty) : null;
  const approval = currentProperty ? evaluateApproval(currentProperty) : null;
  // Amenities: the client's OWN requirements that SAD confirms, at the required
  // specificity. No verdict word — the matched amenity IS the intelligence. Empty when
  // nothing client-relevant is confirmed, and the row then hides entirely.
  const amenities = currentProperty ? evaluateAmenities(ctx, currentProperty.propertyAmenities) : [];
  // Specials: the best RENT concession in SAD's specials block (gift cards, fee waivers
  // and footnotes are never shown as rent). Null when SAD rendered no specials element
  // (unknown) or the block states no rent concession — the row then hides. Base Rent /
  // Avg Rent stay omitted until an exact rent can be bound to the qualifying term.
  const specials =
    currentProperty?.propertySpecials != null
      ? evaluateSpecials({ lines: currentProperty.propertySpecials })
      : null;

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
                rows with reliable evidence render. */}
            <div className="bc-cp-intel">
              {location && (
                <IntelRow category="Location" lead={location.fit} tone={location.verdict} facts={[location.detail]} />
              )}
              {approval && (
                <IntelRow
                  category="Approval"
                  lead={approval.risk}
                  tone={approvalTone(approval.risk)}
                  facts={[approval.mgmt ? { label: "Mgmt", value: displayMgmt(approval.mgmt) } : null, approval.reason]}
                />
              )}
              <IntelRow category="Amenities" facts={amenities} />
              {/* Specials: [special] · Base Rent: [$] · Avg Rent: [$]. V1 shows the rent
                  concession only — SAD's factsBar carries a property-wide rent RANGE and a
                  minimum lease, which cannot bind an exact base rent to this concession's
                  qualifying term, so Base Rent / Avg Rent are omitted rather than guessed. */}
              {specials && (specials.hasRentConcession || specials.baseRent) && (
                <IntelRow
                  category="Specials"
                  facts={[
                    specials.special,
                    specials.baseRent ? { label: "Base Rent", value: specials.baseRent } : null,
                    specials.avgRent ? { label: "Avg Rent", value: specials.avgRent } : null,
                  ]}
                />
              )}
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
