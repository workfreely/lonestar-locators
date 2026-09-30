"use client"

import { useState } from "react"
import { SectionCard } from "./LeadPanelSections"
import PropertyThumb from "./PropertyThumb"
import { displayAddress, formatRating, normalizeShortSpecial, isSpecialCurrent, evaluateLocatorCommission, MAX_REASONS } from "@bc/companion-shared"
import { StarRating } from "./StarRating"
import { propertyWebsiteHref } from "@/lib/propertyExplorer/types"

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
  onSendRecommendations,
  onOpenSentHistory,
  onSaveReasons,
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
  /** Persist edited "Why I chose this for you" reasons for ONE recommendation row.
   *  Writes lead_recommendations.reasons — client-property-specific, never global. */
  onSaveReasons?: (recommendationId: number | string, reasons: string[]) => Promise<boolean>
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
          {leadRecommendations.map((r) => {
            // Locator-facing status — Special (blue, compact, beside the name) +
            // Commission (green/red/neutral, on the bottom-right operational row).
            const shortSpecial = isSpecialCurrent(r.verified_at) ? normalizeShortSpecial(r.current_special) : null
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
            return (
            <div
              key={r.id}
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
              <div className="mt-2 flex items-center justify-between gap-2">
                {/* "Why I chose this" — compact, secondary, anchored to the card's left
                    edge (the operational row spans the full card, so this aligns with
                    the property image above it). Expands an inline editor. The
                    client-facing page placement is NOT affected by this control. */}
                {onSaveReasons ? (
                  <ReasonsControl
                    reasons={Array.isArray(r.reasons) ? r.reasons : []}
                    onSave={(next) => onSaveReasons(r.id, next)}
                  />
                ) : <span />}
                {commission.state === "paying" ? (
                  <span className="rounded-lg border border-[#8ecaa6] bg-[#dff5e6] px-2.5 py-[3px] text-[11px] font-medium leading-none text-[#136c3a]">
                    <span className="font-semibold">Commission:</span> {commission.text}
                  </span>
                ) : commission.state === "not_paying" ? (
                  <span className="rounded-lg border border-[#eaa9a5] bg-[#fdeaea] px-2.5 py-[3px] text-[11px] font-semibold leading-none text-[#b42318]">Not Paying Locators</span>
                ) : (
                  <span className="rounded-lg border border-[#cbd4e0] bg-[#eef1f5] px-2.5 py-[3px] text-[11px] font-medium leading-none text-[#5a6b86]">Commission Not Verified</span>
                )}
              </div>
            </div>
            )
          })}
        </div>
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
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--crm-border)] px-3 py-2 text-[12px] font-semibold text-[var(--crm-text-secondary)] transition-colors hover:bg-[var(--crm-card)] hover:border-[var(--crm-text-muted)] hover:text-[var(--crm-text-primary)]"
            >
              Sent List History
            </button>
          )}
          {onSendRecommendations && (
            <button
              type="button"
              onClick={onSendRecommendations}
              disabled={leadRecommendations.length === 0}
              title={leadRecommendations.length === 0 ? "Add recommendations first" : "Send these recommendations to the client"}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[var(--crm-accent)] px-3 py-2 text-[12px] font-semibold text-white transition-[filter,opacity] hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:brightness-100"
            >
              Send Recommendations
            </button>
          )}
        </div>
      )}
    </SectionCard>
  )
}

/**
 * "Why I chose this · Edit" — the locator-side editor for one recommendation's
 * client-facing reasons.
 *
 * Deliberately secondary: collapsed it is a small muted button plus, when reasons
 * exist, a one-line preview of them. It never competes with the property name or the
 * commission chip, and it does not change the client-facing card, where the section
 * stays directly under the Google rating.
 *
 * 0–3 reasons. Zero is a legitimate state — the client page hides the section
 * entirely — so "Save" with everything cleared is a valid action, not an error.
 * Blank rows are dropped on save rather than stored as empty bullets.
 */
function ReasonsControl({
  reasons,
  onSave,
}: {
  reasons: string[]
  onSave: (next: string[]) => Promise<boolean>
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<string[]>(reasons)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function begin() {
    // Seed from the CURRENT saved value every time it opens, so a cancelled edit
    // never leaks into the next one.
    setDraft(reasons.length ? reasons : [""])
    setError(null)
    setOpen(true)
  }

  async function save() {
    const cleaned = draft.map((r) => r.trim()).filter(Boolean).slice(0, MAX_REASONS)
    setSaving(true)
    setError(null)
    const okSaved = await onSave(cleaned)
    setSaving(false)
    if (!okSaved) { setError("Couldn't save. Please try again."); return }
    setOpen(false)
  }

  if (!open) {
    return (
      <div className="flex min-w-0 items-center gap-1.5">
        <button
          type="button"
          onClick={begin}
          className="flex-none text-[10.5px] font-medium text-[var(--crm-text-muted)] underline decoration-[var(--crm-border)] underline-offset-2 transition-colors hover:text-[var(--crm-text-primary)]"
        >
          Why I chose this · Edit
        </button>
        {reasons.length > 0 && (
          <span className="min-w-0 truncate text-[10.5px] text-[var(--crm-text-muted)]">
            {reasons.join(" · ")}
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="w-full">
      <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--crm-text-muted)]">
        Why I chose this for you
      </p>
      <div className="flex flex-col gap-1.5">
        {draft.map((value, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input
              value={value}
              autoFocus={i === 0}
              // 40 chars, not 60: on the client card a reason renders at 18px on
              // mobile (the max-width:640px block scales it UP from 13.5px), where
              // ~40 characters is the last width that stays on ONE line at 375px.
              // Every approved example fits — the longest, "Within your $1,600–$1,700
              // budget", is 32.
              maxLength={40}
              placeholder="Short fragment — e.g. Washer & dryer included"
              onChange={(e) => setDraft((d) => d.map((v, j) => (j === i ? e.target.value : v)))}
              onKeyDown={(e) => { if (e.key === "Enter") void save() }}
              className="min-w-0 flex-1 rounded-lg border border-[var(--crm-border)] bg-[var(--crm-panel)] px-2 py-1 text-[11.5px] text-[var(--crm-text-primary)] outline-none focus:border-[var(--crm-text-muted)]"
            />
            <button
              type="button"
              aria-label="Remove reason"
              onClick={() => setDraft((d) => d.filter((_, j) => j !== i))}
              className="flex-none px-1 text-[11px] leading-none text-[var(--crm-text-muted)] transition-colors hover:text-red-500"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      {error && <p className="mt-1.5 text-[10.5px] font-medium text-red-500">{error}</p>}
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          disabled={draft.length >= MAX_REASONS}
          onClick={() => setDraft((d) => [...d, ""])}
          className="text-[10.5px] font-medium text-[var(--crm-text-secondary)] transition-colors hover:text-[var(--crm-text-primary)] disabled:opacity-40 disabled:hover:text-[var(--crm-text-secondary)]"
        >
          + Add reason
        </button>
        <span className="text-[10px] text-[var(--crm-text-muted)]">
          {draft.filter((d) => d.trim()).length}/{MAX_REASONS}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg px-2 py-1 text-[10.5px] font-medium text-[var(--crm-text-muted)] transition-colors hover:text-[var(--crm-text-primary)]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="rounded-lg bg-[var(--crm-accent)] px-2.5 py-1 text-[10.5px] font-semibold text-white transition-[filter,opacity] hover:brightness-110 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  )
}
