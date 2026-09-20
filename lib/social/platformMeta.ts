// Beast Social — ONE source of truth for the platform label + icon used across the Queue,
// History, and Calendar. Reuses the established react-icons/si marks (SiInstagram/SiTiktok/
// SiYoutube) so every surface shows the exact same platform identity from the post's ACTUAL
// persisted `platform` (never a hard-coded "Instagram"). Lookup is case-insensitive, so both
// stored keys ("instagram") and display strings ("Instagram") resolve.
import { SiInstagram, SiTiktok, SiYoutube } from "react-icons/si"
import type { IconType } from "react-icons"

// `color` is the recognizable brand hue for each platform, used ONLY where a colored logo is
// wanted (the Calendar events). Surfaces that want a theme-inheriting monochrome mark (Queue,
// History) simply ignore `color` and set their own text color — so this field is additive and
// changes nothing for them. Each hue is vivid enough to read on both light and dark themes.
export const PLATFORM_META: Record<string, { label: string; Icon: IconType; color: string }> = {
  instagram: { label: "Instagram", Icon: SiInstagram, color: "#E4405F" },
  tiktok: { label: "TikTok", Icon: SiTiktok, color: "#FE2C55" },
  youtube: { label: "YouTube", Icon: SiYoutube, color: "#FF0000" },
}

export const platformMeta = (p: string | null | undefined) =>
  PLATFORM_META[(p ?? "").toLowerCase()] ??
  { label: p ? p.charAt(0).toUpperCase() + p.slice(1) : "Instagram", Icon: SiInstagram, color: "#E4405F" }
