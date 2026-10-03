/**
 * CONVERSATION CRITERIA EXTRACTION — V1 (location only).
 *
 * Reconciliation is tested against hand-built facts rather than live model
 * output, deliberately: the model is the part that can be wrong, and the whole
 * design is that NOTHING it returns can reach the database without passing the
 * deterministic rules below. These assertions are those rules.
 *
 * Run: npx tsx scripts/leads/criteriaExtraction.test.ts
 */
import { readFileSync } from "node:fs"
import { execSync } from "node:child_process"
import path from "node:path"
import { reconcileLocation, MAX_DESIRED_AREAS } from "@/lib/criteria/reconcileLocation"
import { mayContainLocation, locationFactsSchema, EMPTY_FACTS } from "@/lib/criteria/locationFacts"
import { buildPrompt, CONTEXT_TURNS } from "@/lib/criteria/extractLocationFacts"
import type { LocationFacts } from "@/lib/criteria/locationFacts"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}${d ? `\n      ${d}` : ""}`) }
}
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")
const strip = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")

// ── builders ────────────────────────────────────────────────────────────────
const F = (p: Partial<LocationFacts>): LocationFacts => ({ ...EMPTY_FACTS, ...p })
const area = (name: string, intent: "replacement" | "additive" | "preference" = "preference", confidence: "explicit" | "ambiguous" = "explicit") =>
  ({ name, intent, confidence })
const dest = (name: string, confidence: "explicit" | "ambiguous" = "explicit") => ({ name, confidence })
const max = (minutes: number, confidence: "explicit" | "ambiguous" = "explicit") => ({ minutes, confidence })
const LACKLAND = { label: "Lackland AFB", placeId: "ChIJ_LACKLAND" }

const BLANK = { id: 1, neighborhoods: "", submarkets: "", commute_anchor_label: "", commute_anchor_place_id: "", commute_max_minutes: null }
const TWO_AREAS = { ...BLANK, neighborhoods: "Downtown San Antonio, Westover Hills" }
const ANCHORED = { ...BLANK, commute_anchor_label: "Fort Sam", commute_anchor_place_id: "ChIJ_FORTSAM" }

console.log("\nCONVERSATION CRITERIA EXTRACTION — V1\n")

console.log("THE REQUIRED CLIENT STATEMENTS:")
{
  // "Lackland AFB, preferably within 20 minutes."
  {
    const r = reconcileLocation({ lead: BLANK, facts: F({ destination: dest("Lackland AFB"), maxDriveMinutes: max(20) }), resolvedDestination: LACKLAND })
    ok('"Lackland AFB, preferably within 20 minutes." → destination + max, ONE event',
      r.patch.commute_anchor_place_id === LACKLAND.placeId && r.patch.commute_max_minutes === 20 && r.changes.length === 2)
    ok("…and it does NOT touch Desired Areas", !("neighborhoods" in r.patch))
  }
  // "I work at Lackland AFB. I'd like to stay within 15 minutes."
  {
    const r = reconcileLocation({ lead: BLANK, facts: F({ destination: dest("Lackland AFB"), maxDriveMinutes: max(15) }), resolvedDestination: LACKLAND })
    ok('"I work at Lackland AFB… within 15 minutes." → 15', r.patch.commute_max_minutes === 15)
  }
  // "I work at Fort Sam and don't want to drive more than 15 minutes."
  {
    const r = reconcileLocation({ lead: ANCHORED, facts: F({ destination: dest("Fort Sam"), maxDriveMinutes: max(15) }), resolvedDestination: { label: "Fort Sam", placeId: "ChIJ_FORTSAM" } })
    ok('"…Fort Sam… no more than 15 minutes." on an already-anchored lead → only the max moves',
      r.patch.commute_max_minutes === 15 && !("commute_anchor_place_id" in r.patch))
    ok("…and the unchanged destination is noted, not rewritten", r.notes.includes("destination_unchanged"))
  }
  // "I need to be near Lackland."
  {
    const r = reconcileLocation({ lead: BLANK, facts: F({ destination: dest("Lackland") }), resolvedDestination: LACKLAND })
    ok('"I need to be near Lackland." → destination only, max stays NULL',
      r.patch.commute_anchor_place_id === LACKLAND.placeId && !("commute_max_minutes" in r.patch))
  }
  // "No specific address, just somewhere near Alamo Ranch."
  {
    const r = reconcileLocation({ lead: BLANK, facts: F({ areas: [area("Alamo Ranch")] }) })
    ok('"No specific address, just…near Alamo Ranch." → AREA, not destination',
      r.patch.neighborhoods === "Alamo Ranch" && !("commute_anchor_place_id" in r.patch))
  }
  // "Northwest side, preferably around Helotes."
  {
    const r = reconcileLocation({ lead: BLANK, facts: F({ areas: [area("Helotes")] }) })
    ok('"Northwest side…around Helotes." → area', r.patch.neighborhoods === "Helotes")
  }
  // Contextual one-word answers.
  {
    const r = reconcileLocation({ lead: BLANK, facts: F({ areas: [area("Alamo Ranch")] }) })
    ok('"Alamo Ranch" answering our location question → area', r.patch.neighborhoods === "Alamo Ranch")
    const r2 = reconcileLocation({ lead: ANCHORED, facts: F({ maxDriveMinutes: max(20) }) })
    ok('"20 minutes" answering our commute question → max drive 20', r2.patch.commute_max_minutes === 20)
  }
}

console.log("\nAMBIGUOUS STATEMENTS NEVER WRITE:")
{
  const cases: Array<[string, LocationFacts]> = [
    ['"Maybe Alamo Ranch."', F({ areas: [area("Alamo Ranch", "preference", "ambiguous")] })],
    ['"I\'ve heard Westover Hills is nice."', F({ areas: [area("Westover Hills", "preference", "ambiguous")] })],
    ['"My friend lives near Lackland."', F({ destination: dest("Lackland", "ambiguous") })],
    ['"I don\'t know yet." / "No specific area."', EMPTY_FACTS],
  ]
  for (const [label, facts] of cases) {
    const r = reconcileLocation({ lead: TWO_AREAS, facts, resolvedDestination: LACKLAND })
    ok(`${label} → NO write`, Object.keys(r.patch).length === 0 && r.changes.length === 0)
  }
  ok("…and an ambiguous fact is noted internally, not silently dropped",
    reconcileLocation({ lead: BLANK, facts: F({ areas: [area("Alamo Ranch", "preference", "ambiguous")] }) })
      .notes.includes("ambiguous_area_ignored"))
}

console.log("\nDESTINATION vs DESIRED AREA — the distinction that must hold:")
{
  const r = reconcileLocation({ lead: TWO_AREAS, facts: F({ destination: dest("Lackland AFB") }), resolvedDestination: LACKLAND })
  ok("a destination NEVER consumes a Desired Area slot", !("neighborhoods" in r.patch))
  ok("…and never erases existing areas", r.patch.neighborhoods === undefined)
  ok("…it writes the anchor columns instead",
    r.patch.commute_anchor_label === "Lackland AFB" && r.patch.commute_anchor_place_id === LACKLAND.placeId)
}

console.log("\nTHE TWO-AREA LIMIT:")
{
  ok("the limit is 2", MAX_DESIRED_AREAS === 2)
  // Additive third → declined, NOT guessed.
  const third = reconcileLocation({ lead: TWO_AREAS, facts: F({ areas: [area("Alamo Ranch", "additive")] }) })
  ok("an additive THIRD area is NOT appended", !("neighborhoods" in third.patch))
  ok("…and is flagged for review rather than guessing which to drop",
    third.needsReview && third.notes.includes("areas_would_exceed_limit"))
  // Explicit replacement of two areas with one → allowed.
  const repl = reconcileLocation({ lead: TWO_AREAS, facts: F({ areas: [area("Alamo Ranch", "replacement")] }) })
  ok("an EXPLICIT replacement of two areas with one is applied", repl.patch.neighborhoods === "Alamo Ranch")
  ok("…recorded with the originals preserved in `from`",
    repl.changes[0]?.from === "Downtown San Antonio, Westover Hills" && repl.changes[0]?.to === "Alamo Ranch")
  // Additive that still fits.
  const fits = reconcileLocation({ lead: { ...BLANK, neighborhoods: "Downtown San Antonio" }, facts: F({ areas: [area("Alamo Ranch", "additive")] }) })
  ok("an additive SECOND area is applied", fits.patch.neighborhoods === "Downtown San Antonio, Alamo Ranch")
  // Replacement can never exceed the cap either.
  const many = reconcileLocation({ lead: TWO_AREAS, facts: F({ areas: [area("A", "replacement"), area("B", "replacement"), area("C", "replacement")] }) })
  ok("a replacement naming three is capped at two", String(many.patch.neighborhoods).split(",").length === 2)
}

console.log("\nNEVER DELETE ON MENTION; NEVER INVENT:")
{
  ok("stating a destination leaves areas intact",
    !("neighborhoods" in reconcileLocation({ lead: TWO_AREAS, facts: F({ destination: dest("Lackland AFB") }), resolvedDestination: LACKLAND }).patch))
  ok("stating an area leaves the anchor intact",
    !("commute_anchor_place_id" in reconcileLocation({ lead: ANCHORED, facts: F({ areas: [area("Helotes", "replacement")] }) }).patch))
  ok("a max drive is never invented when unstated",
    !("commute_max_minutes" in reconcileLocation({ lead: BLANK, facts: F({ destination: dest("Lackland AFB") }), resolvedDestination: LACKLAND }).patch))
  const orphan = reconcileLocation({ lead: BLANK, facts: F({ maxDriveMinutes: max(20) }) })
  ok("a max drive with NO anchor is not written", !("commute_max_minutes" in orphan.patch))
  ok("…and is flagged for review", orphan.needsReview && orphan.notes.includes("max_drive_without_destination"))
  ok("re-stating the SAME area is a no-op",
    reconcileLocation({ lead: TWO_AREAS, facts: F({ areas: [area("Westover Hills", "additive")] }) }).changes.length === 0)
  ok("re-stating the SAME max is a no-op",
    reconcileLocation({ lead: { ...ANCHORED, commute_max_minutes: 20 }, facts: F({ maxDriveMinutes: max(20) }) }).changes.length === 0)
}

console.log("\nUNSUPPORTED GEOGRAPHIC BOUNDARIES — surfaced, never written:")
{
  // "inside 1604" / "north of 410" describe a REGION, not a point. The only
  // shaped slot V1 has is a point anchor, so forcing one in would state a
  // different requirement than the client gave. Flagged instead of guessed.
  const b = reconcileLocation({ lead: BLANK, facts: F({ unsupportedConstraint: "inside 1604" }) })
  ok("a boundary writes NOTHING", Object.keys(b.patch).length === 0 && b.changes.length === 0)
  ok("…and is flagged for review", b.needsReview && b.notes.includes("unsupported_geographic_constraint"))
  // It must never be silently dropped either — the note is the record that we saw it.
  ok("…never silently discarded", b.notes.includes("unsupported_geographic_constraint"))
  // A boundary alongside a genuine fact must not block that fact.
  const mixed = reconcileLocation({
    lead: ANCHORED,
    facts: F({ unsupportedConstraint: "north of 410", maxDriveMinutes: max(20) }),
  })
  ok("a genuine Max Drive in the same message STILL applies", mixed.patch.commute_max_minutes === 20)
  ok("…while the boundary still raises review", mixed.needsReview)
  // And the schema must actually carry the field.
  ok("the contract has a place for it",
    locationFactsSchema.safeParse({ unsupportedConstraint: "inside 1604" }).success)
  ok("…defaulting to absent", locationFactsSchema.parse({}).unsupportedConstraint == null)
}

console.log("\nUNRESOLVED DESTINATION WRITES NOTHING:")
{
  const r = reconcileLocation({ lead: BLANK, facts: F({ destination: dest("Methodist Hospital") }), resolvedDestination: null })
  ok("no place id → no destination written", Object.keys(r.patch).length === 0)
  ok("…flagged for review", r.needsReview && r.notes.includes("destination_unresolved"))
  const withMax = reconcileLocation({ lead: BLANK, facts: F({ destination: dest("Methodist Hospital"), maxDriveMinutes: max(20) }), resolvedDestination: null })
  ok("…and its max is not written either (no anchor to measure to)", !("commute_max_minutes" in withMax.patch))
}

console.log("\nONE STATEMENT = ONE EVENT:")
{
  const r = reconcileLocation({ lead: BLANK, facts: F({ destination: dest("Lackland AFB"), maxDriveMinutes: max(15) }), resolvedDestination: LACKLAND })
  ok("destination + max produce TWO changes in ONE changes[] array", r.changes.length === 2)
  const labels = r.changes.map((c) => c.label).sort()
  ok("…labelled Commute / Destination and Max Drive",
    labels[0] === "Commute / Destination" && labels[1] === "Max Drive")
  const consumer = strip(read("lib/criteria/processLeadLocation.ts"))
  ok("the consumer inserts ONE timeline row per statement",
    (consumer.match(/from\("lead_timeline"\)[\s\S]{0,40}\.insert/g) ?? []).length === 1)
  ok('…with source "conversation"', /criteriaChangedMetadata\("conversation", outcome\.changes\)/.test(consumer))
}

console.log("\nCONTEXT WINDOW — small, and sufficient:")
{
  const turns = Array.from({ length: 10 }, (_, i) => ({ fromMe: i % 2 === 0, body: `turn ${i}` }))
  const prompt = buildPrompt("Alamo Ranch", turns)
  ok(`only the last ${CONTEXT_TURNS} turns are sent`, !prompt.includes("turn 5") && prompt.includes("turn 9"))
  ok("…the message under extraction is marked CLIENT", /Message to extract from \(CLIENT\)/.test(prompt))
  ok("…and agent turns are labelled so a question can be read", prompt.includes("Agent:"))
  ok("no context → no empty 'Recent conversation' header", !buildPrompt("hi", []).includes("Recent conversation"))
}

console.log("\nPRE-FILTER is a COST filter, never a safety filter:")
{
  // Generous on purpose: "that works for me" trips the work-at hint, and that is
  // the correct trade — a false positive costs one model call, a false negative
  // loses a client's stated requirement.
  ok("a long message with no location language is skipped before any model call",
    !mayContainLocation("Thanks so much, I really appreciate you sending those over and getting back to me so quickly today"))
  ok("a short reply is ALWAYS considered (it may answer our question)", mayContainLocation("Alamo Ranch") && mayContainLocation("20 minutes"))
  ok("location language is considered", mayContainLocation("I work at Lackland AFB and cannot drive more than fifteen minutes each way"))
  ok("empty is skipped", !mayContainLocation("") && !mayContainLocation(null))
}

console.log("\nSCHEMA — the model cannot return an unknown shape:")
{
  ok("a valid payload parses", locationFactsSchema.safeParse({ areas: [], destination: null, maxDriveMinutes: null, evidence: "" }).success)
  ok("a fabricated numeric confidence is REJECTED",
    !locationFactsSchema.safeParse({ areas: [{ name: "X", intent: "preference", confidence: 0.87 }] }).success)
  ok("an out-of-range max drive is REJECTED",
    !locationFactsSchema.safeParse({ maxDriveMinutes: { minutes: 9999, confidence: "explicit" } }).success)
  ok("a non-integer max drive is REJECTED",
    !locationFactsSchema.safeParse({ maxDriveMinutes: { minutes: 12.5, confidence: "explicit" } }).success)
  ok("an unknown intent is REJECTED",
    !locationFactsSchema.safeParse({ areas: [{ name: "X", intent: "whatever", confidence: "explicit" }] }).success)
  const src = strip(read("lib/criteria/extractLocationFacts.ts"))
  ok("the extractor validates before returning", /locationFactsSchema\.safeParse\(parsed\)/.test(src))
  ok("…and degrades to EMPTY_FACTS rather than throwing", /return EMPTY_FACTS/.test(src))
  ok("…the model never receives the lead's current criteria",
    !/neighborhoods|commute_anchor|commute_max/.test(src))
}

console.log("\nIDEMPOTENCY — the ledger is companion_messages.criteria_scanned_at:")
{
  const consumer = strip(read("lib/criteria/processLeadLocation.ts"))

  // (1) A scanned message costs ZERO model calls. The guard must EXIST and come
  // first — ordering alone is not enough, because with the guard deleted indexOf
  // returns -1 and -1 < anything is still "before".
  const guardAt = consumer.indexOf("if (m.criteria_scanned_at)")
  ok("the scanned guard exists", guardAt >= 0)
  ok("…and runs BEFORE any model call", guardAt >= 0 && guardAt < consumer.indexOf("extractLocationFacts("))
  ok("…and before the pre-filter too", guardAt >= 0 && guardAt < consumer.indexOf("mayContainLocation(body)"))
  ok("…and it SKIPS (continue), rather than merely noting it",
    /if \(m\.criteria_scanned_at\) \{[\s\S]{0,200}continue/.test(consumer))
  ok("the ledger column is selected so the guard can see it",
    /\.select\("guid, body, is_from_me, sent_at, criteria_scanned_at"\)/.test(consumer))

  // The ledger REPLACED the history-guid mechanism as the decision input.
  ok("dedupe no longer derives from Client History events",
    !/metadata\?\.evidence\?\.guid/.test(consumer) && !/processed\.has\(/.test(consumer))
  // …but the evidence guid is still recorded for AUDIT.
  ok("the evidence guid is STILL written to criteria_changed metadata",
    /evidence: \{ guid: m\.guid, text: facts\.evidence \|\| body/.test(consumer))

  // (10) Stamped only AFTER the required persistence. Every markScanned call for
  // the change path must follow both the lead update and the history insert.
  {
    // Scoped to the CHANGE PATH — everything after the dryRun early-return — so a
    // stamp inserted before persistence is caught here directly, not merely as a
    // side effect of a count. lastIndexOf alone would still find the correct final
    // stamp and pass while an earlier, premature one sat above it.
    const tail = consumer.slice(consumer.indexOf("if (dryRun) {"))
    const firstStamp = tail.indexOf("markScanned(m.guid)")
    const leadUpdate = tail.indexOf('.from("leads").update(outcome.patch)')
    const historyInsert = tail.indexOf('.from("lead_timeline")')
    ok("the change path contains a stamp, a lead update and a history insert",
      firstStamp >= 0 && leadUpdate >= 0 && historyInsert >= 0)
    ok("NO stamp occurs before the lead update", leadUpdate < firstStamp,
      "stamping first would lose the client's requirement on any later failure")
    ok("…and none before the Client History insert", historyInsert < firstStamp)
  }
  ok("a FAILED lead update leaves the message unscanned",
    /update failed[\s\S]{0,260}left_unscanned[\s\S]{0,60}continue/.test(consumer))
  ok("a FAILED history write leaves the message unscanned",
    /history write failed[\s\S]{0,320}left_unscanned/.test(consumer))
  ok("a FAILED extraction leaves the message unscanned",
    /extraction failed[\s\S]{0,260}left_unscanned/.test(consumer))
  ok("an UNAVAILABLE Places resolver leaves the message unscanned (infrastructure, not a verdict)",
    /if \(r\.status === "unavailable"\) resolverFailed = true/.test(consumer) &&
    /if \(resolverFailed\) \{[\s\S]{0,220}left_unscanned/.test(consumer))

  // (2,3,4) Every SUCCESSFUL outcome is stamped, not just changes.
  for (const [name, re] of [
    ["no location language", /mayContainLocation\(body\)\) \{[\s\S]{0,320}markScanned\(m\.guid\)/],
    ["nothing stated", /nothing_stated/],
    ["no change / ambiguous / needsReview", /outcome\.changes\.length === 0\) \{[\s\S]{0,260}markScanned\(m\.guid\)/],
  ] as const) ok(`a successful "${name}" outcome IS stamped`, re.test(consumer))

  // markScanned writes ONLY the ledger column.
  const fn = consumer.slice(consumer.indexOf("async function markScanned"))
  ok("markScanned updates ONLY criteria_scanned_at",
    /\.update\(\{ criteria_scanned_at: new Date\(\)\.toISOString\(\) \}\)/.test(fn))
  // Scoped to the update PAYLOAD — `guid` legitimately appears in the signature
  // and the .eq() selector; what matters is that no other column is written.
  {
    const payload = fn.slice(fn.indexOf(".update("), fn.indexOf("})", fn.indexOf(".update(")))
    ok("…and writes no other message column",
      !/body|lead_id|sent_at|is_from_me|phone|workspace_id/.test(payload))
  }
  ok("…and never throws (a failed stamp retries, never loses the requirement)", !/throw/.test(fn))
}

console.log("\nDRY RUN — zero database mutations:")
{
  const consumer = strip(read("lib/criteria/processLeadLocation.ts"))
  // Every mutation in the file must be unreachable while dryRun is true.
  ok("the lead update is behind a dryRun early-return",
    consumer.indexOf("if (dryRun) {") < consumer.indexOf('.from("leads").update(outcome.patch)'))
  ok("…and that branch writes nothing", /if \(dryRun\) \{[\s\S]{0,400}dry_run_not_written[\s\S]{0,40}continue/.test(consumer))
  {
    // Four stamp sites: three on early-exit paths (explicitly !dryRun-guarded),
    // and one on the change path, which is unreachable in a dry run because the
    // `if (dryRun)` branch above it returns first.
    const all = (consumer.match(/markScanned\(m\.guid\)/g) ?? []).length
    const guarded = (consumer.match(/if \(!dryRun\) await markScanned\(m\.guid\)/g) ?? []).length
    ok("every stamp site is either !dryRun-guarded or after the dryRun return",
      all === 4 && guarded === 3, `sites=${all} guarded=${guarded}`)
    ok("…and the one unguarded stamp sits AFTER the dryRun early-return",
      consumer.indexOf("if (dryRun) {") < consumer.lastIndexOf("await markScanned(m.guid)"))
  }
  ok("dryRun DEFAULTS to true", /opts\.dryRun \?\? true/.test(consumer))
}

console.log("\nARCHITECTURE BOUNDARY — asserted, not assumed:")
{
  const files = [
    "lib/criteria/locationFacts.ts",
    "lib/criteria/reconcileLocation.ts",
    "lib/criteria/resolveDestination.ts",
    "lib/criteria/extractLocationFacts.ts",
    "lib/criteria/processLeadLocation.ts",
  ]
  const all = files.map((f) => strip(read(f))).join("\n")
  for (const forbidden of ["lib/followup", "followup_opt_in", "sms_opt_in", "opt_out", "applyOptOut", "ai_client_briefs", "syncAiInsights", "insightsRefresh", "device_tokens", "cursor", "twilio", "sendSms"]) {
    ok(`no module references ${forbidden}`, !new RegExp(forbidden.replace("/", "\\/"), "i").test(all))
  }
  const consumer = strip(read("lib/criteria/processLeadLocation.ts"))
  // companion_messages is now WRITTEN — but ONLY the ledger column, by design and
  // with approval. Message CONTENT remains untouched, which is the rule that
  // actually protects Beast Sync: it never reads criteria_scanned_at, so stamping
  // it cannot affect ingestion, attribution, cursors or ACKs.
  ok("companion_messages content is never inserted, upserted or deleted",
    !/from\("companion_messages"\)[\s\S]{0,160}\.(insert|upsert|delete)\(/.test(consumer))
  ok("…the only update to it is the ledger stamp",
    (consumer.match(/from\("companion_messages"\)[\s\S]{0,160}\.update\(/g) ?? []).length === 1 &&
    /from\("companion_messages"\)\s*\.update\(\{ criteria_scanned_at:/.test(consumer))
  ok("…and the stamp is keyed on the message's own guid", /\.eq\("guid", guid\)/.test(consumer))
  ok("only leads, lead_timeline and companion_messages are written at all",
    (consumer.match(/\.from\("(\w+)"\)[\s\S]{0,80}\.(update|insert|upsert|delete)\(/g) ?? [])
      .every((s) => /"leads"|"lead_timeline"|"companion_messages"/.test(s)))
  ok("Beast Sync does not read or write the ledger column",
    !/criteria_scanned_at/.test(read("app/api/companion/messages/route.ts")) &&
    !/criteria_scanned_at/.test(read("lib/companion/attribution.ts")))
  ok("the lead update is confined to the four location columns",
    /\.select\("id, neighborhoods, submarkets, commute_anchor_label, commute_anchor_place_id, commute_max_minutes"\)/.test(consumer))
  ok("the destination resolver does NOT use the apartment-biased query",
    !/nameSearchTextQuery|apartments/.test(strip(read("lib/criteria/resolveDestination.ts"))))
  ok("…and sends the client's words unmodified", /textQuery, maxResultCount/.test(read("lib/criteria/resolveDestination.ts")))
}

console.log("\nAUTOMATIC PROCESSING IS OFF:")
{
  const consumer = read("lib/criteria/processLeadLocation.ts")
  ok("the master switch exists and is false", /export const AUTO_PROCESSING_ENABLED = false/.test(consumer))
  ok("dryRun DEFAULTS to true (callers must opt in to writing)", /opts\.dryRun \?\? true/.test(consumer))
  // Nothing may schedule it. Scoped to "criteria": vercel.json also carries the
  // Part 3 insights-refresh cron, which is an ancestor commit on this branch and
  // nothing to do with extraction.
  ok("no criteria cron is registered", !/criteria/i.test(read("vercel.json")))
  ok("…and no route invokes the consumer",
    !/processLeadLocation/.test(["app", "components"].map((d) => {
      try { return execSync(`grep -rl processLeadLocation ${d} 2>/dev/null || true`).toString() } catch { return "" }
    }).join("")))
}

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
