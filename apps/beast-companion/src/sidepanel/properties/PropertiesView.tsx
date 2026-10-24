import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { SectionCard } from "../lead/primitives";
import { PropertyThumb } from "./PropertyThumb";
import { resolveClientContext, evaluateLocationFit, evaluateApproval, evaluateAmenities, evaluateBudget, evaluateMatchScore, matchScoreTone, normalizeMustHaveAmenities, cityMismatch, starFillPercent, formatRating, displayAddress, propertyWebsiteHref, canonicalPropertyKey, selectMatchReasonLines, normalizeShortSpecial, isSpecialCurrent, evaluateLocatorCommission, FEATURE_SEPARATOR } from "@bc/companion-shared";
import type { FavoriteDTO, RecommendationDTO, LeadSummaryDTO } from "@bc/companion-shared";
import type { CurrentProperty } from "@/types";

// The property name — a link opening the property in a normal browser tab when a
// canonical propertyUrl exists (the external site ViewProperty URL for detected properties), or
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
              <span className="bc-cp-rating-label">Google Rating</span>
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
  onAddFavorite,
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
  // the external site ViewProperty URL (which embeds the stable propertyID). Current Property has a
  // SINGLE control — a property enters the progression as a Recommendation and is only
  // promoted to a Favorite from its Recommendations row, so it can never be favorited
  // directly from here.
  // "Already recommended" is decided by CANONICAL property identity (matches the DB
  // canonical_property_key), not raw URL equality, so a the external site `url:` and a `?q=place_id:`
  // form of the same property don't disagree. Favorite membership is intentionally NOT
  // consulted — Recommendations and Favorites are independent collections.
  const cpKey = canonicalPropertyKey(currentProperty?.propertyUrl ?? "");
  const isRecommended = !!cpKey && recommendations.some((r) => canonicalPropertyKey(r.propertyUrl ?? "") === cpKey);

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
  // Location: client context vs submarket/name/address. Approval: the external site management vs
  // the locator-supplied intelligence table. Both recomputed cheaply per render.
  const location = currentProperty ? evaluateLocationFit(ctx, currentProperty) : null;
  // Budget: the client's working budget vs the external site's property-wide rent range. Null when
  // either side is unknown — the row then hides rather than implying a comparison.
  // The property's own Specials lines feed the matching TOLERANCE (a concession widens
  // how far over budget is still worth surfacing). Same parsed intelligence the Specials
  // row uses — no second parser, and no net-effective-rent claim.
  const budget = currentProperty
    ? evaluateBudget(ctx, currentProperty.propertyRent, currentProperty.propertySpecials)
    : null;

  const approval = currentProperty ? evaluateApproval(currentProperty) : null;
  // Amenities: the client's OWN requirements that the external site confirms, at the required
  // specificity. No verdict word — the matched amenity IS the intelligence. Empty when
  // nothing client-relevant is confirmed, and the row then hides entirely.
  // Full labels ("Floor-to-Ceiling Windows", never "FTC Windows") for the reason
  // line. The match-score amenity COUNT is label-agnostic, so this one call serves
  // both the feature reason line and the score's confirmed-amenity count.
  const amenities = currentProperty ? evaluateAmenities(ctx, currentProperty.propertyAmenities, { fullLabels: true }) : [];
  // The current special is now shown as the canonical GREEN badge (shortSpecial,
  // above) sourced from property_catalog.current_special — not from the raw scraped
  // specials block, and not as a reason line. The scraped specials still feed the
  // budget TOLERANCE below (evaluateBudget reads propertySpecials directly).

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
  // Approval: the KEY REASON is the evidence ("Second chance", "1099 friendly").
  // The risk grade itself is folded into the Match %, so it is no longer printed.
  const approvalReason = approval?.reason ?? null;

  // Feature line fit (Companion narrow side panel). The feature line must ALWAYS be
  // one clean line — never wrap, split a label, or abbreviate. We keep up to 3 full
  // labels, but when 3 don't fit on one line at the current panel width (e.g. the
  // long "Floor-to-Ceiling Windows" combo), we drop to the 2 STRONGEST features
  // rather than wrapping. `featureCount` is decided by an actual measurement below
  // (self-calibrating to whatever width the panel is), so shorter combos keep all 3.
  const reasonsRef = useRef<HTMLDivElement | null>(null);
  const featureMeasureRef = useRef<HTMLSpanElement | null>(null);
  const allFeatures = amenities.slice(0, 3);
  const fullFeatureText = allFeatures.join(FEATURE_SEPARATOR);
  const [featureCount, setFeatureCount] = useState(3);
  useLayoutEffect(() => {
    if (allFeatures.length < 3) {
      setFeatureCount(allFeatures.length);
      return;
    }
    const measure = () => {
      const container = reasonsRef.current;
      const probe = featureMeasureRef.current;
      if (!container || !probe) return;
      // The hidden probe holds the full 3-feature line with the SAME styling. Require
      // it to fit with BREATHING ROOM (≤ 90% of the line width) — an edge-to-edge fit
      // reads as cramped, so that counts as "doesn't fit cleanly" and we drop to the
      // 2 strongest features. Result: genuinely narrow panels show 2, roomier panels
      // show all 3 — never a wrap, split, or abbreviation.
      const CLEAN_FILL = 0.9;
      setFeatureCount(probe.getBoundingClientRect().width <= container.clientWidth * CLEAN_FILL ? 3 : 2);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (reasonsRef.current) ro.observe(reasonsRef.current);
    return () => ro.disconnect();
  }, [fullFeatureText, allFeatures.length]);

  const featureLabels = amenities.slice(0, Math.min(featureCount, 3));
  const featureLineText = featureLabels.length ? featureLabels.join(FEATURE_SEPARATOR) : null;

  // ── "Why I chose this for you" — MIRRORS the Map property card ──────────────
  // Same shared selector, same decision language, same ≤3 cap. The Companion is
  // the compact ACTION surface, not a richer profile: it shows the same core data
  // and reasons as the Map, differing only in the actions below. Budget and Mgmt
  // are intentionally NOT rendered as lines — Budget still feeds the Match Score,
  // and Mgmt is property metadata, not a "why this client" reason. Honest to the
  // data: commute is omitted (no drive-time is ever computed).
  // The special is NOT a reason line: it is a per-property offer, not a client-
  // specific reason. It renders as the compact GREEN badge below (shortSpecial),
  // mirroring the Map card — so it is dropped from these reasons to avoid a duplicate.
  const reasonLines = currentProperty
    ? selectMatchReasonLines({
        location: location?.verdict === "good" ? "Within Preferred Area" : null,
        approval: approvalReason,
        features: featureLabels, // full labels; fit-checked to 3 or 2 (never wraps)
      })
    : [];

  // Canonical verified current special → normalized SHORT badge (e.g. "1 Month Free",
  // "$200 Gift Card"), from property_catalog.current_special via the enrichment
  // round-trip. Shown ONLY when it normalizes AND the record is fresh (verified_at
  // within the window) — never stale/Unknown/raw long text. Distinct from the raw
  // scraped `propertySpecials` block. Null → no badge.
  const shortSpecial =
    currentProperty && isSpecialCurrent(currentProperty.catalogVerifiedAt)
      ? normalizeShortSpecial(currentProperty.propertyCurrentSpecial)
      : null;
  // Locator commission STATUS (paying / not_paying / unverified) — trusted-master
  // canonical data. Locator surface only; never shown to the client. Unknown ≠ No:
  // blank/Unknown is "unverified", never assumed not-paying.
  const commissionStatus = currentProperty
    ? evaluateLocatorCommission({
        sendCommission: currentProperty.sendCommission,
        escortCommission: currentProperty.escortCommission,
        bonusFlat: currentProperty.bonusFlat,
      })
    : null;

  // Is the current property already in THIS client's Favorites? Drives the header
  // heart's filled/active state (mirrors isRecommended's read of recommendations).
  const isFavorited = !!cpKey && favorites.some((f) => canonicalPropertyKey(f.propertyUrl ?? "") === cpKey);

  return (
    <div className="bc-props">
      {/* Current Property — the the external property site property currently being viewed
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
            {/* Favorite — the SAME compact heart control used on Recommendation rows
                (.bc-prop-move--heart): empty ♡ at rest, red on hover, filled ♥ once in
                Favorites. An ICON, not a labeled button, so the card stays compact and
                + Recommend remains the single primary action. Sits in the header just
                left of the ✕. Reuses the already-wired add-favorite verb — no new path. */}
            {onAddFavorite && (
              <button
                type="button"
                className={`bc-cp-fav bc-prop-move bc-prop-move--heart${isFavorited ? " is-on" : ""}`}
                aria-label={isFavorited ? "In this client's Favorites" : "Add to this client's Favorites"}
                aria-pressed={isFavorited}
                title={isFavorited ? "In Favorites" : "Add to Favorites"}
                onClick={() => !isFavorited && onAddFavorite?.()}
                disabled={isFavorited}
              >
                {isFavorited ? "♥" : "♡"}
              </button>
            )}
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
              <PropertyThumb src={currentProperty.propertyImageUrl} backupSrc={currentProperty.propertyImageUrlBackup} alt={currentProperty.propertyName} size={48} />
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
                    <span className="bc-cp-rating-label">Google Rating</span>
                  </div>
                )}
              </div>
            </div>

            {/* Full-width STATUS ROW beneath the top row — Special (blue) + Commission
                (green) pills start at the card's LEFT content edge, using the space
                under the thumbnail instead of the narrow text column. Side-by-side
                when they fit; a long commission wraps to its own full-width line
                rather than squeezing/wrapping inside the right column. */}
            {(shortSpecial || commissionStatus) && (
              <div className="bc-cp-status">
                {shortSpecial && <span className="bc-cp-special">{shortSpecial}</span>}
                {commissionStatus && (
                  commissionStatus.state === "paying" ? (
                    <span className="bc-cp-commission"
                          aria-label={`Commission: ${commissionStatus.text}`}
                          title={`Commission: ${commissionStatus.text}`}>
                      {/* The dollar mark belongs to the PAYING state alone — it marks
                          compensation, not the absence of it, so the no-pay and unverified
                          chips below stay text-only. Matches the web app's CommissionBadge. */}
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.25}
                           strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 2v20" />
                        <path d="M17 6.5c0-1.9-2.2-3-5-3s-5 1.1-5 3 2.2 2.9 5 3.4 5 1.4 5 3.6-2.2 3.5-5 3.5-5-1.3-5-3.2" />
                      </svg>
                      <span className="bc-cp-commission-label">{commissionStatus.text}</span>
                    </span>
                  ) : commissionStatus.state === "not_paying" ? (
                    <span className="bc-cp-commission bc-cp-commission--nopay">Not Paying Locators</span>
                  ) : (
                    <span className="bc-cp-commission bc-cp-commission--unverified">Commission Not Verified</span>
                  )
                )}
              </div>
            )}

            {/* "Why I chose this for you" — up to 3 short personalized reason lines,
                the SAME shared selector + decision language as the Map property card.
                Strongest-first (location → commute → approval → features → special);
                the feature line spells out full labels (e.g. "Floor-to-Ceiling
                Windows") joined by " · ". Only meaningful reasons appear — never a
                property-data dump. The first line is emphasized. */}
            {reasonLines.length > 0 && (
              <div className="bc-cp-reasons" ref={reasonsRef}>
                {reasonLines.map((line, i) => (
                  <p
                    key={i}
                    className={
                      `bc-cp-reason${i === 0 ? " is-lead" : ""}` +
                      (featureLineText && line === featureLineText ? " bc-cp-reason--features" : "")
                    }
                  >
                    {line}
                  </p>
                ))}
                {/* Hidden probe — the full 3-feature line, same styling, used only to
                    measure whether 3 fit on one line at the current width. */}
                {allFeatures.length >= 3 && (
                  <span
                    ref={featureMeasureRef}
                    className="bc-cp-reason--features"
                    aria-hidden
                    style={{ position: "absolute", visibility: "hidden", pointerEvents: "none", left: -9999, top: 0 }}
                  >
                    {fullFeatureText}
                  </span>
                )}
              </div>
            )}
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
