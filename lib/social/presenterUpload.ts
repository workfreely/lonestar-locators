// AVATAR UPLOAD — what the renderer will actually accept, decided in one place.
//
// This module holds NO rendering logic and changes none. It answers a narrower question: given a
// file an operator picked, will lib/social/renderVideo.ts composite it as a person or as a box?
//
// ── WHY A FORMAT WHITELIST AND NOT A MIME SNIFF ─────────────────────────────────────────────
// The renderer's transparency depends on the DECODER, not on the container's advertised type.
// decoderForPresenterClip() in presenterSpec.ts is the authority: ".webm" gets libvpx-vp9 because
// FFmpeg's native vp9 decoder silently discards alpha, and everything else gets the default. So
// the accepted set below is derived from what that function can produce a decoder for — a format
// it does not special-case, and whose alpha the default decoder cannot read, would upload fine and
// then render as an opaque rectangle.
//
// ── WHY AN MP4 IS REFUSED RATHER THAN CONVERTED ─────────────────────────────────────────────
// An MP4 has no alpha channel. Composited, it is a rectangle; faded, it becomes a BLACK rectangle
// growing where the avatar was, because the fade in buildPresenterFilter() acts on the alpha
// channel. That is a silently wrong render rather than an error, which is the worst outcome
// available here — so it is refused at the door with a message that says what to export instead.
import { decoderForPresenterClip } from "@/lib/social/presenterSpec"

/**
 * Upload bounds.
 *
 * maxBytes is 40 MB. A HeyGen 1080p transparent WebM of the supported 3-5s runs 1-3 MB, so this
 * is generous for the intended path while staying small enough that the validating server can
 * DOWNLOAD the stored object to probe it without holding a serverless function open. An alpha
 * ProRes 4444 master of the same length is far larger than this; the message says to export WebM.
 */
export const PRESENTER_UPLOAD = {
  maxBytes: 40 * 1024 * 1024,
  /** Lowercase, no leading dot. Both are formats whose alpha the renderer can actually read. */
  acceptedExtensions: ["webm", "mov"] as const,
  /** For the file picker only. Never trusted as evidence — browsers disagree and clients lie. */
  acceptAttribute: "video/webm,video/quicktime,.webm,.mov",
  storagePrefix: "presenters",
} as const

export type PresenterExt = (typeof PRESENTER_UPLOAD.acceptedExtensions)[number]

/** The extension, lowercased and stripped of anything that is not a letter or digit. */
export function extensionOf(filename: string): string {
  const base = filename.slice(filename.lastIndexOf("/") + 1)
  const dot = base.lastIndexOf(".")
  if (dot < 0) return ""
  return base.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "")
}

export type FormatVerdict =
  | { ok: true; ext: PresenterExt }
  | { ok: false; reason: "no_extension" | "unsupported_format"; detail: string }

/**
 * Is this filename one the renderer can composite with transparency?
 *
 * MP4 is named explicitly in its own rejection message because it is the format an operator is
 * most likely to try, and "unsupported" alone would not tell them the fix.
 */
export function checkPresenterFormat(filename: string): FormatVerdict {
  const ext = extensionOf(filename)
  if (!ext) return { ok: false, reason: "no_extension", detail: "That file has no extension, so there is no way to tell what it is." }
  if ((PRESENTER_UPLOAD.acceptedExtensions as readonly string[]).includes(ext)) {
    return { ok: true, ext: ext as PresenterExt }
  }
  if (ext === "mp4" || ext === "m4v") {
    return {
      ok: false,
      reason: "unsupported_format",
      detail: "An MP4 has no transparency, so the avatar would composite as a solid rectangle and fade to black. Export a transparent WebM instead — in HeyGen that is the “transparent background” option.",
    }
  }
  return {
    ok: false,
    reason: "unsupported_format",
    detail: `“.${ext}” is not a format the renderer can read transparency from. Upload a transparent WebM (HeyGen’s transparent export) or an alpha-bearing MOV.`,
  }
}

/** Over the size limit? Returns null when fine, else a ready-to-show message. */
export function checkPresenterSize(bytes: number): string | null {
  if (!Number.isFinite(bytes) || bytes <= 0) return "That file is empty."
  if (bytes > PRESENTER_UPLOAD.maxBytes) {
    const mb = (bytes / (1024 * 1024)).toFixed(1)
    const cap = PRESENTER_UPLOAD.maxBytes / (1024 * 1024)
    return `That file is ${mb} MB, over the ${cap} MB limit. A transparent WebM of 3-5 seconds is normally a few MB.`
  }
  return null
}

/**
 * The storage key for an uploaded avatar clip.
 *
 * Owner-scoped and under presenters/, which is a DERIVATIVE prefix — the same place the sample
 * stand-in lives.
 *
 * ── WHY THE ID IS SANITISED AND WHY "source" IS SPECIAL ─────────────────────────────────────
 * An original master is identified BY ITS FILENAME — `storage.filename(name) like 'source.%'` is
 * the exact predicate of the restrictive RLS policy, and isSourceObjectPath() is its twin. So an
 * id of "source" would produce `{owner}/presenters/source.webm`, a key that LOOKS like a protected
 * master: assertDisposablePath would throw on the cleanup path, and the discard that is supposed
 * to run on every failure would itself fail. Callers pass crypto.randomUUID() and could never hit
 * it — but the helper guarantees the property rather than trusting that, because the guarantee is
 * what the storage protection rests on.
 */
export function presenterStorageKey(ownerUserId: string, ext: string, id: string): string {
  const safeId = id.toLowerCase().replace(/[^a-z0-9-]/g, "") || "clip"
  // Never a filename the source-video predicate would claim.
  const finalId = safeId === SOURCE_RESERVED_ID || safeId.startsWith(`${SOURCE_RESERVED_ID}`) ? `clip-${safeId}` : safeId
  return `${ownerUserId}/${PRESENTER_UPLOAD.storagePrefix}/${finalId}.${ext}`
}

/** The one filename stem the storage policy reserves for original masters. */
const SOURCE_RESERVED_ID = "source"

/**
 * Is a storage key one THIS owner may register as their presenter clip?
 *
 * Checked server-side on a path the client supplied, because the client chose where to upload.
 * Three conditions, all required: the owner's own prefix, the presenters/ subdirectory, and an
 * accepted extension. Without the first a caller could register another agent's object; without
 * the second they could point the renderer at an original master.
 */
export function isOwnedPresenterKey(path: string, ownerUserId: string): boolean {
  if (!path || !ownerUserId) return false
  if (path.includes("..") || path.startsWith("/")) return false
  const expectedPrefix = `${ownerUserId}/${PRESENTER_UPLOAD.storagePrefix}/`
  if (!path.startsWith(expectedPrefix)) return false
  // Exactly one segment after the prefix — no nested paths to reason about.
  const rest = path.slice(expectedPrefix.length)
  if (!rest || rest.includes("/")) return false
  // A filename the source-video predicate would claim is refused even here, inside presenters/.
  // Without this a client could upload `presenters/source.webm`, and then the discard that runs on
  // every failure would throw in assertDisposablePath instead of cleaning up.
  if (rest.toLowerCase().startsWith(`${SOURCE_RESERVED_ID}.`)) return false
  return (PRESENTER_UPLOAD.acceptedExtensions as readonly string[]).includes(extensionOf(rest))
}

// ── TRANSPARENCY, PROVEN RATHER THAN ASSUMED ────────────────────────────────────────────────
//
// The ONLY reliable server-side signal is the pixel format FFmpeg reports WHEN DECODING WITH THE
// SAME DECODER THE RENDERER USES. Measured on the real sample clip:
//
//   ffmpeg -i sample.webm                     -> yuv420p    (native decoder, alpha DISCARDED)
//   ffmpeg -c:v libvpx-vp9 -i sample.webm     -> yuva420p   (what the renderer actually sees)
//
// So a probe that omits the decoder flag reports NO alpha on a perfectly good transparent clip.
// That is why decoderArgsFor() exists and why it reads decoderForPresenterClip rather than
// hardcoding a flag: if the renderer's decoder choice ever changes, this check follows it.
//
// Scanning the container for Matroska's AlphaMode element (EBML id 0x53C0) was the other
// candidate and was rejected: those two bytes occur by coincidence inside compressed frame data —
// five times in the 153 KB sample alone — so a byte search yields false positives, and parsing
// EBML properly is a lot of new surface for a fact the decoder already states.

/** Pixel formats that carry an alpha channel, as FFmpeg names them. */
export function isAlphaPixFmt(pixFmt: string): boolean {
  const f = pixFmt.trim().toLowerCase()
  if (!f) return false
  if (f.startsWith("yuva")) return true          // yuva420p, yuva444p10le, …
  if (f.startsWith("gbrap")) return true         // gbrap, gbrap10le, …
  if (f === "ya8" || f === "ya16le" || f === "ya16be") return true
  return ["rgba", "bgra", "argb", "abgr", "rgba64le", "rgba64be", "bgra64le", "bgra64be"].includes(f)
}

/** The decoder arguments to put BEFORE `-i`, or [] when the format needs none. */
export function decoderArgsFor(filename: string): string[] {
  const decoder = decoderForPresenterClip(filename)
  return decoder ? ["-c:v", decoder] : []
}

/**
 * The pixel format on the first video stream of an `ffmpeg -i` stderr banner.
 *
 * Reads the field AFTER the codec name on the Video line, which is where FFmpeg prints it:
 *   Stream #0:0: Video: vp9 (Profile 0), yuva420p(tv, progressive), 720x1080, …
 * Any parenthesised suffix is dropped, so "yuva420p(tv, progressive)" yields "yuva420p".
 */
export function pixFmtFromProbe(stderr: string): string | null {
  const line = /Stream #\d+:\d+.*:\s*Video:\s*(.*)/.exec(stderr)?.[1]
  if (!line) return null
  // Fields are comma-separated; the codec (which may itself carry "(Profile 0)") is first.
  const fields = line.split(",").map((s) => s.trim())
  for (const f of fields.slice(1)) {
    const token = f.split("(")[0].trim().toLowerCase()
    if (/^[a-z0-9]+$/.test(token) && (isAlphaPixFmt(token) || /^(yuv|rgb|bgr|gray|pal|nv|p0|gbr|ya)/.test(token))) {
      return token
    }
  }
  return null
}

export type TransparencyVerdict =
  | { ok: true; pixFmt: string }
  | { ok: false; reason: "no_video_stream" | "unreadable" | "no_alpha"; pixFmt: string | null; detail: string }

/** Decide transparency from a probe's stderr. Pure, so the decision is testable without ffmpeg. */
export function checkTransparency(stderr: string): TransparencyVerdict {
  if (!/Stream #\d+:\d+.*:\s*Video:/.test(stderr)) {
    return { ok: false, reason: "no_video_stream", pixFmt: null, detail: "That file has no video stream the renderer can read." }
  }
  const pixFmt = pixFmtFromProbe(stderr)
  if (!pixFmt) {
    return { ok: false, reason: "unreadable", pixFmt: null, detail: "The renderer could not determine this clip's pixel format." }
  }
  if (!isAlphaPixFmt(pixFmt)) {
    return {
      ok: false,
      reason: "no_alpha",
      pixFmt,
      detail: `This clip has no transparency (${pixFmt}). The avatar would composite as a solid rectangle and fade to black. In HeyGen, choose the transparent WebM export.`,
    }
  }
  return { ok: true, pixFmt }
}

/** A label for a newly uploaded presenter, derived from the filename. Never empty. */
export function labelFromFilename(filename: string, fallback = "My Avatar"): string {
  const base = filename.slice(filename.lastIndexOf("/") + 1).replace(/\.[^.]+$/, "")
  const cleaned = base.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120)
  return cleaned || fallback
}
