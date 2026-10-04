import Anthropic from "@anthropic-ai/sdk"
import { locationFactsSchema, EMPTY_FACTS, type LocationFacts } from "./locationFacts"

/**
 * THE MODEL STEP — one client message, read in context, turned into stated facts.
 *
 * It extracts and nothing else. It never sees the lead's current criteria, never
 * decides whether anything should change, and never produces a database field.
 * reconcileLocation.ts owns every decision, so the blast radius of a bad
 * extraction is "a fact that reconciliation refuses to act on".
 *
 * ── CONTEXT WINDOW ──────────────────────────────────────────────────────────
 * Short answers are only interpretable against the question that prompted them:
 * "Alamo Ranch" means an area because WE asked which side of town, and "20
 * minutes" means a maximum because WE asked how far they would drive. So the
 * prompt carries a few preceding turns — enough to resolve a one-line reply, and
 * deliberately not the whole transcript, which would cost more and invite the
 * model to answer from old statements rather than this message.
 */

/** Turns before the target message. Four covers question→answer with room to spare. */
export const CONTEXT_TURNS = 4

export type ConversationTurn = { fromMe: boolean; body: string }

const SYSTEM_PROMPT = `You read a text message from someone looking for an apartment and extract the geographic information an apartment locator would use to decide which properties to show them. You only extract. Other code decides what to do with it.

THE QUESTION YOU ARE ANSWERING:
"Did the renter communicate a location that should influence which apartments we show them?"
If yes, capture it. If they are just mentioning a place, do not.

Extract only what the CLIENT said (never the agent):
1. areas — a broad neighborhood / side-of-town preference: where they want to LIVE.
2. destination — ONE specific geographic reference they want to be NEAR. Think of it as a geographic ANCHOR, not necessarily a workplace.
3. maxDriveMinutes — an acceptable travel time.
4. unsupportedConstraint — a geographic BOUNDARY we cannot yet represent (see below).

PREFERENCE LANGUAGE IS ACTIONABLE — THIS IS THE MOST IMPORTANT RULE.
Renters are polite and flexible. They rarely state requirements. All of these are actionable and "explicit":
  "I'd love to be near Fort Sam."      "I'd like to be near Fort Sam."
  "I'd prefer to be near Fort Sam."    "Ideally I'd like to be near Fort Sam."
  "If possible I'd like to be near Fort Sam."  "I want to be near Fort Sam."
Words like ideally, preferably, I'd like, I'd love, I'd prefer, I want, I need, if possible, around, about, roughly, or so do NOT by themselves make something ambiguous.

"explicit" means: the client clearly communicated this as something they want us to accommodate in their apartment search.
"explicit" does NOT mean they used forceful language.
"ambiguous" is for genuine uncertainty about what they want ("Maybe Alamo Ranch, I really don't know yet"), or competing options they have not chosen between.

A GEOGRAPHIC ANCHOR CAN BE ALMOST ANYTHING SPECIFIC:
a full or partial street address, a ZIP code, a road, cross streets / an intersection, a highway, a military base, an employer, an office, a school, a hospital, a restaurant or business, a landmark.
  "I'd like to be near Potranco Road."                → destination: Potranco Road
  "I'd like to be around Culebra and 1604."           → destination: "Culebra Rd & Loop 1604"  (ONE intersection, never two areas)
  "I'd like to be near the Dave's Hot Chicken on Potranco." → destination: that business
  "I need to stay close to Fort Sam."                 → destination: Fort Sam Houston
  "My job is at Methodist Hospital and I'd like to stay close." → destination: Methodist Hospital
  "I'd like to stay near 123 Main Street."            → destination: 123 Main Street
The client does NOT have to explain why the location matters.

AREA vs ANCHOR — DECIDE BY WHAT KIND OF PLACE THEY NAMED:

A NEIGHBOURHOOD, residential area, submarket or side of town is an AREA — even when
the client uses proximity words. "near", "close to", "around", "stay near", "live
near", "preferably near" do NOT make something an anchor:
  "I'd like to stay near Westover Hills."   → area Westover Hills   (NOT a destination)
  "I'd like to stay around Alamo Ranch."    → area Alamo Ranch
  "I'd prefer to live close to Stone Oak."  → area Stone Oak
  "I want to live in 78245."                → area 78245
A neighbourhood is a REGION. It has no single point to measure to, so it can never
be an anchor however the sentence is phrased.

A POINT-LIKE or destination-style place is an ANCHOR — an address, workplace or
employer, military base, school, hospital, business, landmark, road, or intersection:
  "I need to be near Lackland AFB."              → destination Lackland AFB
  "I'd like to be close to Methodist Hospital."  → destination Methodist Hospital
  "I work at USAA and want to stay nearby."      → destination USAA
  "I'd like to be near Potranco Road."           → destination Potranco Road

When the SAME name could be either, the client's use decides:
  "I like the Potranco area."                                  → area Potranco
  "My job is in 78245 and I'd like to stay within 20 minutes." → destination 78245 + maxDriveMinutes 20
Ask first "what kind of place is this?", and only if that is genuinely ambiguous,
"how is the client using it?"

ONE ANCHOR ONLY. NEVER CONCATENATE PLACES.
Returning "Brooke Army Medical Center / Fort Sam Houston" or "Lackland / Fort Sam" is always WRONG.
When a message names several places, decide which one the client is asking us to search around:
  "I may be working at Brooke, but I'll know later. I'd love to be close to Fort Sam."
      → destination: Fort Sam Houston, explicit.  Brooke is tentative background, not their stated preference.
  "My friend lives near Lackland, but I'd like to be near Fort Sam."
      → destination: Fort Sam Houston.  Lackland is incidental.
  "Lackland or Fort Sam could both work. I'm really not sure which to prioritize."
      → ONE of them with confidence "ambiguous" — genuinely undecided. Still never a combined string.

MENTIONING A PLACE IS NOT A PREFERENCE:
  "My friend lives near Lackland."     → nothing
  "I've heard Westover Hills is nice." → nothing
  "I've heard Westover Hills is nice and I'd like to live there." → area Westover Hills, explicit
  "My sister works at Lackland."       → nothing
  "My sister works at Lackland and I'd like to live near her." → destination Lackland

APPROXIMATE TIMES ARE STILL USEFUL — never discard the number:
  "within 20 minutes" / "about 20 minutes" / "around 20 minutes" / "roughly 20 minutes" / "20 or so minutes" → 20
  "I'd prefer not to drive more than about 25 minutes." → 25
  "no more than 20 or so minutes with traffic" → 20

BOUNDARIES ARE NOT ANCHORS. Put them in unsupportedConstraint and set destination null:
  "I'd like to stay inside 1604."  "I'd rather be outside 1604."  "north of 410."  "between 410 and 1604."
These describe a REGION, not a point. Turning "inside 1604" into a destination of "1604" states a different requirement than the client gave, so never do it.
But an intersection IS a point: "near Potranco and 1604" → destination, not a boundary.

AREA INTENT:
- replacement: explicitly supersedes a previous answer ("Actually forget Westover Hills, I'd rather be around Alamo Ranch")
- additive: offered in addition ("Alamo Ranch would also work")
- preference: a plain statement with no stated relation to a previous answer

USE THE CONTEXT. A short reply answers the agent's preceding question:
  Agent: "Are you trying to stay near a specific address or side of town?"  Client: "Alamo Ranch"  → area, explicit
  Agent: "Is there somewhere specific you're commuting to?"  Client: "Lackland"  → destination Lackland AFB, explicit
  Agent: "How far would you be comfortable driving from there?"  Client: "20 minutes"  → maxDriveMinutes 20, explicit

Extract nothing when the client said nothing about location. An empty result is correct and common.

Return ONLY JSON, no prose, no code fence:
{"areas":[{"name":string,"intent":"replacement"|"additive"|"preference","confidence":"explicit"|"ambiguous"}],"destination":{"name":string,"confidence":"explicit"|"ambiguous"}|null,"maxDriveMinutes":{"minutes":number,"confidence":"explicit"|"ambiguous"}|null,"unsupportedConstraint":string|null,"evidence":string}

"evidence" is the client's own words that justify the extraction — a short quote, not the whole message.`

/** The prompt body: a few prior turns, then the one message under consideration. */
export function buildPrompt(message: string, context: ConversationTurn[]): string {
  const window = context.slice(-CONTEXT_TURNS)
  const lines = window.map((t) => `${t.fromMe ? "Agent" : "Client"}: ${t.body.trim()}`)
  return [
    window.length > 0 ? `Recent conversation:\n${lines.join("\n")}\n` : "",
    `Message to extract from (CLIENT):\n${message.trim()}`,
  ]
    .filter(Boolean)
    .join("\n")
}

/**
 * Extract from ONE client message. Returns empty facts rather than throwing when
 * the model is unavailable or returns something unusable: a failed extraction
 * must never become a failed anything-else, and extracting nothing is already a
 * valid, common outcome.
 */
export async function extractLocationFacts(
  message: string,
  context: ConversationTurn[] = [],
): Promise<LocationFacts> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set in environment variables")

  const client = new Anthropic({ apiKey })
  const response = await client.messages.create({
    model: "claude-opus-4-8",
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildPrompt(message, context) }],
  })

  const textBlock = response.content.find((b) => b.type === "text")
  if (!textBlock || textBlock.type !== "text") return EMPTY_FACTS

  const raw = textBlock.text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim()
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    console.error("[extractLocationFacts] unparseable model response")
    return EMPTY_FACTS
  }

  // Schema validation, not trust. A malformed or inventive response degrades to
  // "nothing stated" instead of reaching reconciliation in an unknown shape.
  const result = locationFactsSchema.safeParse(parsed)
  if (!result.success) {
    console.error("[extractLocationFacts] response failed schema:", result.error.issues[0]?.message)
    return EMPTY_FACTS
  }
  return result.data
}
