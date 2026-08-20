import type { SmartLeadFormConfig } from "./types"

export type AgentPhotoSize = SmartLeadFormConfig["branding"]["agentPhotoSize"]

// Single source of truth for the agent photo — and, because the photo overlaps
// the hero's bottom edge, for the two spacing values that depend on it.
//
// The photo is responsive: it carries more of the page's personality than
// anything else on it, so it is deliberately large on a phone and larger again
// on desktop rather than one size reused at both. Every value below is derived
// from one number per breakpoint:
//
//   box                    96 / 112 · 128 / 160 · 168 / 208  (mobile / desktop)
//   overlap  = box ÷ 2     the photo straddles the hero edge by exactly half
//   heroPad  = overlap+28  Hero's bottom padding: the overlap plus a constant
//                          28px gap, so the space between Highlights and the
//                          photo stays identical at every size
//   pullUp   = −overlap    AgentProfile's negative top margin
//
// These were inline styles computed from a rem number, which cannot vary by
// breakpoint. They are precomputed class strings instead — literal, so Tailwind
// sees them — which is what makes a responsive photo possible at all. Change a
// box size here and its overlap, hero padding and pull-up must change with it.
export const AGENT_PHOTO_SIZES: Record<
  AgentPhotoSize,
  { boxClass: string; initialsClass: string; heroPadClass: string; pullUpClass: string }
> = {
  small: {
    boxClass: "h-[96px] w-[96px] sm:h-[112px] sm:w-[112px]",
    initialsClass: "text-[30px] sm:text-[36px]",
    heroPadClass: "pb-[76px] sm:pb-[84px]", // 48+28 / 56+28
    pullUpClass: "-mt-[48px] sm:-mt-[56px]",
  },
  medium: {
    boxClass: "h-[128px] w-[128px] sm:h-[160px] sm:w-[160px]",
    initialsClass: "text-[40px] sm:text-[50px]",
    heroPadClass: "pb-[92px] sm:pb-[108px]", // 64+28 / 80+28
    pullUpClass: "-mt-[64px] sm:-mt-[80px]",
  },
  large: {
    boxClass: "h-[168px] w-[168px] sm:h-[208px] sm:w-[208px]",
    initialsClass: "text-[52px] sm:text-[64px]",
    heroPadClass: "pb-[112px] sm:pb-[132px]", // 84+28 / 104+28
    pullUpClass: "-mt-[84px] sm:-mt-[104px]",
  },
}

/** Hero's bottom padding when Agent Information is hidden — no photo to overlap. */
export const HERO_PAD_NO_PHOTO_CLASS = "pb-8"
