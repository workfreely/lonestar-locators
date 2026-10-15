// WHAT A POST EDITOR LOAD DOES TO GENERATED COPY — the one rule, in one pure place.
//
// ── THE BUG THIS EXISTS TO PREVENT ──────────────────────────────────────────────────────────
// Opening a draft used to RE-SYNC its caption, headline and hashtags to the current metadata
// whenever they looked generator-owned. The intent was to repair drift. The effect was that the
// editor held different text from the database the moment a draft opened — and because the editor
// sends caption, headline and hashtags on EVERY save, saving an unrelated field silently rewrote
// them.
//
// Measured on a live draft before the fix: stored said "✨ 8 Weeks Free" and "Submit the form to
// get your free custom apartment list"; the editor had already swapped in "✨ Up to 8 weeks free!"
// and a "Comment LIST" CTA. Saving a geographic field persisted the swap. There is no history
// table, so the original wording was unrecoverable.
//
// ── THE RULE ────────────────────────────────────────────────────────────────────────────────
// STORED WINS. Generation fills a gap; it never replaces something already written. A draft that
// has a caption loads that caption byte for byte, whatever it looks like. A draft with no caption
// gets one built, which is what keeps a brand-new draft usable.
//
// ── OWNERSHIP IS SEPARATE FROM DISPLAY ──────────────────────────────────────────────────────
// `*Dirty` still answers a DIFFERENT question: may the generator touch this field LATER? A stored
// value matching no generated form is a manual override (dirty → generator keeps off it forever);
// one matching a generated form stays generator-owned, so a later Market/Type/template edit
// re-syncs it. The fix changed WHAT IS SHOWN on load, and deliberately left ownership alone — so
// every intentional generation path still works exactly as it did.
//
// Drift is still repairable, just never silently: metadata edits call syncGenerated, a template
// change moves the headline and caption with it, hashtags have "Suggest from market", and the
// caption has its own Regenerate control. All of those are clicks.

import type { OverlayTemplate, SourceMeta } from "./composePost"
import { buildCaption, isGeneratedCaption, isGeneratedHashtags, isGeneratedHeadline } from "./composePost"

export type LoadedCopy = {
  caption: string
  captionDirty: boolean
  headline: string
  headlineDirty: boolean
  hashtags: string[]
  hashtagsDirty: boolean
}

export type LoadedCopyInput = {
  storedCaption: string | null | undefined
  storedHeadline: string | null | undefined
  storedHashtags: string[] | null | undefined
  meta: SourceMeta
  /** Deterministic hook seed — the source content id, so one source always gets the same hook. */
  seed?: string | number
  template: OverlayTemplate
  /** The headline the CURRENT template would generate. Passed in rather than imported so this stays
   *  free of the template-rendering module and its fixtures. */
  generatedHeadline: string
  /** The hashtags the CURRENT market/type would generate, for the empty case only. */
  generatedHashtags: string[]
}

/**
 * Resolve what the editor shows, and who owns it, for a post being opened.
 *
 * Pure: no React, no fetch, no clock. Every branch is reachable from a test.
 */
export function resolveLoadedCopy(input: LoadedCopyInput): LoadedCopy {
  const { meta, seed, template, generatedHeadline, generatedHashtags } = input

  const storedCaption = input.storedCaption ?? ""
  const storedHeadline = input.storedHeadline ?? ""
  const storedHashtags = Array.isArray(input.storedHashtags) ? input.storedHashtags : []

  // OWNERSHIP — unchanged from before the fix, and independent of what is displayed below.
  const captionDirty = !isGeneratedCaption(storedCaption, meta, seed)
  const headlineDirty =
    !!storedHeadline && storedHeadline !== generatedHeadline && !isGeneratedHeadline(storedHeadline)
  const hashtagsDirty = !isGeneratedHashtags(storedHashtags, meta)

  // DISPLAY — stored wins; generation fills a gap.
  return {
    caption: storedCaption || buildCaption(meta, seed, template),
    captionDirty,
    headline: storedHeadline || generatedHeadline,
    headlineDirty,
    hashtags: storedHashtags.length > 0 ? storedHashtags : generatedHashtags,
    hashtagsDirty,
  }
}
