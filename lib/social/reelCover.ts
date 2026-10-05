// Social Beast — which cover a Reel publishes with.
//
// Three callers need this answer and must never disagree: the manual publish route, the cron
// worker, and the dry run that claims to preview what those two will send. So the decision lives
// here once, as a pure function over the two stored columns.
//
// PRECEDENCE: a custom cover wins over a chosen frame. Instagram happens to resolve cover_url over
// thumb_offset the same way when both are present, but we send exactly ONE — the request should
// state the intent rather than lean on somebody else's tie-break, and a dry run that showed both
// could not honestly say which one took effect.

/** The single cover parameter that will be attached to the container request. */
export type ReelCover =
  /** cover_url — a signed URL to an uploaded image. */
  | { kind: "url"; url: string }
  /** thumb_offset — milliseconds into the RENDERED video. */
  | { kind: "offset"; ms: number }

/** What the stored columns resolve to, before any signing happens. "custom" still needs a signed
 *  URL; "offset" is ready to send; "none" means Instagram picks, which is the pre-existing
 *  behaviour and perfectly valid. */
export type CoverChoice =
  | { kind: "custom"; path: string }
  | { kind: "offset"; ms: number }
  | { kind: "none" }

/**
 * Decide the cover from the two stored values.
 *
 * A custom cover wins whenever it is present. An offset is used only when it is a finite,
 * non-negative integer — a NaN or negative value is treated as "not chosen" rather than sent to
 * Meta, because a rejected container is a worse outcome than Instagram's default frame.
 */
export function chooseCover(
  coverStoragePath: string | null | undefined,
  coverThumbOffsetMs: number | null | undefined,
): CoverChoice {
  const path = typeof coverStoragePath === "string" ? coverStoragePath.trim() : ""
  if (path) return { kind: "custom", path }

  const ms = coverThumbOffsetMs
  if (typeof ms === "number" && Number.isFinite(ms) && ms >= 0) {
    return { kind: "offset", ms: Math.round(ms) }
  }
  return { kind: "none" }
}

/** A human-readable description of what will be sent — used by the dry run so the preview names
 *  the actual parameter, not just "a cover". */
export function describeCover(choice: CoverChoice): string {
  switch (choice.kind) {
    case "custom":
      return "cover_url (custom uploaded cover)"
    case "offset":
      return `thumb_offset (${choice.ms}ms into the rendered video)`
    default:
      return "none — Instagram selects the cover frame"
  }
}

/**
 * Resolve a CoverChoice into the parameter to send, signing a custom cover if needed.
 *
 * `sign` returns a time-limited URL for a private-bucket object, exactly as the video_url is
 * handled. A custom cover that cannot be signed returns null rather than falling back to the
 * offset: silently publishing a different cover than the one chosen is worse than letting
 * Instagram pick, and the caller surfaces the failure.
 */
export async function resolveReelCover(
  choice: CoverChoice,
  sign: (path: string) => Promise<string | null>,
): Promise<ReelCover | null> {
  if (choice.kind === "offset") return { kind: "offset", ms: choice.ms }
  if (choice.kind === "custom") {
    const url = await sign(choice.path)
    return url ? { kind: "url", url } : null
  }
  return null
}
