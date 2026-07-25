import type { SmartLeadFormConfig } from "../../../_lib/types"
import { getHeroTheme } from "../../../_lib/heroThemes"
import { agentPhotoOverlapRem } from "../../../_lib/agentPhotoSizes"
import Highlights from "./Highlights"

const OVERLAY_OPACITY: Record<SmartLeadFormConfig["branding"]["heroOverlay"], string> = {
  light: "bg-black/30",
  medium: "bg-black/55",
  dark: "bg-black/75",
}

// Breathing room between the bottom of Highlights (or the subheadline, if
// Highlights are hidden) and the top of the overlapping Agent Photo. Added
// on top of the photo's own overlap amount below, so this gap stays
// constant no matter which photo size is selected.
const HERO_TO_PHOTO_GAP_PX = 28
// Used instead when Agent Information is hidden entirely — there's no
// photo to overlap into, so this is just a normal bottom padding.
const HERO_BOTTOM_PADDING_PX = 32

// Hero, Highlights, and the overlapping Agent Photo (rendered by
// AgentProfile immediately after this component) are one composed hero
// unit — see the note in types.ts. Highlights render on the dark
// background here so the overlapping photo below always straddles the
// hero's own bottom edge, never a separate white section.
export default function Hero({ config }: { config: SmartLeadFormConfig }) {
  const { headline, subheadline } = config.copy
  const { heroTheme, heroImageUrl, heroOverlay, logoUrl, agentPhotoSize } = config.branding
  const { highlights: showHighlights, agentProfile: showAgentProfile } = config.sections.visibility

  // "custom" uses the locator's own upload; any built-in theme uses its
  // bundled default image once that photography exists.
  const backgroundUrl = heroTheme === "custom" ? heroImageUrl : getHeroTheme(heroTheme).defaultImageUrl

  const heroBottomPadding = showAgentProfile
    ? `calc(${agentPhotoOverlapRem(agentPhotoSize)}rem + ${HERO_TO_PHOTO_GAP_PX}px)`
    : `${HERO_BOTTOM_PADDING_PX}px`

  return (
    <section
      className="relative overflow-hidden bg-[#0b0f1a] px-5 pt-9 text-center text-white sm:px-8 sm:pt-12"
      style={{ paddingBottom: heroBottomPadding }}
    >
      {backgroundUrl && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={backgroundUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className={`absolute inset-0 ${OVERLAY_OPACITY[heroOverlay]}`} />
        </>
      )}

      <div className="relative mx-auto max-w-lg">
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" className="mx-auto mb-4 h-8 w-auto object-contain" />
        )}

        <h1 className="text-[28px] font-semibold leading-[1.15] tracking-tight sm:text-[38px]">{headline}</h1>
        <p className="mx-auto mt-2.5 max-w-md text-[15px] leading-relaxed text-white/80 sm:text-[17px]">
          {subheadline}
        </p>

        {showHighlights && (
          <div className="mt-5">
            <Highlights config={config} />
          </div>
        )}
      </div>
    </section>
  )
}
