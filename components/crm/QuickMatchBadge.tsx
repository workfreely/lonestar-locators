"use client"

import { useState } from "react"
import type { ReactNode } from "react"

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

function Group({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  if (items.length === 0) return null
  return (
    <div>
      <p className={`text-[10px] font-semibold uppercase tracking-wide ${tone}`}>{title}</p>
      <ul className="mt-0.5 space-y-0.5">
        {items.map((t, i) => (
          <li key={i} className="flex gap-1.5 text-[11px] leading-snug text-[var(--crm-text-secondary)]">
            <span aria-hidden className="text-[var(--crm-text-muted)]">·</span>
            <span className="min-w-0">{t}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function QuickMatchBadge({
  screening,
  className = "",
}: {
  screening: QuickMatchScreening
  className?: string
}): ReactNode {
  const [open, setOpen] = useState(false)
  const base = CHIP[screening.tier]
  const noPolicy = screening.policyOnRecord === false
  const chip = noPolicy ? { ...base, title: NO_POLICY_TITLE } : base
  const detail = [
    ...(screening.conflicts ?? []),
    ...(screening.unverified ?? []),
    ...(screening.conditions ?? []),
    ...(screening.reasons ?? []),
  ]

  return (
    <span className={`inline-flex flex-col items-start ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={chip.title}
        title={chip.title}
        className={`inline-flex items-center gap-1 whitespace-nowrap rounded-lg border px-2.5 py-[3px] text-[11px] font-medium leading-none transition-colors hover:brightness-105 ${chip.cls}`}
      >
        <span className="font-semibold">{chip.label}</span>
        {(detail.length > 0 || noPolicy || screening.geography) && (
          <span aria-hidden className="text-[9px] opacity-70">{open ? "▴" : "▾"}</span>
        )}
      </button>
      {open && (detail.length > 0 || noPolicy || screening.geography) && (
        // Agent-only detail, inside the card the chip belongs to. Not a panel, not a modal, and
        // not a second list — it expands under the chip and collapses again.
        <div className="mt-1.5 w-full space-y-1.5 rounded-lg border border-[var(--crm-border-soft)] bg-[var(--crm-card)] px-2.5 py-2">
          {noPolicy && (
            // FIRST, and in its own words. A row that reached the agent on geography alone must
            // say so before it says anything else.
            <p className="text-[11px] font-semibold leading-snug text-[#8a5a10]">
              No screening policy on record for this property — everything below is unconfirmed.
            </p>
          )}
          {screening.geography && (
            <p className="text-[11px] leading-snug text-[var(--crm-text-secondary)]">{screening.geography}</p>
          )}
          <Group title="Possible conflicts" items={screening.conflicts ?? []} tone="text-[#b42318]" />
          <Group title="Needs verification" items={screening.unverified ?? []} tone="text-[#8a5a10]" />
          <Group title="Approval costs" items={screening.conditions ?? []} tone="text-[var(--crm-text-secondary)]" />
          {/* The geographic sentence is shown above, so it is dropped from the list here: one
              fact, one place on the card. */}
          <Group title="Why it was drafted"
            items={(screening.reasons ?? []).filter((r) => r !== screening.geography)}
            tone="text-[var(--crm-text-muted)]" />
          <p className="pt-0.5 text-[10px] leading-snug text-[var(--crm-text-muted)]">
            A Quick Match draft, for the agent only. It is never sent to the client and never
            promises approval.
          </p>
        </div>
      )}
    </span>
  )
}
