import { useEffect, useMemo, useState } from "react";
import { SectionCard } from "../lead/primitives";
import { PropertyThumb } from "./PropertyThumb";
import { resolveClientContext, evaluateLocationFit, evaluateApproval, evaluateAmenities, evaluateSpecials, evaluateBudget, evaluateMatchScore, matchScoreTone, normalizeMustHaveAmenities, resolveClientBudget, formatRent, cityMismatch, starFillPercent, formatRating, displayAddress, propertyWebsiteHref } from "@bc/companion-shared";
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
  rowClass,
}: {
  category: string;
  lead?: string | null;
  tone?: IntelTone;
  facts?: (IntelFact | null | undefined)[];
  /** Optional modifier on the row itself (Specials uses it to tint its concession). */
  rowClass?: string;
}) {
  const clean = facts.filter((f): f is IntelFact => !!f);
  if (!lead && clean.length === 0) return null; // no reliable data → render nothing
  return (
    <div className={`bc-intel-row${rowClass ? ` ${rowClass}` : ""}`}>
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

/**
 * A saved property row: full name, full address underneath, and ONE compact control
 * that moves it to the other collection (Recommendation ↔ Favorite are two states of
 * one progression, never both). The control is disabled with a reason when the move
 * would break a downstream dependency — the row layout itself is unchanged.
 */
function PropertyRow({
  name,
  sub,
  url,
  rating,
  moveLabel,
  moveTitle,
  moveVariant,
  blockedReason,
  onMove,
  onRemove,
  removeTitle,
  removeBlockedReason,
}: {
  name: string;
  sub?: string | null;
  url?: string | null;
  /** Google rating (0.0–5.0) or null — same treatment as Current Property. */
  rating?: number | null;
  moveLabel?: string;
  moveTitle?: string;
  /** "heart" gets the heavier Favorite treatment; the default stays minimal. */
  moveVariant?: "heart";
  blockedReason?: string | null;
  onMove?: () => void;
  /** Compact ✕ control. On a Recommendation it removes the property; on a Favorite
   *  it moves back to Recommendations. Sits LEFT of any move control. */
  onRemove?: () => void;
  removeTitle?: string;
  /** When set, the ✕ is disabled with this reason (Favorite move-back blocked by
   *  a scheduled tour / Top Pick / open property action). */
  removeBlockedReason?: string | null;
}) {
  const blocked = !!blockedReason;
  return (
    <div className="bc-prop-row">
      <div className="bc-prop-row-main">
        <div className="bc-prop-row-text">
          <PropertyName name={name} url={url} className="bc-prop-name" />
          {sub ? <span className="bc-prop-sub">{sub}</span> : null}
          {typeof rating === "number" && (
            <div className="bc-cp-rating">
              <span className="bc-cp-rating-label">Google Rating:</span>
              <span className="bc-cp-rating-num">{formatRating(rating)}</span>
              <span
                className="bc-cp-stars"
                title={`${formatRating(rating)} out of 5`}
                aria-label={`Google rating ${formatRating(rating)} out of 5`}
              >
                <span className="bc-cp-stars-base">★★★★★</span>
                <span
                  className="bc-cp-stars-fill"
                  style={{ width: `${starFillPercent(rating)}%` }}
                  aria-hidden
                >
                  ★★★★★
                </span>
              </span>
            </div>
          )}
        </div>
        {(onRemove || (moveLabel && onMove)) && (
          <div className="bc-prop-row-actions">
            {/* ✕ removes the association; sits to the LEFT of the move control. */}
            {onRemove && (
              <button
                type="button"
                className="bc-prop-remove"
                onClick={() => !removeBlockedReason && onRemove()}
                disabled={!!removeBlockedReason}
                title={removeBlockedReason ? `Can't move back — ${removeBlockedReason}` : removeTitle}
                aria-label={removeBlockedReason ? `Can't move back — ${removeBlockedReason}` : removeTitle}
              >
                ✕
              </button>
            )}
            {moveLabel && onMove && (
              <button
                type="button"
                className={`bc-prop-move${moveVariant === "heart" ? " bc-prop-move--heart" : ""}`}
                onClick={() => !blocked && onMove()}
                disabled={blocked}
                title={blocked ? `Can't move back — ${blockedReason}` : moveTitle}
                aria-label={blocked ? `Can't move back — ${blockedReason}` : moveTitle}
              >
                {moveLabel}
              </button>
            )}
          </div>
        )}
      </div>
      {blocked ? <span className="bc-prop-blocked">{blockedReason}</span> : null}
    </div>
  );
}

// Per-lead set of favorite ids seen this session. MODULE-LEVEL so it survives a
// PropertiesView remount — a component ref would reset and mis-read the post-remount
// state as a fresh mount, swallowing the auto-expand (the reported regression).
const seenFavoriteIdsByLead = new Map<string, Set<string>>();

export function PropertiesView({
  lead,
  favorites,
  recommendations,
  currentProperty,
  onAddRecommendation,
  onMoveToFavorite,
  onMoveToRecommendation,
  onRemoveRecommendation,
  onClearCurrentProperty,
}: {
  // The active client — its location context (searchCriteria + Locator Notes + AI
  // Insights) is the ONLY input to Location Fit besides the viewed property.
  lead: LeadSummaryDTO;
  favorites: FavoriteDTO[];
  recommendations: RecommendationDTO[];
  currentProperty: CurrentProperty | null;
  onAddRecommendation?: () => void;
  onAddFavorite?: () => void;
  onMoveToFavorite?: (propertyUrl?: string | null) => void;
  onMoveToRecommendation?: (propertyUrl?: string | null) => void;
  /** Compact ✕ on a Recommendation — remove the property entirely. */
  onRemoveRecommendation?: (propertyUrl?: string | null) => void;
  /** Manual dismiss of the transient Current Property — clears ONLY
   *  lb-current-property (the same clear path used on a market switch). */
  onClearCurrentProperty?: () => void;
}) {
  // Button state comes from the ACTIVE client's real collections (not local button
  // state): the Current Property is "already in" a collection when a row shares its
  // SAD ViewProperty URL (which embeds the stable propertyID). Current Property has a
  // SINGLE control — a property enters the progression as a Recommendation and is only
  // promoted to a Favorite from its Recommendations row, so it can never be favorited
  // directly from here.
  const cpUrl = currentProperty?.propertyUrl ?? "";
  const isRecommended = !!cpUrl && recommendations.some((r) => (r.propertyUrl ?? "") === cpUrl);

  // Auto-expand Favorite Properties the first time a genuinely NEW favorite appears
  // for the active client, so a hearted/moved property is immediately visible even
  // when the section was collapsed. Then the user stays free to collapse it again.
  //
  // The "seen ids per lead" baseline is MODULE-LEVEL (seenFavoriteIdsByLead), not a
  // component ref, on purpose: a PropertiesView remount would reset a ref to null,
  // the effect would read the post-add favorites as a fresh "first mount", and the
  // expand would be swallowed — which is the reported regression (adding a favorite
  // while collapsed did not expand). Module scope survives remounts. We also ignore
  // transient empty/refill payloads (rehydration) and already-existing favorites:
  // ONLY a first-ever-seen id for this lead expands, exactly once.
  const [favOpenSignal, setFavOpenSignal] = useState(0);
  useEffect(() => {
    const leadId = String(lead.id);
    const current = favorites.map((f) => String(f.id));
    const seen = seenFavoriteIdsByLead.get(leadId);
    if (!seen) {
      // First time this session we see this client → establish baseline, never expand.
      seenFavoriteIdsByLead.set(leadId, new Set(current));
      return;
    }
    if (current.length === 0) return; // transient empty payload → never expand
    let added = false;
    for (const id of current) {
      if (!seen.has(id)) {
        seen.add(id);
        added = true;
      }
    }
    if (added) setFavOpenSignal((n) => n + 1);
  }, [favorites, lead.id]);

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
        budgetText: lead.searchCriteria?.budgetText,
      }),
    [lead.searchCriteria?.city, lead.searchCriteria?.desiredAreas, lead.searchCriteria?.interest, lead.clientNotes, lead.locatorNotes, lead.aiInsights, lead.searchCriteria?.mustHaveAmenities, lead.searchCriteria?.budgetText],
  );

  // Deterministic, read-only intelligence for the property currently on screen.
  // Location: client context vs submarket/name/address. Approval: SAD management vs
  // the locator-supplied intelligence table. Both recomputed cheaply per render.
  const location = currentProperty ? evaluateLocationFit(ctx, currentProperty) : null;
  // Budget: the client's working budget vs SAD's property-wide rent range. Null when
  // either side is unknown — the row then hides rather than implying a comparison.
  // The property's own Specials lines feed the matching TOLERANCE (a concession widens
  // how far over budget is still worth surfacing). Same parsed intelligence the Specials
  // row uses — no second parser, and no net-effective-rent claim.
  const budget = currentProperty
    ? evaluateBudget(ctx, currentProperty.propertyRent, currentProperty.propertySpecials)
    : null;

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

  // The property sits outside the client's stated location criteria. This scores the
  // LOCATION dimension poorly — it is NOT an overall disqualifier, because apartment
  // searches routinely cross municipal boundaries. False whenever either city is
  // unknown, so missing data is never treated as a mismatch.
  const outsideArea = currentProperty ? cityMismatch(ctx, currentProperty) : false;

  // Overall Match % — composes the SAME four signals rendered below, so the headline can
  // never disagree with the rows. Null when too little is known to state a number.
  const matchScore = currentProperty
    ? evaluateMatchScore({
        locationOutsideCriteria: outsideArea,
        location,
        budget,
        approval,
        amenities: { requested: normalizeMustHaveAmenities(ctx.mustHaveAmenities).length, confirmed: amenities.length },
      })
    : null;

  // ── Display rules: rows are EVIDENCE, the Match % is the verdict ───────────
  // The overall percentage above now carries the judgement, so these rows explain it
  // rather than grading it a second time — no "Good", no "Unverified".
  //
  // Location shows ONLY the match verdict (Within/Outside Preferred Area) — the
  // property's city/neighborhood is already visible elsewhere on the card, so the
  // verdict stays simple and unambiguous. NOTE: there is no commute intelligence —
  // evaluateLocationFit explicitly cannot verify proximity without map data — so a
  // drive time is NEVER manufactured. A client's own stated proximity phrase is
  // preserved verbatim.
  const locationRelation = (() => {
    if (!location) return null;
    if (location.verdict === "good") return "Within Preferred Area";
    if (location.verdict === "bad") return "Outside Preferred Area";
    if (location.detail === "No location set") return "Area not provided";
    if (location.detail === "Area not confirmed") return location.detail;
    return location.detail; // the client's own proximity words, e.g. "Near the Domain"
  })();
  /**
   * Budget DISPLAY copy — presentation only; the evaluator is untouched.
   *
   * The "Budget:" label already supplies the context, so the value stays terse and the
   * client's actual figure carries the detail. "Options within budget" collapses to
   * "Within budget", and the gap amount drops out of "$125 over budget" so the row is
   * not two competing money figures.
   */
  const budgetCopy = (verdict: string): string => {
    if (verdict === "Options within budget") return "Within budget";
    if (/over budget$/.test(verdict)) return "Over budget";
    return verdict; // "Within budget", "Near budget"
  };

  // Budget evidence: the verdict is backed by the client's ACTUAL working budget —
  // the resolved figure (so a confirmed later override is reflected, not just the Smart
  // Form baseline). A single-value budget prints as one amount, not a range of itself.
  const clientBudget = resolveClientBudget(ctx);
  const clientBudgetText = clientBudget
    ? clientBudget.min === clientBudget.max
      ? formatRent(clientBudget.max)
      : `${formatRent(clientBudget.min)} – ${formatRent(clientBudget.max)}`
    : null;

  // Approval: the KEY REASON is the evidence ("Second chance", "1099 friendly").
  // The risk grade itself is folded into the Match %, so it is no longer printed.
  const approvalReason = approval?.reason ?? null;

  return (
    <div className="bc-props">
      {/* Current Property — the Smart Apartment Data property currently being viewed
          (page context, read-only). Thumbnail + name + address, with compact
          state-aware add action. Clears to the placeholder off a property page. */}
      <SectionCard
        title="Current Property"
        defaultOpen
        right={
          matchScore != null ? (
            // Colour only — wording, size and position are unchanged, and the tone
            // classes reuse the existing --lb-success/--lb-warning/--lb-danger tokens.
            <span className={`bc-match-score tone-${matchScoreTone(matchScore)}`}>{matchScore}% Match</span>
          ) : undefined
        }
      >
        {currentProperty ? (
          <div className="bc-cp-wrap">
            {/* Manual dismiss — clears ONLY the transient Current Property (same
                storage clear path as a market switch). Quiet at rest, clear on
                hover; upper-right of the card. */}
            {onClearCurrentProperty && (
              <button
                type="button"
                className="bc-cp-clear"
                aria-label="Clear current property"
                title="Clear current property"
                onClick={onClearCurrentProperty}
              >
                ✕
              </button>
            )}
            {/* Identity block — thumbnail aligned to the property NAME, address
                immediately below. The intelligence rows sit outside this block so
                the thumbnail never centers against the whole analysis area. */}
            <div className="bc-current-prop">
              <PropertyThumb src={currentProperty.propertyImageUrl} alt={currentProperty.propertyName} size={48} />
              <div className="bc-current-prop-body">
                <PropertyName
                  name={currentProperty.propertyName}
                  url={propertyWebsiteHref(currentProperty.websiteUrl)}
                  className="bc-current-prop-name"
                />
                {currentProperty.propertyAddress && (
                  <div className="bc-current-prop-addr">{displayAddress(currentProperty.propertyAddress)}</div>
                )}
                {/* Google rating — same treatment as the CRM property card: numeric
                    value first (one decimal), then a compact five-star visual whose
                    gold fill reflects the decimal via the shared starFillPercent
                    math. Shown ONLY when a real rating is present; omitted entirely
                    otherwise. No review count, never fabricated. */}
                {typeof currentProperty.googleRating === "number" && (
                  <div className="bc-cp-rating">
                    <span className="bc-cp-rating-label">Google Rating:</span>
                    <span className="bc-cp-rating-num">{formatRating(currentProperty.googleRating)}</span>
                    <span
                      className="bc-cp-stars"
                      title={`${formatRating(currentProperty.googleRating)} out of 5`}
                      aria-label={`Google rating ${formatRating(currentProperty.googleRating)} out of 5`}
                    >
                      <span className="bc-cp-stars-base">★★★★★</span>
                      <span
                        className="bc-cp-stars-fill"
                        style={{ width: `${starFillPercent(currentProperty.googleRating)}%` }}
                        aria-hidden
                      >
                        ★★★★★
                      </span>
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Beast intelligence — four compact rows (~7px below the address). Only
                rows with reliable evidence render. */}
            <div className="bc-cp-intel">
              {/* Location — the match verdict only (Within/Outside Preferred Area);
                  no city/neighborhood suffix (that is shown elsewhere on the card). */}
              <IntelRow
                category="Location"
                facts={[outsideArea ? "Outside Preferred Area" : locationRelation]}
              />
              {budget && <IntelRow category="Budget" facts={[budgetCopy(budget), clientBudgetText]} />}
              {/* Approval — the key reason, not the grade. */}
              {approvalReason && <IntelRow category="Approval" facts={[approvalReason]} />}
              {/* Mgmt — its OWN full-width line, so a long management company is never
                  squeezed onto the Approval row. */}
              {approval?.mgmt && <IntelRow category="Mgmt" facts={[displayMgmt(approval.mgmt)]} />}
              <IntelRow category="Amenities" facts={amenities} />
              {/* Specials: [special] · Base Rent: [$] · Avg Rent: [$]. V1 shows the rent
                  concession only — SAD's factsBar carries a property-wide rent RANGE and a
                  minimum lease, which cannot bind an exact base rent to this concession's
                  qualifying term, so Base Rent / Avg Rent are omitted rather than guessed. */}
              {specials && (specials.hasRentConcession || specials.baseRent) && (
                <IntelRow
                  category="Specials"
                  // Amber ONLY when there is an actual concession — a "None" value or a
                  // bare Base Rent row stays the normal fact colour.
                  rowClass={specials.hasRentConcession ? "bc-intel-specials" : undefined}
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
                {isRecommended ? "✓ Recommended" : "+ Recommend"}
              </button>
            </div>
          </div>
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
              <PropertyRow
                key={String(r.id)}
                name={r.propertyName}
                sub={r.propertyAddress ? displayAddress(r.propertyAddress) : r.propertyAddress}
                url={propertyWebsiteHref(r.websiteUrl)}
                rating={r.googleRating}
                // ✕ removes the recommendation; ♡ (EMPTY heart — still a Recommendation)
                // moves it to Favorites. ✕ sits to the LEFT of the heart.
                onRemove={onRemoveRecommendation ? () => onRemoveRecommendation(r.propertyUrl) : undefined}
                removeTitle="Remove recommendation"
                moveLabel="♡"
                moveTitle="Move to Favorites"
                moveVariant="heart"
                onMove={onMoveToFavorite ? () => onMoveToFavorite(r.propertyUrl) : undefined}
              />
            ))}
          </div>
        )}
      </SectionCard>

      {/* Favorite Properties — the active client's real lead_favorites (read-only).
          Starts collapsed, but auto-expands the moment a favorite is added (see
          favOpenSignal) so a hearted property is shown immediately instead of
          seeming to disappear. Stays user-collapsible afterward. */}
      <SectionCard title="Favorite Properties" defaultOpen={false} openSignal={favOpenSignal}>
        {favorites.length === 0 ? (
          <p className="bc-props-placeholder">No favorite properties yet.</p>
        ) : (
          <div className="bc-prop-list">
            {favorites.map((f) => (
              <PropertyRow
                key={String(f.id)}
                name={f.propertyName}
                sub={f.propertyAddress ? displayAddress(f.propertyAddress) : f.propertyAddress}
                url={propertyWebsiteHref(f.websiteUrl)}
                rating={f.googleRating}
                // ✕ moves the Favorite BACK to Recommendations (never a full delete),
                // reusing the move-back verb. Disabled while a scheduled tour / Top
                // Pick / open property action still depends on it.
                onRemove={onMoveToRecommendation ? () => onMoveToRecommendation(f.propertyUrl) : undefined}
                removeTitle="Move to recommendations"
                removeBlockedReason={f.moveBlockedReason}
              />
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
