import type { ReactNode } from "react"
import { notFound } from "next/navigation"
import { Inter } from "next/font/google"
import { createClient } from "@/lib/supabase/server"
import { mergeSmartFormConfig } from "@/app/smart-lead-form/_lib/mergeConfig"
import { youtubeEmbedUrl } from "@/lib/smartForm/thankYouVideo"
import { buildThankYouSteps, buildThankYouIntro } from "@/lib/smartForm/thankYouSteps"
import { serviceAreasLabelCanonical } from "@/lib/markets/catalog"
import { clientHeroImage } from "@/lib/clientShare/heroImage"
import Footer from "@/app/smart-lead-form/_components/form/sections/Footer"
import AgentSignature from "@/components/clientShare/AgentSignature"

// Client-facing legal/identity footer treatment, reused verbatim from the
// Recommendations page (/r/[token]): the shared Footer in `compact` mode, scoped so
// "Powered by Locator Beast" is non-clickable, Privacy/Terms are hidden (kept off the
// client footer intentionally), and the two TREC disclosures wrap cleanly with no
// dangling separator on mobile. Mirrors the `.lbr-legal` rules on /r.
const TY_CSS = `
/* HERO — approved dark-navy directional treatment (shared with /r). The city
   PHOTOGRAPH is injected per-request via the --hero-img custom property (the
   client's SEARCH-city theme skyline, resolved by clientHeroImage), so the exact
   same navy gradient + fade wraps whichever city image resolves. A strong navy
   wash behind the left/text side smoothly reduces so the right/image side keeps
   the skyline's contrast. Not a uniform fog. */
.ty-hero{background-image:linear-gradient(90deg,rgba(9,25,48,.97) 0%,rgba(10,28,52,.90) 30%,rgba(12,32,60,.58) 56%,rgba(14,37,69,.16) 80%,rgba(14,37,69,0) 92%),var(--hero-img);background-size:cover;background-position:right 42%}
/* Mobile: adapt to the stacked composition — a diagonal so the top-left (heading) stays
   dark for white-text legibility while the lower-right keeps real skyline richness. */
@media (max-width:640px){
.ty-hero{background-image:linear-gradient(155deg,rgba(9,25,48,.97) 0%,rgba(10,28,52,.90) 40%,rgba(12,32,60,.60) 72%,rgba(14,37,69,.22) 100%),var(--hero-img);background-position:center 28%}
}
/* CLOSING CARD — force the whole card LEFT-aligned at every width. A global mobile
   rule (globals.css) centers bare <h2> and caps it to max-width:82% with margin:auto,
   which would inset/center the closing heading on phones; neutralize all three here
   (page-scoped) so "You're all set!" + body sit flush-left with the identity below. */
.ty-close{text-align:left}
.ty-close h2{max-width:none;margin-left:0;margin-right:0;text-align:left}
.ty-legal{padding:22px 26px 26px;margin-top:8px;border-top:1px solid #eef1f7}
.ty-legal a[href="https://locatorbeast.com"]{pointer-events:none;color:inherit;text-decoration:none;cursor:default}
.ty-legal span:has(> a[href="/privacy"]),.ty-legal span:has(> a[href="/terms"]){display:none}
.ty-legal span.basis-full{display:none}
.ty-legal .slf-compact a,.ty-legal .slf-compact span{font-size:13.5px!important}
@media (max-width:640px){
.ty-legal{padding:20px 16px 26px}
.ty-legal span:has(> a[target="_blank"]) > span[aria-hidden="true"]{display:none}
}
`

export const dynamic = "force-dynamic"

// Same family as the client Recommendations page (/r/[token]): Inter, deep navy
// typography, a treated skyline hero, rounded cards, restrained accents.
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], display: "swap" })

type PublicForm = {
  agent_name: string
  brokerage_name: string | null
  photo_url: string | null
  form_config: unknown
  service_areas: string[] | null
  agent_phone: string | null
  agent_email: string | null
}

// Renders a step body, bolding known emphasis substrings (e.g. the action to
// select + the agent/brokerage to list in the default apply step). Wraps each
// (first, non-overlapping) match in a real element — no HTML injection from
// config values, and never a link/color, just weight. UNCHANGED from before.
function renderBody(body: string, emphasis?: string[]) {
  const phrases = (emphasis ?? []).filter(Boolean)
  if (!phrases.length) return body
  const ranges = phrases
    .map((p) => [body.indexOf(p), p.length] as const)
    .filter(([i]) => i >= 0)
    .map(([i, len]) => [i, i + len] as [number, number])
    .sort((a, b) => a[0] - b[0])
  if (!ranges.length) return body
  const parts: ReactNode[] = []
  let cursor = 0
  let key = 0
  for (const [start, end] of ranges) {
    if (start < cursor) continue // skip overlaps
    if (start > cursor) parts.push(body.slice(cursor, start))
    parts.push(
      <strong key={key++} className="font-bold text-[#0e2545]">
        {body.slice(start, end)}
      </strong>,
    )
    cursor = end
  }
  if (cursor < body.length) parts.push(body.slice(cursor))
  return <>{parts}</>
}

/**
 * Post-submission confirmation for a per-agent Smart Lead Form, served at
 * locatorbeast.com/{username}/thank-you.
 *
 * PRESENTATION redesign only — the data model is unchanged: the intro, steps
 * 2/3/4 + application instructions, the optional reward step, and the optional
 * intro video all still come from the locator's saved Smart Lead Form config
 * (mergeSmartFormConfig + buildThankYouSteps/buildThankYouIntro). The number of
 * visible steps is dynamic (reward adds one; nothing is padded). Submission,
 * redirect, attribution and analytics are untouched — this page only renders.
 */
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
  const embedUrl = youtubeEmbedUrl(config.thankYouVideoUrl)
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

  const Timeline = () => (
    <div>
      <h2 className="text-left text-[22px] font-extrabold tracking-[-0.01em] text-[#0e2545] sm:text-[24px]">What Happens Next</h2>
      <ol className="mt-6">
        {steps.map((step, i) => {
          const isLast = i === steps.length - 1
          return (
            <li key={i} className="relative flex gap-4 pb-7 last:pb-0 sm:gap-5">
              {!isLast && (
                <span
                  className={`absolute left-[21px] top-[48px] bottom-1 w-[2px] rounded ${step.done ? "bg-[#bfe6cf]" : "bg-[#e7ebf2]"}`}
                  aria-hidden
                />
              )}
              {step.done ? (
                <span className="relative z-10 flex h-[44px] w-[44px] flex-none items-center justify-center rounded-full bg-[#1f9d55] text-white shadow-[0_6px_16px_-6px_rgba(31,157,85,0.7)]">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </span>
              ) : (
                <span className="relative z-10 flex h-[44px] w-[44px] flex-none items-center justify-center rounded-full bg-[#0e2545] text-[16px] font-extrabold text-white">
                  {i + 1}
                </span>
              )}
              <div className="min-w-0 pt-1.5">
                {step.done ? (
                  <div className="flex flex-wrap items-center gap-2.5">
                    <p className="text-[17px] font-bold text-[#0e2545] line-through decoration-2 decoration-[#6b7688] sm:text-[18px]">{step.title}</p>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e4f6ec] px-3 py-[5px] text-[11.5px] font-extrabold uppercase tracking-wide text-[#136c3a]">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                      Completed
                    </span>
                  </div>
                ) : (
                  <>
                    <p className="text-[17px] font-bold leading-snug text-[#0e2545] sm:text-[18px]">{step.title}</p>
                    <p className="mt-1.5 text-[15px] leading-relaxed text-[#4b5468] sm:text-[15.5px]">{renderBody(step.body, step.emphasis)}</p>
                  </>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )

  // Optional 9:16 intro video — restyled to sit naturally in the composition.
  // Collapses cleanly when absent (no empty column / placeholder).
  const Video = () => (
    <div className="overflow-hidden rounded-[20px] border border-[#e7ebf2] bg-black shadow-[0_18px_40px_-24px_rgba(14,37,69,0.5)]">
      <div className="aspect-[9/16] w-full">
        <iframe
          src={embedUrl!}
          title={`A message from ${agentName}`}
          className="h-full w-full"
          loading="lazy"
          allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
    </div>
  )

  // One intentional closing composition: the final client message + the dynamic
  // locator identity in a single polished card. No contact buttons.
  const ClosingCard = () => (
    <section className="ty-close mt-9 rounded-[20px] border border-[#e7ebf2] bg-[#f7f9fc] px-5 py-6 sm:px-7 sm:py-7">
      <h2 className="text-left text-[20px] font-extrabold tracking-[-0.01em] text-[#0e2545] sm:text-[22px]">
        You&apos;re all set!
      </h2>
      <p className="mt-2 text-[15px] leading-relaxed text-[#4b5468] sm:text-[15.5px]">
        Keep an eye on your texts and email. I&rsquo;ll reach out as soon as your recommendations are ready.
      </p>
      {/* Canonical shared agent signature (identical to the Recommendations page). */}
      <div className="mt-6 border-t border-[#e3e8f1] pt-6">
        <AgentSignature name={agentName} photoUrl={form.photo_url} title={title} brokerage={brokerage} serviceAreas={config.copy?.serviceAreas ?? null} />
      </div>
    </section>
  )

  // Intentional composition: a focused, centered confirmation card when there's no
  // video; a wider two-column layout when a video shares the row with the timeline.
  const shellMax = embedUrl ? "max-w-[1040px]" : "max-w-[720px]"

  // Brokerage flows into the shared Footer's identity row (Equal Housing · {brokerage}
  // · Powered by Locator Beast), same as /r.
  // Brokerage is shown ONCE in the agent signature above; blank it in the footer so the legal
  // identity row reads "Equal Housing · Powered by Locator Beast" (no duplicate brokerage).
  const footerConfig = { ...config, copy: { ...config.copy, brokerageName: "" } }

  return (
    <main className={`${inter.className} min-h-screen bg-[#f5f7fb] text-[#3a4658] antialiased`}>
      <style dangerouslySetInnerHTML={{ __html: TY_CSS }} />
      <div className={`mx-auto w-full ${shellMax} sm:px-6 sm:py-10`}>
        <div className="overflow-hidden bg-white sm:rounded-[26px] sm:border sm:border-[#e7ebf2] sm:shadow-[0_30px_80px_-50px_rgba(14,37,69,0.35)]">
          {/* ── HERO — treated skyline, personalized, configured intro ── */}
          <section
            className="ty-hero relative px-6 pt-11 pb-9 sm:px-12 sm:pt-12 sm:pb-10"
            style={{ ["--hero-img" as string]: `url('${heroImg}')` }}
          >
            <h1 className="max-w-[16ch] text-left text-[30px] font-extrabold leading-[1.1] tracking-[-0.02em] text-white sm:text-[40px]">
              {name ? `Thanks, ${name}!` : "Thank you!"}
            </h1>
            <p className="mt-3.5 max-w-xl text-[16px] leading-relaxed text-white/90 sm:mt-4 sm:text-[17px]">{intro}</p>
          </section>

          {/* ── BODY ── */}
          <div className="px-6 pb-10 pt-8 sm:px-12 sm:pb-12 sm:pt-9">
            {embedUrl ? (
              <div className="lg:flex lg:items-start lg:gap-10">
                <section className="lg:flex-1">
                  <Timeline />
                </section>
                <aside className="mx-auto mt-8 w-[84%] max-w-[300px] lg:mx-0 lg:mt-0 lg:w-[300px] lg:max-w-none lg:flex-none">
                  <Video />
                </aside>
              </div>
            ) : (
              <section className="max-w-2xl">
                <Timeline />
              </section>
            )}

            <div className="max-w-2xl">
              <ClosingCard />
            </div>
          </div>

          {/* ── FOOTER — reused client-facing legal/identity treatment from /r ── */}
          <div className="ty-legal">
            <Footer config={footerConfig} compact equalHousingText />
          </div>
        </div>
      </div>
    </main>
  )
}
