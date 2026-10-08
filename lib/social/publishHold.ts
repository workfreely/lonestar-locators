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
