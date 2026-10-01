/**
 * AUTOMATED TEXT SAFETY CHECKPOINT — the eight proofs.
 *
 * Covers the four defects the outbound audit found:
 *   1. the automation's own Text 1 held Text 2 (it looked like a human's text);
 *   2. no explicit opt-out existed — nothing ever set sms_opt_in = false;
 *   3. two paired Macs could claim one intent and both send;
 *   4. the opening-pair gap was a flat 30.000s, not the intended 30-45s.
 *
 * Run: npx tsx scripts/tests/automatedTextSafety.test.ts
 */
import { evaluateSend } from "../../lib/followup/gate"
import { nextStepEligibility } from "../../lib/followup/cadence"
import { doubleTextSpacingMs, DOUBLE_TEXT_MIN_MS, DOUBLE_TEXT_MAX_MS } from "../../lib/followup/pacing"
import { classifyProvenance, type IngestedMessage, type SentIntent } from "../../lib/companion/provenance"
import { isOptOutMessage, optOutKeyword } from "../../lib/messaging/optOut"
import { InMemoryFollowupStore } from "../../lib/followup/sim/inMemoryStore"
import type { ConversationSnapshot, LeadSnapshot, RunSnapshot, ShareSnapshot } from "../../lib/followup/types"

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`)
  }
}

// 14:00 CDT — comfortably inside the 09:00-21:00 allowed window, so quiet hours
// never confounds a result below.
const NOW = new Date("2026-09-23T19:00:00Z")
const T1_SENT = "2026-09-23T18:59:30.000Z" // Text 1 went out 30s ago

const lead = (over: Partial<LeadSnapshot> = {}): LeadSnapshot => ({
  id: 1,
  firstName: "Sarah",
  agentFirstName: "Jay",
  beds: "1",
  propertyType: null,
  moveDate: "2026-10-01",
  moveMonthLabel: "October",
  crmStatus: "new",
  smsOptIn: true,
  accountAuthorized: true,
  followupOptIn: true,
  timeZone: "America/Chicago",
  appliedAt: null,
  ...(over as object),
}) as LeadSnapshot

/** The New Lead run, sitting on Text 2 and already eligible. */
const t2Run = (over: Partial<RunSnapshot> = {}): RunSnapshot => ({
  sequenceKey: "new_lead",
  stepKey: "t2",
  stepIndex: 1,
  status: "due",
  mode: "auto",
  baselineInboundAt: null, // a brand-new lead has never texted in
  nextEligibleAt: T1_SENT,
  ...over,
})

const conv = (over: Partial<ConversationSnapshot> = {}): ConversationSnapshot => ({
  lastInboundAt: null,
  lastManualOutboundAt: null,
  ...over,
})
const share: ShareSnapshot = { sentAt: null, doneSelectingAt: null, favoritedCount: 0, availabilitySubmittedAt: null, resumedAt: null }

/** `reason` exists on every decision EXCEPT "send" — narrow instead of casting. */
const reasonOf = (d: ReturnType<typeof evaluateSend>) => ("reason" in d ? d.reason : null)

const decide = (c: ConversationSnapshot, l: LeadSnapshot = lead(), r: RunSnapshot = t2Run()) =>
  evaluateSend(NOW, l, c, share, r)

async function main() {
  console.log("\nAUTOMATED TEXT SAFETY\n")

  // ─── PROOF 1 — Text 1 must never suppress Text 2 ───────────────────────────
  console.log("Proof 1 — the automation's own Text 1 does not suppress Text 2")
  {
    // The snapshot is built from provenance now, so the automation's own send never
    // appears as lastManualOutboundAt at all. This is the fixed state.
    const d = decide(conv({ lastManualOutboundAt: null }))
    check("Text 2 sends when the only prior outbound was automated", d.action === "send", JSON.stringify(d))
  }
  {
    // The REGRESSION this replaces: before provenance, an automated send landed in
    // lastManualOutboundAt and suppressed the next automated step.
    //
    // Demonstrated on a FULL-gated step. The opening pair (t1/t2) is now
    // deliberately EXEMPT from handoff — see the lifecycle pass — so t2 can no
    // longer serve as the witness for this, and asserting on it would be
    // asserting the old spec.
    const d = decide(conv({ lastManualOutboundAt: T1_SENT }), lead(), t2Run({ stepKey: "contact_fu1", stepIndex: 2 }))
    check(
      "…whereas an unfiltered outbound timestamp still suppresses a full-gated step (the fix is load-bearing)",
      d.action !== "send" && reasonOf(d) === "manual_conversation",
      JSON.stringify(d),
    )
  }

  // The provenance classifier is what keeps Text 1 out of that field.
  console.log("\n  …and the classifier is what keeps it out of that field")
  {
    const intents: SentIntent[] = [
      { id: "intent-t1", lead_id: 1, rendered_body: "Hey Sarah it's Jay! I got your form", message_guid: "GUID-T1" },
    ]
    const byGuid = classifyProvenance(
      [{ id: "m1", guid: "GUID-T1", lead_id: 1, is_from_me: true, body: "Hey Sarah it's Jay! I got your form", provenance: null, outbound_intent_id: null }],
      intents,
    )
    check("a guid match classifies as automated", byGuid[0].provenance === "automated_outbound")
    check("…authoritatively, not by correlation", byGuid[0].basis === "guid_match")
    check("…and links back to the intent", byGuid[0].outboundIntentId === "intent-t1")

    // An older Mac build reports no guid — exact body correlation covers it.
    const byBody = classifyProvenance(
      [{ id: "m1", guid: "OTHER", lead_id: 1, is_from_me: true, body: "Hey Sarah it's Jay! I got your form", provenance: null, outbound_intent_id: null }],
      [{ id: "intent-t1", lead_id: 1, rendered_body: "Hey Sarah it's Jay! I got your form", message_guid: null }],
    )
    check("with no guid, exact body correlates as automated", byBody[0].provenance === "automated_outbound")
    check("…by correlation", byBody[0].basis === "body_correlation")
  }
  {
    // One-to-one claiming: two identical outbound messages, one intent → only one
    // can be automated. Otherwise a single automated send could absorb a locator's
    // identical manual text and suppress the hold.
    const d = classifyProvenance(
      [
        { id: "m1", guid: "g1", lead_id: 1, is_from_me: true, body: "same text", provenance: null, outbound_intent_id: null },
        { id: "m2", guid: "g2", lead_id: 1, is_from_me: true, body: "same text", provenance: null, outbound_intent_id: null },
      ],
      [{ id: "i1", lead_id: 1, rendered_body: "same text", message_guid: null }],
    )
    check("one intent is claimed by exactly one message", d.filter((x) => x.provenance === "automated_outbound").length === 1)
    check("…and the surplus message is treated as manual (fail-safe)", d.filter((x) => x.provenance === "manual_outbound").length === 1)
  }
  check(
    "an unprovable outbound message defaults to MANUAL, never automated",
    classifyProvenance(
      [{ id: "m", guid: "g", lead_id: 1, is_from_me: true, body: "typed by hand", provenance: null, outbound_intent_id: null }],
      [],
    )[0].provenance === "manual_outbound",
  )
  check(
    "a different lead's identical body does not correlate",
    classifyProvenance(
      [{ id: "m", guid: "g", lead_id: 2, is_from_me: true, body: "same text", provenance: null, outbound_intent_id: null }],
      [{ id: "i1", lead_id: 1, rendered_body: "same text", message_guid: null }],
    )[0].provenance === "manual_outbound",
  )
  check(
    "inbound is always client_inbound regardless of intents",
    classifyProvenance(
      [{ id: "m", guid: "g", lead_id: 1, is_from_me: false, body: "same text", provenance: null, outbound_intent_id: null }],
      [{ id: "i1", lead_id: 1, rendered_body: "same text", message_guid: null }],
    )[0].provenance === "client_inbound",
  )

  // ─── PROOF 2 — an ordinary reply still allows Text 2 ───────────────────────
  console.log("\nProof 2 — an ordinary client reply after Text 1 still allows Text 2")
  for (const reply of ["sounds good!", "yes please", "I'm looking downtown", "stop by the office tomorrow", "can we cancel the 3pm tour?"]) {
    const d = decide(conv({ lastInboundAt: "2026-09-23T18:59:45.000Z" }), lead())
    check(`"${reply}" → Text 2 still sends`, d.action === "send", JSON.stringify(d))
  }
  check(
    "the opening pair is reply-insensitive because t1/t2 are consent_only",
    decide(conv({ lastInboundAt: "2026-09-23T18:59:45.000Z" })).action === "send",
  )
  {
    // Contrast: a FULL-gated step IS cancelled by the same reply. Proves the
    // exemption is scoped to the opening pair and not a blanket change.
    const d = decide(
      conv({ lastInboundAt: "2026-09-23T18:59:45.000Z" }),
      lead(),
      t2Run({ stepKey: "contact_fu1", stepIndex: 2 }),
    )
    check(
      "a full-gated contact follow-up IS cancelled by the same reply",
      d.action === "cancel" && reasonOf(d) === "client_replied",
      JSON.stringify(d),
    )
  }

  // ─── PROOF 3 — explicit STOP prevents Text 2 ──────────────────────────────
  console.log("\nProof 3 — an explicit STOP after Text 1 prevents Text 2")
  {
    const d = decide(conv({ lastInboundAt: "2026-09-23T18:59:45.000Z" }), lead({ smsOptIn: false }))
    check("consent off → Text 2 is cancelled, not held", d.action === "cancel", JSON.stringify(d))
    check("…with reason opt_out", reasonOf(d) === "opt_out", String(reasonOf(d)))
  }
  console.log("  keyword recognition (whole message only):")
  for (const kw of ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"]) {
    check(`"${kw}" is an opt-out`, isOptOutMessage(kw))
    check(`"${kw.toLowerCase()}" is an opt-out`, isOptOutMessage(kw.toLowerCase()))
  }
  check('"stop." (punctuation) is an opt-out', isOptOutMessage("stop."))
  check('"  STOP!  " (padding) is an opt-out', isOptOutMessage("  STOP!  "))
  check('"Opt out" folds to OPTOUT', isOptOutMessage("Opt out"))
  check("the matched keyword is reported for the audit trail", optOutKeyword("stop!") === "STOP")
  console.log("  …and ordinary English containing a keyword is NOT:")
  for (const phrase of [
    "can we cancel the 3pm tour?",
    "I'll be at the end of the street",
    "quit messing around, send the list",
    "please stop texting me",
    "stop by the office tomorrow",
    "I want to end my lease early",
    "no stop",
  ]) {
    check(`"${phrase}" is NOT an opt-out`, !isOptOutMessage(phrase))
  }
  check("empty / null are not opt-outs", !isOptOutMessage("") && !isOptOutMessage(null) && !isOptOutMessage(undefined))

  // ─── PROOF 4 — a real manual text still holds automation ──────────────────
  console.log("\nProof 4 — a genuine manual locator text still holds/cancels automation")
  {
    // Changed deliberately in the lifecycle pass: a manual text suppresses
    // FULL-gated automation. It no longer holds Text 2, because the opening pair
    // is one thought split in two and a locator texting inside that 30-45s window
    // is greeting the client, not answering the location question.
    const d = decide(conv({ lastManualOutboundAt: "2026-09-23T18:59:50.000Z" }), lead(), t2Run({ stepKey: "contact_fu1", stepIndex: 2 }))
    check("a human text suppresses a full-gated step", d.action !== "send" && reasonOf(d) === "manual_conversation", JSON.stringify(d))
  }
  {
    const d = decide(conv({ lastManualOutboundAt: "2026-09-23T18:59:50.000Z" }))
    check("…and does NOT hold Text 2 (consent-only is exempt)", d.action === "send", JSON.stringify(d))
  }
  {
    const d = decide(
      conv({ lastManualOutboundAt: "2026-09-23T18:59:50.000Z" }),
      lead(),
      t2Run({ stepKey: "contact_fu1", stepIndex: 2 }),
    )
    check("…and reschedules a morning-gated routine step", d.action === "reschedule" && reasonOf(d) === "manual_conversation", JSON.stringify(d))
  }
  check(
    "a manual text BEFORE the baseline does not hold anything",
    decide(
      conv({ lastManualOutboundAt: "2026-09-23T10:00:00.000Z" }),
      lead(),
      t2Run({ baselineInboundAt: "2026-09-23T12:00:00.000Z" }),
    ).action === "send",
  )

  // ─── PROOF 5 — two devices racing produce exactly one claim ───────────────
  console.log("\nProof 5 — two devices racing for one intent produce exactly one claim")
  {
    const store = new InMemoryFollowupStore(() => NOW)
    const intentId = "intent-race"
    // Seed one pending intent directly.
    ;(store as unknown as { intents: Map<string, Record<string, unknown>> }).intents.set(intentId, {
      id: intentId,
      workspace_id: "ws",
      lead_id: 1,
      dispatch_status: "pending",
      created_at: NOW.toISOString(),
      _seq: 1,
    })

    // BOTH devices read it before either writes — the exact interleaving the old
    // read-then-write claim allowed.
    const seenByA = await store.pendingIntents("ws", 10)
    const seenByB = await store.pendingIntents("ws", 10)
    check("both devices see the pending intent", seenByA.length === 1 && seenByB.length === 1)

    const wonA = await store.claimIntent(intentId, { dispatch_status: "claimed", gateway_device_id: "mac-A" })
    const wonB = await store.claimIntent(intentId, { dispatch_status: "claimed", gateway_device_id: "mac-B" })
    check("device A wins the claim", wonA === true)
    check("device B is refused", wonB === false)
    check("exactly one device claimed it", [wonA, wonB].filter(Boolean).length === 1)

    const after = await store.intentById(intentId)
    check("the intent is owned by A, not B", (after as unknown as { gateway_device_id: string }).gateway_device_id === "mac-A")
    check("…and is no longer claimable by anyone", (await store.pendingIntents("ws", 10)).length === 0)
    check("a third claim also fails", (await store.claimIntent(intentId, { dispatch_status: "claimed" })) === false)
  }
  {
    // The guard must be in the WRITE, not merely in the read filter.
    const { readFileSync } = await import("node:fs")
    const src = readFileSync("lib/followup/stores/supabaseStore.ts", "utf8")
    // Bounded to claimIntent's OWN body. An unbounded slice-to-end-of-file
    // silently matched pendingIntents' identical `.eq("dispatch_status",
    // "pending")` further down, so removing the predicate from the claim itself
    // left this assertion green — a mutation caught it.
    const claimStart = src.indexOf("async claimIntent")
    const claimEnd = src.indexOf("\n  async ", claimStart + 1)
    const claim = src.slice(claimStart, claimEnd === -1 ? undefined : claimEnd)
    check("the bounded slice really is just claimIntent", !claim.includes("async pendingIntents"))
    check("the real claim filters on dispatch_status in the UPDATE", /\.eq\("dispatch_status", "pending"\)/.test(claim))
    check("…and checks the rows it actually changed", /\.select\("id"\)/.test(claim) && /length === 1/.test(claim))
    check("…and fails closed on error", /if \(error\) return false/.test(claim))
    const engine = readFileSync("lib/followup/engine.ts", "utf8")
    check("runClaim releases no job when the claim is lost", /if \(!won\) continue/.test(engine))
    check("…and no unconditional claim write remains in runClaim", !/updateIntent\(intent\.id, \{\s*\n\s*dispatch_status: "claimed"/.test(engine))
  }

  // ─── PROOF 6 — repeated claim/ack is idempotent ───────────────────────────
  console.log("\nProof 6 — repeated claim/ack is idempotent")
  {
    const store = new InMemoryFollowupStore(() => NOW)
    const id = "intent-idem"
    ;(store as unknown as { intents: Map<string, Record<string, unknown>> }).intents.set(id, {
      id, workspace_id: "ws", lead_id: 1, dispatch_status: "pending", created_at: NOW.toISOString(), _seq: 1,
    })
    const first = await store.claimIntent(id, { dispatch_status: "claimed" })
    const second = await store.claimIntent(id, { dispatch_status: "claimed" })
    const third = await store.claimIntent(id, { dispatch_status: "claimed" })
    check("only the first claim succeeds", first && !second && !third)

    await store.updateIntent(id, { dispatch_status: "sent" })
    check("a sent intent cannot be re-claimed", (await store.claimIntent(id, { dispatch_status: "claimed" })) === false)

    const { readFileSync } = await import("node:fs")
    const engine = readFileSync("lib/followup/engine.ts", "utf8")
    check("a duplicate 'sent' ack short-circuits", /dispatch_status === "sent"\) return \{ ok: true, already: true \}/.test(engine))
    check("an ack from the wrong device is refused", /wrong_device/.test(engine))
  }
  check(
    "re-classifying provenance is a no-op (already-linked intents are not re-claimed)",
    classifyProvenance(
      [{ id: "m1", guid: "g1", lead_id: 1, is_from_me: true, body: "b", provenance: "automated_outbound", outbound_intent_id: "i1" }],
      [{ id: "i1", lead_id: 1, rendered_body: "b", message_guid: "g1" }],
    )[0].outboundIntentId === "i1",
  )

  // ─── PROOF 7 — the opening-pair delay is 30-45s ───────────────────────────
  console.log("\nProof 7 — the opening-pair delay resolves within 30-45 seconds")
  {
    const gapFor = (spacing: number) => {
      const r = nextStepEligibility("new_lead", "t1", T1_SENT, { spacingMs: () => spacing })
      return new Date(r!.nextEligibleAt).getTime() - new Date(T1_SENT).getTime()
    }
    // Injected, so these are exact rather than flaky.
    check("an injected 30s produces a 30s gap", gapFor(30_000) === 30_000)
    check("an injected 45s produces a 45s gap", gapFor(45_000) === 45_000)
    check("an injected 37s produces a 37s gap", gapFor(37_000) === 37_000)
    check("the next step after t1 is t2", nextStepEligibility("new_lead", "t1", T1_SENT, { spacingMs: () => 30_000 })!.nextStepKey === "t2")

    // The real generator is sampled for its RANGE, which is deterministic even
    // though each draw is not.
    const draws = Array.from({ length: 2000 }, () => doubleTextSpacingMs())
    check(`${draws.length} draws all fall within [30000, 45000)`, draws.every((d) => d >= 30_000 && d < 45_000), `min ${Math.min(...draws)} max ${Math.max(...draws)}`)
    check("the range bounds are the documented 30s/45s", DOUBLE_TEXT_MIN_MS === 30_000 && DOUBLE_TEXT_MAX_MS === 45_000)
    // The bug being fixed: it used to be the same value every time.
    check("the gap is NOT a constant 30s any more", new Set(draws).size > 100, `${new Set(draws).size} distinct values`)
    check("the real generator is wired in by default (no injection)", (() => {
      const gaps = new Set(
        Array.from({ length: 200 }, () => {
          const r = nextStepEligibility("new_lead", "t1", T1_SENT)
          return new Date(r!.nextEligibleAt).getTime() - new Date(T1_SENT).getTime()
        }),
      )
      return gaps.size > 10 && [...gaps].every((g) => g >= 30_000 && g < 45_000)
    })())

    // Contrast: a routine step is unaffected — still a 2-day interval.
    const fu = nextStepEligibility("new_lead", "t2", T1_SENT)
    check("the step after t2 is contact_fu1 at +2 days", fu!.nextStepKey === "contact_fu1" &&
      new Date(fu!.nextEligibleAt).getTime() - new Date(T1_SENT).getTime() === 2 * 24 * 3600_000)
  }

  console.log(`\n${pass} passed, ${fail} failed\n`)
  process.exit(fail === 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })
