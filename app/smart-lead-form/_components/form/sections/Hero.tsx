import type { SmartLeadFormConfig } from "../../../_lib/types"
import { getHeroTheme } from "../../../_lib/heroThemes"
import { AGENT_PHOTO_SIZES, HERO_PAD_NO_PHOTO_CLASS } from "../../../_lib/agentPhotoSizes"
import Highlights from "./Highlights"
import AgentPhoto from "./AgentPhoto"
import AgentInfoText from "./AgentInfoText"

const OVERLAY_OPACITY: Record<SmartLeadFormConfig["branding"]["heroOverlay"], string> = {
  light: "bg-black/30",
  medium: "bg-black/55",
  dark: "bg-black/75",
}

// Hero, Highlights, and the overlapping Agent Photo (rendered by
// AgentProfile immediately after this component) are one composed hero
// unit — see the note in types.ts. Highlights render on the dark
// background here so the overlapping photo below always straddles the
// hero's own bottom edge, never a separate white section.
export default function Hero({ config }: { config: SmartLeadFormConfig }) {
  const { headline, subheadline } = config.copy
  const { heroTheme, heroImageUrl, heroOverlay, agentPhotoSize, profileImagePosition } = config.branding
  const { headline: showHeadline, highlights: showHighlights, agentProfile: showAgentProfile } = config.sections.visibility

  // "custom" uses the locator's own upload; any built-in theme uses its
  // bundled default image once that photography exists.
  const backgroundUrl = heroTheme === "custom" ? heroImageUrl : getHeroTheme(heroTheme).defaultImageUrl

  const showPhotoUnderHeadline = showAgentProfile && profileImagePosition === "underHeadline"
  const showOverlappingPhotoBelow = showAgentProfile && !showPhotoUnderHeadline

  // The overlap-plus-gap padding now varies by breakpoint along with the photo,
  // so it is a class rather than an inline style (see agentPhotoSizes.ts).
  const heroBottomPadding = showOverlappingPhotoBelow
    ? AGENT_PHOTO_SIZES[agentPhotoSize].heroPadClass
    : HERO_PAD_NO_PHOTO_CLASS

  // Subheadline and Highlights keep their own existing margin classes no
  // matter which order they render in — reordering them (Under Headline
  // only) never invents new spacing values, it just changes which
  // existing gap ends up next to which element.
  // The short promise — read as the OFFER (17px semibold, full white), not a
  // muted metadata line. Extra top gap separates it from the identity group.
  const subheadlineNode = (
    <p className="mx-auto mt-6 max-w-md break-words text-[17px] font-semibold leading-snug text-white">
      {subheadline}
    </p>
  )

  // Gap from the CTA offer line (subheadline "Get Your Free Custom Apartment
  // List") down to the highlights band. This single wrapper is the ONE rule for
  // that boundary in BOTH photo-position modes (Under Headline and Overlapping
  // both render subheadlineNode → highlightsNode in this file), so tightening it
  // here moves the highlights ~8px closer to the CTA in both — and only there;
  // it never touches the photo/identity spacing or the subheadline's own top gap.
  const highlightsNode = showHighlights && (
    <div className="mt-4">
      <Highlights config={config} />
    </div>
  )

  return (
    <section className={`relative overflow-hidden bg-[#0b0f1a] px-5 pt-5 text-center text-white sm:px-8 sm:pt-8 ${heroBottomPadding}`}>
      {backgroundUrl && (
        <>
          {/* This image is the hero's full-bleed backdrop, so it is above the fold on
              every viewport and is in fact the LCP element — measured on production at
              1040ms, with a paint area of ~199,000px² against the agent photo's
              ~25,000px². It was marked `loading="lazy"`, which does NOT delay discovery
              for an in-viewport image but does drop it to LOW fetch priority and
              suppresses the SSR preload React emits for eager images. Eager + high
              priority is simply the honest description of what this image is.

              Deliberately still a plain <img> rather than next/image: the source is
              already an optimised same-origin WebP (the theme catalog) or an agent's
              own upload, the box is a CSS-sized full-bleed backdrop with no intrinsic
              dimensions to hand the optimizer, and re-encoding it would change the
              visual the hero is built around. Priority was the defect; compression was
              not. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={backgroundUrl}
            alt=""
            fetchPriority="high"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className={`absolute inset-0 ${OVERLAY_OPACITY[heroOverlay]}`} />
        </>
      )}

      <div className="relative mx-auto max-w-lg">

        {/* Headline is optional — hiding it removes its space entirely so the
            hero collapses upward and the background image becomes the primary
            visual (image-focused style). */}
        {showHeadline && (
          <h1 className="text-balance break-words text-[clamp(22px,7vw,32px)] font-bold leading-[1.14] tracking-tight sm:text-[40px]">{headline}</h1>
        )}

        {showPhotoUnderHeadline ? (
          <>
            {/* Gap above the photo is conditional on the headline: a bit more
                breathing room under a visible headline (~27px); when the headline
                is hidden it isn't rendered at all (no leftover empty space) and
                the photo relies on the hero section's own pt-5 (~20px) for a
                compact, intentional top padding. */}
            <div className={`${showHeadline ? "mt-[27px]" : "mt-0"} flex justify-center`}>
              <AgentPhoto config={config} />
            </div>
            {/* Identity group (name · title · service areas) — one compact unit,
                separated from the photo above and the promise below. */}
            <div className="mt-6">
              <AgentInfoText config={config} theme="dark" />
            </div>
            {subheadlineNode}
            {highlightsNode}
          </>
        ) : (
          <>
            {subheadlineNode}
            {highlightsNode}
          </>
        )}
      </div>
    </section>
  )
}
