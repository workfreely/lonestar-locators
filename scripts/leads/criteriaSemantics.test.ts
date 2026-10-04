/**
 * EXTRACTION SEMANTICS — does the model read renter language the way a locator does?
 *
 * These call the REAL model, deliberately. The deterministic rules are covered by
 * criteriaExtraction.test.ts; what failed in the first production dry run was the
 * extraction layer itself — it downgraded "I would love to be close to Fort Sam"
 * to ambiguous because the wording was soft, and concatenated two places into one
 * destination string. No amount of structural assertion catches that. Only asking
 * the model does.
 *
 * Costs one Opus call per case, run in parallel. Requires ANTHROPIC_API_KEY.
 *
 * Run: node --env-file=.env.local --import tsx scripts/leads/criteriaSemantics.test.ts
 */
import { extractLocationFacts, type ConversationTurn } from "@/lib/criteria/extractLocationFacts"
import type { LocationFacts } from "@/lib/criteria/locationFacts"

type Case = {
  name: string
  message: string
  context?: ConversationTurn[]
  /** Return "" when satisfied, or a description of what was wrong. */
  check: (f: LocationFacts) => string
}

const agent = (body: string): ConversationTurn => ({ fromMe: true, body })

const areaNames = (f: LocationFacts) => f.areas.map((a) => a.name)
const explicitAreas = (f: LocationFacts) => f.areas.filter((a) => a.confidence === "explicit")
const destName = (f: LocationFacts) => f.destination?.name ?? ""
const destIsExplicit = (f: LocationFacts) => f.destination?.confidence === "explicit"
/** Loose containment — the model may canonicalize ("1604" → "Loop 1604"). */
const has = (hay: string, needle: string) => hay.toLowerCase().includes(needle.toLowerCase())

const CASES: Case[] = [
  // ── Preference wording must stay actionable ───────────────────────────────
  {
    name: `"I'd love to be close to Fort Sam." → anchor, explicit`,
    message: "I'd love to be close to Fort Sam.",
    check: (f) =>
      !has(destName(f), "fort sam") ? `destination was ${JSON.stringify(destName(f))}`
      : !destIsExplicit(f) ? `confidence was ${f.destination?.confidence} — soft wording must not downgrade`
      : "",
  },
  {
    name: `"Ideally I'd like to be near Potranco Road." → road anchor, explicit`,
    message: "Ideally I'd like to be near Potranco Road.",
    check: (f) =>
      !has(destName(f), "potranco") ? `destination was ${JSON.stringify(destName(f))}`
      : !destIsExplicit(f) ? `confidence was ${f.destination?.confidence}`
      : explicitAreas(f).length > 0 ? `a road became an AREA: ${JSON.stringify(areaNames(f))}`
      : "",
  },
  {
    name: `"If possible I'd like to stay around Helotes." → Desired Area, explicit`,
    message: "If possible I'd like to stay around Helotes.",
    check: (f) =>
      !explicitAreas(f).some((a) => has(a.name, "helotes")) ? `areas were ${JSON.stringify(areaNames(f))}`
      : f.destination ? `a neighborhood became an ANCHOR: ${JSON.stringify(destName(f))}`
      : "",
  },

  // ── NEIGHBOURHOOD + proximity language is still an AREA ───────────────────
  // The real production failure: "I'd like to stay near west over hills papi, with
  // you 😍" was classified as a DESTINATION because of the word "near". A
  // neighbourhood is a region with no point to measure to, so proximity wording
  // must not turn it into an anchor.
  {
    name: `"stay near Westover Hills" → AREA, not an anchor`,
    message: "I'd like to stay near Westover Hills.",
    check: (f) =>
      f.destination ? `became an anchor: ${JSON.stringify(destName(f))}`
      : !explicitAreas(f).some((a) => has(a.name, "westover")) ? `areas were ${JSON.stringify(areaNames(f))}`
      : "",
  },
  {
    name: `"live near Alamo Ranch" → AREA`,
    message: "I'd like to live near Alamo Ranch.",
    check: (f) =>
      f.destination ? `became an anchor: ${JSON.stringify(destName(f))}`
      : !explicitAreas(f).some((a) => has(a.name, "alamo ranch")) ? `areas were ${JSON.stringify(areaNames(f))}`
      : "",
  },
  {
    name: `"close to Stone Oak" → AREA`,
    message: "I'd prefer to live close to Stone Oak.",
    check: (f) =>
      f.destination ? `became an anchor: ${JSON.stringify(destName(f))}`
      : !explicitAreas(f).some((a) => has(a.name, "stone oak")) ? `areas were ${JSON.stringify(areaNames(f))}`
      : "",
  },
  // The mirror image: point-like places must STAY anchors under the same wording.
  {
    name: `"near Lackland AFB" → ANCHOR (same wording, different kind of place)`,
    message: "I need to be near Lackland AFB.",
    check: (f) =>
      explicitAreas(f).length > 0 ? `became an area: ${JSON.stringify(areaNames(f))}`
      : !has(destName(f), "lackland") ? `destination was ${JSON.stringify(destName(f))}`
      : "",
  },
  {
    name: `"close to Methodist Hospital" → ANCHOR`,
    message: "I'd like to be close to Methodist Hospital.",
    check: (f) =>
      explicitAreas(f).length > 0 ? `became an area: ${JSON.stringify(areaNames(f))}`
      : !has(destName(f), "methodist") ? `destination was ${JSON.stringify(destName(f))}`
      : "",
  },
  {
    name: `"I work at USAA and want to stay nearby" → ANCHOR`,
    message: "I work at USAA and want to stay nearby.",
    check: (f) =>
      explicitAreas(f).length > 0 ? `became an area: ${JSON.stringify(areaNames(f))}`
      : !has(destName(f), "usaa") ? `destination was ${JSON.stringify(destName(f))}`
      : "",
  },
  // Filler, emoji and split/lowercase spelling — the real message's own hazards.
  {
    name: `conversational filler + emoji do not affect classification`,
    message: "I'd like to stay near Westover Hills papi, with you 😍",
    check: (f) =>
      f.destination ? `filler flipped it to an anchor: ${JSON.stringify(destName(f))}`
      : !explicitAreas(f).some((a) => has(a.name, "westover")) ? `areas were ${JSON.stringify(areaNames(f))}`
      : "",
  },
  {
    name: `split/lowercase "west over hills" still normalizes AND stays an area`,
    message: "i'd like to stay near west over hills",
    check: (f) =>
      f.destination ? `became an anchor: ${JSON.stringify(destName(f))}`
      : !explicitAreas(f).some((a) => /westover/i.test(a.name)) ? `not normalized — areas were ${JSON.stringify(areaNames(f))}`
      : "",
  },
  // The two-area capacity must survive the change.
  {
    name: `"Westover Hills or Stone Oak" → still able to extract TWO areas`,
    message: "I'd prefer Westover Hills or Stone Oak.",
    check: (f) =>
      f.areas.length < 2 ? `only extracted ${f.areas.length}: ${JSON.stringify(areaNames(f))}`
      : f.destination ? `also produced an anchor: ${JSON.stringify(destName(f))}`
      : "",
  },

  // ── Roads, intersections, businesses are ONE anchor ───────────────────────
  {
    name: `"around Culebra and 1604" → ONE intersection anchor, never two areas`,
    message: "I'd like to be around Culebra and 1604.",
    check: (f) =>
      f.areas.length > 0 ? `intersection split into areas: ${JSON.stringify(areaNames(f))}`
      : !f.destination ? "no anchor extracted"
      : !(has(destName(f), "culebra") && has(destName(f), "1604")) ? `anchor lost half the intersection: ${JSON.stringify(destName(f))}`
      : "",
  },
  {
    name: `"near the Dave's Hot Chicken on Potranco" → business anchor`,
    message: "I'd like to stay near the Dave's Hot Chicken on Potranco.",
    check: (f) =>
      !has(destName(f), "dave") ? `destination was ${JSON.stringify(destName(f))}`
      : f.areas.length > 0 ? `business became an area: ${JSON.stringify(areaNames(f))}`
      : "",
  },
  {
    name: `"near I-10 and 1604" → one intersection anchor`,
    message: "I'd like to be near I-10 and 1604.",
    check: (f) =>
      f.areas.length > 0 ? `split into areas: ${JSON.stringify(areaNames(f))}`
      : !f.destination ? "no anchor extracted"
      : !(has(destName(f), "10") && has(destName(f), "1604")) ? `anchor incomplete: ${JSON.stringify(destName(f))}`
      : "",
  },

  // ── ZIP depends on USE, not on being a ZIP ───────────────────────────────
  {
    name: `"I want to live in 78245." → Desired Area`,
    message: "I want to live in 78245.",
    check: (f) =>
      !explicitAreas(f).some((a) => has(a.name, "78245")) ? `areas were ${JSON.stringify(areaNames(f))}`
      : f.destination ? `also produced an anchor: ${JSON.stringify(destName(f))}`
      : "",
  },
  {
    name: `"My job is in 78245… within 20 minutes." → anchor 78245 + max 20`,
    message: "My job is in 78245 and I'd like to stay within 20 minutes.",
    check: (f) =>
      !has(destName(f), "78245") ? `destination was ${JSON.stringify(destName(f))}`
      : f.maxDriveMinutes?.minutes !== 20 ? `max drive was ${JSON.stringify(f.maxDriveMinutes)}`
      : explicitAreas(f).length > 0 ? `also produced areas: ${JSON.stringify(areaNames(f))}`
      : "",
  },

  // ── Incidental mentions are not preferences ──────────────────────────────
  {
    name: `"My friend lives near Lackland, but I'd like to stay close to Fort Sam." → Fort Sam ONLY`,
    message: "My friend lives near Lackland, but I'd like to stay close to Fort Sam.",
    check: (f) =>
      has(destName(f), "lackland") ? `incidental location won: ${JSON.stringify(destName(f))}`
      : !has(destName(f), "fort sam") ? `destination was ${JSON.stringify(destName(f))}`
      : !destIsExplicit(f) ? `confidence was ${f.destination?.confidence}`
      : "",
  },
  {
    name: `"I've heard Westover Hills is nice." → no actionable preference`,
    message: "I've heard Westover Hills is nice.",
    check: (f) =>
      explicitAreas(f).length > 0 ? `hearsay became an explicit area: ${JSON.stringify(areaNames(f))}`
      : f.destination?.confidence === "explicit" ? `hearsay became an explicit anchor: ${destName(f)}`
      : "",
  },
  {
    name: `"I've heard Westover Hills is nice and I'd like to live there." → Desired Area`,
    message: "I've heard Westover Hills is nice and I'd like to live there.",
    check: (f) =>
      !explicitAreas(f).some((a) => has(a.name, "westover")) ? `areas were ${JSON.stringify(areaNames(f))}` : "",
  },

  // ── Multiple places: choose, never concatenate ───────────────────────────
  {
    name: `"may be working at Brooke… I'd love to be close to Fort Sam." → Fort Sam only`,
    message: "I may be working at Brooke, but I'll know later. I'd love to be close to Fort Sam.",
    check: (f) =>
      /[/&]|\band\b/.test(destName(f)) && has(destName(f), "brooke") ? `CONCATENATED: ${JSON.stringify(destName(f))}`
      : has(destName(f), "brooke") ? `tentative workplace won: ${JSON.stringify(destName(f))}`
      : !has(destName(f), "fort sam") ? `destination was ${JSON.stringify(destName(f))}`
      : !destIsExplicit(f) ? `confidence was ${f.destination?.confidence} — "I'd love to" must stay actionable`
      : "",
  },
  {
    name: `"Lackland or Fort Sam… not sure which to prioritize." → ambiguous, never combined`,
    message: "Lackland or Fort Sam could both work. I'm really not sure which one I want to prioritize.",
    check: (f) =>
      has(destName(f), "lackland") && has(destName(f), "fort sam") ? `CONCATENATED: ${JSON.stringify(destName(f))}`
      : destIsExplicit(f) ? `genuine indecision marked explicit: ${JSON.stringify(destName(f))}`
      : "",
  },

  // ── Approximate drive times keep their number ────────────────────────────
  {
    name: `"about 20 minutes from work" (context names the anchor) → 20`,
    message: "I'd like to stay about 20 minutes from work.",
    context: [agent("Where do you work?"), { fromMe: false, body: "I work at Lackland AFB." }],
    check: (f) => (f.maxDriveMinutes?.minutes !== 20 ? `max drive was ${JSON.stringify(f.maxDriveMinutes)}` : ""),
  },
  {
    name: `"20 or so minutes" answering our commute question → 20`,
    message: "20 or so minutes",
    context: [agent("About how far would you be comfortable driving from there?")],
    check: (f) =>
      f.maxDriveMinutes?.minutes !== 20 ? `max drive was ${JSON.stringify(f.maxDriveMinutes)}`
      : f.maxDriveMinutes?.confidence !== "explicit" ? `confidence was ${f.maxDriveMinutes?.confidence}`
      : "",
  },

  // ── Boundaries are not anchors ───────────────────────────────────────────
  {
    name: `"I'd like to stay inside 1604." → unsupported boundary, NOT a destination`,
    message: "I'd like to stay inside 1604.",
    check: (f) =>
      f.destination ? `boundary forced into destination: ${JSON.stringify(destName(f))}`
      : !f.unsupportedConstraint ? "boundary was discarded instead of flagged"
      : "",
  },
  {
    name: `"near Potranco and 1604" → intersection anchor, NOT a boundary`,
    message: "I'd like to stay near Potranco and 1604.",
    check: (f) =>
      f.unsupportedConstraint ? `intersection misread as a boundary: ${JSON.stringify(f.unsupportedConstraint)}`
      : !f.destination ? "no anchor extracted"
      : "",
  },
]

async function main() {
  console.log(`\nEXTRACTION SEMANTICS — ${CASES.length} live model calls\n`)
  const results = await Promise.all(
    CASES.map(async (c) => {
      try {
        const facts = await extractLocationFacts(c.message, c.context ?? [])
        return { c, problem: c.check(facts), facts }
      } catch (e) {
        return { c, problem: `threw: ${e instanceof Error ? e.message : "unknown"}`, facts: null }
      }
    }),
  )
  let pass = 0, fail = 0
  for (const { c, problem, facts } of results) {
    if (!problem) { pass++; console.log(`  ✓ ${c.name}`) }
    else {
      fail++
      console.log(`  ✗ ${c.name}\n      ${problem}`)
      if (facts) console.log(`      got: ${JSON.stringify({ areas: facts.areas, destination: facts.destination, maxDriveMinutes: facts.maxDriveMinutes, unsupportedConstraint: facts.unsupportedConstraint })}`)
    }
  }
  console.log(`\n${pass} passed, ${fail} failed\n`)
  process.exit(fail === 0 ? 0 : 1)
}
main()
