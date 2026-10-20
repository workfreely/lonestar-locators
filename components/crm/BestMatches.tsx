"use client"

import { SectionCard } from "./LeadPanelSections"
import ReasonsControl from "./ReasonsControl"
import PropertyPricingEditor from "./PropertyPricingEditor"
import PropertyThumb from "./PropertyThumb"
import { MAX_REASONS } from "@bc/companion-shared"
import { displayReasons } from "@/lib/leads/bedroomPricing"
import { placeIdFromPropertyUrl } from "@/lib/propertyExplorer/types"
import { displayAddress, formatRating, normalizeShortSpecial, isSpecialCurrent, evaluateLocatorCommission } from "@bc/companion-shared"
import { StarRating } from "./StarRating"
import RecommendationEngagement from "./RecommendationEngagement"
import { propertyWebsiteHref } from "@/lib/propertyExplorer/types"
import { DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors, closestCenter, type DragEndEvent } from "@dnd-kit/core"
import { SortableContext, useSortable, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { moveItem } from "@/lib/leads/recommendationOrder"
import type { WasherDryerStatus } from "@/lib/leads/washerDryer"
import { bedroomLineRentOverride, type AverageRentInputs } from "@/lib/leads/averageRent"

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

/** Six dots — the conventional vertical grip. Decorative; the button carries the label. */
function Grip() {
  return (
    <svg viewBox="0 0 10 16" width="10" height="16" aria-hidden fill="currentColor">
      <circle cx="3" cy="3" r="1.35" /><circle cx="7" cy="3" r="1.35" />
      <circle cx="3" cy="8" r="1.35" /><circle cx="7" cy="8" r="1.35" />
      <circle cx="3" cy="13" r="1.35" /><circle cx="7" cy="13" r="1.35" />
    </svg>
  )
}

/**
 * ONE recommendation row, draggable by its handle.
 *
 * The card is passed through as `children` and is NOT modified — same markup, same classes, same
 * height, same thumbnail, same reasons, same ✕ / pencil / ♡ handlers. This adds a grip to its
 * left and applies the drag transform to the pair.
 *
 * Only the HANDLE carries the drag listeners, so a press anywhere on the card still reaches the
 * control underneath it. The transform is pinned to the Y axis (x: 0) instead of pulling in
 * @dnd-kit/modifiers for restrictToVerticalAxis — a vertical list has no use for horizontal
 * travel, and this needs no new dependency.
 *
 * With reordering off (no onReorder handler, or a single-row list) the row renders exactly as it
 * did before: no wrapper element, no grip, no listeners, no behaviour change at all.
 */
function SortableRecommendation({
  id, enabled, children,
}: { id: string; enabled: boolean; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !enabled })
  if (!enabled) return <>{children}</>
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform ? { ...transform, x: 0, scaleX: 1, scaleY: 1 } : null),
        transition,
        // The dragged row rides above its neighbours and dims slightly, so it reads as lifted.
        zIndex: isDragging ? 20 : undefined,
        position: isDragging ? "relative" : undefined,
        opacity: isDragging ? 0.85 : undefined,
      }}
      className="flex items-stretch gap-1"
    >
      <button
        type="button"
        aria-label="Reorder this property"
        title="Drag to reorder"
        {...attributes}
        {...listeners}
        className="flex w-4 flex-none cursor-grab touch-none items-center justify-center rounded text-[var(--crm-text-muted)] opacity-60 transition-opacity duration-[120ms] hover:opacity-100 focus-visible:opacity-100 active:cursor-grabbing"
      >
        <Grip />
      </button>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

export default function BestMatches({
  lead,
  recommendations = [],
  onRemoveRecommendation,
  onMoveToFavorite,
  onSendRecommendations,
  onOpenSentHistory,
  reasonsByKey,
  onSaveReasons,
  canEditPricing = false,
  onPricingSaved,
  onReorder,
  washerDryerByKey,
  onSaveWasherDryer,
  averageRentByKey,
  onSaveAverageRent,
}: {
  lead: any
  recommendations?: any[]
  /** Compact ✕ — remove the recommendation association entirely. */
  onRemoveRecommendation?: (propertyUrl?: string | null) => void
  /** Heart — move the property from Recommendations → Favorites. */
  onMoveToFavorite?: (propertyUrl?: string | null) => void
  /** Primary action — prepare/send the current Recommendations as a client share list. */
  onSendRecommendations?: () => void
  /** Secondary action — open this client's Sent List history (scoped to their lead). */
  onOpenSentHistory?: () => void
  /** Canonical reasons for this client, keyed by canonical_property_key. The SAME
   *  map Favorites reads, so both sections show one live value. */
  reasonsByKey?: Map<string, string[]>
  /** Persist reasons for ONE client-property PAIR. Keyed by the property, never by
   *  the recommendation row id — the row is deleted when the property moves to
   *  Favorites, and the reasons must outlive it. */
  onSaveReasons?: (canonicalPropertyKey: string, reasons: string[]) => Promise<boolean>
  /**
   * Platform-owner only: show the pricing pencil. PRESENTATION ONLY — the authorization
   * boundary is requirePlatformAdmin() inside /api/admin/owner/property-pricing, which
   * re-checks on every call. Hiding this never has to be relied on.
   */
  canEditPricing?: boolean
  /** Bumped after a pricing save so the derived reason re-renders with the new value. */
  onPricingSaved?: () => void
  /**
   * Persist a new arrangement. Receives THIS lead's visible recommendation ids in the order the
   * locator left them; the caller writes 1..N to lead_recommendations.sort_order. Absent → no
   * grips are rendered and the list behaves exactly as before.
   */
  onReorder?: (orderedIds: (number | string)[]) => void
  /** Client-facing washer/dryer status per canonical_property_key, for THIS client. */
  washerDryerByKey?: Map<string, WasherDryerStatus | null>
  /** Persist the status for ONE client-property pair. Absent → no dropdown is offered. */
  onSaveWasherDryer?: (canonicalPropertyKey: string, next: WasherDryerStatus | null) => Promise<boolean>
  /** The confirmed average-rent figures per canonical_property_key, for THIS client. */
  averageRentByKey?: Map<string, AverageRentInputs>
  /** Persist all five figures for ONE pair. Absent → no average-rent control is offered. */
  onSaveAverageRent?: (canonicalPropertyKey: string, next: AverageRentInputs) => Promise<boolean>
}) {
  const leadRecommendations = (recommendations || []).filter(
    (r) => String(r.lead_id) === String(lead?.id),
  )

  // ── ARRANGING ──────────────────────────────────────────────────────────────────────────────
  // The incoming array is ALREADY in canonical order — the loader applies sort_order ASC NULLS
  // LAST, created_at, id, the same rule the share fingerprint and the snapshot's row_number()
  // use. This section renders it as given and never re-sorts; a drag reports the ids in their
  // new order and the caller persists 1..N, so there is no second source of truth here.
  const canReorder = typeof onReorder === "function" && leadRecommendations.length > 1
  const rowIds = leadRecommendations.map((r) => String(r.id))
  // A 5px threshold: a press that never travels is a CLICK and must still reach the control it
  // landed on. Keyboard sorting comes free with dnd-kit's own coordinate getter.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )
  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = rowIds.indexOf(String(active.id))
    const to = rowIds.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    onReorder?.(moveItem(leadRecommendations, from, to).map((r) => r.id))
  }

  return (
    <SectionCard title="Recommended Properties" collapsible defaultOpen storageKey="best-matches">
      {leadRecommendations.length === 0 ? (
        <p className="text-[11px] text-[var(--crm-text-muted)]">No recommendations yet.</p>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={rowIds} strategy={verticalListSortingStrategy}>
        <div className="space-y-1.5">
          {leadRecommendations.map((r) => {
            // Locator-facing status — Special (blue, compact, beside the name) +
            // Commission (green/red/neutral, on the bottom-right operational row).
            const shortSpecial = isSpecialCurrent(r.current_special_checked_at ?? r.verified_at) ? normalizeShortSpecial(r.current_special) : null
            const commission = evaluateLocatorCommission({
              sendCommission: r.send_commission,
              escortCommission: r.escort_commission,
              bonusFlat: r.bonus_flat,
            })
            // Genuine Match % (same 0–100 scale as Map / Beast Companion) — rendered ONLY
            // when a real score is present (> 0). These list rows do not carry a score yet,
            // so `matchScore` is null and nothing renders — never a placeholder, default,
            // or 0%. Wiring the real source later populates this without a card redesign.
            const matchScore = typeof (r as { match_score?: unknown }).match_score === "number" ? (r as { match_score: number }).match_score : null
            const showMatch = matchScore !== null && Number.isFinite(matchScore) && matchScore > 0

            // The catalog identity for THIS row, resolved from its Google Maps property_url
            // exactly as the rating/image enrichment does. Null when the URL yields no place
            // id — the pencil is then not offered, because an editor with no confident
            // property to write against could only guess.
            const pricingPlaceId = placeIdFromPropertyUrl(r.property_url)

            // The SAVED reasons (canonical, locator-owned) and the DISPLAY list (those plus
            // the derived bedroom price). They are deliberately separate values: the editor
            // writes `savedReasons`, the row renders `shownReasons`, and the price therefore
            // never becomes stored text that a later correction would leave stale.
            const savedReasons = reasonsByKey?.get(String(r.canonical_property_key)) ?? []
            // When a confirmed quote is being shown, the preview quotes that unit too, so the
            // workspace shows the locator exactly the line the client will read.
            const quoteOverride = bedroomLineRentOverride(averageRentByKey?.get(String(r.canonical_property_key)))
            const shownReasons = displayReasons(
              savedReasons,
              {
                onebrStartingRent: (r as { onebr_starting_rent?: number | null }).onebr_starting_rent ?? null,
                twobrStartingRent: (r as { twobr_starting_rent?: number | null }).twobr_starting_rent ?? null,
                threebrStartingRent: (r as { threebr_starting_rent?: number | null }).threebr_starting_rent ?? null,
              },
              lead?.beds,
              MAX_REASONS,
              quoteOverride,
            )
            return (
            <SortableRecommendation key={r.id} id={String(r.id)} enabled={canReorder}>
            <div
              className="rounded-lg border border-[var(--crm-border)] bg-[var(--crm-inset)] px-3 py-2"
            >
              <div className="flex items-start gap-2.5">
              <PropertyThumb src={r.property_image_url} alt={r.property_name} />
              {(() => {
                // The name links ONLY to the real property website (resolved read-side
                // from property_catalog.website_url), never the property_url (Google Maps).
                const recHref = propertyWebsiteHref((r as { website_url?: string | null }).website_url)
                return (
                  <div className="min-w-0 flex-1">
                    {/* Name row — property name (typography unchanged) + top-right controls. */}
                    <div className="flex items-center justify-between gap-2">
                      {recHref ? (
                        <a href={recHref} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate text-[12.5px] font-semibold text-[var(--crm-accent)] hover:underline">{r.property_name}</a>
                      ) : (
                        <p className="min-w-0 truncate text-[12.5px] font-semibold text-[var(--crm-text-primary)]">{r.property_name}</p>
                      )}
                      {(onRemoveRecommendation || onMoveToFavorite || (canEditPricing && pricingPlaceId)) && (
                        <div className="flex flex-none items-center gap-1.5">
                          {onRemoveRecommendation && (
                            <button
                              type="button"
                              aria-label="Remove recommendation"
                              title="Remove recommendation"
                              onClick={() => onRemoveRecommendation(r.property_url)}
                              className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-md text-[12px] leading-none text-[var(--crm-text-muted)] transition-colors duration-[120ms] hover:text-red-500"
                            >
                              ✕
                            </button>
                          )}
                          {/* Owner-only pricing pencil — IMMEDIATELY LEFT OF THE HEART, as
                              specified. The existing ✕ and ♡ keep their order, their
                              handlers and their styling; this is inserted between them and
                              matches their 22×22 footprint, so the controls row and the
                              card height are unchanged. Rendered only when the property
                              resolves to a catalog place_id — without one there is nothing
                              to write against, and offering an editor that could not save
                              (or worse, could be pointed at the wrong property) is not an
                              option. */}
                          {canEditPricing && pricingPlaceId && (
                            <PropertyPricingEditor
                              placeId={pricingPlaceId}
                              propertyName={r.property_name}
                              onSaved={onPricingSaved}
                            />
                          )}
                          {onMoveToFavorite && (
                            <button
                              type="button"
                              aria-label="Move to favorites"
                              title="Move to favorites"
                              onClick={() => onMoveToFavorite(r.property_url)}
                              className="crm-rec-heart"
                            >
                              ♡
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    {/* Address row — address left, Special (compact, current/verified only)
                        on the far right. mt-[7px] gives clear separation below the top-right
                        controls so the Special never reads as attached to Edit/♡. */}
                    {(r.property_address || shortSpecial) && (
                      <div className="mt-[7px] flex items-center justify-between gap-2">
                        <p className="min-w-0 truncate text-[11px] text-[var(--crm-text-muted)]">{r.property_address ? displayAddress(r.property_address) : ""}</p>
                        {shortSpecial && (
                          <span className="flex-none rounded-md border border-[#8fb6ea] bg-[#e8f0fe] px-1 py-[1px] text-[9px] font-semibold leading-none text-[#1c3f75]">{shortSpecial}</span>
                        )}
                      </div>
                    )}
                    {/* Rating row — Google rating left, genuine Match % on the far right
                        (only when a real score exists). */}
                    {(typeof r.google_rating === "number" || showMatch) && (
                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-1.5">
                          {typeof r.google_rating === "number" && (
                            <>
                              <span className="text-[11px] font-semibold tabular-nums text-[var(--crm-text-secondary)]">{formatRating(r.google_rating)}</span>
                              <StarRating value={r.google_rating} />
                              <span className="-ml-[3px] text-[11px] text-[var(--crm-text-muted)]">Google Rating</span>
                            </>
                          )}
                        </div>
                        {showMatch && (
                          <span className="flex-none rounded-md border border-[var(--crm-border)] px-1.5 py-[1px] text-[10px] font-semibold leading-none text-[var(--crm-text-secondary)]">{matchScore}% <span className="font-medium text-[var(--crm-text-muted)]">Match</span></span>
                        )}
                      </div>
                    )}
                  </div>
                )
              })()}
              </div>
              {/* Operational row — Recommended has no Guest Card / Schedule Tour actions,
                  so Commission aligns to the bottom-right of the card. Present whenever
                  there is a commission state (always ≥ "Not Verified"). */}
              {/* The commission badge is flex-none + nowrap, and the reasons half is
                  flex-1 + min-w-0, so a long reason ellipses instead of squeezing,
                  wrapping or compressing the badge. */}
              <div className="mt-2 flex items-center justify-between gap-3">
                {/* "Why I chose this" — compact, secondary, anchored to the card's left
                    edge (the operational row spans the full card, so this aligns with
                    the property image above it). Expands an inline editor. The
                    client-facing page placement is NOT affected by this control. */}
                {onSaveReasons && r.canonical_property_key ? (
                  <ReasonsControl
                    // Editing always operates on the SAVED reasons…
                    reasons={savedReasons}
                    // …while the inline preview shows the derived list (location · price ·
                    // amenity). Nothing here can write the price back.
                    previewReasons={shownReasons}
                    onSave={(next) => onSaveReasons(String(r.canonical_property_key), next)}
                    // Washer/dryer rides on the SAME client-property pair as the reasons.
                    // Supplied only here, so Favorites keeps the editor it has always had.
                    washerDryer={washerDryerByKey?.get(String(r.canonical_property_key)) ?? null}
                    onSaveWasherDryer={
                      onSaveWasherDryer
                        ? (next) => onSaveWasherDryer(String(r.canonical_property_key), next)
                        : undefined
                    }
                    averageRent={averageRentByKey?.get(String(r.canonical_property_key)) ?? null}
                    onSaveAverageRent={
                      onSaveAverageRent
                        ? (next) => onSaveAverageRent(String(r.canonical_property_key), next)
                        : undefined
                    }
                  />
                ) : <span />}
                {commission.state === "paying" ? (
                  <span className="flex-none whitespace-nowrap rounded-lg border border-[#8ecaa6] bg-[#dff5e6] px-2.5 py-[3px] text-[11px] font-medium leading-none text-[#136c3a]">
                    <span className="font-semibold">Commission:</span> {commission.text}
                  </span>
                ) : commission.state === "not_paying" ? (
                  <span className="flex-none whitespace-nowrap rounded-lg border border-[#eaa9a5] bg-[#fdeaea] px-2.5 py-[3px] text-[11px] font-semibold leading-none text-[#b42318]">Not Paying Locators</span>
                ) : (
                  <span className="flex-none whitespace-nowrap rounded-lg border border-[#cbd4e0] bg-[#eef1f5] px-2.5 py-[3px] text-[11px] font-medium leading-none text-[#5a6b86]">Commission Not Verified</span>
                )}
              </div>
            </div>
            </SortableRecommendation>
            )
          })}
        </div>
        </SortableContext>
        </DndContext>
      )}

      {/* Recommendation actions — BELOW the cards, inside Recommended Properties (never
          Favorites). Order: Sent List History (left, secondary/bordered) then Send
          Recommendations (right, stronger filled-accent action, and the wider button).
          Both operate on the canonical client-share flow; neither touches Favorites. */}
      {lead?.id != null && (onSendRecommendations || onOpenSentHistory) && (
        <div className="mt-3 flex items-center gap-2 border-t border-[var(--crm-border-soft)] pt-3">
          {onOpenSentHistory && (
            <button
              type="button"
              onClick={onOpenSentHistory}
              className="inline-flex flex-none items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-[var(--crm-border)] px-3 py-2 text-[12px] font-semibold text-[var(--crm-text-secondary)] transition-colors hover:bg-[var(--crm-card)] hover:border-[var(--crm-text-muted)] hover:text-[var(--crm-text-primary)]"
            >
              Sent List History
            </button>
          )}
          {/* ENGAGEMENT, INLINE — the history button and what that history amounts to belong on
              one line: they answer the same question. min-w-0 lets it truncate at narrow widths
              instead of pushing Send List off the row, and it renders NOTHING when no list has
              been sent, so the row collapses back to two buttons rather than leaving a gap. */}
          {lead?.id != null && (
            <RecommendationEngagement leadId={lead.id} variant="inline" />
          )}
          {onSendRecommendations && (
            <>
              {/* The divider separates "what already happened" from "do it again". Hidden when
                  there is no history to separate. The primary action earns its emphasis from
                  horizontal padding only — px-5 against the outlined button's px-3 — so the row
                  keeps its height and the button stays content-sized rather than full-width. */}
              {onOpenSentHistory && (
                <span aria-hidden className="ml-auto h-5 w-px flex-none bg-[var(--crm-border-soft)]" />
              )}
              <button
                type="button"
                onClick={onSendRecommendations}
                disabled={leadRecommendations.length === 0}
                title={leadRecommendations.length === 0 ? "Add recommendations first" : "Send these recommendations to the client"}
                className={`inline-flex flex-none items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-[var(--crm-accent)] px-5 py-2 text-[12px] font-semibold text-white transition-[filter,opacity] hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:brightness-100${onOpenSentHistory ? "" : " ml-auto"}`}
              >
                Send List
              </button>
            </>
          )}
        </div>
      )}
    </SectionCard>
  )
}
