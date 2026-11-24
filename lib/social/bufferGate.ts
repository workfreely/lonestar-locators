// THE BUFFER LAUNCH SWITCH — pure, so it can be tested without a database client.
//
// A SIBLING of tiktokGate, in the same shape and for the same reasons. It lives apart from the
// worker because the worker imports supabaseAdmin, which needs environment variables at module
// load, and a gate this consequential should be testable without standing any of that up. It
// reads an environment variable and nothing else, so there is no secret here.
/**
 * May the Buffer worker publish at all?
 *
 * CRON_SECRET answers "may this caller invoke the worker?". This answers the different question —
 * "may the worker publish anything?" — and it is what lets the worker be deployed and verified in
 * production while real publishing stays off.
 *
 * FAIL CLOSED and deliberately strict: only the exact string "true" arms it. Missing, empty,
 * "TRUE", "1" and "yes" all leave it disarmed. Surrounding whitespace is trimmed, because an env
 * var pasted with a trailing newline is still an operator saying "true" — nothing else is.
 *
 * ── WHY THIS IS A SEPARATE SWITCH FROM THE OTHER TWO ────────────────────────────────────────
 * SOCIAL_TIKTOK_AUTOPUBLISH_ENABLED arms OUR TikTok app, whose Content Posting API audit is still
 * under review. Buffer publishes with Buffer's own credentials and is not covered by that audit,
 * so the two must be armable independently — otherwise arming Buffer would require arming a path
 * that is deliberately held shut, and holding that path shut would forbid Buffer for no reason.
 */
export function bufferAutopublishEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.SOCIAL_BUFFER_AUTOPUBLISH_ENABLED ?? "").trim() === "true"
}

/**
 * MAY THE BUFFER ROUTE PUBLISH TIKTOK? — a second switch, and it replaces a real guard rather
 * than merely adding to one.
 *
 * bufferDestinationRefusal used to refuse tiktok_video outright, because DESTINATIONS.tiktok_video
 * .publish is 'awaiting_approval'. That field describes OUR TikTok developer app's audit, and this
 * route never calls our app — Buffer calls TikTok with Buffer's own audited app and the grant
 * Lisette gave Buffer directly. So the field was answering a question this route does not ask.
 *
 * But it was also providing something worth keeping: a PER-SURFACE clearance, so Instagram could
 * be armed without TikTok. Dropping the field check without replacing that would mean arming the
 * worker armed both surfaces at once. This switch is that clearance, expressed as a decision the
 * operator makes rather than as a field about an unrelated audit — and it is required IN ADDITION
 * to SOCIAL_BUFFER_AUTOPUBLISH_ENABLED, never instead of it.
 *
 * Strict "true", missing ⇒ no, exactly like its sibling.
 */
export function bufferTikTokEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.SOCIAL_BUFFER_TIKTOK_ENABLED ?? "").trim() === "true"
}
