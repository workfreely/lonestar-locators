// Social Beast — per-platform safe areas, in 1080×1920 canvas units.
//
// The renderer always outputs the full 1080×1920 frame. What changes per platform is the box the
// HEADLINE IS FITTED INTO, because each app covers a different part of that frame with its own UI.
// Fitting to the raw canvas width is what put a published Reel's headline under Instagram's
// like/comment/share column.
//
// ── HOW THE INSTAGRAM NUMBERS WERE OBTAINED ─────────────────────────────────────────────────
// MEASURED from a real published Reel screenshot (1320×2868), not taken from a style guide.
// Instagram fits the 1080-wide frame to the screen width (scale 1.222), so screenshot pixels map
// directly to canvas pixels. The mapping was verified independently: the post's own burned-in
// overlay text resolved to canvas y 933–1064, exactly where the vertically-centred lockup sits.
//
//   engagement rail   icon column at screenshot x 1195–1267  ->  canvas x 978–1037
//   caption block     username row top at screenshot y 2152  ->  canvas y 1548
//   (caption 1649, "View insights" 1856, comment bar below the video entirely)
//
// The text box then takes 8px of clearance from the rail and 48px above the username row.
//
// ── TIKTOK IS PROVISIONAL ───────────────────────────────────────────────────────────────────
// Not measured. These come from published guidance and are deliberately flagged so nobody mistakes
// them for the same quality of evidence as the Instagram set. Replace them by measuring a real
// TikTok screenshot the same way. Instagram typography is NEVER shrunk to satisfy them — each
// platform fits to its own box.

export type SafeRect = { x: number; y: number; w: number; h: number }

// ── THE BOX MUST BE HORIZONTALLY SYMMETRIC ──────────────────────────────────────────────────
// Both renderers centre text on the CANVAS, not inside the box: FFmpeg uses x=(w-text_w)/2 and the
// CSS preview uses equal left/right margins. So a box whose centre is not 540 cannot be honoured —
// a line fitted to its width would still be drawn canvas-centred and would spill past the narrow
// side. (Caught in testing: an x110/w820 TikTok box put an 820px line at 130..950, 20px PAST its
// own 930 edge.) Keeping every box symmetric makes "fits the box" and "fits once centred" the same
// statement. assertSymmetric() below is called on every entry at module load.
function assertSymmetric(a: PlatformSafeArea): PlatformSafeArea {
  const right = SOCIAL_CANVAS.w - (a.text.x + a.text.w)
  if (right !== a.text.x) {
    throw new Error(`${a.id}: safe-area text box must be horizontally symmetric (left ${a.text.x}, right ${right})`)
  }
  return a
}

export type PlatformSafeArea = {
  id: string
  label: string
  /** Where headline/detail may be fitted. The only value the layout engine consumes. */
  text: SafeRect
  /** UI zones, for the editor overlay. Presentational only — the fitter never reads these. */
  zones: { label: string; rect: SafeRect; kind: "rail" | "caption" | "header" }[]
  /** False when the numbers are estimates rather than measurements. */
  measured: boolean
  source: string
}

export const SOCIAL_CANVAS = { w: 1080, h: 1920 } as const

const RAW: Record<string, PlatformSafeArea> = {
  instagram: {
    id: "instagram",
    label: "Instagram Reels",
    // x 110..970 (860 wide), y 150..1500 (1350 tall)
    text: { x: 110, y: 150, w: 860, h: 1350 },
    zones: [
      { label: "Engagement rail", kind: "rail", rect: { x: 978, y: 0, w: 1080 - 978, h: 1920 } },
      { label: "Caption / profile", kind: "caption", rect: { x: 0, y: 1548, w: 1080, h: 1920 - 1548 } },
      { label: "Header", kind: "header", rect: { x: 0, y: 0, w: 1080, h: 150 } },
    ],
    measured: true,
    source: "measured from a published Reel screenshot, 2026-10-05",
  },
  tiktok: {
    id: "tiktok",
    label: "TikTok",
    // Symmetric by construction: rail starts at x930, so the text edge stops at 922 and the
    // margin is 1080-922 = 158 on both sides. (The earlier x110/w820 draft was asymmetric and
    // would have overflowed — see assertSymmetric.)
    text: { x: 158, y: 160, w: 764, h: 1260 },
    zones: [
      { label: "Engagement rail", kind: "rail", rect: { x: 930, y: 0, w: 1080 - 930, h: 1920 } },
      { label: "Caption / profile", kind: "caption", rect: { x: 0, y: 1420, w: 1080, h: 1920 - 1420 } },
      { label: "Header", kind: "header", rect: { x: 0, y: 0, w: 1080, h: 160 } },
    ],
    measured: false,
    source: "PROVISIONAL — published guidance, not measured from a real post",
  },
}

export const PLATFORM_SAFE_AREAS: Record<string, PlatformSafeArea> =
  Object.fromEntries(Object.entries(RAW).map(([k, v]) => [k, assertSymmetric(v)]))

export const DEFAULT_PLATFORM = "instagram"

/** Resolve a platform id to its safe area. Anything unknown falls back to Instagram, which is the
 *  only publishing platform today and the only one whose numbers are measured. */
export function safeAreaFor(platform: string | null | undefined): PlatformSafeArea {
  return PLATFORM_SAFE_AREAS[(platform ?? "").toLowerCase()] ?? PLATFORM_SAFE_AREAS[DEFAULT_PLATFORM]
}

/** The horizontal room a headline may occupy on this platform. */
export function textAvailPx(platform: string | null | undefined): number {
  return safeAreaFor(platform).text.w
}

/** The side margin implied by the text box — used by the CSS preview so its box matches the width
 *  the fitter measured against. */
export function sideMarginPx(platform: string | null | undefined): number {
  return safeAreaFor(platform).text.x
}
