"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { createSpeechProvider } from "@/lib/beastVoice/provider"
import { parseCommand, parseChain } from "@/lib/beastVoice/parseCommand"
import { resolveClient } from "@/lib/beastVoice/resolveClient"
import { resolveIntent } from "@/lib/beastVoice/resolveIntent"
import { logVoiceCommand } from "@/lib/beastVoice/log"
import {
  readActivePrompt,
  isValidForPhase,
  type ActivePrompt,
  type PromptAction,
} from "@/lib/beastVoice/activePrompt"
import { dialUrl, launchExternalProtocol } from "@/lib/leads/launchCommunication"
import { COMPANION_MSG_SOURCE } from "@/lib/companion/leadToDto"
import { useOptionalTheme } from "@/components/theme/ThemeProvider"
import { isCrmTheme } from "@/lib/theme"
import VoiceGlow from "./VoiceGlow"
import type {
  ContactMethod,
  SpeechError,
  SpeechErrorCode,
  SpeechProvider,
  VoiceLogEntry,
  VoiceAction,
  ParsedCommand,
} from "@/lib/beastVoice/types"
import type { AgendaOp, CrmOpenVerb, PropertyVerb } from "@/lib/beastVoice/phrases"

// Beast Voice V1 — the mic that lives inside the existing Kanban search field.
//
// Beast Voice is an INPUT LAYER. It captures speech, parses it deterministically,
// resolves the client/property/market it names, and then invokes the EXACT
// existing product behavior the locator would trigger by hand — the same prop,
// setter, route, or workflow-verb. It never changes workflow, stage, follow-up,
// confirmation-ownership, or business logic; the existing product stays the
// source of truth. Everything it can do maps 1:1 onto an existing control:
//
//   • Contact (New)      → onInitiateContact (the drag's Contact Gate)
//   • Contact (non-New)  → launchExternalProtocol(dialUrl(...)) — comms only
//   • Navigate / theme / focus / agenda / workspace / add-lead / select-client
//                        → the existing router / ThemeProvider / setters / handler
//   • CRM-owned flows    → the existing open-* workflow-verb (opens the modal only)
//   • Property verbs     → the existing add/move/remove workflow-verb (direct write,
//                          identical to the property card's own click)
//   • Copy               → navigator.clipboard on an allow-listed, already-shown value
//   • Market / Unleash   → the Property Explorer's existing setMarketOverride / run
//   • Completion         → answers an on-screen CRM prompt if one is readable;
//                          companion-owned completions are NEVER blind-posted (§2/§4)
//
// The contact gate keeps its confirmation-first behavior (the chooser IS the
// confirmation). Chains ("Open Maria, check application") run segment-by-segment
// and stop the moment a confirmation or a CRM-owned modal takes over (§40).

type Phase =
  | { name: "idle" }
  | { name: "listening" }
  | { name: "working" }
  // The ambiguity resolver carries the ACTION to apply to the chosen lead, so
  // "Open Maria" (two Marias) and "Text Maria" both disambiguate through one UI.
  | { name: "ask-which"; leads: any[]; spoken: string; action: VoiceAction }
  | { name: "notice"; tone: "error" | "info"; message: string }

// Only leads still in New have a first contact to make; every other stage means
// contact already happened. Rather than invent a behavior for those, Beast Voice
// says so and does nothing.
const ELIGIBLE_STAGE = "new"

// ── Active-flow safeguards ──────────────────────────────────────────────────
// Beast Voice must never sit open on a hot microphone. Listening is re-armed
// ONLY while a valid existing prompt is on screen, and even then these caps end
// the flow on their own.
/** Hardest stop: a voice flow can never outlive this, whatever else happens. */
const FLOW_MAX_MS = 60_000
/** Give up after this many consecutive sessions that heard nothing. */
const MAX_SILENT_SESSIONS = 3
/** Backoff before re-arming, growing with consecutive silence. */
const REARM_DELAY_MS = 350
/** How long to wait for the workflow to render its first question before giving up. */
const PROMPT_WAIT_MS = 6_000

/** Which existing rendered button a spoken response asks for. */
const RESPONSE_ACTIONS: Record<string, PromptAction> = {
  respond_call: "call",
  respond_text: "text",
  confirm_yes: "yes",
  confirm_no: "no",
  cancel: "cancel",
}

/** Clicking these launches tel:/sms: to the OS. */
const HANDOFF_ACTIONS: PromptAction[] = ["call", "text"]

function displayName(lead: any): string {
  return `${lead?.first_name ?? ""} ${lead?.last_name ?? ""}`.trim() || "this client"
}

function stageLabel(raw: unknown): string {
  const s = String(raw ?? "").replace(/_/g, " ").trim()
  return s ? s.replace(/\b\w/g, (c) => c.toUpperCase()) : "another stage"
}

/** Short operational confirmation for an opened CRM-owned flow (§45). */
function openVerbLabel(verb: CrmOpenVerb): string {
  const map: Record<CrmOpenVerb, string> = {
    "open-check-application": "Opened Check Application.",
    "open-apply": "Opened Application.",
    "open-confirm-lease": "Opened Confirm Lease.",
    "open-guest-card": "Opened Guest Card.",
    "open-invoice-details": "Opened Invoice Details.",
    "open-send-invoice": "Opened Send Invoice.",
    "open-commission-paid": "Opened Commission Paid.",
    "open-send-rebate": "Opened Send Rebate.",
    "open-tour-follow-up": "Opened Tour Follow-Up.",
  }
  return map[verb]
}

/** Short operational confirmation for a property direct-write verb (§45). */
function propertyVerbLabel(verb: PropertyVerb): string {
  const map: Record<PropertyVerb, string> = {
    "add-recommendation": "Added to recommendations.",
    "add-favorite": "Added to favorites.",
    "move-to-favorite": "Moved to favorites.",
    "move-to-recommendation": "Moved to recommendations.",
    "remove-recommendation": "Removed from recommendations.",
  }
  return map[verb]
}

// Provider-neutral copy: these codes are the shared SpeechError vocabulary, so
// swapping the backend needs no new branches here.
function speechErrorMessage(code: SpeechErrorCode): string {
  switch (code) {
    case "permission-denied":
      return "Microphone blocked. Allow mic access for this site, then try again."
    case "no-input":
      return "Didn't catch that. Try again."
    case "capture-failed":
      return "No microphone found."
    case "network":
      return "Speech service unreachable. Check your connection."
    case "service-error":
      return "Speech service error. Try again."
    case "unavailable":
      return "Beast Voice isn't available in this browser."
    case "cancelled":
      return "Cancelled."
    default:
      return "Something went wrong. Try again."
  }
}

export default function BeastVoiceMic({
  leads,
  onInitiateContact,
  onListeningChange,
  createProvider,
  onSelectClient,
  onWorkspace,
  onFocus,
  onAgenda,
  onAddLead,
  getSelectedLead,
  getCurrentProperty,
}: {
  /** The leads already loaded in the board — resolution never queries. */
  leads: any[]
  /** The existing Contact Gate entry point (identical to the drag's). */
  onInitiateContact?: (lead: any) => void
  /** Lets the search field swap its placeholder while a session runs. */
  onListeningChange?: (state: "idle" | "listening" | "working") => void
  /** Override the speech backend (tests, future per-workspace selection). */
  createProvider?: () => SpeechProvider
  // ── V1 input-layer wiring — each is the EXISTING handler/setter, threaded. ──
  /** Select/open a lead — the SAME selection the board card click performs (§19). */
  onSelectClient?: (lead: any) => void
  /** Switch workspace — the existing selectWorkspace("board"|"map") (§13). */
  onWorkspace?: (target: "board" | "map") => void
  /** Focus mode — the existing setFocus(on) (§16). */
  onFocus?: (on: boolean) => void
  /** Agenda open/close/expand/collapse/side — the existing Agenda setters (§15). */
  onAgenda?: (op: AgendaOp) => void
  /** Open the existing Add Lead modal — setShowLeadModal(true) (§14). */
  onAddLead?: () => void
  /** The currently selected/shown lead, for commands that target "this client". */
  getSelectedLead?: () => any | null
  /** The current property in the Map workspace (never fabricated), for "this
   *  property" recommend/favorite/remove and address copy (§20–§22, §8). */
  getCurrentProperty?: () =>
    | { propertyUrl?: string; placeId?: string | null; propertyAddress?: string | null; propertyName?: string | null }
    | null
}) {
  const router = useRouter()
  const theme = useOptionalTheme()
  // Injected so a test (or a future per-workspace choice) can supply another
  // backend; the default comes from the factory, never from a concrete provider.
  const provider = useMemo(() => (createProvider ?? createSpeechProvider)(), [createProvider])
  const [supported, setSupported] = useState(false)
  const [phase, setPhase] = useState<Phase>({ name: "idle" })
  // Whether THIS session already decided what the UI should show. It must be a
  // ref, not derived from `phase`: the recognizer fires onresult and onend in the
  // same tick, so React has not re-rendered yet and reading `phase` in onEnd
  // would still say "listening" — resetting to idle and erasing the ask/notice
  // the result just produced.
  const sessionHandledRef = useRef(false)
  // Capture duration from the last result — the billable unit for per-minute STT
  // vendors, recorded now so a paid provider's cost is computable retroactively.
  const captureMsRef = useRef<number | null>(null)
  // ── Active voice flow ─────────────────────────────────────────────────────
  // A voice-initiated contact flow is "live" from hand-off until the existing
  // workflow closes or a safeguard trips. While live, Beast Voice re-arms itself
  // between the workflow's own questions so the locator neither clicks the mic
  // again nor repeats the client name — the existing prompt supplies the context.
  const flowLiveRef = useRef(false)
  const flowStartedAtRef = useRef(0)
  const silentSessionsRef = useRef(0)
  const promptRef = useRef<ActivePrompt | null>(null)
  // Whether this flow has yet seen the workflow render a prompt. Between the
  // hand-off and the modal appearing, the board is hidden and the lead panel
  // mounts — mutations that would otherwise look like "the workflow closed" and
  // end the flow before it ever started.
  const promptSeenRef = useRef(false)
  // A method named in the OPENING command ("text Maria"). The existing workflow
  // always opens on its chooser, so the method is applied by clicking that
  // chooser's own Call/Text button once it renders — the same button the locator
  // would press, and the same path a spoken "Text" takes a moment later.
  const pendingMethodRef = useRef<ContactMethod>("unspecified")
  const rearmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // The observer and its timers are bound once, so they would otherwise capture
  // the FIRST render's startListening — the one whose `supported` is still false
  // because availability is resolved in a post-mount effect. Re-arming through a
  // ref that every render refreshes keeps that whole class of stale-closure bug
  // out of the flow.
  const startListeningRef = useRef<() => void>(() => {})
  const respondToPromptRef = useRef<(p: ActivePrompt, intent: string, t: string) => boolean>(() => false)
  const [listening, setListening] = useState(false)
  // Mirrors phase.name for callbacks that run outside React's render cycle.
  const phaseRefName = useRef<Phase["name"]>("idle")
  // Read at callback time so a session started before a board refresh still
  // resolves against the current leads.
  const leadsRef = useRef(leads)
  leadsRef.current = leads

  // Availability is a browser capability check, so it can only run after mount —
  // rendering it on the server would mismatch.
  useEffect(() => setSupported(provider.isAvailable()), [provider])

  useEffect(() => {
    const s = phase.name
    onListeningChange?.(s === "listening" || s === "working" ? s : "idle")
    // The glow follows the ONE listening state, so it stays correct even while
    // the search-bar mic itself is unrendered by the contact workflow.
    setListening(s === "listening")
    phaseRefName.current = s
  }, [phase.name, onListeningChange])

  // Stop the recognizer if the board unmounts mid-utterance.
  useEffect(() => () => provider.cancel(), [provider])

  // Watch the EXISTING workflow's rendered UI. Beast Voice keeps no workflow
  // state of its own — this only reads which question is currently on screen,
  // so a phase change (chooser → confirmation) or the modal closing is observed
  // rather than predicted. Debounced because a board re-render produces many
  // mutations and reading the prompt walks the button list.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null

    const read = () => {
      timer = null
      const previous = promptRef.current
      const next = readActivePrompt()
      promptRef.current = next

      if (!flowLiveRef.current) return

      if (!next) {
        // Only a prompt that HAS appeared can have closed. Before the first one
        // renders we are still waiting, not finished.
        if (promptSeenRef.current) endFlow()
        return
      }

      promptSeenRef.current = true

      // The opening command already named a method — press that button rather
      // than asking a question the locator has answered.
      if (next.phase === "choose-method" && pendingMethodRef.current !== "unspecified") {
        const wanted = pendingMethodRef.current
        pendingMethodRef.current = "unspecified"
        if (respondToPromptRef.current(next, wanted === "call" ? "respond_call" : "respond_text", "")) return
      }

      // A new question is on screen: listen for the answers IT accepts.
      if (!previous || previous.phase !== next.phase) {
        silentSessionsRef.current = 0
        scheduleRearm()
      }
    }

    const observer = new MutationObserver(() => {
      if (timer) return
      timer = setTimeout(read, 60)
    })
    observer.observe(document.body, { childList: true, subtree: true })
    read()

    return () => {
      observer.disconnect()
      if (timer) clearTimeout(timer)
      if (rearmTimerRef.current) clearTimeout(rearmTimerRef.current)
    }
    // Bound once: every dependency it needs is read through a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-dismiss transient messages so the field returns to plain search.
  useEffect(() => {
    if (phase.name !== "notice") return
    const t = setTimeout(() => setPhase({ name: "idle" }), 4200)
    return () => clearTimeout(t)
  }, [phase])

  // Escape cancels whatever Beast Voice is doing (never the CRM behind it).
  useEffect(() => {
    if (phase.name === "idle") return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      sessionHandledRef.current = true
      // Escape ends the whole voice flow, not just this utterance.
      endFlow()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [phase.name, provider])

  function log(entry: Partial<VoiceLogEntry> & Pick<VoiceLogEntry, "transcript" | "outcome">) {
    logVoiceCommand({
      provider: provider.id,
      providerModel: provider.model,
      audioDurationMs: captureMsRef.current,
      parsedIntent: "unknown",
      requestedMethod: null,
      phraseId: null,
      workflowPhase: null,
      handoffAttempted: false,
      activationLive: null,
      matchedLeadId: null,
      matchedCount: 0,
      requestedAction: null,
      handedOff: false,
      errorReason: null,
      ...entry,
    })
  }

  /**
   * Hand a resolved lead to the CRM's EXISTING first-contact workflow.
   *
   * `onInitiateContact` is the identical prop the New→Contacted drag calls, so
   * everything past this point — the Call/Text chooser, the tel:/sms: launch,
   * "Were you able to contact…?", recordFirstContact — is the workflow exactly
   * as it already exists. Beast Voice adds nothing to it.
   *
   * A spoken method ("call Maria") is recorded but NOT yet applied: reaching the
   * workflow's Call/Text branch directly would require changing DashboardClient,
   * which is out of scope by rule. Until that is approved a stated method lands
   * on the existing chooser — strictly less than asked, never something else —
   * and the gap is logged so the cost of leaving it unwired is measurable.
   */
  function handOff(lead: any, transcript: string, method: ContactMethod, phrase: string) {
    const base = {
      transcript,
      parsedIntent: "contact_client" as const,
      requestedMethod: method,
      phraseId: phrase,
      matchedLeadId: lead.id,
      matchedCount: 1,
    }

    if (String(lead.crm_status ?? "") !== ELIGIBLE_STAGE) {
      log({ ...base, outcome: "not-eligible", errorReason: `stage:${lead.crm_status}` })
      setPhase({
        name: "notice",
        tone: "info",
        message: `${displayName(lead)} is already in ${stageLabel(lead.crm_status)}.`,
      })
      return
    }

    log({ ...base, requestedAction: "initiate-contact", handedOff: true, outcome: "handed-off" })

    // From here the flow is live: the existing workflow is about to ask its own
    // questions, and Beast Voice re-arms between them so the locator neither
    // clicks the mic again nor repeats the client name.
    flowLiveRef.current = true
    promptSeenRef.current = false
    pendingMethodRef.current = method
    flowStartedAtRef.current = Date.now()
    silentSessionsRef.current = 0
    // Backstop: if the workflow never renders a prompt (an unexpected path, or
    // the hand-off did nothing), the flow must not stay armed waiting forever.
    setTimeout(() => {
      if (flowLiveRef.current && !promptSeenRef.current) endFlow()
    }, PROMPT_WAIT_MS)

    setPhase({ name: "idle" })
    // Everything past this line is the CRM's existing workflow, untouched.
    onInitiateContact?.(lead)
  }

  /** End the voice flow and release the microphone. Idempotent. */
  function endFlow() {
    flowLiveRef.current = false
    promptSeenRef.current = false
    pendingMethodRef.current = "unspecified"
    silentSessionsRef.current = 0
    if (rearmTimerRef.current) {
      clearTimeout(rearmTimerRef.current)
      rearmTimerRef.current = null
    }
    provider.cancel()
    setPhase({ name: "idle" })
  }

  /**
   * Re-arm for the next question of a live flow. Every safeguard is checked
   * here, so there is exactly one path back to a hot microphone and it is
   * impossible to reach without a valid prompt still on screen.
   */
  function scheduleRearm(delayFactor = 1) {
    if (!flowLiveRef.current) return
    if (rearmTimerRef.current) clearTimeout(rearmTimerRef.current)

    if (Date.now() - flowStartedAtRef.current > FLOW_MAX_MS) return endFlow()
    if (silentSessionsRef.current >= MAX_SILENT_SESSIONS) return endFlow()

    rearmTimerRef.current = setTimeout(() => {
      rearmTimerRef.current = null
      // Re-checked at fire time: the workflow may have closed while we waited.
      if (!flowLiveRef.current || !promptRef.current) return
      if (phaseRefName.current !== "idle") return
      startListeningRef.current()
    }, REARM_DELAY_MS * delayFactor)
  }

  /**
   * Answer the question the EXISTING workflow is asking, by clicking the button
   * it already rendered. Beast Voice performs no CRM work of its own here — the
   * button's own onClick is the action, exactly as if the locator had clicked.
   */
  function respondToPrompt(prompt: ActivePrompt, intent: string, transcript: string): boolean {
    const action = RESPONSE_ACTIONS[intent]
    const base = {
      // Empty when the method came from the opening command rather than a
      // separate utterance, so the log distinguishes the two.
      transcript,
      parsedIntent: intent as VoiceLogEntry["parsedIntent"],
      workflowPhase: prompt.phase,
    }

    // Fail closed. A response the on-screen phase has no button for does
    // nothing — this is what stops "No" from inventing an outcome on the Text
    // confirmation, which renders only "Yes, Sent" and "Cancel".
    if (!action || !isValidForPhase(prompt.phase, action)) {
      log({ ...base, outcome: "not-valid-for-phase", errorReason: `no ${action ?? intent} in ${prompt.phase}` })
      return false
    }

    const button = prompt.buttons[action]
    if (!button) {
      log({ ...base, outcome: "not-valid-for-phase", errorReason: `button missing: ${action}` })
      return false
    }

    // Call/Text hand off to the OS. Recording activation state (rather than
    // gating on it) is what will show in the alpha data whether a delayed
    // handoff ever fails; the OS's own confirmation is expected, not a failure.
    const handoff = HANDOFF_ACTIONS.includes(action)
    const activationLive =
      typeof navigator !== "undefined" && "userActivation" in navigator
        ? navigator.userActivation.isActive
        : null

    log({
      ...base,
      requestedAction: "initiate-contact",
      handedOff: true,
      handoffAttempted: handoff,
      activationLive,
      outcome: "responded",
    })

    // Cancel ends the voice flow; every other answer advances the existing
    // workflow, and the observer re-arms for whatever it asks next.
    if (action === "cancel") endFlow()

    button.click()
    return true
  }

  // ── Reusing the existing centralized workflow-verb dispatcher ───────────────
  // The CRM's DashboardClient listens on `window` for exactly this envelope
  // (source + type "workflow-verb") and routes it to the same canonical handler
  // the Companion's open-* delegation and the property cards already use. Posting
  // it here is byte-identical to those existing callers — no new handler, no
  // workflow change. Voice only ever posts verbs whose manual path has NO
  // companion-owned interactive prompt in between (CRM-owned open-* modals, and
  // the direct-write property verbs the property card posts on click).
  function postWorkflowVerb(leadId: string | number, verb: string, extra?: Record<string, unknown>) {
    try {
      window.postMessage(
        { source: COMPANION_MSG_SOURCE, type: "workflow-verb", payload: { leadId, verb, ...(extra ?? {}) } },
        window.location.origin
      )
    } catch {
      /* best-effort — a failed post never mutates anything */
    }
  }

  // Same-page adapter channel for the Property Explorer (§1). The explorer adds a
  // listener ONLY while mounted (Map workspace); when the board is showing, these
  // events have no listener and safely do nothing — which is exactly why firing a
  // market attempt on an unresolved "select X" is safe.
  function dispatchExplorer(detail: Record<string, unknown>) {
    try {
      window.dispatchEvent(new CustomEvent("lb-voice-explorer", { detail }))
    } catch {
      /* best-effort */
    }
  }

  function copyValue(value: string): boolean {
    try {
      // The SAME browser clipboard write the CRM already uses (e.g. the Copy phone
      // control). No new permission. The value is never logged (§8).
      void navigator.clipboard?.writeText(value)
      return true
    } catch {
      return false
    }
  }

  /** Result of executing one action; drives chain continuation + the notice. */
  type ExecResult = {
    outcome: VoiceLogEntry["outcome"]
    feedback?: { tone: "error" | "info"; message: string }
    /** The action already claimed the UI (e.g. handed off to the contact gate). */
    handledPhase?: boolean
    /** Disambiguation is needed; the chain stops and the picker is shown. */
    ask?: { leads: any[]; spoken: string; action: VoiceAction }
    /** A CRM-owned modal / confirmation / navigation took over — end the chain (§40.5, §41). */
    endsChain?: boolean
    /** Updated in-chain client context after a select/contact resolved a lead. */
    nextLead?: any
  }

  /** Resolve the lead a command targets: a spoken name, else the in-chain/selected client. */
  function resolveTarget(clientName: string | null, ctxLead: any): { lead?: any; ask?: any[]; none?: boolean } {
    if (!clientName) {
      const lead = ctxLead ?? getSelectedLead?.() ?? null
      return lead ? { lead } : { none: true }
    }
    const match = resolveClient(clientName, leadsRef.current)
    if (match.kind === "one") return { lead: match.lead }
    if (match.kind === "many") return { ask: match.leads }
    return { none: true }
  }

  /**
   * Perform ONE resolved action by invoking the exact existing behavior. Pure
   * dispatcher: it never encodes workflow rules, only which existing entry point
   * a given action maps onto. `ctxLead` is the current in-chain client context.
   */
  function executeAction(action: VoiceAction, ctxLead: any, transcript: string, forced?: any): ExecResult {
    switch (action.kind) {
      case "navigate":
        router.push(action.route)
        return { outcome: "executed", feedback: { tone: "info", message: `Opened ${action.label}.` }, endsChain: true }

      case "workspace":
        onWorkspace?.(action.target)
        return { outcome: "executed", feedback: { tone: "info", message: action.target === "map" ? "Map opened." : "Lead Board opened." } }

      case "focus":
        onFocus?.(action.on)
        return { outcome: "executed", feedback: { tone: "info", message: action.on ? "Focus on." : "Focus off." } }

      case "agenda":
        onAgenda?.(action.op)
        return { outcome: "executed", feedback: { tone: "info", message: `Agenda ${action.op}.` } }

      case "theme": {
        // Validate the canonical id again at the boundary; use the EXISTING
        // ThemeProvider setter, which owns persistence/broadcast (§18).
        if (!theme || !isCrmTheme(action.theme)) return { outcome: "no-context" }
        theme.setPreference(action.theme)
        return { outcome: "executed", feedback: { tone: "info", message: `Theme ${action.theme}.` } }
      }

      case "add_lead":
        onAddLead?.()
        return { outcome: "executed", feedback: { tone: "info", message: "Add Lead opened." }, endsChain: true }

      case "ask_beast":
        try { window.dispatchEvent(new Event("lb:open-beast-ai")) } catch { /* best-effort */ }
        return { outcome: "executed", feedback: { tone: "info", message: "Ask Beast opened." }, endsChain: true }

      case "unleash":
        dispatchExplorer({ action: "unleash" })
        return { outcome: "executed", feedback: { tone: "info", message: "Unleashed the Beast." } }

      case "market":
        dispatchExplorer({ action: "select-market", spoken: action.spoken })
        // The explorer validates against service areas; we don't learn the result
        // synchronously. Feedback stays neutral (§45) and truthful.
        return { outcome: "executed", feedback: { tone: "info", message: `Selecting ${action.spoken}…` } }

      case "select_client": {
        const t = forced ? { lead: forced } : resolveTarget(action.clientName, null)
        if (t.ask) return { outcome: "ambiguous", ask: { leads: t.ask, spoken: action.clientName, action } }
        if (t.lead) {
          onSelectClient?.(t.lead)
          return { outcome: "executed", feedback: { tone: "info", message: `Opened ${displayName(t.lead)}.` }, nextLead: t.lead }
        }
        // No client matched. In the Map workspace this is very likely a market
        // ("Open map, select Dallas"): fire a market attempt, which the explorer
        // ignores unless it is mounted AND the name is an in-area market (§1, §44).
        dispatchExplorer({ action: "select-market", spoken: action.clientName })
        return { outcome: "no-context" }
      }

      case "contact": {
        const t = forced ? { lead: forced } : resolveTarget(action.clientName, null)
        if (t.ask) return { outcome: "ambiguous", ask: { leads: t.ask, spoken: action.clientName, action } }
        if (t.none || !t.lead) {
          return { outcome: "not-found", feedback: { tone: "error", message: `No client matching "${action.clientName}".` } }
        }
        const lead = t.lead
        if (String(lead.crm_status ?? "") === ELIGIBLE_STAGE) {
          // NEW lead → the existing Contact Gate (confirmation-first), unchanged.
          handOff(lead, transcript, action.method, "voice-contact")
          return { outcome: "handed-off", handledPhase: true, endsChain: true, nextLead: lead }
        }
        // NON-NEW lead → pure comms, exactly like the manual header Call/Text on
        // an active lead: launch tel:/sms:, NO prompt, NO workflow write (§6).
        if (action.method === "unspecified") {
          return {
            outcome: "no-context",
            feedback: { tone: "info", message: `Say "call ${displayName(lead)}" or "text ${displayName(lead)}".` },
            endsChain: true,
          }
        }
        const url = dialUrl(action.method, lead.phone)
        if (!url) return { outcome: "no-context", feedback: { tone: "error", message: `${displayName(lead)} has no phone number.` }, endsChain: true }
        // Pure comms handoff — the SAME tel:/sms: launch the manual header
        // Call/Text uses on an active lead. No prompt, no workflow write (§6).
        launchExternalProtocol(url)
        return {
          outcome: "executed",
          feedback: { tone: "info", message: `${action.method === "call" ? "Calling" : "Texting"} ${displayName(lead)}.` },
          endsChain: true,
          nextLead: lead,
        }
      }

      case "copy": {
        if (action.target === "current_property") {
          const prop = getCurrentProperty?.() ?? null
          const addr = prop?.propertyAddress ?? null
          if (!addr) return { outcome: "no-context", feedback: { tone: "info", message: "No property selected." } }
          return copyValue(addr)
            ? { outcome: "executed", feedback: { tone: "info", message: "Copied property address." } }
            : { outcome: "no-context" }
        }
        const t = forced ? { lead: forced } : resolveTarget(action.clientName, ctxLead)
        if (t.ask) return { outcome: "ambiguous", ask: { leads: t.ask, spoken: action.clientName ?? "", action } }
        if (!t.lead) return { outcome: "no-context", feedback: { tone: "info", message: "No client selected." } }
        const value = action.field === "phone" ? t.lead.phone : t.lead.email
        if (!value) return { outcome: "no-context", feedback: { tone: "info", message: `No ${action.field} on file.` } }
        return copyValue(String(value))
          ? { outcome: "executed", feedback: { tone: "info", message: `Copied ${action.field}.` }, nextLead: t.lead }
          : { outcome: "no-context" }
      }

      case "crm_open": {
        const t = forced ? { lead: forced } : resolveTarget(action.clientName, ctxLead)
        if (t.ask) return { outcome: "ambiguous", ask: { leads: t.ask, spoken: action.clientName ?? "", action } }
        if (!t.lead) return { outcome: "no-context", feedback: { tone: "info", message: "Open a client first." } }
        postWorkflowVerb(t.lead.id, action.verb)
        // CRM-owned modal takes over — end any chain here (§40.5). The human
        // completes the flow in the modal; Voice never completes it.
        return { outcome: "executed", feedback: { tone: "info", message: openVerbLabel(action.verb) }, endsChain: true, nextLead: t.lead }
      }

      case "edit_client": {
        const t = forced ? { lead: forced } : resolveTarget(action.clientName, ctxLead)
        if (t.ask) return { outcome: "ambiguous", ask: { leads: t.ask, spoken: action.clientName ?? "", action } }
        if (!t.lead) return { outcome: "no-context", feedback: { tone: "info", message: "Open a client first." } }
        postWorkflowVerb(t.lead.id, "edit-client")
        return { outcome: "executed", feedback: { tone: "info", message: `Editing ${displayName(t.lead)}.` }, endsChain: true, nextLead: t.lead }
      }

      case "property_action": {
        // "this" resolves ONLY from a known current property + selected client;
        // with either missing, do nothing (§20, §44). The verb is the identical
        // direct-write the property card posts on click — no interactive prompt.
        const lead = ctxLead ?? getSelectedLead?.() ?? null
        const prop = getCurrentProperty?.() ?? null
        if (!lead) return { outcome: "no-context", feedback: { tone: "info", message: "Open a client first." } }
        if (!prop || (!prop.propertyUrl && !prop.placeId)) return { outcome: "no-context", feedback: { tone: "info", message: "No property selected." } }
        postWorkflowVerb(lead.id, action.verb, {
          property: { propertyUrl: prop.propertyUrl, placeId: prop.placeId ?? null },
        })
        return { outcome: "executed", feedback: { tone: "info", message: propertyVerbLabel(action.verb) } }
      }

      case "completion": {
        // DEFERRED for executable V1 (§2/§4/§34). Completion of a companion-owned
        // prompt (follow-ups, contact-attempt chase, send/build list, setup/
        // schedule tour) is confirmed IN THE COMPANION, not the CRM DOM where
        // Beast Voice runs — so Voice cannot answer the existing confirmation and
        // MUST NOT blind-post a complete-* verb. Recognition is kept for forward
        // compatibility + telemetry, but the result is an EXPLICIT, non-mutating
        // deferred message — never a false "completed" success. Nothing is
        // written, no stage/workflow/prompt is touched.
        return {
          outcome: "deferred",
          feedback: { tone: "info", message: "This action still needs to be completed in Beast Companion." },
          endsChain: true,
        }
      }

      case "stop":
        endFlow()
        return { outcome: "stopped", handledPhase: true, endsChain: true }

      case "unknown":
        return { outcome: "unparsed" }
    }
  }

  /** The contextual answer kinds — invalid as standalone commands / chain steps. */
  const CONTEXTUAL_KINDS = new Set(["respond_call", "respond_text", "confirm_yes", "confirm_no"])

  /**
   * Execute a parsed utterance, which may be a chain of ordered commands (§38–§40).
   * Runs strictly sequentially, threading the resolved client as context so
   * "Open Maria, check application" targets Maria. Stops the moment a step is
   * ambiguous/unknown (§40.1), or a confirmation / CRM-owned modal / navigation
   * takes over (§40.5, §41). Never executes later steps past such a boundary.
   */
  function runChain(commands: ParsedCommand[], transcript: string) {
    let ctxLead: any = getSelectedLead?.() ?? null
    let lastFeedback: ExecResult["feedback"] | undefined
    let ranSomething = false

    for (let i = 0; i < commands.length; i++) {
      const parsed = commands[i]

      // A contextual answer or an unparsable fragment inside a command chain is
      // ambiguous by rule — abort without running anything further.
      if (parsed.kind === "unknown" || CONTEXTUAL_KINDS.has(parsed.kind)) {
        if (commands.length > 1 && ranSomething) {
          log({ transcript, parsedIntent: parsed.kind, outcome: "chain-aborted", errorReason: `segment ${i + 1}` })
          setPhase({ name: "notice", tone: "info", message: "Stopped — the rest of that wasn't clear." })
        } else {
          // A single unclear utterance keeps the existing command-mode messaging.
          handleStandaloneNonCommand(parsed, transcript)
        }
        return
      }

      if (parsed.kind === "cancel") {
        log({ transcript, parsedIntent: "cancel", outcome: "cancelled" })
        endFlow()
        setPhase({ name: "idle" })
        return
      }

      const action = resolveIntent(parsed)
      const res = executeAction(action, ctxLead, transcript)
      ranSomething = true

      // Log every step here EXCEPT the New-lead contact hand-off, which logs its
      // own richer "handed-off" row inside handOff (handledPhase === true).
      if (!(action.kind === "contact" && res.handledPhase)) {
        log({
          transcript,
          parsedIntent: parsed.kind,
          requestedMethod: action.kind === "contact" ? action.method : null,
          matchedLeadId: res.nextLead?.id ?? null,
          matchedCount: res.nextLead ? 1 : 0,
          requestedAction: res.outcome === "executed" ? "execute" : null,
          handoffAttempted: action.kind === "contact" && res.outcome === "executed",
          outcome: res.outcome,
          errorReason: res.outcome === "executed" && action.kind === "contact" ? `non-new` : null,
        })
      }

      if (res.ask) {
        // Ambiguity ends the chain and shows the picker (§40.1).
        setPhase({ name: "ask-which", leads: res.ask.leads, spoken: res.ask.spoken, action: res.ask.action })
        return
      }
      if (res.nextLead !== undefined) ctxLead = res.nextLead
      if (res.feedback) lastFeedback = res.feedback
      if (res.handledPhase) return // the action owns the UI (contact gate / stop)
      if (res.endsChain) break
    }

    if (lastFeedback) setPhase({ name: "notice", tone: lastFeedback.tone, message: lastFeedback.message })
  }

  /** Messaging for a single non-command utterance (contextual answer with nothing
   *  to answer, or an unparsed command) — preserves the alpha's copy. */
  function handleStandaloneNonCommand(parsed: ParsedCommand, transcript: string) {
    if (CONTEXTUAL_KINDS.has(parsed.kind)) {
      log({ transcript, parsedIntent: parsed.kind, outcome: "no-active-prompt" })
      setPhase({ name: "notice", tone: "info", message: "Nothing to answer right now." })
      return
    }
    log({ transcript, parsedIntent: "unknown", outcome: "unparsed" })
    setPhase({
      name: "notice",
      tone: "error",
      message: `Didn't understand "${transcript.trim()}". Try "Contact Maria Gonzalez".`,
    })
  }

  /** The user chose a lead from the ambiguity picker — apply the stored action to
   *  exactly that lead (no re-resolution), then surface its short feedback. */
  function applyPickedLead(lead: any, action: VoiceAction) {
    const res = executeAction(action, lead, phase.name === "ask-which" ? phase.spoken : "", lead)
    if (res.handledPhase) return // contact gate owns the UI from here
    if (res.feedback) setPhase({ name: "notice", tone: res.feedback.tone, message: res.feedback.message })
    else setPhase({ name: "idle" })
  }

  function handleTranscript(transcript: string) {
    const prompt = promptRef.current

    // ── Contextual mode ─────────────────────────────────────────────────────
    // A prompt is on screen, so ONLY its valid answers mean anything. A fresh
    // command is ignored rather than stacking a second workflow. Parsed as a
    // single segment (never a chain) — a prompt expects exactly one answer.
    if (prompt) {
      const parsed = parseCommand(transcript)
      if (parsed.kind === "confirm_yes" || parsed.kind === "confirm_no" || parsed.kind === "respond_call" || parsed.kind === "respond_text" || parsed.kind === "cancel" || parsed.kind === "stop") {
        if (parsed.kind === "stop") {
          log({ transcript, parsedIntent: "stop", outcome: "stopped" })
          endFlow()
          return
        }
        respondToPrompt(prompt, parsed.kind, transcript)
        return
      }
      log({ transcript, parsedIntent: parsed.kind, workflowPhase: prompt.phase, outcome: "not-valid-for-phase" })
      return
    }

    // ── Command mode ────────────────────────────────────────────────────────
    // May be a single command or an ordered chain.
    runChain(parseChain(transcript), transcript)
  }

  function startListening() {
    if (!supported) {
      setPhase({ name: "notice", tone: "error", message: speechErrorMessage("unavailable") })
      return
    }
    setPhase({ name: "listening" })
    sessionHandledRef.current = false
    captureMsRef.current = null

    let transcript = ""
    provider.start({
      // Capture ended, transcript pending. Near-instant for the browser
      // recognizer; for a cloud provider this covers the upload + inference round
      // trip, which is exactly what the working state is for.
      onTranscribing: () => setPhase({ name: "working" }),
      onResult: (result) => {
        transcript = result.transcript
        captureMsRef.current = result.audioDurationMs
        sessionHandledRef.current = true
        handleTranscript(result.transcript)
      },
      onError: (error: SpeechError) => {
        // A deliberate cancel already reset the UI; don't overwrite it.
        if (error.code === "cancelled") return
        sessionHandledRef.current = true

        // Mid-flow silence is ordinary (the locator is reading, or on the call).
        // Count it, back off, and let the caps end the flow rather than sitting
        // on an open microphone or nagging with a notice nobody can see.
        if (flowLiveRef.current && error.code === "no-input") {
          silentSessionsRef.current += 1
          log({
            transcript: "",
            parsedIntent: "unknown",
            workflowPhase: promptRef.current?.phase ?? null,
            outcome: "speech-error",
            errorReason: error.code,
          })
          setPhase({ name: "idle" })
          scheduleRearm(silentSessionsRef.current + 1)
          return
        }
        // The provider's own code is logged verbatim, so a backend swap keeps
        // producing comparable failure data.
        log({
          transcript: transcript || "",
          outcome: "speech-error",
          errorReason: error.detail ? `${error.code}:${error.detail}` : error.code,
        })
        setPhase({ name: "notice", tone: "error", message: speechErrorMessage(error.code) })
      },
      onEnd: () => {
        // Only clear if nothing else claimed the UI (a result, ask, or notice).
        if (!sessionHandledRef.current) setPhase({ name: "idle" })
        // Still mid-flow with a question on screen (e.g. the answer was not
        // valid for this phase): listen again. scheduleRearm re-checks every cap.
        if (flowLiveRef.current && promptRef.current) {
          setPhase({ name: "idle" })
          scheduleRearm()
        }
      },
    })
  }

  startListeningRef.current = startListening
  respondToPromptRef.current = respondToPrompt

  function toggle() {
    if (phase.name === "listening") {
      // Cancel, not finish: Chrome ends an utterance on silence by itself, so the
      // only reason to press a listening mic is to abandon the command. A cloud
      // provider has no silence auto-stop — when one lands, this becomes finish().
      provider.cancel()
      sessionHandledRef.current = true
      setPhase({ name: "idle" })
      return
    }
    if (phase.name === "working") return
    startListening()
  }

  // Beast Voice is invisible where it can't run, rather than offering a button
  // that always fails.
  if (!supported) return null

  const working = phase.name === "working"

  return (
    <>
      {/* Portalled to <body>, so it stays visible even while the contact
          workflow hides the board (and this button with it). */}
      <VoiceGlow active={listening} />

      <button
        type="button"
        className="kb-voice-mic"
        data-state={listening ? "listening" : working ? "working" : "idle"}
        onClick={toggle}
        disabled={working}
        aria-label={listening ? "Stop listening" : "Speak to Beast"}
        aria-pressed={listening}
        title={listening ? "Stop listening" : "Speak to Beast"}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="9" y="2" width="6" height="11" rx="3" />
          <path d="M5 10v1a7 7 0 0 0 14 0v-1" />
          <path d="M12 18v4" />
        </svg>
      </button>

      {(phase.name === "ask-which" || phase.name === "notice") && (
        <div className="kb-voice-pop" role="dialog" aria-live="polite">
          {phase.name === "ask-which" ? (
            <>
              <p className="kb-voice-pop-title">Which client did you mean?</p>
              <div className="kb-voice-pop-list">
                {phase.leads.map((lead) => (
                  <button
                    key={String(lead.id)}
                    type="button"
                    className="kb-voice-pop-item"
                    onClick={() => applyPickedLead(lead, phase.action)}
                  >
                    <span>{displayName(lead)}</span>
                    <span className="kb-voice-pop-meta">{stageLabel(lead.crm_status)}</span>
                  </button>
                ))}
              </div>
              <button type="button" className="kb-voice-pop-cancel" onClick={() => setPhase({ name: "idle" })}>
                Cancel
              </button>
            </>
          ) : (
            <p className="kb-voice-pop-msg" data-tone={phase.tone}>
              {phase.message}
            </p>
          )}
        </div>
      )}
    </>
  )
}
