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
  NAV_PATTERNS,
  BOARD_PATTERNS,
  MAP_PATTERNS,
  FOCUS_ON_PATTERNS,
  FOCUS_OFF_PATTERNS,
  AGENDA_PATTERNS,
  THEME_PATTERNS,
  ADD_LEAD_PATTERNS,
  SELECT_CLIENT_PATTERNS,
  ASK_BEAST_PATTERNS,
  UNLEASH_PATTERNS,
  MARKET_PATTERNS,
  COPY_PATTERNS,
  CRM_OPEN_PATTERNS,
  EDIT_CLIENT_PATTERNS,
  PROPERTY_PATTERNS,
  COMPLETION_PATTERNS,
  SEND_LIST_OPEN_PATTERNS,
  BUILD_LIST_OPEN_PATTERNS,
  SCHEDULE_TOUR_OPEN_PATTERNS,
  STAGE_MOVE_RE,
  CLOSE_RE,
  ARCHIVE_RE,
  RESTORE_TO_RE,
  RESTORE_BARE_RE,
  resolveStagePhrase,
  THIS_CLIENT_RE,
  STOP_PATTERNS,
  CHAIN_SPLIT,
  type ThemeName,
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

/** A captured client name, or null when it names the CURRENT client ("this
 *  client"/"this"/"it"). Empty → null. */
function nameOrCurrent(raw: string): string | null {
  const name = cleanName(raw)
  if (!name || THIS_CLIENT_RE.test(name)) return null
  return name
}

/** Openers that mean "bring up / go to" — stripped so bare targets (a route,
 *  a workspace) match without every pattern having to spell the verb out. */
const OPEN_PREFIX = /^(?:open|show|pull\s+up|go\s+to|take\s+me\s+to|view)\s+/

/**
 * Parse ONE already-normalized, wake-word-stripped segment. Returns the intent,
 * or `unknown`. Order is specific → general: every dedicated "open X" family is
 * tried before the catch-all client opener, so "open map" is a workspace switch
 * and never a client named "map".
 */
function parseSegment(text: string): ParsedCommand {
  if (!text) return { kind: "unknown" }

  // ── Contextual responses (whole-utterance) ──────────────────────────────────
  // Matched first so a bare "no"/"call" can never be read as the start of a
  // command. Stop is separated from Cancel (§37): Stop ends listening/the chain
  // and reverses nothing; Cancel answers an existing dismiss.
  if (STOP_PATTERNS.some((re) => re.test(text))) return { kind: "stop" }
  if (CANCEL_PATTERNS.some((re) => re.test(text))) return { kind: "cancel" }
  if (YES_PATTERNS.some((re) => re.test(text))) return { kind: "confirm_yes" }
  if (NO_PATTERNS.some((re) => re.test(text))) return { kind: "confirm_no" }
  if (RESPOND_CALL_PATTERNS.some((re) => re.test(text))) return { kind: "respond_call" }
  if (RESPOND_TEXT_PATTERNS.some((re) => re.test(text))) return { kind: "respond_text" }

  const command = cleanName(text)
  const bare = command.replace(OPEN_PREFIX, "").trim()

  // ── Theme (§18) ─────────────────────────────────────────────────────────────
  for (const re of THEME_PATTERNS) {
    const m = command.match(re)
    if (m) return { kind: "theme", theme: m[1] as ThemeName }
  }

  // ── Focus (§16) ─────────────────────────────────────────────────────────────
  if (FOCUS_OFF_PATTERNS.some((re) => re.test(command))) return { kind: "focus", on: false }
  if (FOCUS_ON_PATTERNS.some((re) => re.test(command))) return { kind: "focus", on: true }

  // ── Add Lead (§14) ──────────────────────────────────────────────────────────
  if (ADD_LEAD_PATTERNS.some((re) => re.test(command))) return { kind: "add_lead" }

  // ── Workspace (§13) — bare "map"/"board" or "open map"/"show board". ─────────
  if (BOARD_PATTERNS.some((re) => re.test(bare))) return { kind: "workspace", target: "board" }
  if (MAP_PATTERNS.some((re) => re.test(bare))) return { kind: "workspace", target: "map" }

  // ── Agenda (§15) ────────────────────────────────────────────────────────────
  for (const p of AGENDA_PATTERNS) {
    if (p.re.test(command)) return { kind: "agenda", op: p.op }
  }

  // ── Ask Beast (§36) ─────────────────────────────────────────────────────────
  if (ASK_BEAST_PATTERNS.some((re) => re.test(command))) return { kind: "ask_beast" }

  // ── Navigation (§17) — bare route name after an optional opener. ─────────────
  for (const p of NAV_PATTERNS) {
    if (p.re.test(bare)) return { kind: "navigate", target: p.id }
  }

  // ── Unleash the Beast (§1) ────────────────────────────────────────────────
  if (UNLEASH_PATTERNS.some((re) => re.test(command))) return { kind: "unleash" }

  // ── Market (explicit market verbs only; §1) ─────────────────────────────────
  for (const re of MARKET_PATTERNS) {
    const m = command.match(re)
    if (m) {
      const spoken = cleanName(m[1] ?? "")
      if (spoken) return { kind: "market", spoken }
    }
  }

  // ── CRM-owned OPEN flows (§7, §24–§32; completion words map here too, §5/§30) ─
  for (const p of CRM_OPEN_PATTERNS) {
    const m = command.match(p.re)
    if (!m) continue
    const clientName = p.nameGroup !== null ? cleanName(m[p.nameGroup] ?? "") : null
    return { kind: "crm_open", verb: p.verb, clientName: clientName || null }
  }

  // ── Edit client (§23) ───────────────────────────────────────────────────────
  for (const p of EDIT_CLIENT_PATTERNS) {
    const m = command.match(p.re)
    if (!m) continue
    const clientName = p.nameGroup !== null ? cleanName(m[p.nameGroup] ?? "") : null
    // "edit X" needs a name to look up; a bare "edit" with no target is not this.
    if (p.nameGroup !== null && !clientName) continue
    return { kind: "edit_client", clientName: clientName || null }
  }

  // ── Property actions on the current property (§20–§22) ───────────────────────
  for (const p of PROPERTY_PATTERNS) {
    if (p.re.test(command)) return { kind: "property_action", verb: p.verb }
  }

  // ── Copy (§8) ────────────────────────────────────────────────────────────────
  for (const p of COPY_PATTERNS) {
    const m = command.match(p.re)
    if (!m) continue
    const clientName = p.nameGroup !== null ? cleanName(m[p.nameGroup] ?? "") : null
    if (p.nameGroup !== null && !clientName) continue
    return { kind: "copy", field: p.field, target: p.target, clientName: clientName || null }
  }

  // ── Completion of companion-owned prompts (§2, §3, §33–§35) ──────────────────
  // Tried AFTER crm_open so "mark commission paid" opens the CRM flow rather than
  // being read as a completion. What remains here names a companion-owned prompt.
  for (const p of COMPLETION_PATTERNS) {
    if (p.re.test(command)) return { kind: "completion", target: p.target }
  }

  // Send List / Build List / Schedule Tour openers (§33–§35). These name
  // companion-owned flows whose interactive step lives in the Companion, so they
  // resolve to the same DEFERRED completion family — recognized, never executed
  // from the CRM, and surfaced with an explicit "complete it in Beast Companion"
  // message rather than a silent no-op or a false success.
  if (SEND_LIST_OPEN_PATTERNS.some((re) => re.test(command))) return { kind: "completion", target: "send_list" }
  if (BUILD_LIST_OPEN_PATTERNS.some((re) => re.test(command))) return { kind: "completion", target: "build_list" }
  if (SCHEDULE_TOUR_OPEN_PATTERNS.some((re) => re.test(command))) return { kind: "completion", target: "schedule_tour" }

  // ── Lifecycle: Restore (with destination), Archive, Close, Stage move ────────
  // Restore-with-destination is tried FIRST so "move X out of archive to Y" isn't
  // mis-split by the generic stage-move regex; it resolves to a normal move onto
  // the named stage (the shared handler runs its restore branch for an archived
  // lead).
  for (const re of RESTORE_TO_RE) {
    const m = command.match(re)
    if (!m) continue
    const stage = resolveStagePhrase(m[2] ?? "")
    if (!stage) continue
    return { kind: "move_stage", clientName: nameOrCurrent(m[1] ?? ""), stage }
  }

  // Close aliases → move_stage(closed); the executor reroutes to Confirm Lease.
  for (const re of CLOSE_RE) {
    const m = command.match(re)
    if (m) return { kind: "move_stage", clientName: nameOrCurrent(m[1] ?? ""), stage: "closed" }
  }

  // Archive → opens the reason dialog (executor); never archives from the phrase.
  for (const re of ARCHIVE_RE) {
    const m = command.match(re)
    if (m) return { kind: "archive_lead", clientName: nameOrCurrent(m[1] ?? "") }
  }

  // Generic stage move (both directions). "move X to archived" resolves to the
  // archive command; every other resolvable stage is a move.
  {
    const m = command.match(STAGE_MOVE_RE)
    if (m) {
      const stage = resolveStagePhrase(m[2] ?? "")
      if (stage === "archived") return { kind: "archive_lead", clientName: nameOrCurrent(m[1] ?? "") }
      if (stage) return { kind: "move_stage", clientName: nameOrCurrent(m[1] ?? ""), stage }
      // Unresolvable destination → not a stage move; fall through.
    }
  }

  // Bare Restore (no destination) → recognized, needs a stage (executor asks).
  for (const re of RESTORE_BARE_RE) {
    const m = command.match(re)
    if (m) return { kind: "restore_bare", clientName: nameOrCurrent(m[1] ?? "") }
  }

  // ── Contact (existing grammar, §6) ───────────────────────────────────────────
  for (const pattern of CONTACT_PATTERNS) {
    const match = command.match(pattern.re)
    if (!match) continue
    const clientName = cleanName(match[1] ?? "")
    if (!clientName) continue
    return { kind: "contact_client", clientName, method: pattern.method, phrase: pattern.id }
  }

  // ── Select / open a client (last-resort opener, §19) ─────────────────────────
  for (const re of SELECT_CLIENT_PATTERNS) {
    const m = command.match(re)
    if (!m) continue
    const clientName = cleanName(m[1] ?? "")
    if (clientName) return { kind: "select_client", clientName }
  }

  return { kind: "unknown" }
}

/** Strip the optional wake word, which is noise in every position of the grammar. */
function stripWake(text: string): string {
  return text.replace(WAKE_WORD, "").trim()
}

/**
 * Parse a single utterance segment (no chaining). Kept as the public entry point
 * the contextual-response path uses, where a prompt is already on screen and
 * exactly one answer is expected.
 */
export function parseCommand(transcript: string): ParsedCommand {
  return parseSegment(stripWake(normalize(transcript)))
}

/**
 * Split ONE utterance into its ordered command segments and parse each (§38–§39).
 * A single command is just a one-element chain. The wake word is stripped once,
 * from the whole utterance, before splitting.
 *
 * Segments are re-validated by the same grammar, so a client name that happens to
 * contain "and" degrades safely: the fragment simply fails to parse and the chain
 * aborts (§40.1) rather than executing a guess.
 */
export function parseChain(transcript: string): ParsedCommand[] {
  // Lower-case and collapse whitespace but KEEP commas — they are chain
  // delimiters and normalize() (used per-segment below) would strip them.
  const kept = transcript.toLowerCase().replace(/[.!?;:]/g, " ").replace(/\s+/g, " ").trim()
  const whole = kept.replace(WAKE_WORD, "").trim()
  if (!whole) return [{ kind: "unknown" }]
  const segments = whole.split(CHAIN_SPLIT).map((s) => s.trim()).filter(Boolean)
  if (segments.length <= 1) return [parseSegment(normalize(whole))]
  // Each segment is normalized (drops its own stray punctuation) then parsed.
  return segments.map((s) => parseSegment(normalize(s)))
}
