// Comments — THE SEND POLICY: the gates, Meta's 7-day window, and how a send result is classified.
//
// classifySendAttempt is the most consequential function in this feature: it decides whether a
// person can ever be messaged again. The tests below are mostly about the boundary between
// "definitely did not send" and "we do not know", because getting that wrong either locks someone
// out for ever or messages them twice.
// Run: npx tsx scripts/social/commentSendPolicy.test.ts
import {
  featureGate, sendGate, privateReplyWindow, classifySendAttempt, isOutsideWindowError,
  PRIVATE_REPLY_WINDOW_DAYS,
} from "@/lib/social/commentSendPolicy"
import {
  parseBucUsage, shouldContinuePolling, planPoll, BACKOFF_THRESHOLD_PERCENT, POLL_WINDOW_DAYS,
} from "@/lib/social/commentRateLimit"
import { resolveDmOutcome } from "@/lib/social/commentIdentity"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}${d ? ` — ${d}` : ""}`) }
}

console.log("1. THE ENVIRONMENT GATES — case-sensitive \"true\", whitespace forgiven:")
{
  ok("'true' arms the kill switch", featureGate({ SOCIAL_COMMENT_AUTOMATION_ENABLED: "true" }).active)
  ok("'true' arms the sending gate", sendGate({ SOCIAL_COMMENT_SEND_ENABLED: "true" }).active)
  // Truthy-looking values are NOT consent. Case matters; surrounding whitespace does not.
  const offValues = [undefined, "", "false", "0", "1", "yes", "on", "TRUE", "True", "tru", "truee"]
  ok("EVERY other value is OFF for the kill switch",
    offValues.every((v) => !featureGate({ SOCIAL_COMMENT_AUTOMATION_ENABLED: v }).active),
    JSON.stringify(offValues.filter((v) => featureGate({ SOCIAL_COMMENT_AUTOMATION_ENABLED: v }).active)))
  ok("EVERY other value is OFF for the sending gate",
    offValues.every((v) => !sendGate({ SOCIAL_COMMENT_SEND_ENABLED: v }).active))
  ok("an empty environment is OFF for both", !featureGate({}).active && !sendGate({}).active)
  // Documented and deliberate, matching the publish worker's gate: a pasted leading space in a
  // Vercel field is not an intent to disable the feature.
  ok("surrounding whitespace IS forgiven, and only whitespace",
    featureGate({ SOCIAL_COMMENT_AUTOMATION_ENABLED: " true" }).active
    && featureGate({ SOCIAL_COMMENT_AUTOMATION_ENABLED: "true " }).active
    && !featureGate({ SOCIAL_COMMENT_AUTOMATION_ENABLED: "t rue" }).active)
  // The two switches are independent: intake can run while sending stays off. That is the dry run.
  ok("the gates are INDEPENDENT — automation on, sending off is a valid state",
    featureGate({ SOCIAL_COMMENT_AUTOMATION_ENABLED: "true" }).active
    && !sendGate({ SOCIAL_COMMENT_AUTOMATION_ENABLED: "true" }).active)
}

console.log("\n2. META'S 7-DAY PRIVATE-REPLY WINDOW:")
{
  const NOW = Date.parse("2026-10-17T12:00:00Z")
  const ago = (h: number) => new Date(NOW - h * 3_600_000).toISOString()
  const w = (commentedAt: string | null) => privateReplyWindow({ commentedAt, nowMs: NOW })

  ok("the window is seven days", PRIVATE_REPLY_WINDOW_DAYS === 7)
  ok("a comment from an hour ago is inside the window", w(ago(1)).withinWindow)
  ok("…with hours remaining reported", w(ago(1)).hoursRemaining === 167)
  ok("a comment from 6 days 23 hours ago is still inside", w(ago(167)).withinWindow)
  ok("a comment from exactly 7 days ago is OUTSIDE (the boundary is closed)",
    !w(ago(168)).withinWindow && w(ago(168)).reason === "expired")
  ok("a comment from 8 days ago is expired", w(ago(192)).reason === "expired")
  // The refusal that matters: an undateable comment might be a month old.
  ok("a comment we cannot date is REFUSED, not assumed fresh",
    !w(null).withinWindow && w(null).reason === "unknown_age")
  ok("an unparseable date is refused", !w("not-a-date").withinWindow)
  ok("an empty string is refused", !w("").withinWindow)
}

console.log("\n3. CLASSIFYING A SEND — the accepted / failed / uncertain boundary:")
{
  const c = classifySendAttempt
  ok("200 with an id is ACCEPTED", c({ status: 200, externalId: "m1" }).outcome === "accepted")

  // The subtle one. A 2xx with nothing to record is not evidence of delivery.
  ok("200 WITHOUT an id is UNCERTAIN, not accepted",
    c({ status: 200, externalId: null }).outcome === "uncertain"
    && c({ status: 200 }).reason === "no_id_returned")
  ok("200 with an unparseable body is UNCERTAIN",
    c({ status: 200, externalId: "m1", unparseable: true }).outcome === "uncertain")

  ok("400 is a definite FAILURE (the server understood and refused)", c({ status: 400 }).outcome === "failed")
  ok("403 is a definite failure", c({ status: 403 }).outcome === "failed")
  ok("429 is a failure, classified as rate_limited",
    c({ status: 429 }).outcome === "failed" && c({ status: 429 }).reason === "rate_limited")
  ok("Meta code 4 (throttled) is a failure, not uncertain",
    c({ status: 400, errorCode: 4 }).reason === "rate_limited")
  ok("Meta code 613 (throttled) is a failure", c({ status: 400, errorCode: 613 }).reason === "rate_limited")
  ok("Meta code 190 (bad token) is a failure, classified as permission",
    c({ status: 400, errorCode: 190 }).reason === "permission")

  // Everything below MAY have been delivered, so none of it may be retried.
  ok("500 is UNCERTAIN", c({ status: 500 }).outcome === "uncertain")
  ok("502 is UNCERTAIN", c({ status: 502 }).outcome === "uncertain")
  ok("503 is UNCERTAIN", c({ status: 503 }).outcome === "uncertain")
  ok("a TIMEOUT / network error is UNCERTAIN",
    c({ status: null, transportError: true }).outcome === "uncertain"
    && c({ status: null, transportError: true }).reason === "transport_error")
  ok("a null status with no flag is still UNCERTAIN", c({ status: null }).outcome === "uncertain")
  ok("an unanticipated status (302) lands in the SAFE class",
    c({ status: 302 }).outcome === "uncertain")

  ok("Meta's too-old subcode is recognised so the ledger can say so",
    isOutsideWindowError({ status: 400, errorSubcode: 2534037 })
    && !isOutsideWindowError({ status: 400, errorSubcode: 1 }))
}

console.log("\n4. THE CLASSIFICATION FEEDS resolveDmOutcome — and only 'accepted' releases nothing:")
{
  const route = (a: Parameters<typeof classifySendAttempt>[0]) =>
    resolveDmOutcome(classifySendAttempt(a).outcome)

  const accepted = route({ status: 200, externalId: "m1" })
  ok("accepted → stamp sent, never retry", accepted.markSent && !accepted.retryable && accepted.mayClaimDmPublicly)

  const failed = route({ status: 400 })
  ok("failed → release the claim so a later comment may try", failed.releaseClaim && !failed.markSent)
  ok("failed may NOT claim a DM publicly", !failed.mayClaimDmPublicly)

  // The critical safety property, stated three ways.
  for (const a of [{ status: 500 }, { status: null, transportError: true }, { status: 200, externalId: null }]) {
    const r = route(a)
    if (r.markSent || r.releaseClaim || r.retryable || r.mayClaimDmPublicly) {
      fail++; console.log(`  ✗ an uncertain send was not held: ${JSON.stringify(a)}`)
    }
  }
  ok("EVERY uncertain send: not stamped, not released, NOT RETRIED, and may not claim a DM", true)
}

console.log("\n5. RATE LIMIT AWARENESS:")
{
  const header = JSON.stringify({ "1234": [{ type: "instagram", call_count: 12, total_cputime: 3, total_time: 4, estimated_time_to_regain_access: 0 }] })
  const u = parseBucUsage(header)
  ok("the usage header parses", u?.callCount === 12)

  // A header listing two buckets must be read at its WORST, not its first.
  const two = JSON.stringify({ "1": [{ call_count: 3 }, { call_count: 95 }] })
  ok("the WORST bucket wins, not the first", parseBucUsage(two)?.callCount === 95)
  const multi = JSON.stringify({ "1": [{ call_count: 10 }], "2": [{ call_count: 80 }] })
  ok("the worst across BUSINESS IDS wins too", parseBucUsage(multi)?.callCount === 80)

  ok("an absent header is UNKNOWN, not zero", parseBucUsage(null) === null)
  ok("an unparseable header is UNKNOWN", parseBucUsage("{{{") === null)
  ok("an empty object is UNKNOWN", parseBucUsage("{}") === null)

  ok(`the backoff threshold is ${BACKOFF_THRESHOLD_PERCENT}%, well short of the limit`,
    BACKOFF_THRESHOLD_PERCENT === 60)
  ok("low usage proceeds", shouldContinuePolling({ callCount: 10, totalCputime: 0, totalTime: 0, estimatedTimeToRegainAccess: 0 }).proceed)
  ok("usage AT the threshold stops",
    !shouldContinuePolling({ callCount: 60, totalCputime: 0, totalTime: 0, estimatedTimeToRegainAccess: 0 }).proceed)
  ok("CPU time alone can stop the run",
    !shouldContinuePolling({ callCount: 1, totalCputime: 99, totalTime: 0, estimatedTimeToRegainAccess: 0 }).proceed)
  ok("an active throttle stops the run regardless of percentages",
    shouldContinuePolling({ callCount: 1, totalCputime: 1, totalTime: 1, estimatedTimeToRegainAccess: 7 }).reason === "throttled")
  // The one documented exception to failing closed, and why.
  ok("UNKNOWN usage proceeds — otherwise the first call of a run could never be made",
    shouldContinuePolling(null).proceed && shouldContinuePolling(null).reason === "unknown_usage")
}

console.log("\n6. THE POLL PLAN — one call in the steady state:")
{
  const NOW = Date.parse("2026-10-17T12:00:00Z")
  const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString()
  ok("the poll window matches the private-reply window", POLL_WINDOW_DAYS === PRIVATE_REPLY_WINDOW_DAYS)

  const media = [
    { mediaId: "fresh-changed", timestamp: daysAgo(1), commentsCount: 5 },
    { mediaId: "fresh-same", timestamp: daysAgo(2), commentsCount: 3 },
    { mediaId: "fresh-fell", timestamp: daysAgo(3), commentsCount: 1 },
    { mediaId: "old", timestamp: daysAgo(30), commentsCount: 99 },
    { mediaId: "undated", timestamp: null, commentsCount: 1 },
  ]
  const cursors = [
    { mediaId: "fresh-changed", lastCommentsCount: 4 },
    { mediaId: "fresh-same", lastCommentsCount: 3 },
    { mediaId: "fresh-fell", lastCommentsCount: 2 },
    { mediaId: "old", lastCommentsCount: 1 },
  ]
  const plan = planPoll({ media, cursors, nowMs: NOW })
  ok("a media whose count ROSE is fetched", plan.fetch.includes("fresh-changed"))
  ok("a media whose count is UNCHANGED is skipped", !plan.fetch.includes("fresh-same"))
  // `!==` not `>`: a delete plus an add can leave the total equal, and a fall still means movement.
  ok("a media whose count FELL is fetched (a delete plus an add can hide behind a bare >)",
    plan.fetch.includes("fresh-fell"))
  ok("a media OUTSIDE the 7-day window is never fetched, however many comments it has",
    !plan.fetch.includes("old"))
  ok("an undated media is skipped with a reason",
    plan.skipped.some((s) => s.mediaId === "undated" && s.reason === "no_timestamp"))
  ok("the call estimate is 1 for the list plus one per fetch",
    plan.estimatedCalls === 1 + plan.fetch.length)

  // The no-migration fallback: with no cursors, everything in window is fetched. Correct, not frugal.
  const noCursors = planPoll({ media, cursors: [], nowMs: NOW })
  ok("WITHOUT cursors every in-window media is fetched — correct, merely less frugal",
    noCursors.fetch.length === 3 && !noCursors.fetch.includes("old"))
  ok("a null cursor count re-fetches (absence is not evidence of no change)",
    planPoll({ media, cursors: [{ mediaId: "fresh-same", lastCommentsCount: null }], nowMs: NOW })
      .fetch.includes("fresh-same"))
  ok("a provider that reports no count is always fetched",
    planPoll({
      media: [{ mediaId: "m", timestamp: daysAgo(1), commentsCount: null }],
      cursors: [{ mediaId: "m", lastCommentsCount: 3 }], nowMs: NOW,
    }).fetch.includes("m"))
  ok("the STEADY STATE costs exactly one call",
    planPoll({
      media: [{ mediaId: "m", timestamp: daysAgo(1), commentsCount: 3 }],
      cursors: [{ mediaId: "m", lastCommentsCount: 3 }], nowMs: NOW,
    }).estimatedCalls === 1)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
