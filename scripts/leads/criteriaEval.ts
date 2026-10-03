/**
 * CRITERIA EXTRACTION EVALUATION HARNESS — safe, read-only, no writes.
 *
 * Runs the REAL pipeline over simulated client replies:
 *
 *     extractLocationFacts  →  resolveDestination  →  reconcileLocation
 *
 * Nothing is mocked except the lead, which is an in-memory object. There is no
 * Supabase client in this file at all, so it cannot write a lead, a Client
 * History event, or criteria_scanned_at even by mistake — the safety property is
 * structural rather than a flag that could be flipped.
 *
 * WHY IT EXISTS. The extractor's behaviour lives in a prompt, and a prompt has no
 * type signature. criteriaSemantics.test.ts pins specific contracts pass/fail;
 * this shows the whole distribution at a glance, which is what you want when
 * CHANGING the prompt — a regression usually shows up as a handful of rows
 * shifting column, not as one assertion flipping.
 *
 * Scenario: the New Lead double-text, whose second message asks
 * "Are you trying to stay near a specific address or side of town?" Clients reply
 * in two or three words, so this is the main way location criteria will arrive.
 *
 * Costs one model call per case plus one Places call per explicit anchor.
 *
 * Run: node --env-file=.env.local --import tsx scripts/leads/criteriaEval.ts
 */
import { extractLocationFacts, type ConversationTurn } from "@/lib/criteria/extractLocationFacts"
import { resolveDestination } from "@/lib/criteria/resolveDestination"
import { reconcileLocation, type ResolvedDestination } from "@/lib/criteria/reconcileLocation"

/** The real second New Lead message (packages/companion-shared …followUpTemplates). */
const NEW_LEAD_Q2 = "Are you trying to stay near a specific address or side of town?"

/** A brand-new lead: nothing collected yet, which is the real state at this point. */
const FRESH_LEAD = {
  id: 0,
  neighborhoods: "",
  submarkets: "",
  commute_anchor_label: "",
  commute_anchor_place_id: "",
  commute_max_minutes: null,
}

const REPLIES = [
  "Westover Hills",
  "Downtown",
  "Alamo Ranch",
  "Northwest side",
  "78245",
  "Near Lackland",
  "Fort Sam",
  // NOT "123 Main St" or any other placeholder address. A fictitious address
  // tests nothing about the resolver: it cannot resolve because the place does
  // not exist, which says nothing about whether a real client-supplied address
  // works. Use verifiable local addresses here, or nothing.
  "Potranco Road",
  "Potranco and 1604",
  "Culebra & 1604",
  "Near Methodist Hospital",
  "About 20 minutes from Lackland",
  "I work at Lackland",
  "Westover Hills or Alamo Ranch",
]

type Row = {
  reply: string
  areas: string
  anchor: string
  maxDrive: string
  needsReview: string
  notes: string[]
  raw: unknown
}

const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s.padEnd(n))

async function evaluate(reply: string, question: string): Promise<Row> {
  const context: ConversationTurn[] = [{ fromMe: true, body: question }]
  const facts = await extractLocationFacts(reply, context)

  // Real resolution — only for an explicit anchor, exactly as the consumer does.
  let resolved: ResolvedDestination | null = null
  let anchorNote = ""
  if (facts.destination?.confidence === "explicit") {
    const r = await resolveDestination(facts.destination.name)
    if (r.status === "resolved") resolved = r.destination
    else anchorNote = ` [${r.status}]`
  } else if (facts.destination) {
    anchorNote = " [ambiguous]"
  }

  const outcome = reconcileLocation({ lead: FRESH_LEAD, facts, resolvedDestination: resolved })

  // Report what the lead WOULD hold, not merely what the model said.
  const areas = String(outcome.patch.neighborhoods ?? "") ||
    (facts.areas.length ? `(not applied: ${facts.areas.map((a) => a.name).join(", ")})` : "—")
  const anchor = resolved
    ? String(outcome.patch.commute_anchor_label ?? resolved.label)
    : facts.destination
      ? `(not applied: ${facts.destination.name})${anchorNote}`
      : "—"
  const maxDrive = outcome.patch.commute_max_minutes != null
    ? `${outcome.patch.commute_max_minutes} min`
    : facts.maxDriveMinutes
      ? `(not applied: ${facts.maxDriveMinutes.minutes})`
      : "—"

  return {
    reply,
    areas,
    anchor,
    maxDrive,
    needsReview: outcome.needsReview ? "YES" : "no",
    notes: outcome.notes,
    raw: { areas: facts.areas, destination: facts.destination, maxDriveMinutes: facts.maxDriveMinutes, unsupportedConstraint: facts.unsupportedConstraint },
  }
}

async function main() {
  console.log(`\nNEW LEAD — reply to: "${NEW_LEAD_Q2}"`)
  console.log(`Fresh lead (no existing criteria). ${REPLIES.length} replies through the real pipeline.\n`)

  const rows = await Promise.all(REPLIES.map((r) => evaluate(r, NEW_LEAD_Q2)))

  const H = ["Client reply", "Desired Areas", "Geographic Anchor", "Max Drive", "needsReview"]
  const W = [32, 24, 34, 11, 11]
  console.log(H.map((h, i) => pad(h, W[i])).join("│ "))
  console.log(W.map((w) => "─".repeat(w)).join("┼─"))
  for (const r of rows) {
    console.log([r.reply, r.areas, r.anchor, r.maxDrive, r.needsReview].map((c, i) => pad(String(c), W[i])).join("│ "))
  }

  console.log("\nRECONCILIATION NOTES")
  for (const r of rows) console.log(`  ${pad(r.reply, 32)} ${r.notes.join(", ") || "(none)"}`)

  console.log("\nRAW EXTRACTION (for any row that looks wrong)")
  for (const r of rows) console.log(`  ${pad(r.reply, 32)} ${JSON.stringify(r.raw)}`)
}
main()
