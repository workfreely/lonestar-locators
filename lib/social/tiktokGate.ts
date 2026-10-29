// THE TIKTOK LAUNCH SWITCH — pure, so it can be tested without a database client.
//
// It lives apart from the worker for the same reason publishHold and autoPosting do: the worker
// imports supabaseAdmin, which needs environment variables at module load, and a gate this
// important should be testable without standing any of that up. It reads an environment
// variable and nothing else, so there is no secret here and no reason to mark it server-only —
// publishHold.ts and autoPosting.ts are plain modules for the same reason.
/**
 * May the TikTok worker publish at all?
 *
 * CRON_SECRET answers "may this caller invoke the worker?". This answers the different and more
 * consequential question, and it is what lets the worker be deployed and verified in production
 * while real TikTok publishing stays off.
 *
 * FAIL CLOSED and deliberately strict: only the exact string "true" arms it. Missing, empty,
 * "TRUE", "1" and "yes" all leave it disarmed. Surrounding whitespace is trimmed, because an env
 * var pasted with a trailing newline is still an operator saying "true" — nothing else is.
 */
export function tiktokAutopublishEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.SOCIAL_TIKTOK_AUTOPUBLISH_ENABLED ?? "").trim() === "true"
}
