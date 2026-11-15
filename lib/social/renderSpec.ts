// THE COMPLETE DESCRIPTION OF ONE RENDER'S OUTPUT.
//
// A RenderSpec says everything that determines the bytes of the finished MP4 and nothing that
// does not. Two specs that are equal produce the same video; two that differ anywhere may not.
// That property is the whole point, and it is what a fingerprint can be computed from.
//
// ── WHY THIS TYPE EXISTS AT ALL ────────────────────────────────────────────────────────────
// renderPostToStorage used to read its own inputs: an eighteen-column select, two more queries
// for voice clips, and several storage reads, all inside the function that renders. Nothing
// outside it could say what a given post would render to without running it, and any new column
// it learned to read became an input that an externally-computed hash would not know about.
// That is the failure mode that matters for reuse — a forgotten input means two materially
// different videos collide on one fingerprint and the wrong artifact is served to a real
// account.
//
// Discipline does not prevent that; structure does. The renderer now takes a spec and queries
// NOTHING, so an input that is not in the spec cannot reach ffmpeg, and the fingerprint is
// computed over the whole spec rather than a hand-maintained list of fields.
import { createHash } from "node:crypto"
import type { AudioChoice } from "@/lib/social/renderVideo"

/**
 * Bumped whenever a change to the RENDERER could alter output for an unchanged spec: the overlay
 * geometry, the font, the filter graph, the ducking curve, the encoder settings.
 *
 * It is in the fingerprint because the inputs alone do not determine the output — the code does
 * too. Without it, fixing a template bug would leave every existing artifact stale while still
 * matching the fingerprint of a fresh render, which is the quiet version of serving the wrong
 * video. Changing this invalidates every stored fingerprint, deliberately.
 */
export const RENDERER_VERSION = 1

/**
 * Input media, named by IMMUTABLE STORAGE PATH rather than by the local file a run downloads it
 * to. Local paths live in a temp directory whose name changes every run and every machine, so
 * hashing them would make a fingerprint that never matches itself.
 */
export type RenderSpecMedia = {
  /** The footage. Already resolved: the post's own override, else its content row's. */
  source: string
  /** The effective hook — an explicitly chosen voice clip, else the presenter's audio. Already
   *  resolved to the exact file (the normalised derivative when one exists), because WHICH of
   *  the two files is used changes the mix and therefore the output. */
  hook: string | null
  cta: string | null
  presenter: string | null
  presenterCta: string | null
}

export type RenderSpec = {
  rendererVersion: number
  /** The GEOMETRY, not the provider. Reel and Story share one safe area and therefore one
   *  artifact; TikTok has its own. This is what decides the layout. */
  safeAreaId: string
  template: string
  headline: string
  subheadline: string
  audioChoice: AudioChoice
  media: RenderSpecMedia
  presenterIntroSeconds: number | null
  presenterSide: string | null
  presenterWidthPx: number | null
}

/** Keys sorted at every depth, so two equal specs serialise identically regardless of how they
 *  were built. Undefined is normalised to null: a field that is absent and a field that is
 *  explicitly nothing describe the same video. */
function canonical(v: unknown): unknown {
  if (v === undefined) return null
  if (Array.isArray(v)) return v.map(canonical)
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(v as Record<string, unknown>).sort()) out[k] = canonical((v as Record<string, unknown>)[k])
    return out
  }
  return v
}

export function canonicalRenderSpec(spec: RenderSpec): string {
  return JSON.stringify(canonical(spec))
}

/**
 * The content address of a finished render.
 *
 * Computed over the WHOLE spec, never a selected subset — adding a field to RenderSpec changes
 * every fingerprint that field participates in, automatically. renderSpec.test.ts proves this by
 * mutating each field in turn and asserting the hash moves.
 */
export function renderFingerprint(spec: RenderSpec): string {
  return createHash("sha256").update(canonicalRenderSpec(spec)).digest("hex")
}
