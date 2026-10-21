// THE LEDGER AND THE LABELS MUST DESCRIBE WHAT HAPPENED.
//
// On 21 Oct 2026 the first two live private replies were refused by Meta with reason `permission`,
// while both public replies were ACCEPTED. Three things then went wrong at the reporting layer:
// the ledger stored no numeric code, so code 190 (dead token) could not be told from code 200 (app
// not permitted); the Inbox collapsed "DM refused, bio-link reply posted" into a bare "failed", so
// a working fallback read as a dead system; and the Accounts panel offered "Re-authorize Comments"
// as the remedy for a failure that re-granting cannot fix.
//
// These assertions pin the fixes, and the two directions that matter: never leak provider text or
// credentials into the ledger, and never describe a partial success as a total failure.
import { failureRecord, type SendAttempt } from "@/lib/social/commentSendPolicy"
import { autoReplyCapability } from "@/lib/social/accountCapabilities"
import { outcomeOf } from "@/components/crm/social/CommentsClient"
import type { AccountGate } from "@/lib/social/commentSafety"

let pass = 0
let fail = 0
function ok(label: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`) }
}

// ── 1. THE NUMBERS ARE RECORDED ─────────────────────────────────────────────────────────────
console.log("\n1. NUMERIC CODES REACH THE LEDGER:")
const base: SendAttempt = { status: 400, transportError: false }
ok('code only -> "permission code=200"',
  failureRecord("permission", { ...base, errorCode: 200 }) === "permission code=200")
ok('code + subcode -> "permission code=200 subcode=2534037"',
  failureRecord("permission", { ...base, errorCode: 200, errorSubcode: 2534037 })
    === "permission code=200 subcode=2534037")
ok("no numbers reported -> the bare reason, unchanged",
  failureRecord("rejected", base) === "rejected")
ok("190 (dead token) is now DISTINGUISHABLE from 200 (not permitted)",
  failureRecord("permission", { ...base, errorCode: 190 })
    !== failureRecord("permission", { ...base, errorCode: 200 }))
ok("subcode alone is still recorded",
  failureRecord("rejected", { ...base, errorSubcode: 999 }) === "rejected subcode=999")

console.log("\n2. NOTHING SENSITIVE CAN REACH THE LEDGER:")
// A SendAttempt carrying hostile extra fields: none may appear in the output.
const hostile = {
  ...base,
  errorCode: 200,
  // These are not part of SendAttempt; the point is that failureRecord reads only the two numbers.
  message: "Bearer sk-live-SECRET-TOKEN-abc123",
  body: { error: { message: "https://graph.instagram.com/x?access_token=SECRET" } },
  headers: { authorization: "Bearer SECRET" },
} as unknown as SendAttempt
const out = failureRecord("permission", hostile)
ok("the provider message is absent", !/SECRET|Bearer|sk-live/.test(out))
ok("no URL or query string is present", !/https?:|access_token|\?/.test(out))
ok("the output is only the reason and digits", /^[a-z_]+( code=\d+)?( subcode=\d+)?$/.test(out), out)
ok("a non-numeric code is ignored rather than stringified",
  failureRecord("permission", { ...base, errorCode: "SECRET" as unknown as number }) === "permission")
ok("NaN and Infinity are ignored",
  failureRecord("permission", { ...base, errorCode: NaN }) === "permission" &&
  failureRecord("permission", { ...base, errorCode: Infinity }) === "permission")

// ── 3. THE INBOX LABEL ──────────────────────────────────────────────────────────────────────
const row = (dm: string | null, pub: string | null, dmReason: string | null = null) =>
  ({
    id: "c", provider: "instagram", body: "TOWN", author_username: "someone",
    permalink: null, commented_at: null, matched_keyword: "TOWN", hold_reason: null,
    external_media_id: null, social_commenters: [], social_posts: null,
    comment_actions: [
      ...(dm ? [{ kind: "private_reply", status: dm, reason: dmReason }] : []),
      ...(pub ? [{ kind: "public_reply", status: pub, reason: null }] : []),
    ],
  }) as unknown as Parameters<typeof outcomeOf>[0]

console.log("\n3. EVERY COMBINATION READS AS ITSELF:")
ok("DM accepted + public reply sent", outcomeOf(row("sent", "sent")).text === "DM + public reply")
ok("DM FAILED + public reply sent names BOTH facts",
  outcomeOf(row("failed", "sent")).text === "DM failed · public reply sent")
ok("…and is NOT reported as a plain failure",
  outcomeOf(row("failed", "sent")).text !== "failed")
ok("public reply only (DM skipped)", outcomeOf(row("skipped", "sent", "sending_disabled")).text === "public reply only")
ok("both failed", outcomeOf(row("failed", "failed")).text === "both failed")
ok("DM sent but public reply failed", outcomeOf(row("sent", "failed")).text === "DM sent · public reply failed")
ok("uncertain DM + public reply sent", outcomeOf(row("uncertain", "sent")).text === "DM uncertain · public reply sent")
ok("uncertain alone still demands review", outcomeOf(row("uncertain", null)).text === "uncertain — review")

console.log("\n4. THE 21 OCT INCIDENT, AS THE SCREEN SHOULD HAVE SHOWN IT:")
const incident = outcomeOf(row("failed", "sent"))
ok("it says the public reply was sent", /public reply sent/.test(incident.text))
ok("it says the DM failed", /DM failed/.test(incident.text))
ok("it is amber (needs a look), not red (broken)", incident.tone.includes("d9a441"))
ok("the hint explains the fallback claimed no DM", /claimed no DM/.test(incident.hint ?? ""))

// ── 5. THE ACCOUNTS DETAIL ──────────────────────────────────────────────────────────────────
const gate: AccountGate = { active: true, reason: "ok" }
console.log("\n5. THE ATTENTION DETAIL NAMES THE CAUSE:")
const withReason = autoReplyCapability(gate, { unresolvedActions: 2, danglingClaims: 0, topReason: "permission" })
ok("the classified reason is shown", /permission/.test(withReason.detail))
ok("the counts are still shown", /2 action\(s\) and 0 message claim\(s\)/.test(withReason.detail))
ok("still badged Attention needed", withReason.badge === "Attention needed")
const noReason = autoReplyCapability(gate, { unresolvedActions: 1, danglingClaims: 0 })
ok("no reason available -> no trailing separator", !/· $/.test(noReason.detail) && !/·\s*$/.test(noReason.detail))
ok("underscores are humanised", /transport error/.test(
  autoReplyCapability(gate, { unresolvedActions: 1, danglingClaims: 0, topReason: "transport_error" }).detail))
ok("zero counts still raise nothing",
  autoReplyCapability(gate, { unresolvedActions: 0, danglingClaims: 0 }).badge === "Enabled")

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
