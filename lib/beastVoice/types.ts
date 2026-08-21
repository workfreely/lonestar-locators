// Beast Voice Alpha — shared types.
//
// The voice layer is deliberately thin: speech → intent → client → hand off to
// the CRM workflow that already exists. NOTHING in lib/beastVoice performs a CRM
// mutation, calls an API route, or touches Supabase. Execution is always handed
// back to the caller, which invokes the same functions the buttons/drag already
// use. Keeping that boundary is what stops Beast Voice from becoming a second
// workflow system.

import type { ContactMethod } from "./phrases"
export type { ContactMethod }

// ── Speech provider ─────────────────────────────────────────────────────────
// The seam that lets the transcription backend change later (a hosted STT API,
// on-device Whisper) without touching the parser, the resolver, or the UI.
//
// Deliberately provider-NEUTRAL: nothing here assumes the recognizer runs in the
// browser, ends an utterance by itself, or reports Chrome's error codes. A cloud
// provider records audio locally, uploads it on finish(), and answers over the
// network — the shape below covers that too.
export type SpeechResult = {
  transcript: string
  /** How long capture ran. The billable unit for per-minute STT vendors; null when unknown. */
  audioDurationMs: number | null
}

// Provider-neutral failure codes. A provider's own code is preserved verbatim in
// `detail` for logging, so adding a backend never means widening this union.
export type SpeechErrorCode =
  | "unavailable" // the provider cannot run in this environment at all
  | "permission-denied" // the user or the browser refused the microphone
  | "no-input" // capture produced nothing usable (silence)
  | "capture-failed" // microphone/device problem
  | "network" // could not reach the transcription service
  | "service-error" // the service answered with an error (auth, quota, 5xx)
  | "cancelled" // the session was abandoned on purpose
  | "unknown"

export type SpeechError = {
  code: SpeechErrorCode
  /** The provider's raw code/message, kept for the usage log. */
  detail?: string | null
}

export type SpeechHandlers = {
  /** Capture actually began (permission granted, microphone live). */
  onStart?: () => void
  /**
   * Capture ended and a transcript is pending. For a cloud provider this is the
   * upload + inference round trip and is where the UI shows its working state;
   * the browser recognizer resolves fast enough that it is near-instant.
   */
  onTranscribing?: () => void
  /** One utterance transcribed. */
  onResult: (result: SpeechResult) => void
  onError: (error: SpeechError) => void
  /** Session finished (success or not) — always fires last, exactly once. */
  onEnd: () => void
}

export interface SpeechProvider {
  /** Stable id recorded in the usage log, so a provider swap is visible in the data. */
  readonly id: string
  /** Model/variant a cloud provider reports; null for the browser recognizer. */
  readonly model: string | null
  /** False when this environment cannot run the provider. */
  isAvailable(): boolean
  start(handlers: SpeechHandlers): void
  /**
   * Stop capturing and PRODUCE a transcript — the push-to-talk release.
   * Distinct from cancel() because a cloud provider has no silence auto-stop:
   * without this it could never be told "I am done speaking, transcribe it".
   */
  finish(): void
  /** Abandon the session. No transcript is produced and no result is delivered. */
  cancel(): void
}

// ── Parsed intent ───────────────────────────────────────────────────────────
// Every supported utterance resolves to one of these. The vocabulary that maps
// onto them lives in phrases.ts.
//
// `contact_client` covers ALL contact phrasings; `method` only records which
// branch of the EXISTING first-contact workflow the locator already has in mind.
// There is deliberately no "set stage" intent: the CRM's Contact Gate owns what
// New → Contacted means, and Beast Voice defers to it.
//
// confirm_yes / confirm_no / cancel are CONTEXTUAL — they answer a question the
// existing workflow is already asking, carry no client and no method, and mean
// nothing on their own.
export type ParsedCommand =
  | {
      kind: "contact_client"
      clientName: string
      method: ContactMethod
      /** Which phrase-library pattern matched, logged to learn how locators speak. */
      phrase: string
    }
  | { kind: "respond_call" }
  | { kind: "respond_text" }
  | { kind: "confirm_yes" }
  | { kind: "confirm_no" }
  | { kind: "cancel" }
  | { kind: "unknown" }

// ── Client resolution ───────────────────────────────────────────────────────
export type ClientMatch =
  | { kind: "one"; lead: any }
  | { kind: "many"; leads: any[] }
  | { kind: "none" }

// ── Usage log ───────────────────────────────────────────────────────────────
// One row of alpha telemetry, persisted to public.beast_voice_commands via
// /api/admin/beast-voice/log. user_id and workspace_id are NOT here on purpose —
// the route derives both from the session, never from the browser.
//
// Raw audio is never captured or stored; audioDurationMs is a duration, not a
// recording. Provider + model + duration together are what make per-user and
// per-organization cost metering possible once a paid provider is chosen.
export type VoiceLogEntry = {
  /** SpeechProvider id — 'browser-webspeech' today. */
  provider: string
  /** Model/variant when the provider reports one; null for the browser recognizer. */
  providerModel: string | null
  /** Capture duration — the billable unit for per-minute STT vendors. */
  audioDurationMs: number | null
  /** What the recognizer heard. Text only — no audio is recorded or stored. */
  transcript: string
  parsedIntent: ParsedCommand["kind"]
  /** Which contact branch the locator asked for; null for non-contact intents. */
  requestedMethod: ContactMethod | null
  /** Which phrase-library pattern matched — shows which phrasings get real use. */
  phraseId: string | null
  /** Which existing workflow question was on screen, if any, when this was said. */
  workflowPhase: string | null
  /** True when the triggered action launches tel:/sms: to the OS. */
  handoffAttempted: boolean
  /** Transient user activation at launch — settles whether delayed handoffs hold. */
  activationLive: boolean | null
  matchedLeadId: string | number | null
  matchedCount: number
  requestedAction: "initiate-contact" | null
  /** Whether the command reached the existing workflow (its own UI then confirms). */
  handedOff: boolean
  outcome:
    | "handed-off"
    | "ambiguous"
    | "not-found"
    | "not-eligible"
    | "unparsed"
    | "speech-error"
    /** A cancel phrase cleared Beast Voice's own state. */
    | "cancelled"
    /** A yes/no answer arrived with no workflow prompt reachable to answer. */
    | "no-active-prompt"
    /** A contextual response the on-screen phase has no button for (fail closed). */
    | "not-valid-for-phase"
    /** A valid response clicked the existing rendered button. */
    | "responded"
  errorReason: string | null
}
