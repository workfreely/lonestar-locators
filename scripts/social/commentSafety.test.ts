// Comments — the launch-critical safeguards: what may be answered automatically, and when.
//
// Pure and deterministic. No model call, no network, no database. Every rule the brief sets out is
// asserted against the real implementation.
// Run: npx tsx scripts/social/commentSafety.test.ts
import {
  screenComment, shouldSendPublicReply, accountAutomationGate,
  DEFAULT_MAX_COMMENT_AGE_MINUTES, DEFAULT_PUBLIC_REPLY_COOLDOWN_MINUTES,
} from "@/lib/social/commentSafety"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}${d ? ` — ${d}` : ""}`) }
}

const NOW = Date.parse("2026-10-14T12:00:00Z")
const minsAgo = (m: number) => new Date(NOW - m * 60000).toISOString()
const base = {
  text: "LIST please!",
  commentedAt: minsAgo(2),
  isOwnAccount: false,
  isNestedReply: false,
  alreadyProcessed: false,
  activatedAt: minsAgo(60),
  nowMs: NOW,
}
const screen = (over: Partial<typeof base> = {}) => screenComment({ ...base, ...over })

console.log("1. THE HAPPY PATH, AND THE CERTAIN EXCLUSIONS:")
{
  ok("a fresh keyword comment is processed", screen().outcome === "process" && screen().reason === "ok")
  ok("our own comment is skipped", screen({ isOwnAccount: true }).reason === "own_account")
  ok("an already-processed comment is skipped (re-polling is free)",
    screen({ alreadyProcessed: true }).reason === "already_processed")
  ok("own account is checked FIRST, even on a hostile comment",
    screen({ isOwnAccount: true, text: "this is a scam" }).reason === "own_account")
  ok("already-processed beats content screening",
    screen({ alreadyProcessed: true, text: "this is a scam" }).reason === "already_processed")
}

console.log("\n2. NEW COMMENTS ONLY — activation must not answer a backlog:")
{
  ok("a comment from BEFORE activation is skipped",
    screen({ commentedAt: minsAgo(120), activatedAt: minsAgo(60) }).reason === "before_activation")
  ok("…and is skipped, not held, so it never reaches a human queue either",
    screen({ commentedAt: minsAgo(120) }).outcome === "skip")
  ok("a comment AFTER activation is processed",
    screen({ commentedAt: minsAgo(30), activatedAt: minsAgo(60) }).outcome === "process")

  // The age ceiling is independent of activation, so a long outage cannot release a flood.
  ok(`older than the ${DEFAULT_MAX_COMMENT_AGE_MINUTES}-minute default is skipped`,
    screen({ commentedAt: minsAgo(DEFAULT_MAX_COMMENT_AGE_MINUTES + 1), activatedAt: minsAgo(60 * 24 * 30) }).reason === "too_old")
  ok("just inside the ceiling is processed",
    screen({ commentedAt: minsAgo(DEFAULT_MAX_COMMENT_AGE_MINUTES - 1), activatedAt: minsAgo(60 * 24 * 30) }).outcome === "process")
  ok("the ceiling is configurable",
    screen({ commentedAt: minsAgo(90), activatedAt: minsAgo(60 * 24), maxAgeMinutes: 60 }).reason === "too_old")

  // THE RECONNECTION CASE: activated long ago, down for a week, a week of comments waiting.
  const backlog = [minsAgo(60 * 24 * 7), minsAgo(60 * 24 * 3), minsAgo(60 * 24 * 2), minsAgo(5)]
    .map((t) => screen({ commentedAt: t, activatedAt: minsAgo(60 * 24 * 30) }))
  ok("after a week of downtime only the FRESH comment is processed",
    backlog.filter((r) => r.outcome === "process").length === 1 && backlog[3].outcome === "process")
  ok("no timestamp at all → held, never processed on an assumption",
    screen({ commentedAt: null }).outcome === "hold" && screen({ commentedAt: null }).reason === "too_old")
}

console.log("\n3. CONTENT SCREENING — ambiguity holds, it never sends:")
{
  for (const t of ["this is a scam", "you're a scammer", "worst service ever", "I'm getting a lawyer", "what a fraud"]) {
    ok(`hostile: ${JSON.stringify(t)} → hold`, screen({ text: t }).outcome === "hold" && screen({ text: t }).reason === "hostile")
  }
  for (const t of ["DM me for promo growth", "cheap followers here", "grow your account fast", "check the link in my bio", "crypto signals coach", "wa.me/1555"]) {
    ok(`spam: ${JSON.stringify(t)} → hold`, screen({ text: t }).reason === "spam_or_promo", screen({ text: t }).reason)
  }
  for (const t of ["don't send me a list", "stop messaging me", "no more info thanks", "not interested", "remove me", "please do not contact me"]) {
    ok(`negative context: ${JSON.stringify(t)} → hold`, screen({ text: t }).reason === "negative_context", screen({ text: t }).reason)
  }
  ok("a nested reply is held, not skipped (a real 'LIST please' is not lost)",
    screen({ isNestedReply: true }).outcome === "hold" && screen({ isNestedReply: true }).reason === "nested_reply")
  ok("hostile outranks spam when both match", screen({ text: "this scam account sells cheap followers" }).reason === "hostile")
  ok("EVERY hold is a hold, never a process",
    ["this is a scam", "cheap followers", "don't message me"].every((t) => screen({ text: t }).outcome === "hold"))

  // False positives would train the operator to ignore the queue, so ordinary comments must pass.
  for (const t of ["LIST please!", "is this still available?", "LOVE this place 😍", "town?", "what's the rent", "more info please", "contact me"]) {
    ok(`ordinary comment passes: ${JSON.stringify(t)}`, screen({ text: t }).outcome === "process", screen({ text: t }).reason)
  }
}

console.log("\n4. PUBLIC REPLIES ARE OPTIONAL AND RATE-LIMITED PER PERSON:")
{
  const on = { publicRepliesEnabled: true, alreadyRepliedToComment: false, nowMs: NOW }
  ok("off by default → refused", shouldSendPublicReply({ ...on, publicRepliesEnabled: false, lastPublicReplyAt: null }).reason === "disabled")
  ok("enabled and never replied → send", shouldSendPublicReply({ ...on, lastPublicReplyAt: null }).send)
  ok("the same comment twice → duplicate",
    shouldSendPublicReply({ ...on, alreadyRepliedToComment: true, lastPublicReplyAt: null }).reason === "duplicate")
  ok(`within the ${DEFAULT_PUBLIC_REPLY_COOLDOWN_MINUTES}-minute cooldown → refused`,
    shouldSendPublicReply({ ...on, lastPublicReplyAt: minsAgo(60) }).reason === "cooldown")
  ok("…which spans DIFFERENT posts, because it is keyed on the person",
    !shouldSendPublicReply({ ...on, lastPublicReplyAt: minsAgo(10) }).send)
  ok("past the cooldown → allowed again",
    shouldSendPublicReply({ ...on, lastPublicReplyAt: minsAgo(DEFAULT_PUBLIC_REPLY_COOLDOWN_MINUTES + 1) }).send)
  ok("the cooldown is configurable",
    shouldSendPublicReply({ ...on, lastPublicReplyAt: minsAgo(30), cooldownMinutes: 60 }).reason === "cooldown")
}

console.log("\n5. ACCOUNT GATE — fails closed on every unknown:")
{
  const live = { settingsReadOk: true, globalEnabled: true, accountEnabled: true, activatedAt: minsAgo(60), permissionsOk: true }
  ok("everything on → active", accountAutomationGate(live).active)
  ok("global off → inactive", !accountAutomationGate({ ...live, globalEnabled: false }).active)
  ok("account off → inactive", !accountAutomationGate({ ...live, accountEnabled: false }).active)
  ok("no activation stamp → inactive", accountAutomationGate({ ...live, activatedAt: null }).reason === "not_activated")
  ok("permissions missing → inactive", accountAutomationGate({ ...live, permissionsOk: false }).reason === "not_authorized")
  ok("SETTINGS UNREADABLE → inactive (fails closed, does not default on)",
    accountAutomationGate({ ...live, settingsReadOk: false }).reason === "unknown_state")
  ok("null/undefined flags are not treated as true",
    !accountAutomationGate({ ...live, globalEnabled: null }).active
    && !accountAutomationGate({ ...live, accountEnabled: undefined }).active)
  ok("the stricter switch always wins",
    !accountAutomationGate({ ...live, globalEnabled: false, accountEnabled: true }).active
    && !accountAutomationGate({ ...live, globalEnabled: true, accountEnabled: false }).active)
  // Nothing may become active on missing information.
  ok("EVERY degraded input yields inactive",
    [
      { ...live, settingsReadOk: false }, { ...live, permissionsOk: false },
      { ...live, globalEnabled: null }, { ...live, accountEnabled: null }, { ...live, activatedAt: null },
    ].every((i) => !accountAutomationGate(i).active))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
