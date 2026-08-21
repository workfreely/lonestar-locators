import type { ParsedCommand } from "./types"
import {
  CONTACT_PATTERNS,
  YES_PATTERNS,
  NO_PATTERNS,
  CANCEL_PATTERNS,
  RESPOND_CALL_PATTERNS,
  RESPOND_TEXT_PATTERNS,
  WAKE_WORD,
  TRAILING_FILLER,
  LEADING_CLIENT_NOUN,
} from "./phrases"

// The mechanism. All vocabulary lives in phrases.ts — this file only normalizes
// an utterance and asks the library what it means, so widening the grammar never
// touches parsing logic.
//
// Deterministic and offline. No model call: an LLM would add latency and
// nondeterminism to commands that reach CRM state, and could not be unit tested.
// Anything the library does not recognize returns `unknown`, and unknown executes
// nothing — Beast Voice never guesses at an unclear command.

/** Lowercase, drop the punctuation the recognizer inserts, collapse whitespace. */
function normalize(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[.,!?;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** Strip filler and stray articles from a captured client name. */
function cleanName(raw: string): string {
  let name = raw.trim()
  // Repeat: "contact Maria please thanks" sheds both.
  for (let i = 0; i < 3; i++) {
    const next = name.replace(TRAILING_FILLER, "").trim()
    if (next === name) break
    name = next
  }
  return name.replace(LEADING_CLIENT_NOUN, "").trim()
}

export function parseCommand(transcript: string): ParsedCommand {
  const normalized = normalize(transcript)
  if (!normalized) return { kind: "unknown" }

  // The wake word is noise in every position of the grammar, so it goes first.
  const text = normalized.replace(WAKE_WORD, "").trim()
  if (!text) return { kind: "unknown" }

  // Contextual responses are matched BEFORE commands: they are whole-utterance
  // patterns, so they cannot swallow a command, and checking them first keeps a
  // bare "no" from ever being read as the start of something longer.
  if (CANCEL_PATTERNS.some((re) => re.test(text))) return { kind: "cancel" }
  if (YES_PATTERNS.some((re) => re.test(text))) return { kind: "confirm_yes" }
  if (NO_PATTERNS.some((re) => re.test(text))) return { kind: "confirm_no" }
  // Bare method answers. Parsed unconditionally so the log records them, but the
  // caller executes them ONLY when a prompt is on screen that accepts one.
  if (RESPOND_CALL_PATTERNS.some((re) => re.test(text))) return { kind: "respond_call" }
  if (RESPOND_TEXT_PATTERNS.some((re) => re.test(text))) return { kind: "respond_text" }

  // Trailing courtesy is removed before command matching so patterns stay clean.
  const command = cleanName(text)

  for (const pattern of CONTACT_PATTERNS) {
    const match = command.match(pattern.re)
    if (!match) continue
    const clientName = cleanName(match[1] ?? "")
    if (!clientName) continue
    return { kind: "contact_client", clientName, method: pattern.method, phrase: pattern.id }
  }

  return { kind: "unknown" }
}
