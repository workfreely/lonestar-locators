"use client"

import { SectionCard } from "./LeadPanelSections"
import PropertyThumb from "./PropertyThumb"
import { displayAddress, formatRating } from "@bc/companion-shared"
import { StarRating } from "./StarRating"

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

export default function BestMatches({
  lead,
  recommendations = [],
  onRemoveRecommendation,
  onMoveToFavorite,
}: {
  lead: any
  recommendations?: any[]
  /** Compact ✕ — remove the recommendation association entirely. */
  onRemoveRecommendation?: (propertyUrl?: string | null) => void
  /** Heart — move the property from Recommendations → Favorites. */
  onMoveToFavorite?: (propertyUrl?: string | null) => void
}) {
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
                  <p className="truncate text-[11px] text-[var(--crm-text-muted)]">{displayAddress(r.property_address)}</p>
                )}
                {typeof r.google_rating === "number" && (
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span className="text-[11px] font-semibold tabular-nums text-[var(--crm-text-secondary)]">{formatRating(r.google_rating)}</span>
                    <StarRating value={r.google_rating} />
                  </div>
                )}
              </div>
              {/* Action area — ✕ (remove) on the LEFT, ♡ (move to Favorites) on the
                  RIGHT. Both dispatch the shared synced verbs. The heart is styled to
                  MATCH the Beast Companion Recommendation heart (bc-prop-move--heart):
                  22px control, 6px radius, 1px border + elevated bg, empty ♡ at
                  15px/600, neutral at rest, soft red glow (glyph + border + tint) on
                  hover, 120ms transition. The ✕ is deliberately quieter (borderless,
                  muted, smaller) so the heart stays the primary action. */}
              {(onRemoveRecommendation || onMoveToFavorite) && (
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
                  {onMoveToFavorite && (
                    <button
                      type="button"
                      aria-label="Move to favorites"
                      title="Move to favorites"
                      onClick={() => onMoveToFavorite(r.property_url)}
                      className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-md border border-[var(--crm-border)] bg-[var(--crm-card)] px-[5px] text-[15px] font-semibold leading-none text-[var(--crm-text-secondary)] transition-colors duration-[120ms] hover:border-red-500/60 hover:bg-red-500/10 hover:text-red-500"
                    >
                      ♡
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  )
}
