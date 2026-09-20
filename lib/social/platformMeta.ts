// Beast Social — ONE source of truth for the platform label + icon used across the Queue,
// History, and Calendar. Reuses the established react-icons/si marks (SiInstagram/SiTiktok/
// SiYoutube) so every surface shows the exact same platform identity from the post's ACTUAL
// persisted `platform` (never a hard-coded "Instagram"). Lookup is case-insensitive, so both
// stored keys ("instagram") and display strings ("Instagram") resolve.
import { SiInstagram, SiTiktok, SiYoutube } from "react-icons/si"
import type { IconType } from "react-icons"

export const PLATFORM_META: Record<string, { label: string; Icon: IconType }> = {
  instagram: { label: "Instagram", Icon: SiInstagram },
  tiktok: { label: "TikTok", Icon: SiTiktok },
  youtube: { label: "YouTube", Icon: SiYoutube },
}

export const platformMeta = (p: string | null | undefined) =>
  PLATFORM_META[(p ?? "").toLowerCase()] ??
  { label: p ? p.charAt(0).toUpperCase() + p.slice(1) : "Instagram", Icon: SiInstagram }
