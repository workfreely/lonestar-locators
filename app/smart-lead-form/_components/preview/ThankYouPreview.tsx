"use client"

import { useMemo } from "react"
import ThankYouView from "@/components/thankYou/ThankYouView"
import { buildThankYouSteps, buildThankYouIntro } from "@/lib/smartForm/thankYouSteps"
import { thankYouMediaToShow } from "@/lib/smartForm/thankYouMedia"
import { youtubeEmbedUrl } from "@/lib/smartForm/thankYouVideo"
import { clientHeroImage } from "@/lib/clientShare/heroImage"
import type { SmartLeadFormConfig } from "../../_lib/types"

// SAMPLE RENTER, clearly not a real person. Used only to personalise the preview greeting and to
// pick a hero skyline; nothing about it is written anywhere. The agent sees exactly what a renter
// called Alex searching San Antonio would see.
const SAMPLE_FIRST_NAME = "Alex"
const SAMPLE_CITY = "San Antonio"

/**
 * The Thank You page, previewed from UNSAVED editor state.
 *
 * It renders the SAME ThankYouView the public page renders and derives its props with the SAME
 * functions — buildThankYouIntro, buildThankYouSteps, thankYouMediaToShow, youtubeEmbedUrl,
 * clientHeroImage. Nothing about the page's rendering is reimplemented here, so a change to the
 * real page changes the preview automatically.
 *
 * DISPLAY ONLY. No form, no submit, no fetch, no analytics: it is a pure function of the config
 * object currently in the editor. A preview can therefore never create a lead, send a message,
 * enrol anyone, or write to the CRM.
 */
export default function ThankYouPreview({
  config,
  agentName,
  brokerage,
  photoUrl,
  agentPhone,
}: {
  config: SmartLeadFormConfig
  agentName: string
  brokerage: string
  photoUrl: string | null
  agentPhone: string | null
}) {
  const view = useMemo(() => {
    const media = thankYouMediaToShow({
      thankYouMedia: config.thankYouMedia,
      thankYouVideoUrl: config.thankYouVideoUrl,
      testimonials: config.copy?.testimonials,
    })
    return {
      intro: buildThankYouIntro(config.thankYouIntro, { firstName: SAMPLE_FIRST_NAME, city: SAMPLE_CITY }),
      steps: buildThankYouSteps({
        agentName,
        brokerage,
        step2Title: config.thankYouStep2Title,
        step2Body: config.thankYouStep2Body,
        step3Title: config.thankYouStep3Title,
        step3Body: config.thankYouStep3Body,
        step4Title: config.thankYouStep4Title,
        applyInstructions: config.thankYouApplyInstructions,
        showReward: config.thankYouShowReward,
        rewardTitle: config.thankYouRewardTitle,
        incentive: config.thankYouIncentive,
      }),
      media,
      // Only resolved when a video is actually what this page shows, exactly as the public page.
      embedUrl: media.media === "video" && media.show ? youtubeEmbedUrl(config.thankYouVideoUrl) : null,
      showTestimonials: media.media === "testimonials" && media.show,
      heroImg: clientHeroImage(SAMPLE_CITY),
    }
  }, [config, agentName, brokerage])

  return (
    <ThankYouView
      name={SAMPLE_FIRST_NAME}
      intro={view.intro}
      heroImg={view.heroImg}
      agentName={agentName}
      brokerage={brokerage}
      title={(config.copy.agentTitle ?? "").trim() || "Apartment Locator"}
      photoUrl={photoUrl}
      agentPhone={agentPhone}
      steps={view.steps}
      testimonials={view.media.testimonials}
      embedUrl={view.embedUrl}
      showTestimonials={view.showTestimonials}
      config={config}
    />
  )
}
