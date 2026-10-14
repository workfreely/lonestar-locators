import { HiStar } from "react-icons/hi2"
import type { ReactNode } from "react"
import { notFound } from "next/navigation"
import { Inter } from "next/font/google"
import { createClient } from "@/lib/supabase/server"
import { mergeSmartFormConfig } from "@/app/smart-lead-form/_lib/mergeConfig"
import { youtubeEmbedUrl } from "@/lib/smartForm/thankYouVideo"
import { buildThankYouSteps, buildThankYouIntro } from "@/lib/smartForm/thankYouSteps"
import { thankYouMediaToShow } from "@/lib/smartForm/thankYouMedia"
import { serviceAreasLabelCanonical } from "@/lib/markets/catalog"
import { clientHeroImage } from "@/lib/clientShare/heroImage"
import Footer from "@/app/smart-lead-form/_components/form/sections/Footer"
import AgentSignature from "@/components/clientShare/AgentSignature"

// Client-facing legal/identity footer treatment, reused verbatim from the
// Recommendations page (/r/[token]): the shared Footer in `compact` mode, scoped so
// "Powered by Locator Beast" is non-clickable, Privacy/Terms are hidden (kept off the
// client footer intentionally), and the two TREC disclosures wrap cleanly with no
// dangling separator on mobile. Mirrors the `.lbr-legal` rules on /r.
import ThankYouView from "@/components/thankYou/ThankYouView"

type PublicForm = {
  agent_name: string
  brokerage_name: string | null
  photo_url: string | null
  form_config: unknown
  service_areas: string[] | null
  agent_phone: string | null
  agent_email: string | null
}

export default async function SmartLeadFormThankYouPage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>
  searchParams: Promise<{ firstName?: string; city?: string }>
}) {
  const { username } = await params
  const { firstName, city } = await searchParams

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("lb_resolve_public_form", { p_username: username })
  const form = (Array.isArray(data) ? data[0] : data) as PublicForm | undefined
  if (error || !form) notFound()

  const name = (firstName ?? "").trim()
  const where = (city ?? "").trim()
  // Hero photograph = the CLIENT's submitted search city, resolved only through
  // the canonical market/theme catalog (never an arbitrary path), with the
  // generic SKYLINE_PATH as the guaranteed fallback for unknown/imageless cities.
  const heroImg = clientHeroImage(where)
  const agentName = (form.agent_name ?? "").trim() || "Your local locator"
  const brokerage = (form.brokerage_name ?? "").trim()

  const config = mergeSmartFormConfig(form.form_config)
  // WHAT THIS PAGE SHOWS. Testimonials by default; video when the agent chose it, or when they
  // configured one before this control existed (see resolveThankYouMedia). Either way the block
  // renders only when there is something real to render: no empty cards, no broken player.
  const media = thankYouMediaToShow({
    thankYouMedia: config.thankYouMedia,
    thankYouVideoUrl: config.thankYouVideoUrl,
    testimonials: config.copy?.testimonials,
  })
  const embedUrl = media.media === "video" && media.show ? youtubeEmbedUrl(config.thankYouVideoUrl) : null
  const showTestimonials = media.media === "testimonials" && media.show
  const title = (config.copy.agentTitle ?? "").trim() || "Apartment Locator"
  const intro = buildThankYouIntro(config.thankYouIntro, { firstName: name, city: where })

  const steps = buildThankYouSteps({
    agentName: form.agent_name ?? "",
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
  })

  // The ENTIRE presentation lives in ThankYouView, which the editor preview renders too, so the
  // two can never drift. This page's only job is resolving the agent, the renter's details and
  // which media to show.
  return (
    <ThankYouView
      name={name}
      intro={intro}
      heroImg={heroImg}
      agentName={agentName}
      brokerage={brokerage}
      title={title}
      photoUrl={form.photo_url ?? null}
      agentPhone={form.agent_phone ?? null}
      steps={steps}
      testimonials={media.testimonials}
      embedUrl={embedUrl}
      showTestimonials={showTestimonials}
      config={config}
    />
  )
}
