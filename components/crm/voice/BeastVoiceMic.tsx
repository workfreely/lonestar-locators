"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { createSpeechProvider } from "@/lib/beastVoice/provider"
import { parseCommand } from "@/lib/beastVoice/parseCommand"
import { resolveClient } from "@/lib/beastVoice/resolveClient"
import { logVoiceCommand } from "@/lib/beastVoice/log"
import {
  readActivePrompt,
  isValidForPhase,
  type ActivePrompt,
  type PromptAction,
} from "@/lib/beastVoice/activePrompt"
import VoiceGlow from "./VoiceGlow"
import type {
  ContactMethod,
  SpeechError,
  SpeechErrorCode,
  SpeechProvider,
  VoiceLogEntry,
} from "@/lib/beastVoice/types"

// Beast Voice Alpha — the mic that lives inside the existing Kanban search field.
//
// This component owns ONLY: capture, parse, resolve, and asking which client when
// the name is ambiguous. It performs no CRM mutation. When a command resolves, it
// calls `onInitiateContact` — the SAME prop the New→Contacted drag already calls —
// and the existing Contact Gate takes over from there ("Would you like to call or
// text …?" → launch → "Were you able to contact …?" → Yes → recordFirstContact).
//
// There is deliberately NO "Contact Maria?" confirmation step here. The existing
// chooser IS the confirmation and already offers Cancel, and nothing is written
// until the locator answers Yes inside it — so a Beast Voice confirmation would
// be a second prompt for the same decision.

type Phase =
  | { name: "idle" }
  | { name: "listening" }
  | { name: "working" }
  | { name: "ask-which"; leads: any[]; spoken: string; method: ContactMethod }
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
}: {
  /** The leads already loaded in the board — resolution never queries. */
  leads: any[]
  /** The existing Contact Gate entry point (identical to the drag's). */
  onInitiateContact?: (lead: any) => void
  /** Lets the search field swap its placeholder while a session runs. */
  onListeningChange?: (state: "idle" | "listening" | "working") => void
  /** Override the speech backend (tests, future per-workspace selection). */
  createProvider?: () => SpeechProvider
}) {
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

  function handleTranscript(transcript: string) {
    const parsed = parseCommand(transcript)
    const prompt = promptRef.current

    // ── Contextual mode ─────────────────────────────────────────────────────
    // A prompt is on screen, so ONLY its valid answers mean anything. A fresh
    // "contact <someone>" is ignored rather than stacking a second workflow.
    if (prompt) {
      if (parsed.kind === "unknown" || parsed.kind === "contact_client") {
        log({
          transcript,
          parsedIntent: parsed.kind,
          workflowPhase: prompt.phase,
          outcome: "not-valid-for-phase",
        })
        return
      }
      respondToPrompt(prompt, parsed.kind, transcript)
      return
    }

    // ── Command mode ────────────────────────────────────────────────────────
    switch (parsed.kind) {
      case "cancel":
        log({ transcript, parsedIntent: "cancel", outcome: "cancelled" })
        endFlow()
        setPhase({ name: "idle" })
        return

      // Contextual answers with nothing on screen to answer. Parsed and logged
      // so we learn they were said, but executed NEVER: with no active prompt a
      // bare "Yes" or "Call" names no client and no action.
      case "confirm_yes":
      case "confirm_no":
      case "respond_call":
      case "respond_text":
        log({ transcript, parsedIntent: parsed.kind, outcome: "no-active-prompt" })
        setPhase({
          name: "notice",
          tone: "info",
          message: "Nothing to answer right now.",
        })
        return

      case "unknown":
        log({ transcript, parsedIntent: "unknown", outcome: "unparsed" })
        setPhase({
          name: "notice",
          tone: "error",
          message: `Didn't understand "${transcript.trim()}". Try "Contact Maria Gonzalez".`,
        })
        return
    }

    const match = resolveClient(parsed.clientName, leadsRef.current)
    const base = {
      transcript,
      parsedIntent: "contact_client" as const,
      requestedMethod: parsed.method,
      phraseId: parsed.phrase,
    }

    if (match.kind === "none") {
      log({ ...base, outcome: "not-found" })
      setPhase({ name: "notice", tone: "error", message: `No client matching "${parsed.clientName}".` })
      return
    }

    if (match.kind === "many") {
      log({ ...base, matchedCount: match.leads.length, outcome: "ambiguous" })
      setPhase({ name: "ask-which", leads: match.leads, spoken: parsed.clientName, method: parsed.method })
      return
    }

    handOff(match.lead, transcript, parsed.method, parsed.phrase)
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
                    onClick={() => handOff(lead, phase.spoken, phase.method, "disambiguated")}
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
