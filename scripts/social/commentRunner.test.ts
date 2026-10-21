// Comments — THE ORCHESTRATOR, end to end, with a fake store and a mock Meta.
//
// No network and no database, so every branch the live feature can take is exercised here: a
// duplicate delivery, a commenter with no stable id, a 500, a 429, an expired comment, a lost
// claim race, a refused gate, and the dry run. The point is not coverage for its own sake — it is
// that the two outcomes this feature must never produce (an unsolicited DUPLICATE message, and a
// public reply that CLAIMS a DM that did not send) are asserted to be impossible on every path.
// Run: npx tsx scripts/social/commentRunner.test.ts
import { processComment, processBatch, type CommentStore, type PendingComment, type GateState } from "@/lib/social/commentRunner"
import type { CommentSender, SendResult } from "@/lib/social/commentSender"
import { APPROVED_DM_BODY, APPROVED_PUBLIC_FALLBACK } from "@/lib/social/commentKeywords"
import { INSTAGRAM_COMMENTS_SCOPE } from "@/lib/social/commentScope"
import { INSTAGRAM_ADMIN_SCOPES } from "@/lib/social/instagram"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}${d ? ` — ${d}` : ""}`) }
}

const NOW = Date.parse("2026-10-17T12:00:00Z")
const minsAgo = (m: number) => new Date(NOW - m * 60_000).toISOString()
const ON = { SOCIAL_COMMENT_AUTOMATION_ENABLED: "true", SOCIAL_COMMENT_SEND_ENABLED: "true" }
const DRY = { SOCIAL_COMMENT_AUTOMATION_ENABLED: "true" }

const LIVE_GATE: GateState = {
  settingsReadOk: true, globalEnabled: true, accountEnabled: true,
  activatedAt: minsAgo(600), maxCommentAgeMinutes: 1440,
  publicRepliesEnabled: true, publicReplyCooldownMinutes: 1440,
}

type Logged = { kind: string; status: string; reason: string | null }

function fakeStore(over: {
  gate?: Partial<GateState>
  existingComment?: boolean
  commenter?: { dmSentAt?: string | null; dmClaimedAt?: string | null; lastPublicReplyAt?: string | null }
  claimWins?: boolean
  connection?: null
  variants?: { body: string; claimsDm: boolean }[]
  permissionsOk?: boolean
} = {}) {
  const actions: Logged[] = []
  const resolves: { markSent: boolean; releaseClaim: boolean }[] = []
  const touches: string[] = []
  let claims = 0
  const store: CommentStore = {
    async findConnection() {
      if (over.connection === null) return null
      return {
        connectionId: "conn-1", ownProviderUserId: "17841436885324014", username: "realestatepro_tx",
        accessToken: "tok", permissionsOk: over.permissionsOk ?? true,
        formOrigin: "https://locatorbeast.com", formUsername: "jay-morris", formPlatformSlug: "ig",
      }
    },
    async readGate() { return { ...LIVE_GATE, ...over.gate } },
    async findComment() { return over.existingComment ? { id: "existing" } : null },
    async upsertCommenter(i) {
      return {
        id: "commenter-1", providerUserId: i.providerUserId,
        dmSentAt: over.commenter?.dmSentAt ?? null,
        dmClaimedAt: over.commenter?.dmClaimedAt ?? null,
        lastPublicReplyAt: over.commenter?.lastPublicReplyAt ?? null,
      }
    },
    async insertComment() { return { id: "row-1" } },
    async claimDm() { claims++; return over.claimWins ?? true },
    async resolveDm(_id, r) { resolves.push(r) },
    async touchPublicReply(id) { touches.push(id) },
    async logAction(a) { actions.push({ kind: a.kind, status: a.status, reason: a.reason }) },
    async publicReplyVariants() { return over.variants ?? [] },
  }
  return { store, actions, resolves, touches, claimCount: () => claims }
}

function mockSender(dm: SendResult, pub: SendResult = { status: 200, externalId: "r1", usage: null }) {
  const sent: { kind: string; text: string }[] = []
  const sender: CommentSender = {
    async sendPrivateReply(_c, _id, text) { sent.push({ kind: "dm", text }); return dm },
    async sendPublicReply(_c, _id, text) { sent.push({ kind: "public", text }); return pub },
  }
  return { sender, sent }
}

const comment = (over: Partial<PendingComment> = {}): PendingComment => ({
  provider: "instagram", externalCommentId: "c-1", externalMediaId: "m-1",
  recipientProviderUserId: "17841436885324014",
  authorProviderUserId: "renter-igsid-1", authorUsername: "renter.jane",
  body: "LIST please!", commentedAt: minsAgo(3), isNestedReply: false, intake: "webhook",
  ...over,
})

const run = (c: PendingComment, s: ReturnType<typeof fakeStore>, m: ReturnType<typeof mockSender>, env = ON) =>
  processComment(c, s.store, m.sender, { env, nowMs: NOW })

async function main() {
  console.log("1. THE HAPPY PATH — a keyword comment with a stable id:")
  {
    const s = fakeStore(), m = mockSender({ status: 200, externalId: "msg-1", usage: null })
    const r = await run(comment(), s, m)
    ok("the comment is processed", r.result === "processed")
    ok("the keyword is matched", r.matchedKeyword === "LIST")
    ok("the DM was attempted and sent", r.dm?.attempted === true && r.dm?.status === "sent")
    ok("the claim was taken exactly once", s.claimCount() === 1)
    ok("dm_sent_at is stamped and the claim is NOT released",
      s.resolves[0].markSent === true && s.resolves[0].releaseClaim === false)
    ok("the EXACT approved wording is sent, unreworded",
      m.sent[0].text.startsWith(APPROVED_DM_BODY))
    ok("the Smart Lead Form link carries the keyword as attribution",
      m.sent[0].text.includes("utm_content=LIST") && m.sent[0].text.includes("/jay-morris/ig"))
    ok("…and the media id as utm_term", m.sent[0].text.includes("utm_term=m-1"))
    ok("the public reply followed", r.publicReply?.status === "sent")
    ok("both actions are in the ledger",
      s.actions.filter((a) => a.status === "sent").length === 2)
  }

  console.log("\n2. NO STABLE COMMENTER ID — the rule the whole design turns on:")
  {
    const s = fakeStore(), m = mockSender({ status: 200, externalId: "msg-1", usage: null })
    const r = await run(comment({ authorProviderUserId: null }), s, m)
    ok("the comment is still STORED (the Inbox shows it)", r.stored === true)
    ok("NO DM was attempted", r.dm?.attempted === false)
    ok("…and the reason recorded is no_stable_id", r.dm?.reason === "no_stable_id")
    ok("NO claim was taken", s.claimCount() === 0)
    ok("no private reply reached the sender", !m.sent.some((x) => x.kind === "dm"))
    // The truthful alternative: a public reply that promises nothing.
    ok("a public reply IS sent, and it is the fallback that claims no DM",
      m.sent.some((x) => x.kind === "public" && x.text === APPROVED_PUBLIC_FALLBACK))
  }

  console.log("\n3. DUPLICATE DELIVERY AND RE-POLLING MUST BE FREE:")
  {
    const s = fakeStore({ existingComment: true }), m = mockSender({ status: 200, externalId: "x", usage: null })
    const r = await run(comment(), s, m)
    ok("an already-stored comment stops immediately", r.result === "already_processed")
    ok("nothing was sent", m.sent.length === 0)
    ok("nothing was written", s.actions.length === 0 && s.claimCount() === 0)

    // The same person commenting twice: already messaged ⇒ never again.
    const s2 = fakeStore({ commenter: { dmSentAt: minsAgo(60) } })
    const m2 = mockSender({ status: 200, externalId: "x", usage: null })
    const r2 = await run(comment({ externalCommentId: "c-2" }), s2, m2)
    ok("a person ALREADY MESSAGED is never messaged again", r2.dm?.reason === "already_messaged")
    ok("…and no claim is attempted for them", s2.claimCount() === 0)
    ok("…and no DM reached the sender", !m2.sent.some((x) => x.kind === "dm"))

    // A claim held (in flight, or uncertain and never released).
    const s3 = fakeStore({ commenter: { dmClaimedAt: minsAgo(5) } })
    const m3 = mockSender({ status: 200, externalId: "x", usage: null })
    const r3 = await run(comment({ externalCommentId: "c-3" }), s3, m3)
    ok("a HELD CLAIM blocks a second send", r3.dm?.reason === "claim_held")

    // Losing the atomic claim race.
    const s4 = fakeStore({ claimWins: false })
    const m4 = mockSender({ status: 200, externalId: "x", usage: null })
    const r4 = await run(comment({ externalCommentId: "c-4" }), s4, m4)
    ok("LOSING the atomic claim race means NOT sending",
      r4.dm?.reason === "claim_held" && !m4.sent.some((x) => x.kind === "dm"))
  }

  console.log("\n4. PROVIDER ERRORS — and the duplicate that must never happen:")
  {
    const failed = fakeStore(), mf = mockSender({ status: 400, errorCode: 100, usage: null })
    const rf = await run(comment(), failed, mf)
    ok("a definite 400 is recorded as failed", rf.dm?.status === "failed")
    ok("…and the claim is RELEASED so a later comment may retry",
      failed.resolves[0].releaseClaim === true && failed.resolves[0].markSent === false)

    const unc = fakeStore(), mu = mockSender({ status: 500, usage: null })
    const ru = await run(comment(), unc, mu)
    ok("a 500 is recorded as UNCERTAIN", ru.dm?.status === "uncertain")
    ok("…the claim is NOT released and nothing is stamped — the person stays claimed for ever",
      unc.resolves[0].releaseClaim === false && unc.resolves[0].markSent === false)

    const to = fakeStore(), mt = mockSender({ status: null, transportError: true, usage: null })
    const rt = await run(comment(), to, mt)
    ok("a TIMEOUT is uncertain and holds the claim",
      rt.dm?.status === "uncertain" && to.resolves[0].releaseClaim === false)

    const rl = fakeStore(), mr = mockSender({ status: 429, usage: null })
    const rr = await run(comment(), rl, mr)
    ok("a 429 is a failure (the call was throttled, not delivered)",
      rr.dm?.status === "failed" && rr.dm?.reason === "rate_limited")
    ok("…so the claim is released and the person is not locked out", rl.resolves[0].releaseClaim === true)

    const noid = fakeStore(), mn = mockSender({ status: 200, externalId: null, usage: null })
    const rn = await run(comment(), noid, mn)
    ok("a 200 with NO MESSAGE ID is uncertain, not a success",
      rn.dm?.status === "uncertain" && noid.resolves[0].markSent === false)
  }

  console.log("\n5b. THE PUBLIC REPLY FOLLOWS THE DM OUTCOME, ACROSS ALL FOUR CASES:")
  {
    // Both buckets configured, so the runner must CHOOSE rather than fall back. That is the
    // difference this section exists to prove: an empty bucket proves nothing about selection.
    const BIO = "Want to set up a tour? Link in my bio!"
    const DM = "Just sent you a DM! \u{1F60A}"
    const both = [
      { body: BIO, claimsDm: false },
      { body: DM, claimsDm: true },
    ]
    const publicTextFor = async (dmResult: SendResult, opts: Record<string, unknown> = {}) => {
      const st = fakeStore({ variants: both, ...opts })
      const mk = mockSender(dmResult)
      await run(comment(), st, mk)
      return mk.sent.find((x) => x.kind === "public")?.text ?? null
    }

    // 1. ACCEPTED — the only case that may announce a DM.
    ok("an ACCEPTED DM announces the DM",
      (await publicTextFor({ status: 200, externalId: "msg-1", usage: null })) === DM)

    // 2. FAILED — a rejection is not an acceptance.
    ok("a FAILED DM uses the bio-link bucket",
      (await publicTextFor({ status: 400, usage: null })) === BIO)

    // 3. UNCERTAIN — the case that matters most. The message may well have ARRIVED, but we cannot
    //    say so, and we must not retry. Claiming a DM here would be a guess presented as a fact.
    for (const [label, r] of [
      ["a 500", { status: 500, usage: null } as SendResult],
      ["a timeout", { status: null, transportError: true, usage: null } as SendResult],
      ["a 200 with no message id", { status: 200, externalId: null, usage: null } as SendResult],
    ] as const) {
      ok(`an UNCERTAIN DM (${label}) uses the bio-link bucket and claims nothing`,
        (await publicTextFor(r)) === BIO)
    }

    // 4. DISABLED / NEVER ATTEMPTED — no send, so nothing to announce.
    const noDm = await publicTextFor(
      { status: 200, externalId: "msg-1", usage: null },
      { commenter: { dmSentAt: new Date().toISOString() } },
    )
    ok("a commenter already DM'd (no new send) uses the bio-link bucket", noDm === BIO)

    // The DM-claiming line must be UNREACHABLE without an acceptance, however the bank is built.
    const onlyDmClaiming = [{ body: DM, claimsDm: true }]
    for (const r of [
      { status: 400, usage: null } as SendResult,
      { status: 500, usage: null } as SendResult,
      { status: null, transportError: true, usage: null } as SendResult,
    ]) {
      const st = fakeStore({ variants: onlyDmClaiming }), mk = mockSender(r)
      await run(comment(), st, mk)
      const t = mk.sent.find((x) => x.kind === "public")?.text
      ok("…and with ONLY DM-claiming variants configured, a non-accepted DM still claims nothing",
        t === APPROVED_PUBLIC_FALLBACK)
      break
    }

    // The approved private wording is unchanged and carries the link as its own paragraph.
    const st = fakeStore({ variants: both }), mk = mockSender({ status: 200, externalId: "msg-1", usage: null })
    await run(comment(), st, mk)
    const dmText = mk.sent.find((x) => x.kind === "dm")?.text ?? ""
    ok("the DM opens with the approved wording", dmText.startsWith(APPROVED_DM_BODY))
    ok("…and the branded link follows as a separate paragraph", dmText.includes("\n\n") && dmText.includes("utm_medium=comment"))
    ok("…and the approved sentence is never reworded", dmText.split("\n\n")[0] === APPROVED_DM_BODY)
  }

  console.log("\n5. A PUBLIC REPLY MAY NEVER CLAIM A DM THAT DID NOT SEND:")
  {
    // The DM-claiming line now declares itself via claimsDm; the runner filters on that flag
    // rather than on which keyword matched.
    const variants = [{ body: "Just sent you a DM! 📩 Check your inbox.", claimsDm: true }]
    for (const [label, dmResult] of [
      ["a failed DM", { status: 400, usage: null } as SendResult],
      ["an uncertain DM (500)", { status: 500, usage: null } as SendResult],
      ["a timed-out DM", { status: null, transportError: true, usage: null } as SendResult],
      ["a 200 with no id", { status: 200, externalId: null, usage: null } as SendResult],
    ] as const) {
      const s = fakeStore({ variants }), m = mockSender(dmResult)
      await run(comment(), s, m)
      const pub = m.sent.find((x) => x.kind === "public")
      if (pub?.text !== APPROVED_PUBLIC_FALLBACK) {
        fail++; console.log(`  ✗ ${label} produced a DM-claiming public reply: ${pub?.text}`)
      }
    }
    ok("EVERY non-accepted DM falls back to the reply that claims nothing", true)

    // Only a platform-confirmed acceptance may use the DM-claiming variant.
    const s = fakeStore({ variants }), m = mockSender({ status: 200, externalId: "msg-1", usage: null })
    await run(comment(), s, m)
    ok("an ACCEPTED DM may use the DM-claiming variant",
      m.sent.find((x) => x.kind === "public")?.text === variants[0].body)

    // An empty reply bank must degrade to something true, not something specific.
    const s2 = fakeStore({ variants: [] }), m2 = mockSender({ status: 200, externalId: "msg-1", usage: null })
    await run(comment(), s2, m2)
    ok("an EMPTY variant bank falls back to the truthful reply rather than failing",
      m2.sent.find((x) => x.kind === "public")?.text === APPROVED_PUBLIC_FALLBACK)
  }

  console.log("\n6. META'S 7-DAY WINDOW, ENFORCED BEFORE THE CLAIM:")
  {
    // The fixture has to let the comment PAST screening so the window is what refuses it: both the
    // activation boundary and the age ceiling must predate an 8-day-old comment, or screenComment
    // skips it first and this would assert nothing about the window at all.
    const OLD_OK = { gate: { activatedAt: minsAgo(60 * 24 * 60), maxCommentAgeMinutes: 60 * 24 * 30 } }
    const m = mockSender({ status: 200, externalId: "x", usage: null })
    const r = await run(comment({ commentedAt: minsAgo(8 * 24 * 60) }), fakeStore(OLD_OK), m)
    ok("a comment older than 7 days is refused for a DM",
      r.dm?.reason?.startsWith("outside_window") === true)
    ok("…and no DM reached the sender", !m.sent.some((x) => x.kind === "dm"))

    const s2 = fakeStore(OLD_OK)
    const m2 = mockSender({ status: 200, externalId: "x", usage: null })
    await run(comment({ commentedAt: minsAgo(8 * 24 * 60) }), s2, m2)
    // The reason this ordering matters: an unresolved claim is never released.
    ok("NO CLAIM is taken for a send that cannot succeed — it would lock the person out for ever",
      s2.claimCount() === 0)

    // The control for the two assertions above: the SAME fixture with a fresh comment must send,
    // or they would pass for the wrong reason — screening, not the window.
    const s3 = fakeStore(OLD_OK), m3 = mockSender({ status: 200, externalId: "x", usage: null })
    const r3 = await run(comment({ commentedAt: minsAgo(3) }), s3, m3)
    ok("CONTROL: the same fixture with a 3-minute-old comment DOES send",
      r3.dm?.status === "sent" && s3.claimCount() === 1)
  }

  console.log("\n7. THE GATES — nothing runs on missing information:")
  {
    const offEnv = { SOCIAL_COMMENT_SEND_ENABLED: "true" } // kill switch absent
    const s = fakeStore(), m = mockSender({ status: 200, externalId: "x", usage: null })
    const r = await run(comment(), s, m, offEnv)
    ok("the KILL SWITCH off makes the pipeline fully inert", r.result === "inert")
    ok("…nothing was read or written at all", s.actions.length === 0 && !r.stored && m.sent.length === 0)

    for (const [label, gate] of [
      ["global off", { globalEnabled: false }],
      ["account off", { accountEnabled: false }],
      ["never activated", { activatedAt: null }],
      ["settings unreadable", { settingsReadOk: false }],
    ] as const) {
      const st = fakeStore({ gate }), mo = mockSender({ status: 200, externalId: "x", usage: null })
      const ro = await run(comment(), st, mo)
      if (ro.result !== "gate_refused" || mo.sent.length > 0) {
        fail++; console.log(`  ✗ ${label} did not refuse: ${ro.result}`)
      }
    }
    ok("EVERY disabled or unreadable switch refuses, and sends nothing", true)

    const np = fakeStore({ permissionsOk: false }), mp = mockSender({ status: 200, externalId: "x", usage: null })
    const rp = await run(comment(), np, mp)
    ok("a connection WITHOUT the comments scope refuses — today's live state",
      rp.result === "gate_refused" && rp.reason === "not_authorized" && mp.sent.length === 0)

    const nc = fakeStore({ connection: null }), mc = mockSender({ status: 200, externalId: "x", usage: null })
    ok("an UNATTRIBUTABLE delivery is refused, never pinned to the only connection we have",
      (await run(comment(), nc, mc)).result === "unknown_account" && mc.sent.length === 0)
  }

  console.log("\n8. THE DRY RUN — real decisions, no sends:")
  {
    const s = fakeStore(), m = mockSender({ status: 200, externalId: "x", usage: null })
    const r = await run(comment(), s, m, DRY)
    ok("the comment is fully evaluated and stored", r.result === "processed" && r.stored)
    ok("the keyword is matched for real", r.matchedKeyword === "LIST")
    ok("the DM is skipped with reason sending_disabled", r.dm?.reason === "sending_disabled")
    ok("the public reply is skipped too", r.publicReply?.reason === "sending_disabled")
    ok("NOTHING reached the sender", m.sent.length === 0)
    ok("NO CLAIM was taken, so nobody is locked out by a dry run", s.claimCount() === 0)
    ok("the ledger records both skips, so the operator sees what WOULD have happened",
      s.actions.filter((a) => a.reason === "sending_disabled").length === 2)
  }

  console.log("\n9. SCREENING AND KEYWORDS STILL GOVERN:")
  {
    const cases: [string, Partial<PendingComment>, string][] = [
      ["a hostile comment is HELD for a human", { body: "this is a scam" }, "held"],
      ["a spam comment is HELD", { body: "DM me for growth followers" }, "held"],
      ['a negation ("don\'t send me a list") is HELD', { body: "don't send me a list" }, "held"],
      ["a nested reply is HELD", { isNestedReply: true }, "held"],
      ["our OWN comment is skipped", { authorProviderUserId: "17841436885324014" }, "skipped"],
      ["a comment from before activation is skipped", { commentedAt: minsAgo(900) }, "skipped"],
      ["praise with no keyword is stored and left alone", { body: "beautiful place 😍" }, "no_keyword"],
    ]
    for (const [label, over, expected] of cases) {
      const s = fakeStore(), m = mockSender({ status: 200, externalId: "x", usage: null })
      const r = await run(comment(over), s, m)
      ok(label, r.result === expected, `got ${r.result} (${r.reason})`)
      if (m.sent.length > 0) { fail++; console.log(`  ✗ ${label} SENT something`) }
    }
    ok("none of the above sent anything", true)
  }

  console.log("\n10. BATCH BEHAVIOUR AND FAILURE RECOVERY:")
  {
    const s = fakeStore(), m = mockSender({ status: 200, externalId: "x", usage: null })
    const out = await processBatch(
      [comment({ externalCommentId: "a" }), comment({ externalCommentId: "b" })],
      s.store, m.sender, { env: ON, nowMs: NOW },
    )
    ok("a batch processes every comment", out.length === 2)

    // One throwing comment must not abort the rest of a delivery.
    const throwing: CommentStore = { ...s.store, async insertComment() { throw new Error("db down") } }
    const out2 = await processBatch(
      [comment({ externalCommentId: "a" }), comment({ externalCommentId: "b" })],
      throwing, m.sender, { env: ON, nowMs: NOW },
    )
    ok("a comment that throws is recorded, and the batch continues",
      out2.length === 2 && out2.every((o) => o.reason.startsWith("error:")))
  }

  console.log("\n11. THE SCOPE NAME IS NOT DUPLICATED BY ACCIDENT:")
  {
    // A typo in either copy would make permissionsOk permanently false and the feature would sit
    // silently inert with no error to find. This is the cheapest possible guard against that.
    ok("commentScope's name matches the one the authorization flow actually requests",
      (INSTAGRAM_ADMIN_SCOPES as readonly string[]).includes(INSTAGRAM_COMMENTS_SCOPE))
  }


}

main().then(() => {
  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail === 0 ? 0 : 1)
}).catch((e) => { console.error(e); process.exit(1) })
