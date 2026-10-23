// The account badge must stop warning about work nobody can do, without hiding work somebody must.
//
// Three private replies Meta refused on 21 Oct 2026 pinned "Attention needed" permanently: they can
// never retry (commentRunner stops at the idempotency check), and dmGate is off, so no future
// attempt is possible either. actionNeedsAttention is the one predicate that decides what the
// account-level tally counts — it writes nothing and hides nothing from the Comments screen.
//
// Both gate states are exercised everywhere, because "off" is today's configuration and "on" is one
// environment variable away.
import { actionNeedsAttention, autoReplyCapability } from "@/lib/social/accountCapabilities"
import { dmGate } from "@/lib/social/commentSendPolicy"

let pass = 0
let fail = 0
function ok(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}${detail ? `  — ${detail}` : ""}`) }
}

const A = (kind: string, status: string) => ({ kind, status })
const OFF = false
const ON = true

// ── THE RULE ──────────────────────────────────────────────────────────────────────────────────
console.log("public replies always count, whatever the DM switch is doing:")
for (const dm of [OFF, ON]) {
  ok(`public_reply/failed counts (dm=${dm})`, actionNeedsAttention(A("public_reply", "failed"), dm))
  ok(`public_reply/uncertain counts (dm=${dm})`, actionNeedsAttention(A("public_reply", "uncertain"), dm))
}

console.log("\nan UNCERTAIN send always counts — it may actually have been delivered:")
ok("private_reply/uncertain counts even with DMs OFF", actionNeedsAttention(A("private_reply", "uncertain"), OFF))
ok("private_reply/uncertain counts with DMs ON", actionNeedsAttention(A("private_reply", "uncertain"), ON))

console.log("\na FAILED private reply is the only thing the gate suppresses:")
ok("private_reply/failed does NOT count with DMs OFF", !actionNeedsAttention(A("private_reply", "failed"), OFF))
ok("private_reply/failed DOES count with DMs ON", actionNeedsAttention(A("private_reply", "failed"), ON),
  "re-enabling DMs must make past refusals relevant again")

console.log("\nnothing else is swept up:")
ok("sent never counts (either gate)",
  !actionNeedsAttention(A("public_reply", "sent"), ON) && !actionNeedsAttention(A("private_reply", "sent"), OFF))
ok("skipped never counts",
  !actionNeedsAttention(A("private_reply", "skipped"), OFF) && !actionNeedsAttention(A("public_reply", "skipped"), ON))
ok("an unknown status never counts", !actionNeedsAttention(A("public_reply", "queued"), ON))
ok("an unknown KIND that failed still counts — unrecognised is not a licence to hide",
  actionNeedsAttention(A("story_reply", "failed"), OFF))
ok("null/undefined fields do not throw and do not count",
  !actionNeedsAttention({}, OFF) && !actionNeedsAttention({ kind: null, status: null }, ON))
ok("whitespace around the values is tolerated",
  !actionNeedsAttention(A(" private_reply ", " failed "), OFF) &&
  actionNeedsAttention(A(" public_reply ", " failed "), OFF))

// ── THE ACCOUNT'S REAL DATA ───────────────────────────────────────────────────────────────────
// Exactly what production holds today: 3 failed private replies, 0 dangling claims, nothing else
// unresolved. 16 private/skipped, 4 public/sent and 6 public/skipped never reached the tally.
console.log("\n@realestatepro_tx as it actually is (3 failed private replies, 0 claims):")
const PRODUCTION_ROWS = [
  A("private_reply", "failed"), // @the_flavor_muse  "INFO"
  A("private_reply", "failed"), // @seamoss_nutrition "LIST"
  A("private_reply", "failed"), // @humblefaithfulco  "TOWN"
]
const tally = (rows: { kind: string; status: string }[], dm: boolean) =>
  rows.filter((r) => actionNeedsAttention(r, dm)).length

ok("with DMs OFF the tally is 0", tally(PRODUCTION_ROWS, OFF) === 0, String(tally(PRODUCTION_ROWS, OFF)))
ok("with DMs ON the tally is 3", tally(PRODUCTION_ROWS, ON) === 3, String(tally(PRODUCTION_ROWS, ON)))

const LIVE_GATE = { active: true, reason: "ok" as const }
const badge = (unresolvedActions: number) =>
  autoReplyCapability(LIVE_GATE, { unresolvedActions, danglingClaims: 0 })

ok('the badge reads "Enabled" once the tally is 0', badge(tally(PRODUCTION_ROWS, OFF)).badge === "Enabled",
  badge(tally(PRODUCTION_ROWS, OFF)).badge)
ok("…with no leftover review text in the detail line",
  !/need review/.test(badge(tally(PRODUCTION_ROWS, OFF)).detail),
  badge(tally(PRODUCTION_ROWS, OFF)).detail)
ok('turning DMs back on restores "Attention needed"', badge(tally(PRODUCTION_ROWS, ON)).badge === "Attention needed")

// A NEW public-reply failure must still reach the operator — the requirement this must not break.
console.log("\na future public-reply failure still raises the warning:")
const WITH_NEW_PUBLIC_FAILURE = [...PRODUCTION_ROWS, A("public_reply", "failed")]
ok("the tally is 1 with DMs OFF (the new one, not the three old ones)",
  tally(WITH_NEW_PUBLIC_FAILURE, OFF) === 1, String(tally(WITH_NEW_PUBLIC_FAILURE, OFF)))
ok('the badge is "Attention needed"', badge(tally(WITH_NEW_PUBLIC_FAILURE, OFF)).badge === "Attention needed")
ok("the detail names 1 action, not 4",
  /1 action\(s\)/.test(badge(tally(WITH_NEW_PUBLIC_FAILURE, OFF)).detail),
  badge(tally(WITH_NEW_PUBLIC_FAILURE, OFF)).detail)

// ── WHAT MUST STILL GET THROUGH ───────────────────────────────────────────────────────────────
console.log("\nthe other two causes are untouched:")
ok("a dangling message claim alone still raises it",
  autoReplyCapability(LIVE_GATE, { unresolvedActions: 0, danglingClaims: 1 }).badge === "Attention needed")
ok('a missing scope still reads "Permission needed", not "Enabled"',
  autoReplyCapability({ active: false, reason: "not_authorized" }, { unresolvedActions: 0, danglingClaims: 0 })
    .badge === "Permission needed")
ok("…and an unreadable settings row still reads as attention, never as off",
  autoReplyCapability({ active: false, reason: "unknown_state" }, { unresolvedActions: 0, danglingClaims: 0 })
    .badge === "Attention needed")

// ── PRODUCTION'S GATE ─────────────────────────────────────────────────────────────────────────
console.log("\nthe DM gate itself (unchanged by this work):")
ok("unset ⇒ DMs OFF", dmGate({}).active === false && dmGate({}).reason === "dm_disabled")
ok('only the exact string "true" arms it',
  dmGate({ SOCIAL_COMMENT_DM_ENABLED: "true" }).active === true &&
  dmGate({ SOCIAL_COMMENT_DM_ENABLED: "TRUE" }).active === false &&
  dmGate({ SOCIAL_COMMENT_DM_ENABLED: "1" }).active === false &&
  dmGate({ SOCIAL_COMMENT_DM_ENABLED: "yes" }).active === false &&
  dmGate({ SOCIAL_COMMENT_DM_ENABLED: "" }).active === false)

// The page must consult the LIVE gate rather than a constant, or re-enabling DMs would change
// nothing on screen.
const page = readPage()
function readPage() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require("node:fs") as typeof import("node:fs"))
    .readFileSync("app/admin/social-autopilot/accounts/page.tsx", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")
}
console.log("\nthe accounts page is wired to the live gate:")
ok("the stripper works (prose is gone)", !page.includes("see actionNeedsAttention"))
ok("dmGate(process.env) is read", /dmGate\(process\.env\)\.active/.test(page))
ok("actionNeedsAttention guards the tally", /if\s*\(!actionNeedsAttention\(/.test(page))
ok("`kind` is selected, so the predicate has data", /select\(\s*["']kind,\s*status/.test(page))
ok("the status filter still reads both failed AND uncertain",
  /\.in\(\s*["']status["']\s*,\s*\[\s*["']failed["']\s*,\s*["']uncertain["']\s*\]/.test(page))
ok("no DELETE or UPDATE of comment_actions was introduced",
  !/comment_actions[\s\S]{0,120}\.(delete|update)\(/.test(page),
  "history must be preserved")

console.log(`\nAttention gate: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
