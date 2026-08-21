import type { SpeechHandlers, SpeechProvider, SpeechErrorCode } from "./types"

// Browser-native transcription (Chrome's Web Speech API) — the ALPHA provider.
// Chosen because the alpha grammar is a closed set of phrasings, so a hosted STT
// round trip would buy nothing but latency and cost while the command layer is
// still being learned. It is an implementation detail behind SpeechProvider and
// is expected to be replaced before Beast Voice reaches regular users.
//
// PRIVACY: Chrome's implementation is not on-device — it streams microphone
// audio to Google for transcription. Beast Voice itself neither records nor
// stores audio; only the returned text is used.
//
// Everything Chrome-specific lives in this file: the Web Speech type shims, the
// error-code translation, and the silence auto-stop behavior. Nothing above the
// SpeechProvider interface knows this recognizer exists.

// Minimal local declarations. The Web Speech API is NOT in TypeScript's lib.dom,
// and this is deliberately typed here rather than by adding a dependency to
// package.json for one alpha behind an admin flag.
type SpeechRecognitionAlt = { transcript: string }
type SpeechRecognitionRes = { 0: SpeechRecognitionAlt; isFinal: boolean; length: number }
type SpeechRecognitionEventLike = { results: { length: number; [i: number]: SpeechRecognitionRes } }
type SpeechRecognitionErrorEventLike = { error?: string }
type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onaudiostart: (() => void) | null
  onresult: ((e: SpeechRecognitionEventLike) => void) | null
  onerror: ((e: SpeechRecognitionErrorEventLike) => void) | null
  onend: (() => void) | null
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike

function getCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

// Chrome reports problems through the recognition error event rather than a
// rejected promise. Translating here is what keeps Chrome's vocabulary out of
// the shared SpeechError type; the raw code still travels in `detail`.
function mapErrorCode(raw: string | undefined): SpeechErrorCode {
  switch (raw) {
    case "not-allowed":
    case "service-not-allowed":
      return "permission-denied"
    case "no-speech":
      return "no-input"
    case "audio-capture":
      return "capture-failed"
    case "network":
      return "network"
    case "aborted":
      return "cancelled"
    default:
      return "unknown"
  }
}

export function createBrowserSpeechProvider(): SpeechProvider {
  let recognition: SpeechRecognitionLike | null = null
  let startedAt = 0
  // Set by cancel() so the end-of-session handler does not report the resulting
  // empty session as "no input" — a deliberate cancel is not a failure to hear.
  let cancelled = false

  // A plain function rather than `this` so the provider keeps working if a
  // caller destructures its methods.
  function teardown() {
    recognition = null
    startedAt = 0
  }

  return {
    id: "browser-webspeech",
    // Chrome does not disclose which model transcribed the audio; a cloud
    // provider fills this in, and the log column already exists for it.
    model: null,

    isAvailable() {
      // Secure context is required (https or localhost); both CRM surfaces qualify.
      return getCtor() !== null && typeof window !== "undefined" && window.isSecureContext
    },

    start(handlers: SpeechHandlers) {
      const Ctor = getCtor()
      if (!Ctor) {
        handlers.onError({ code: "unavailable", detail: "no SpeechRecognition constructor" })
        handlers.onEnd()
        return
      }

      // A previous session still winding down would throw InvalidStateError.
      if (recognition) {
        try {
          recognition.abort()
        } catch {
          /* already stopped */
        }
        teardown()
      }

      const rec = new Ctor()
      recognition = rec
      rec.lang = "en-US"
      rec.continuous = false // one utterance per mic activation
      rec.interimResults = false // only settled text reaches the parser
      rec.maxAlternatives = 1

      let delivered = false
      cancelled = false
      startedAt = Date.now()

      rec.onaudiostart = () => {
        // Capture is live — the clock for audioDurationMs starts here rather than
        // at start(), so permission-prompt time is not billed as speech.
        startedAt = Date.now()
        handlers.onStart?.()
      }

      rec.onresult = (event) => {
        const last = event.results[event.results.length - 1]
        const transcript = last?.[0]?.transcript ?? ""
        if (!transcript.trim()) return
        delivered = true
        // Chrome resolves locally-immediately, but the callback is still fired so
        // the UI's working state is driven by the same signal a cloud provider
        // will use — where it covers a real network round trip.
        handlers.onTranscribing?.()
        handlers.onResult({
          transcript,
          audioDurationMs: startedAt ? Date.now() - startedAt : null,
        })
      }

      rec.onerror = (event) => {
        delivered = true // suppress the duplicate no-input report from onend
        handlers.onError({ code: mapErrorCode(event?.error), detail: event?.error ?? null })
      }

      rec.onend = () => {
        if (!delivered && !cancelled) handlers.onError({ code: "no-input", detail: null })
        teardown()
        handlers.onEnd()
      }

      try {
        rec.start()
      } catch (err) {
        teardown()
        handlers.onError({ code: "unknown", detail: err instanceof Error ? err.message : null })
        handlers.onEnd()
      }
    },

    // stop() finalizes: Chrome emits the pending result, then onend.
    finish() {
      if (!recognition) return
      try {
        recognition.stop()
      } catch {
        /* already stopped */
      }
    },

    // abort() discards: no result is emitted, only onend.
    cancel() {
      if (!recognition) return
      cancelled = true
      try {
        recognition.abort()
      } catch {
        /* already stopped */
      }
      teardown()
    },
  }
}
