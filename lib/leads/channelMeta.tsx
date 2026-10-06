// ONE source of truth for the marketing-CHANNEL icon + label used across Analytics: Lead Sources,
// Campaigns, the Meta publisher-platform rows and the Leads This Month legend.
//
// WHY NOT lib/social/platformMeta. That helper is Social Beast's and covers exactly three platforms
// (instagram / tiktok / youtube) with an Instagram FALLBACK — correct there, where every row really
// is one of those three, and wrong here, where a "website" or "referral" lead would silently render
// an Instagram mark. Extending it would change Social Beast's behaviour to serve Analytics, so this
// is a separate map that REUSES the identical react-icons/si marks for the platforms the two share.
// Social Beast is untouched; the two surfaces show the same logo for the same platform by
// construction.
//
// Colours are NOT re-invented either: they come from lib/leads/sourceStyles, the canonical module
// the badges and bars already read, so a channel's accent cannot drift between the icon and the bar
// beside it.

import type { IconType } from "react-icons"
import { SiInstagram, SiTiktok, SiYoutube, SiFacebook, SiGoogle } from "react-icons/si"
import { FiGlobe, FiUsers, FiNavigation, FiMail, FiHelpCircle } from "react-icons/fi"
import { MdQrCode2 } from "react-icons/md"
import { getSourceStyle } from "@/lib/leads/sourceStyles"
import type { Channel } from "@/lib/leads/resolveChannel"

/** Icon per canonical channel. Brand marks for real platforms; neutral Feather glyphs for the
 *  concepts (website / referral / direct / email / qr / unknown) that have no logo. */
const CHANNEL_ICON: Record<Channel, IconType> = {
  instagram: SiInstagram,
  tiktok: SiTiktok,
  youtube: SiYoutube,
  facebook: SiFacebook,
  google: SiGoogle,
  website: FiGlobe,
  referral: FiUsers,
  direct: FiNavigation,
  email: FiMail,
  qr: MdQrCode2,
  manual: FiHelpCircle,
  unknown: FiHelpCircle,
}

/**
 * Meta publisher-platform tokens → canonical channels, so the Meta Sales rows get the SAME mark as
 * Lead Sources. Meta's site_source_name values are short ("ig", "fb"); without this the raw token
 * matched nothing and fell to the neutral glyph.
 *
 * Only fb/ig are aliased, deliberately: "msg" (Messenger) and "an" (Audience Network) are real,
 * distinct surfaces with no channel of their own, and forcing them into Facebook would mislabel
 * them — the same reason lib/meta/publisherPlatform refuses to collapse unknown tokens. They keep
 * the neutral glyph and their own full label. Meta has no TikTok surface, and a literal "tiktok"
 * value already resolves directly.
 *
 * Mirrors the aliasing lib/leads/attribution.normalizeSource already applies to utm_source.
 */
const TOKEN_ALIAS: Record<string, Channel> = { ig: "instagram", fb: "facebook" }

export type ChannelMeta = { label: string; Icon: IconType; color: string }

/**
 * Label + icon + accent colour for a channel. Case-insensitive, and an unrecognised value resolves
 * to the neutral `unknown` mark rather than a misleading brand logo.
 *
 * The LABEL comes from sourceStyles so it matches the badge text elsewhere in the CRM exactly.
 */
export function channelMeta(channel: string | null | undefined): ChannelMeta {
  const raw = (channel ?? "").trim().toLowerCase()
  const key = TOKEN_ALIAS[raw] ?? raw
  const Icon = CHANNEL_ICON[key as Channel] ?? FiHelpCircle
  const style = getSourceStyle(key || "unknown")
  return { label: style.label, Icon, color: style.color }
}

/**
 * The shared icon + label row used by every Analytics surface.
 *
 * `dim` renders an INACTIVE channel (zero leads) at reduced opacity while keeping its real icon and
 * label, so the legend still reads "Instagram / TikTok / Facebook / Website / YouTube" rather than
 * collapsing into anonymous grey dots.
 *
 * The icon is the primary identifier and the brand colour is a restrained accent — no filled
 * bubbles, no oversized marks.
 */
export default function ChannelLabel({
  channel,
  size = 13,
  dim = false,
  showLabel = true,
  label: labelOverride,
  className = "",
}: {
  channel: string | null | undefined
  size?: number
  dim?: boolean
  showLabel?: boolean
  /** Override the canonical label. Used only by the compact Leads This Month legend, which keeps
   *  its existing abbreviations ("Web", "FB", "IG", "YT") so five entries still fit one KPI card
   *  without reflowing it. The icon carries the identity either way. */
  label?: string
  className?: string
}) {
  const meta = channelMeta(channel)
  const { Icon, color } = meta
  const label = labelOverride ?? meta.label
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap ${dim ? "opacity-45" : ""} ${className}`}
      title={label}
    >
      <Icon className="flex-none" size={size} color={color} aria-hidden />
      {showLabel && <span>{label}</span>}
    </span>
  )
}
