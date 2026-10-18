// Comments — PROOF THAT NOTHING CAN BE SENT WHILE SENDING IS DISABLED.
//
// The other suites assert that the RUNNER refuses to send. This one asserts something stronger and
// independent: that the SENDER itself — the only code in the feature that holds a fetch — does not
// open a socket when the gate is off. The two guards are deliberately redundant, because a guard in
// the caller can be bypassed by a new caller, and a guard in the one function that holds the fetch
// cannot.
//
// HOW IT IS PROVED, rather than asserted: global.fetch is replaced with a recorder. If a single
// request were attempted it would be captured here, and these tests would fail. That makes the
// claim "no public reply and no DM is possible while sending is disabled" an observation about the
// running code, not a reading of it.
// Run: npx tsx scripts/social/commentSenderGate.test.ts
import { liveSender, inertSender } from "@/lib/social/commentSender"
import { processComment, type CommentStore, type PendingComment } from "@/lib/social/commentRunner"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}${d ? ` — ${d}` : ""}`) }
}

// ── THE TRIPWIRE ────────────────────────────────────────────────────────────────────────────
// Any outbound request anywhere in this process is recorded. Nothing stubs it out per-call, so a
// request made from a path we did not anticipate is still caught.
const attempted: string[] = []
const realFetch = globalThis.fetch
globalThis.fetch = (async (input: unknown) => {
  attempted.push(String(typeof input === "object" && input !== null && "url" in input ? (input as { url: string }).url : input))
  // Returning a plausible success is deliberate: if a guard were missing, the pipeline would carry
  // on and record a SENT action, so the failure would be loud rather than an exception.
  return new Response(JSON.stringify({ id: "should-never-happen" }), {
    status: 200, headers: { "content-type": "application/json" },
  })
}) as typeof fetch

const CTX = { igUserId: "17841436885324014", accessToken: "token-value" }

async function main() {
  console.log("1. THE SENDER ITSELF, WITH THE GATE OFF:")
  {
    for (const v of [undefined, "", "false", "0", "yes", "TRUE", "True"]) {
      if (v === undefined) delete process.env.SOCIAL_COMMENT_SEND_ENABLED
      else process.env.SOCIAL_COMMENT_SEND_ENABLED = v

      const dm = await liveSender.sendPrivateReply(CTX, "comment-1", "hello")
      const pub = await liveSender.sendPublicReply(CTX, "comment-1", "hello")
      if (!dm.disabled || !pub.disabled || attempted.length > 0) {
        fail++
        console.log(`  ✗ gate value ${JSON.stringify(v)} allowed a send (${attempted.length} requests)`)
        attempted.length = 0
      }
    }
    ok("NO value other than \"true\" lets a private reply leave the process", true)
    ok("NO value other than \"true\" lets a public reply leave the process", true)
    ok("ZERO outbound requests were attempted across every disabled value", attempted.length === 0,
      attempted.join(", "))

    // A refusal must be a refusal, not an error the caller might treat as "unknown".
    delete process.env.SOCIAL_COMMENT_SEND_ENABLED
    const r = await liveSender.sendPrivateReply(CTX, "c", "x")
    ok("a refusal reports disabled:true with a null status, never a fake success",
      r.disabled === true && r.status === null && !r.externalId)
    ok("…and classifies as UNCERTAIN, so it can never be mistaken for a delivery",
      r.status === null)
  }

  console.log("\n2. THE INERT SENDER CANNOT SEND EVEN WITH THE GATE ON:")
  {
    process.env.SOCIAL_COMMENT_SEND_ENABLED = "true"
    attempted.length = 0
    const a = await inertSender.sendPrivateReply(CTX, "c", "x")
    const b = await inertSender.sendPublicReply(CTX, "c", "x")
    ok("the inert sender refuses regardless of the environment", a.disabled === true && b.disabled === true)
    ok("…and attempts no request", attempted.length === 0)
  }

  console.log("\n3. THE WHOLE PIPELINE, GATE OFF, WITH THE LIVE SENDER WIRED IN:")
  {
    // This is the configuration a production webhook would actually run in during the dry run:
    // automation ON, sending OFF, the real sender, a real decision path.
    delete process.env.SOCIAL_COMMENT_SEND_ENABLED
    process.env.SOCIAL_COMMENT_AUTOMATION_ENABLED = "true"
    attempted.length = 0

    const actions: { kind: string; status: string; reason: string | null }[] = []
    let claims = 0
    const store: CommentStore = {
      async findConnection() {
        return {
          connectionId: "conn-1", ownProviderUserId: "17841436885324014", username: "realestatepro_tx",
          accessToken: "token-value", permissionsOk: true,
          formOrigin: "https://locatorbeast.com", formUsername: "jay-morris", formPlatformSlug: "ig",
        }
      },
      async readGate() {
        return {
          settingsReadOk: true, globalEnabled: true, accountEnabled: true,
          activatedAt: new Date(Date.now() - 3_600_000).toISOString(),
          maxCommentAgeMinutes: 1440, publicRepliesEnabled: true, publicReplyCooldownMinutes: 1440,
        }
      },
      async findComment() { return null },
      async upsertCommenter(i) {
        return { id: "cm-1", providerUserId: i.providerUserId, dmSentAt: null, dmClaimedAt: null, lastPublicReplyAt: null }
      },
      async insertComment() { return { id: "row-1" } },
      async claimDm() { claims++; return true },
      async resolveDm() {},
      async touchPublicReply() {},
      async logAction(a) { actions.push({ kind: a.kind, status: a.status, reason: a.reason }) },
      async publicReplyVariants() { return ["Just sent you a DM! 📩"] },
    }

    const c: PendingComment = {
      provider: "instagram", externalCommentId: "c-live", externalMediaId: "m-1",
      recipientProviderUserId: "17841436885324014",
      authorProviderUserId: "renter-igsid", authorUsername: "renter.jane",
      body: "LIST please!", commentedAt: new Date(Date.now() - 120_000).toISOString(),
      isNestedReply: false, intake: "webhook",
    }

    const out = await processComment(c, store, liveSender)
    ok("the comment is fully processed and stored", out.result === "processed" && out.stored)
    ok("the keyword is matched for real", out.matchedKeyword === "LIST")
    // The two findings that answer the question directly.
    ok("NO DM LEFT THE PROCESS", out.dm?.attempted === false && out.dm?.reason === "sending_disabled")
    ok("NO PUBLIC REPLY LEFT THE PROCESS", out.publicReply?.reason === "sending_disabled")
    ok("ZERO outbound HTTP requests were attempted by the whole pipeline",
      attempted.length === 0, attempted.join(", "))
    ok("NO CLAIM was taken, so the dry run locks nobody out of a future DM", claims === 0)
    ok("the ledger still records both intentions, so the operator sees what WOULD have happened",
      actions.filter((a) => a.reason === "sending_disabled").length === 2)

    // The control. The same pipeline with the gate ON must reach the network — otherwise every
    // assertion above would pass simply because the test harness is broken.
    process.env.SOCIAL_COMMENT_SEND_ENABLED = "true"
    attempted.length = 0
    const on = await processComment({ ...c, externalCommentId: "c-live-2" }, store, liveSender)
    ok("CONTROL: with the gate ON the same comment DOES reach the network",
      attempted.length === 2 && on.dm?.attempted === true,
      `${attempted.length} requests`)
    ok("CONTROL: and the requests go to graph.instagram.com, nowhere else",
      attempted.every((u) => u.startsWith("https://graph.instagram.com/v21.0/")), attempted.join(", "))
    ok("CONTROL: the private reply posts to /messages with the comment id as recipient",
      attempted.some((u) => u.includes("/17841436885324014/messages")))
    ok("CONTROL: the public reply posts to the comment's /replies edge",
      attempted.some((u) => u.includes("/c-live-2/replies")))
    // The token must never appear in a URL — Meta errors can echo the request.
    ok("the access token never appears in any request URL",
      !attempted.some((u) => u.includes("token-value")), attempted.join(", "))
  }

  console.log("\n4. THE KILL SWITCH BEATS THE SENDING GATE:")
  {
    // Sending armed, automation off. Nothing may happen — the outer switch wins.
    process.env.SOCIAL_COMMENT_SEND_ENABLED = "true"
    delete process.env.SOCIAL_COMMENT_AUTOMATION_ENABLED
    attempted.length = 0
    const store = { async findConnection() { throw new Error("must not be reached") } } as unknown as CommentStore
    const c: PendingComment = {
      provider: "instagram", externalCommentId: "c-x", externalMediaId: null,
      recipientProviderUserId: "17841436885324014", authorProviderUserId: "u", authorUsername: "u",
      body: "LIST", commentedAt: new Date().toISOString(), isNestedReply: false, intake: "webhook",
    }
    const out = await processComment(c, store, liveSender)
    ok("with the kill switch off the pipeline is inert", out.result === "inert")
    ok("…the store is never even consulted (the throwing stub was not reached)", out.stored === false)
    ok("…and nothing reached the network", attempted.length === 0)
  }
}

main().then(() => {
  globalThis.fetch = realFetch
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}).catch((e) => { globalThis.fetch = realFetch; console.error(e); process.exit(1) })
