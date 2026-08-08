import type { SmartLeadFormConfig } from "./types"

export type AgentPhotoSize = SmartLeadFormConfig["branding"]["agentPhotoSize"]

// Single source of truth for the agent photo's box size, in rem so it
// stays proportional to the box classes below (h-16/h-20/h-24) regardless
// of root font size — a plain px value here would drift out of sync with
// those Tailwind classes. Hero.tsx reads agentPhotoOverlapRem (always
// exactly 50% of the box) to size its own bottom padding, so the gap
// between Highlights and the photo stays constant at every size.
export const AGENT_PHOTO_SIZES: Record<AgentPhotoSize, { boxRem: number; boxClass: string; initialsClass: string }> = {
  small: { boxRem: 5, boxClass: "h-20 w-20", initialsClass: "text-[26px]" },
  medium: { boxRem: 7, boxClass: "h-28 w-28", initialsClass: "text-[34px]" },
  large: { boxRem: 9, boxClass: "h-36 w-36", initialsClass: "text-[44px]" },
}

export function agentPhotoOverlapRem(size: AgentPhotoSize) {
  return AGENT_PHOTO_SIZES[size].boxRem / 2
}
