/**
 * THE PUBLISH HOLD — one switch, OFF by default.
 *
 * `needs_review_at` is set when the price or special a scheduled post depends on actually changes
 * (see migration 20261007000005). That detection, its stored reason, and the warning shown in the
 * editor are ALWAYS live — they cost nothing and they make a change visible.
 *
 * Whether a flagged post is also PREVENTED from publishing is a separate question, and today the
 * answer is no. The signal is only as good as the data behind it: until Property Intelligence and
 * the Beast agents are reliably reading property sites and updating prices and specials, a change
 * flag will fire on edits that are routine rather than meaningful, and holding posts on that basis
 * would stall a queue for no good reason. An informational warning is the honest level of
 * confidence; a block is not.
 *
 * WHEN TO TURN IT ON: once those agents are consistently keeping price/special current, so a flag
 * reliably means "this post now says something untrue". Set
 * SOCIAL_PUBLISH_HOLD_ON_REVIEW_ENABLED=true in the environment. Nothing else has to change — both
 * publish paths already consult this.
 *
 * FAIL-OPEN, deliberately, and the opposite of the autopublish flags. Those default to blocking
 * because the cost of a wrong publish is an unwanted post going out. This one defaults to allowing
 * because the cost of a wrong hold is a silently stalled queue, which is harder to notice. Only
 * the exact string "true" arms it; anything else — unset, "TRUE", "1", "yes" — leaves it off.
 *
 * NOT TIME-BASED. Nothing here or in the trigger looks at how old a post or its source data is.
 * social_content.updated_at stays informational: it says when a row was touched, never whether
 * what it says is still true.
 */
export const PUBLISH_HOLD_FLAG = "SOCIAL_PUBLISH_HOLD_ON_REVIEW_ENABLED"

export function publishHoldEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env[PUBLISH_HOLD_FLAG] ?? "").trim() === "true"
}

/**
 * Should this post be withheld right now?
 *
 * Both inputs matter and neither alone is enough: a flagged post publishes while the hold is off,
 * and an unflagged post publishes regardless.
 */
export function shouldHoldForReview(needsReviewAt: string | null | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  return publishHoldEnabled(env) && !!needsReviewAt
}

// ── THE AGENT-OWNED HOLD ────────────────────────────────────────────────────────────────────
//
// UNCONDITIONAL, and therefore NOT governed by PUBLISH_HOLD_FLAG. The flag above exists because a
// review flag on an ADMIN post is only as trustworthy as the data behind it, and holding his queue
// on a noisy signal costs more than it saves. Neither half of that reasoning survives for an agent:
//
//   * the admin knows what he changed; the agent does not
//   * an agent's approval is a statement about SPECIFIC content, so a change invalidates it by
//     definition rather than probabilistically
//
// So an agent-owned post with needs_review_at set does not publish. Full stop, no environment
// variable, nothing to forget to turn on.
//
// AVAILABILITY IS CHECKED SEPARATELY AND AT PUBLISH TIME. A withdrawal trigger sets the flag, but a
// flag can be cleared by a later write; the master's current availability cannot. Both are inputs
// here so neither alone can let a withdrawn video out.
export type AgentHoldInput = {
  /** Is this post owned by an EXTERNAL agent? See lib/social/agentIdentity.ts. */
  isAgentOwned: boolean
  needsReviewAt?: string | null
  /** social_content.available_to_agents for this post's master, read at publish time. */
  availableToAgents?: boolean | null
}

export type HoldDecision =
  | { hold: false }
  | { hold: true; reason: "needs_review" | "withdrawn_from_agents" }

/**
 * Should this post be withheld right now?
 *
 * ONE function for both publish paths — the cron worker and the manual button — so they cannot
 * drift into different answers. Admin posts keep exactly their existing behaviour: the env-gated,
 * fail-open flag and nothing else.
 */
export function publishHoldDecision(input: AgentHoldInput, env: NodeJS.ProcessEnv = process.env): HoldDecision {
  if (!input.isAgentOwned) {
    // ADMIN ROW — unchanged. Governed by the global flag exactly as before.
    return shouldHoldForReview(input.needsReviewAt, env) ? { hold: true, reason: "needs_review" } : { hold: false }
  }
  // AGENT ROW — unconditional.
  //
  // Availability first: a withdrawn video is a harder "no" than a stale one, and saying so
  // precisely is what lets the agent tell "ask the admin" from "re-approve it yourself".
  // `undefined` means the caller did not read it; only an explicit false withholds, so a caller
  // that cannot resolve the master does not silently block every agent post.
  if (input.availableToAgents === false) return { hold: true, reason: "withdrawn_from_agents" }
  if (input.needsReviewAt) return { hold: true, reason: "needs_review" }
  return { hold: false }
}
