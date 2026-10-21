// INTRO-ONLY MODE — the engine may send the New-Lead opening pair and nothing else.
//
// ── WHY THIS IS A GATE AND NOT A DELETION ───────────────────────────────────────────────────
// The obvious way to get two texts and no more is to delete contact_fu1/2/3 from the sequence.
// That throws away working, tested copy and cadence for a restriction that is meant to be
// temporary, and it leaves no record that the steps ever existed. This refuses them at send time
// instead: the definitions, their templates and their tests stay exactly as they are, and lifting
// the restriction is one environment variable rather than a revert.
//
// ── WHY IT COVERS EVERY SEQUENCE, NOT JUST new_lead ─────────────────────────────────────────
// The brief is "exactly two automated texts, every other automated follow-up disabled", verified
// across the whole system rather than only for newly created leads. A switch that stopped
// contact_fu alone would leave list_sent, post_tour, application_status, done_selecting,
// future_move, resume_search and tour able to fire for any lead that later reaches their trigger —
// an existing lead finishing a tour, for instance. So this is an ALLOWLIST of (sequence, step)
// pairs, and it is consulted for every send the engine makes. Anything not named cannot send.
//
// ── WHY UNSET MEANS RESTRICTED ──────────────────────────────────────────────────────────────
// Every gate in this system is opt-in, and this one matches: the restriction holds through a
// deploy, a rollback and a fresh environment without anyone having to remember it. Restoring the
// full sequence set is a deliberate FOLLOWUP_ALL_SEQUENCES_ENABLED=true.
import type { SequenceKey } from "./types"

export const ALL_SEQUENCES_FLAG = "FOLLOWUP_ALL_SEQUENCES_ENABLED"

/** The only steps intro-only mode permits: the New-Lead opening pair. */
export const INTRO_ONLY_STEPS: ReadonlySet<string> = new Set(["t1", "t2"])

/**
 * Is the engine restricted to the opening pair?
 *
 * Demands the exact string "true" after trimming, like every other gate here, so a
 * truthy-looking value ("1", "yes", "TRUE") does not quietly re-enable six days of follow-ups.
 */
export function introOnlyMode(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env[ALL_SEQUENCES_FLAG] ?? "").trim() !== "true"
}

/** May this step send while intro-only mode is in force? */
export function permittedInIntroOnly(sequenceKey: SequenceKey, stepKey: string): boolean {
  return sequenceKey === "new_lead" && INTRO_ONLY_STEPS.has(stepKey)
}
