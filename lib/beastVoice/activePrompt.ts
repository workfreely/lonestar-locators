// Reading the EXISTING contact workflow's on-screen state.
//
// Beast Voice never tracks a workflow of its own. It looks at what the CRM has
// actually rendered and asks: which question is on screen, and which buttons
// exist to answer it? Every voice response then clicks one of those real
// buttons, so the existing handler stays the single source of truth.
//
// Nothing here writes, dispatches, or mutates anything: it is a read of the DOM
// plus a reference to buttons the locator could click by hand.
//
// The button LABELS are the contract. If the workflow ever renames one, phase
// detection returns null and Beast Voice goes quiet rather than guessing — a
// rename can make voice stop working, never make it do the wrong thing. The
// label test in scripts/tests/beastVoicePrompt.test.ts is what turns such a
// rename into a failing test instead of a silent regression.

/** Which existing action a rendered button performs. */
export type PromptAction = "call" | "text" | "yes" | "no" | "cancel" | "guest_card_send"

/** Which existing question is on screen. */
export type PromptPhase = "choose-method" | "confirm-call" | "confirm-text" | "guest-card"

/** The exact labels the existing modal renders, mapped to what they do. */
export const BUTTON_ACTIONS: Record<string, PromptAction> = {
  Call: "call",
  Text: "text",
  "Yes, Contacted": "yes",
  "No Answer": "no",
  "Yes, Sent": "yes",
  Cancel: "cancel",
  // Guest Card guard modal. "Yes, I Sent It" is the affirmative; "Send Guest Card"
  // opens the existing composer; "Cancel" aborts. All three are answerable by voice.
  "Yes, I Sent It": "yes",
  "Send Guest Card": "guest_card_send",
}

/** Responses that are valid for each phase — derived from what the phase renders. */
export const PHASE_ACTIONS: Record<PromptPhase, PromptAction[]> = {
  "choose-method": ["call", "text", "cancel"],
  "confirm-call": ["yes", "no", "cancel"],
  // The existing Text confirmation renders only "Yes, Sent" and "Cancel".
  // There is deliberately no "no" here: saying No must invent nothing.
  "confirm-text": ["yes", "cancel"],
  // Guest Card guard: confirm ("Yes, I Sent It"), open the composer ("Send Guest
  // Card"), or cancel — all answerable by voice.
  "guest-card": ["yes", "guest_card_send", "cancel"],
}

/**
 * Pure phase derivation from the rendered button labels. Each phase is
 * identified by a combination unique to it, so an unrelated "Cancel" elsewhere
 * on the page can never look like a contact prompt.
 */
export function derivePhase(labels: string[]): PromptPhase | null {
  const set = new Set(labels.map((l) => l.trim()))
  // Guest Card guard first — its "Yes, I Sent It" is unique, so it can never be
  // confused with the contact gate's "Yes, Sent" / "Yes, Contacted".
  if (set.has("Yes, I Sent It")) return "guest-card"
  if (set.has("Call") && set.has("Text")) return "choose-method"
  if (set.has("Yes, Contacted") && set.has("No Answer")) return "confirm-call"
  if (set.has("Yes, Sent")) return "confirm-text"
  return null
}

/** Is this response one the phase currently on screen can accept? */
export function isValidForPhase(phase: PromptPhase, action: PromptAction): boolean {
  return PHASE_ACTIONS[phase].includes(action)
}

export type ActivePrompt = {
  phase: PromptPhase
  /** The client the existing workflow named in its question ("Maria"). */
  clientName: string | null
  /** The real rendered buttons, keyed by what they do. */
  buttons: Partial<Record<PromptAction, HTMLButtonElement>>
}

function isRendered(el: HTMLElement): boolean {
  return el.offsetParent !== null || el.getClientRects().length > 0
}

/** Smallest element containing every one of the given nodes. */
function commonAncestor(nodes: HTMLElement[]): HTMLElement | null {
  if (nodes.length === 0) return null
  let current: HTMLElement | null = nodes[0]
  while (current) {
    const c = current
    if (nodes.every((n) => c.contains(n))) return c
    current = current.parentElement
  }
  return null
}

/**
 * Read the contact prompt currently on screen, or null when none is.
 *
 * Deliberately keyed on the buttons themselves rather than the modal's class
 * names: Tailwind arbitrary values like `z-[10000]` are styling that may change,
 * whereas the labels are the workflow's own vocabulary.
 */
export function readActivePrompt(root: ParentNode = document): ActivePrompt | null {
  const candidates = (Array.from(root.querySelectorAll("button")) as HTMLButtonElement[]).filter(
    (b) => BUTTON_ACTIONS[b.textContent?.trim() ?? ""] !== undefined && isRendered(b)
  )
  if (candidates.length === 0) return null

  const phase = derivePhase(candidates.map((b) => b.textContent ?? ""))
  if (!phase) return null

  // Scope to the container holding the buttons that identified the phase, so the
  // "Cancel" we pick is this prompt's own and not one from elsewhere on screen.
  const defining = candidates.filter((b) => {
    const action = BUTTON_ACTIONS[b.textContent?.trim() ?? ""]
    return action !== "cancel"
  })
  const container = commonAncestor(defining) ?? undefined

  const buttons: Partial<Record<PromptAction, HTMLButtonElement>> = {}
  for (const button of candidates) {
    if (container && !container.contains(button)) continue
    const action = BUTTON_ACTIONS[button.textContent?.trim() ?? ""]
    // First match wins, so a phase's own button is never replaced by a later one.
    if (action && !buttons[action]) buttons[action] = button
  }

  // The existing question names the client ("Were you able to contact Maria?").
  const heading = container?.closest("div")?.querySelector("h3")?.textContent ?? ""
  // Matches the contact-gate/guard headings' client name, including the shorter
  // "Did you text/call {name}?" phrasing. Longer alternatives first so "text to"
  // / "call or text" win over the bare "text" / "call".
  const named = heading.match(/(?:text to|call or text|contact|text|call)\s+(.+?)\?/i)

  return { phase, clientName: named ? named[1].trim() : null, buttons }
}
