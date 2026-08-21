// Beast Voice — SpeechProvider contract.
//
// Guards the provider seam that a production backend will later have to satisfy:
// finish() must finalize, cancel() must discard silently, errors must be
// translated to the shared vocabulary with the raw code preserved, and onEnd
// must fire exactly once. Runs headless against a fake recognizer.
// Run: npx tsx scripts/tests/beastVoiceProvider.test.ts

let failures = 0
function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) console.log(`  ✓ ${name}`)
  else {
    failures++
    console.log(`  ✗ ${name}\n      expected ${e}\n      actual   ${a}`)
  }
}

// ── Fake Chrome recognizer ──────────────────────────────────────────────────
const calls: string[] = []
let live: any = null

class FakeRecognition {
  lang = ""
  continuous = false
  interimResults = false
  maxAlternatives = 0
  onaudiostart: (() => void) | null = null
  onresult: ((e: any) => void) | null = null
  onerror: ((e: any) => void) | null = null
  onend: (() => void) | null = null
  start() { calls.push("start"); live = this }
  stop() { calls.push("stop") }
  abort() { calls.push("abort") }
  emitAudioStart() { this.onaudiostart?.() }
  emitResult(t: string) { this.onresult?.({ results: { length: 1, 0: { 0: { transcript: t }, isFinal: true, length: 1 } } }) }
  emitError(code: string) { this.onerror?.({ error: code }) }
  emitEnd() { this.onend?.() }
}

;(globalThis as any).window = { isSecureContext: true, webkitSpeechRecognition: FakeRecognition }

// Safe as a static import: browserSpeech reads `window` inside its methods, not
// at module scope, so the fake above is in place by the time anything calls it.
import { createBrowserSpeechProvider } from "../../lib/beastVoice/browserSpeech"

type Rec = { results: any[]; errors: any[]; ends: number; starts: number; transcribing: number }
function session() {
  const rec: Rec = { results: [], errors: [], ends: 0, starts: 0, transcribing: 0 }
  const provider = createBrowserSpeechProvider()
  provider.start({
    onStart: () => rec.starts++,
    onTranscribing: () => rec.transcribing++,
    onResult: (r) => rec.results.push(r),
    onError: (e) => rec.errors.push(e),
    onEnd: () => rec.ends++,
  })
  return { provider, rec }
}

console.log("\nprovider identity + availability")
{
  const p = createBrowserSpeechProvider()
  check("stable id for the usage log", p.id, "browser-webspeech")
  check("no model — cloud providers fill this in", p.model, null)
  check("available with a ctor in a secure context", p.isAvailable(), true)
  ;(globalThis as any).window = { isSecureContext: false, webkitSpeechRecognition: FakeRecognition }
  check("unavailable outside a secure context", p.isAvailable(), false)
  ;(globalThis as any).window = { isSecureContext: true }
  check("unavailable with no recognizer", p.isAvailable(), false)
  ;(globalThis as any).window = { isSecureContext: true, webkitSpeechRecognition: FakeRecognition }
}

console.log("\nhappy path")
{
  calls.length = 0
  const { rec } = session()
  live.emitAudioStart()
  live.emitResult("Beast, contact Maria Gonzalez.")
  live.emitEnd()
  check("onStart fired when capture went live", rec.starts, 1)
  check("onTranscribing precedes the result", rec.transcribing, 1)
  check("transcript delivered", rec.results[0]?.transcript, "Beast, contact Maria Gonzalez.")
  check("capture duration measured for cost metering", typeof rec.results[0]?.audioDurationMs, "number")
  check("no errors", rec.errors.length, 0)
  check("onEnd fired exactly once", rec.ends, 1)
}

console.log("\nfinish() finalizes — cancel() discards")
{
  calls.length = 0
  const { provider } = session()
  provider.finish()
  check("finish calls stop(), which emits the pending result", calls, ["start", "stop"])
}
{
  calls.length = 0
  const { provider } = session()
  provider.cancel()
  check("cancel calls abort(), which discards", calls, ["start", "abort"])
}
{
  // The leak this fixes: a deliberate cancel used to surface as "Didn't catch that".
  const { provider, rec } = session()
  provider.cancel()
  live.emitEnd()
  check("cancel reports no error", rec.errors, [])
  check("cancel still ends the session once", rec.ends, 1)
}

console.log("\nerror translation — shared codes, raw detail preserved")
for (const [raw, code] of [
  ["not-allowed", "permission-denied"],
  ["service-not-allowed", "permission-denied"],
  ["no-speech", "no-input"],
  ["audio-capture", "capture-failed"],
  ["network", "network"],
  ["aborted", "cancelled"],
  ["something-new", "unknown"],
] as const) {
  const { rec } = session()
  live.emitError(raw)
  live.emitEnd()
  check(`${raw} → ${code}`, rec.errors[0], { code, detail: raw })
}
{
  const { rec } = session()
  live.emitEnd() // silence: ended without ever delivering
  check("silent session reports no-input", rec.errors[0], { code: "no-input", detail: null })
}
{
  const { rec } = session()
  live.emitError("no-speech")
  live.emitEnd()
  check("an error is not double-reported by onEnd", rec.errors.length, 1)
}

console.log(failures ? `\n${failures} FAILED\n` : "\nAll passed\n")
process.exit(failures ? 1 : 0)
