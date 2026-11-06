"use client"

import type { ReactNode } from "react"
import type { ScreeningCriterionRow } from "@/lib/propertyIntel/approvalCriteria"

/**
 * QUICK MATCH BADGE — the agent-only mark on a generated recommendation.
 *
 * It is a CHIP ON AN EXISTING CARD, not a panel. Quick Match has no section of its own and no
 * Map Explorer tab: its output IS the Recommended Properties list, and this is how a row the
 * engine drafted is told apart from one the agent chose. Everything else about the card — the
 * thumbnail, the name link, the specials banner, the reasons control, the commission chip — is
 * untouched.
 *
 * ── THE LABEL IS THE SAFETY FEATURE ─────────────────────────────────────────────────────────
 * Two labels, and the difference between them is the whole reason an agent can trust the list:
 *
 *   Quick Match                  every screening requirement this property STATES for this
 *                                client is met. Still not approval, which the detail says.
 *   Quick Match · Verify         there are open questions, and they are listed.
 *
 * There was a third — "No policy" — for a curated property with nothing on record. It is gone:
 * such a property is no longer recommended on curation alone, and when it IS recommended
 * (because the client's own stated area puts it in front of them) it wears Needs Verification
 * and its detail LEADS with the fact that no policy is recorded. `policyOnRecord` carries that
 * distinction, so the softer label never hides it.
 *
 * ── AGENT-ONLY, BY CONSTRUCTION ─────────────────────────────────────────────────────────────
 * This reads `lead_recommendations.screening`, a column neither lb_create_client_share nor
 * lb_prepare_client_share names — both list their columns explicitly, so the screening detail
 * cannot reach the client-facing /r page even if a row is shared. Nothing here is rendered on
 * any client surface.
 */

export type QuickMatchTier = "strong_candidate" | "needs_verification"

export type QuickMatchScreening = {
  tier: QuickMatchTier
  /** false = this property states no requirement bearing on the client's situation. */
  policyOnRecord?: boolean
  /** Where it sits relative to what the client asked for. */
  geography?: string | null
  reasons?: string[]
  unverified?: string[]
  conflicts?: string[]
  conditions?: string[]
  computedAt?: string
  collection?: string
}

// ── WHY BLUE AND NOT GREEN ──────────────────────────────────────────────────────────────────
// The first version made a Strong Candidate dark green, and rendering the card showed it sitting
// on the same row as the commission chip in exactly that colour. CommissionBadge's own note
// explains why its green is what it is — a special is a renter incentive, a commission is agent
// compensation, and the dark forest green was chosen to separate the two. A third green would
// undo that. Blue is unused on this card, so a screening verdict reads as its own kind of thing.
const CHIP: Record<QuickMatchTier, { label: string; cls: string; title: string }> = {
  strong_candidate: {
    label: "Quick Match",
    cls: "border-[#2b4a7a] bg-[#0f1d2e] text-[#7cb2f5]",
    title: "Quick Match: every screening requirement this property states for this client is met. Not a guarantee of approval.",
  },
  needs_verification: {
    label: "Quick Match · Verify",
    cls: "border-[#d8a34a] bg-[#fdf3e2] text-[#8a5a10]",
    title: "Quick Match: there are open questions about this property for this client. Confirm them before sending.",
  },
}

const NO_POLICY_TITLE =
  "Quick Match: this property states no screening policy for this client's situation. It is on the curated list and in the client's own area — confirm everything before sending."

/** Narrow an unknown jsonb value to the shape above, or null. A row written before a tier was
 *  added, or by hand, renders no chip rather than an "undefined" one. */
export function readScreening(value: unknown): QuickMatchScreening | null {
  if (!value || typeof value !== "object") return null
  const v = value as Record<string, unknown>
  const tier = v.tier
  if (tier !== "strong_candidate" && tier !== "needs_verification") return null
  const list = (k: string): string[] =>
    Array.isArray(v[k]) ? (v[k] as unknown[]).map((x) => String(x)).filter(Boolean) : []
  return {
    tier,
    // Absent means "not recorded", and the safe reading of that is NOT "a policy exists". Only
    // an explicit true says the property states something about this client's situation.
    policyOnRecord: v.policyOnRecord === true,
    geography: typeof v.geography === "string" && v.geography.trim() !== "" ? v.geography : null,
    reasons: list("reasons"),
    unverified: list("unverified"),
    conflicts: list("conflicts"),
    conditions: list("conditions"),
    computedAt: typeof v.computedAt === "string" ? v.computedAt : undefined,
    collection: typeof v.collection === "string" ? v.collection : undefined,
  }
}


/** The chip's own text and colours, with the no-policy title substituted when it applies. */
function chipFor(screening: QuickMatchScreening) {
  const base = CHIP[screening.tier]
  return screening.policyOnRecord === false ? { ...base, title: NO_POLICY_TITLE } : base
}

/** The panel now shows ONE thing: the property's five recorded screening criteria. Without
 *  them — a property outside the loaded collection, or a load that failed — there is nothing to
 *  disclose, so the chip carries no arrow and no panel renders. Five rows of "Unknown" would
 *  claim research that has not happened. */
export function quickMatchHasDetail(criteria: ScreeningCriterionRow[] | null | undefined): boolean {
  return !!criteria && criteria.length > 0
}

/**
 * THE CHIP. Split out from the panel so the card can place it beside the property name, in the
 * same name-row slot the Top Pick badge occupies, while the detail it opens keeps the full card
 * width below. Chip and panel are one disclosure: the caller owns `open` and gives both the same
 * value. Nothing about either one's appearance or wording changed in the split.
 */
export function QuickMatchChip({
  screening,
  criteria,
  open,
  onToggle,
  className = "",
}: {
  screening: QuickMatchScreening
  /** The five recorded criteria, or null when none could be read for this property. */
  criteria?: ScreeningCriterionRow[] | null
  open: boolean
  onToggle: () => void
  className?: string
}): ReactNode {
  const chip = chipFor(screening)
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={chip.title}
      title={chip.title}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-lg border px-2.5 py-[3px] text-[11px] font-medium leading-none transition-colors hover:brightness-105 ${chip.cls} ${className}`}
    >
      <span className="font-semibold">{chip.label}</span>
      {quickMatchHasDetail(criteria) && (
        <span aria-hidden className="text-[9px] opacity-70">{open ? "▴" : "▾"}</span>
      )}
    </button>
  )
}

/**
 * THE PANEL — the property's five screening criteria, one compact row each.
 *
 * It replaces the earlier grouped prose (possible conflicts, needs verification, approval
 * costs, why it was drafted). The five rows are the ones a locator checks before sending, and
 * they are read from Property Intelligence / Approval Criteria rather than restated here:
 * `screeningCriteriaRows` builds them from the editor's own option lists, so a label changed
 * there changes here too.
 *
 * Unknown is printed in a muted tone rather than left blank. A blank value reads as "no
 * requirement", which is the one misreading that costs a renter an application fee.
 */
export function QuickMatchDetail({
  criteria,
  className = "",
}: {
  criteria: ScreeningCriterionRow[] | null | undefined
  className?: string
}): ReactNode {
  if (!quickMatchHasDetail(criteria)) return null
  return (
    <div className={`w-full rounded-lg border border-[var(--crm-border-soft)] bg-[var(--crm-card)] px-2.5 py-1.5 ${className}`}>
      <dl className="divide-y divide-[var(--crm-border-soft)]">
        {criteria!.map((c) => (
          <div key={c.label} className="flex items-baseline justify-between gap-3 py-[3px]">
            <dt className="min-w-0 truncate text-[11px] leading-snug text-[var(--crm-text-secondary)]">{c.label}</dt>
            <dd className={`flex-none text-[11px] font-semibold leading-snug tabular-nums ${
              c.recorded ? "text-[var(--crm-text-primary)]" : "text-[var(--crm-text-muted)] font-medium"
            }`}>{c.value}</dd>
          </div>
        ))}
      </dl>
      <p className="pt-1 text-[10px] leading-snug text-[var(--crm-text-muted)]">
        A Quick Match draft, for the agent only. It is never sent to the client and never
        promises approval.
      </p>
    </div>
  )
}
