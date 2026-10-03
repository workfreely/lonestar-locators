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

const SYSTEM_PROMPT = `You extract LOCATION facts a residential-leasing client has stated in a text conversation. You do not make decisions and you do not write records — other code does that.

Extract ONLY these, and only when the CLIENT stated them (never the agent):
1. Desired areas — general geographic preferences: "Alamo Ranch", "Helotes", "northwest side".
2. Destination — a SPECIFIC anchor they must be near: workplace, military base, school, hospital, street address, or a landmark clearly used as an anchor.
3. Max drive minutes — an explicitly stated maximum driving time.

THE CRITICAL DISTINCTION:
- "I work at Lackland AFB" → destination (NOT an area)
- "I want to live around Alamo Ranch" → area (NOT a destination)
- "I work at Methodist Hospital and want to stay within 20 minutes" → destination + maxDriveMinutes

CONFIDENCE — "explicit" or "ambiguous". Never a number.
- explicit: the client stated it as their own requirement or preference.
  "I work at Lackland." / "No specific address, just Alamo Ranch." / "Within 20 minutes."
- ambiguous: hedged, hypothetical, hearsay, or about someone else.
  "Maybe Alamo Ranch." / "I've heard Westover Hills is nice." / "My friend lives near Lackland." / "I don't know yet."

AREA INTENT:
- replacement: explicitly corrects or supersedes a previous answer ("Actually I'd rather stay around Helotes")
- additive: offered in addition ("Alamo Ranch would also work")
- preference: a plain statement with no stated relation to a previous answer

USE THE CONTEXT. A short client reply answers the agent's preceding question:
  Agent: "Are you trying to stay near a specific address or side of town?"  Client: "Alamo Ranch"  → area, explicit, preference
  Agent: "About how far would you be comfortable driving from there?"  Client: "20 minutes"  → maxDriveMinutes 20, explicit

Extract nothing when the client stated nothing about location. An empty result is the correct and common answer.

Return ONLY JSON, no prose, no code fence:
{"areas":[{"name":string,"intent":"replacement"|"additive"|"preference","confidence":"explicit"|"ambiguous"}],"destination":{"name":string,"confidence":"explicit"|"ambiguous"}|null,"maxDriveMinutes":{"minutes":number,"confidence":"explicit"|"ambiguous"}|null,"evidence":string}

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
