// THE shared contract for how a platform / source mark is drawn, wherever it appears.
//
// Before this, Social Beast's History and Sales Analytics each decided independently, and the two
// had already drifted: History drew a MONOCHROME mark that inherited the cell's text colour, while
// Analytics drew a COLOURED one — and the colours themselves disagreed, because lib/social/
// platformMeta carries true brand hex (Instagram #E4405F, TikTok #FE2C55) while lib/leads/
// sourceStyles carries the CRM's source identity hues (Instagram #a855f7, TikTok #f59e0b). The same
// platform looked like two different products on two screens.
//
// COLOUR COMES FROM sourceStyles, deliberately. That module is already the canonical vocabulary for
// every source badge, pill and bar in the CRM, so sourcing from it keeps an Instagram ICON the same
// hue as the Instagram BADGE sitting next to it. Standardising on platformMeta's brand hex instead
// would have fixed these two screens by breaking that agreement everywhere else.
//
// SIZING COMES FROM Social Beast's History row, which is the denser, more mature treatment: a 14px
// mark with a gap-1.5 and a 13px label. Analytics was a touch smaller (13px mark, 12px label).

import { getSourceStyle } from "@/lib/leads/sourceStyles"

/** Icon edge length in px. One number, used by every platform/source mark. */
export const PLATFORM_ICON_SIZE = 14

/**
 * The size for DENSE secondary rows — Social Beast's Queue draws its platform line at 11.5px, where
 * the standard 14px mark would out-weigh its own label and change the row's rhythm. Centralised
 * rather than left as a literal so the exception is itself a contract and cannot drift arbitrarily.
 */
export const PLATFORM_ICON_SIZE_COMPACT = 12

/** Tailwind gap between the mark and its label. */
export const PLATFORM_ICON_GAP = "gap-1.5"

/** Label type scale for a mark rendered inline with text. */
export const PLATFORM_LABEL_CLASS = "text-[13px]"

/**
 * Display colour for a platform/source mark.
 *
 * Accepts Social Beast's platform keys ("instagram", "tiktok", "youtube") and the Analytics channel
 * keys, since both resolve through the same canonical style module. An unknown key gets the neutral
 * fallback rather than a borrowed brand hue.
 */
export function platformIconColor(key: string | null | undefined): string {
  return getSourceStyle((key ?? "").trim().toLowerCase() || "unknown").color
}
