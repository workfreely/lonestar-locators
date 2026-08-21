import type { SpeechProvider } from "./types"
import { createBrowserSpeechProvider } from "./browserSpeech"

// The ONE place that decides which speech backend Beast Voice runs.
//
// The UI imports this factory, never a concrete provider, so choosing a
// production backend later is an edit to this file plus a new provider module —
// no component, parser, resolver, or workflow code changes.
//
// Today: Chrome's Web Speech API, an alpha-only implementation detail. Before
// Beast Voice reaches regular users this returns a hosted provider instead
// (browser-native is Chrome-only and sends audio to Google under Google's terms,
// neither of which is acceptable for a multi-tenant release).
export function createSpeechProvider(): SpeechProvider {
  return createBrowserSpeechProvider()
}
