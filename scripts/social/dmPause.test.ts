// PRIVATE REPLIES ARE PAUSED, AND THE PAUSE MUST BE AIRTIGHT.
//
// Meta refused the first two live private replies on 21 Oct 2026 (permission) while accepting both
// public replies on the same token and scope. Repeatedly re-attempting a refused call is how an
// account attracts restrictions, so the private leg is paused and the public leg keeps running.
//
// The property under test is narrow and absolute: while paused, NO private-message request is made
// — not after a claim, not on a retry, not by a caller that forgot the gate — and everything else
// (detection, keyword matching, public replies, cooldowns, idempotency) is untouched.
import { dmGate, sendGate } from "@/lib/social/commentSendPolicy"
import { processComment } from "@/lib/social/commentRunner"
import { liveSender } from "@/lib/social/commentSender"

let pass = 0
let fail = 0
function ok(label: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`) }
}

console.log("\n1. THE GATE IS OPT-IN, LIKE EVERY OTHER GATE HERE:")
ok("unset ⇒ PAUSED (the pause survives a deploy or a fresh environment)", !dmGate({}).active)
ok("empty string ⇒ paused", !dmGate({ SOCIAL_COMMENT_DM_ENABLED: "" }).active)
ok('"false" ⇒ paused', !dmGate({ SOCIAL_COMMENT_DM_ENABLED: "false" }).active)
ok('"1" ⇒ paused (a truthy-looking value is not consent)', !dmGate({ SOCIAL_COMMENT_DM_ENABLED: "1" }).active)
ok('"yes" ⇒ paused', !dmGate({ SOCIAL_COMMENT_DM_ENABLED: "yes" }).active)
ok('"TRUE" ⇒ paused (case-sensitive, matching sendGate)', !dmGate({ SOCIAL_COMMENT_DM_ENABLED: "TRUE" }).active)
ok('"true" ⇒ on', dmGate({ SOCIAL_COMMENT_DM_ENABLED: "true" }).active)
ok('" true" ⇒ on (whitespace forgiven, matching sendGate)', dmGate({ SOCIAL_COMMENT_DM_ENABLED: " true" }).active)
ok("the reason is nameable for the ledger", dmGate({}).reason === "dm_disabled")

console.log("\n2. IT IS INDEPENDENT OF THE SENDING GATE:")
const bothOn = { SOCIAL_COMMENT_SEND_ENABLED: "true", SOCIAL_COMMENT_DM_ENABLED: "true" }
const publicOnly = { SOCIAL_COMMENT_SEND_ENABLED: "true" }
ok("public sending on + DMs paused is expressible", sendGate(publicOnly).active && !dmGate(publicOnly).active)
ok("both on is expressible", sendGate(bothOn).active && dmGate(bothOn).active)
ok("arming DMs does NOT arm sending", !sendGate({ SOCIAL_COMMENT_DM_ENABLED: "true" }).active)

// ── The runner, with a sender that records every call ──────────────────────────────────────
const KEYWORD_COMMENT = {
  provider: "instagram",
  externalCommentId: "c-1",
  externalMediaId: "m-1",
  recipientProviderUserId: "own-ig",
  authorProviderUserId: "them-ig",
  authorUsername: "someone",
  body: "TOWN",
  commentedAt: new Date().toISOString(),
  isNestedReply: false,
}

function harness() {
  const calls: string[] = []
  const claims: string[] = []
  const logged: { kind: string; status: string; reason: string | null }[] = []
  const store = {
    findConnection: async () => ({
      connectionId: "conn", ownProviderUserId: "own-ig", username: "us",
      accessToken: "tok", permissionsOk: true,
      formOrigin: "https://example.com", formUsername: "u", formPlatformSlug: "ig",
    }),
    readGate: async () => ({
      settingsReadOk: true, globalEnabled: true, accountEnabled: true,
      activatedAt: "2020-01-01T00:00:00.000Z", maxCommentAgeMinutes: 1440,
      publicRepliesEnabled: true, publicReplyCooldownMinutes: 1440,
    }),
    findComment: async () => null,
    upsertCommenter: async () => ({ id: "p1", dmSentAt: null, dmClaimedAt: null, lastPublicReplyAt: null }),
    insertComment: async () => ({ id: "row1" }),
    logAction: async (i: { kind: string; status: string; reason: string | null }) => { logged.push(i) },
    claimDm: async (id: string) => { claims.push(id); return true },
    resolveDm: async () => {},
    touchPublicReply: async () => {},
    publicReplyVariants: async () => [
      { body: "Want to set up a tour? Link in my bio!", claimsDm: false },
      { body: "Just sent you a DM! 😊", claimsDm: true },
    ],
  }
  const sender = {
    async sendPrivateReply() { calls.push("PRIVATE"); return { status: 200, externalId: "mid", usage: null } },
    async sendPublicReply() { calls.push("public"); return { status: 200, externalId: "rid", usage: null } },
  }
  return { store, sender, calls, claims, logged }
}

async function main() {
console.log("\n3. PAUSED: NO PRIVATE REQUEST, AND THE PUBLIC REPLY STILL GOES OUT:")
{
  const h = harness()
  const r = await processComment(KEYWORD_COMMENT as never, h.store as never, h.sender as never, {
    env: { SOCIAL_COMMENT_AUTOMATION_ENABLED: "true", SOCIAL_COMMENT_SEND_ENABLED: "true" },
  })
  ok("sendPrivateReply was NEVER called", !h.calls.includes("PRIVATE"), h.calls.join(","))
  ok("sendPublicReply WAS called", h.calls.includes("public"))
  ok("NO DM claim was taken (nobody is locked out)", h.claims.length === 0, h.claims.join(","))
  const dmRow = h.logged.find((l) => l.kind === "private_reply")
  ok("the ledger records the pause", dmRow?.status === "skipped" && dmRow?.reason === "dm_disabled",
    `${dmRow?.status}/${dmRow?.reason}`)
  ok("the comment was still stored and matched", r.stored && r.matchedKeyword === "TOWN")
  ok("the public reply was recorded as sent",
    h.logged.find((l) => l.kind === "public_reply")?.status === "sent")
  ok("the outcome is 'processed', not an error", r.result === "processed")
}

console.log("\n4. THE PUBLIC REPLY MUST NOT CLAIM A DM THAT NEVER HAPPENED:")
{
  const h = harness()
  let posted = ""
  h.sender.sendPublicReply = async (_c: unknown, _id: unknown, text: string) => {
    posted = text; h.calls.push("public"); return { status: 200, externalId: "rid", usage: null }
  }
  await processComment(KEYWORD_COMMENT as never, h.store as never, h.sender as never, {
    env: { SOCIAL_COMMENT_AUTOMATION_ENABLED: "true", SOCIAL_COMMENT_SEND_ENABLED: "true" },
  })
  ok("the approved link-in-bio variation was used", posted === "Want to set up a tour? Link in my bio!", posted)
  ok('"Just sent you a DM!" was NOT posted', !/sent you a DM/i.test(posted), posted)
}

console.log("\n5. ARMED AGAIN, THE PRIVATE LEG RETURNS (the pause is not a one-way door):")
{
  const h = harness()
  await processComment(KEYWORD_COMMENT as never, h.store as never, h.sender as never, {
    env: {
      SOCIAL_COMMENT_AUTOMATION_ENABLED: "true",
      SOCIAL_COMMENT_SEND_ENABLED: "true",
      SOCIAL_COMMENT_DM_ENABLED: "true",
    },
  })
  ok("sendPrivateReply IS called when explicitly armed", h.calls.includes("PRIVATE"))
  ok("and the claim is taken again", h.claims.length === 1)
}

console.log("\n6. DEFENCE IN DEPTH — the live sender refuses on its own:")
{
  // No SOCIAL_COMMENT_DM_ENABLED in the real process env, so this must refuse without a request.
  const before = process.env.SOCIAL_COMMENT_DM_ENABLED
  delete process.env.SOCIAL_COMMENT_DM_ENABLED
  process.env.SOCIAL_COMMENT_SEND_ENABLED = "true"
  const r = await liveSender.sendPrivateReply({ igUserId: "x", accessToken: "tok" }, "c", "text")
  ok("a direct call is refused, not sent", r.disabled === true && r.status === null)
  if (before !== undefined) process.env.SOCIAL_COMMENT_DM_ENABLED = before
  delete process.env.SOCIAL_COMMENT_SEND_ENABLED
}

console.log("\n7. THE RUNNER CHECKS THE PAUSE BEFORE THE CLAIM, IN SOURCE ORDER:")
{
  const src = require("node:fs").readFileSync("lib/social/commentRunner.ts", "utf8")
  const gateAt = src.indexOf("dmGate(env).active")
  const claimAt = src.indexOf("store.claimDm(")
  const sendAt = src.indexOf("sender.sendPrivateReply(")
  ok("the gate precedes the atomic claim", gateAt > 0 && gateAt < claimAt)
  ok("the gate precedes the send call", gateAt > 0 && gateAt < sendAt)
}

}

main().then(() => {
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}).catch((e) => {
  console.log(`\n  ✗ the suite itself threw: ${(e as Error).message}`)
  process.exit(1)
})
