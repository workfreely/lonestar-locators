"use client"

// THE Thank You page, as one component.
//
// Extracted VERBATIM from app/locator-beast/[username]/thank-you/page.tsx so the public page and
// the editor preview render the SAME markup, styles and responsive rules. Nothing here was
// retyped or reinterpreted — the server page now computes its data and hands it to this view, and
// the editor preview hands it sample renter details instead. One rendering path, so the preview
// cannot drift from what a renter actually sees.
//
// DISPLAY ONLY. No form, no submit, no network call, no analytics — it renders props. That is
// what makes it safe to mount inside the editor.

import { HiStar } from "react-icons/hi2"
import type { ReactNode } from "react"
import { Inter } from "next/font/google"
import Footer from "@/app/smart-lead-form/_components/form/sections/Footer"
import AgentSignature from "@/components/clientShare/AgentSignature"
import type { SmartLeadFormConfig } from "@/app/smart-lead-form/_lib/types"
import type { ThankYouStep } from "@/lib/smartForm/thankYouSteps"
import type { Testimonial } from "@/lib/smartForm/thankYouMedia"

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
.ty-close h2{max-width:none;margin-left:auto;margin-right:auto;text-align:center}
.ty-legal{padding:22px 26px 26px;margin-top:8px;border-top:1px solid #eef1f7}
.ty-legal a[href="https://locatorbeast.com"]{pointer-events:none;color:inherit;text-decoration:none;cursor:default}
.ty-legal span:has(> a[href="/privacy"]),.ty-legal span:has(> a[href="/terms"]){display:none}
.ty-legal span.basis-full{display:none}
.ty-legal .slf-compact a,.ty-legal .slf-compact span{font-size:13.5px!important}
@media (max-width:640px){
.ty-legal{padding:20px 16px 26px}
/* Match the /r mobile agent-signature card: same subtle soft shadow on the already-bordered
   closing container so the shared signature reads consistently across both client surfaces. */
.ty-close{box-shadow:0 6px 20px -12px rgba(14,37,69,.28)}
.ty-legal span:has(> a[target="_blank"]) > span[aria-hidden="true"]{display:none}
/* Match the /r mobile legal size (base 13.5 → 19 on phones) so the shared footer reads
   consistently with the enlarged mobile agent signature. Desktop unchanged. */
.ty-legal .slf-compact a,.ty-legal .slf-compact span{font-size:15px!important}
}
`

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], display: "swap" })

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

export type ThankYouViewProps = {
  name: string
  intro: string
  heroImg: string
  agentName: string
  brokerage: string
  title: string
  photoUrl: string | null
  agentPhone: string | null
  steps: ThankYouStep[]
  testimonials: Testimonial[]
  embedUrl: string | null
  showTestimonials: boolean
  config: SmartLeadFormConfig
}

export default function ThankYouView({
  name, intro, heroImg, agentName, brokerage, title, photoUrl, agentPhone,
  steps, testimonials, embedUrl, showTestimonials, config,
}: ThankYouViewProps) {
  const Timeline = () => (
    <div>
      <h2 className="text-left text-[26px] font-extrabold tracking-[-0.01em] text-[#0e2545] sm:text-[24px]">What Happens Next</h2>
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
                    <p className="text-[20px] font-bold leading-snug text-[#0e2545] line-through decoration-2 decoration-[#6b7688] sm:text-[18px]">{step.title}</p>
                    <span className="inline-flex items-center gap-[9px] rounded-full bg-[#e4f6ec] px-[18px] py-[8px] text-[15px] font-extrabold uppercase tracking-wide text-[#136c3a] sm:gap-1.5 sm:px-3 sm:py-[5px] sm:text-[11.5px]">
                      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] flex-none sm:h-[12px] sm:w-[12px]" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                      Completed
                    </span>
                  </div>
                ) : (
                  <>
                    <p className="text-[20px] font-bold leading-snug text-[#0e2545] sm:text-[18px]">{step.title}</p>
                    <p className="mt-2 text-[17px] leading-[1.6] text-[#4b5468] sm:mt-1.5 sm:text-[15.5px] sm:leading-relaxed">{renderBody(step.body, step.emphasis)}</p>
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

  // Two testimonials, reusing the SAME data the Smart Lead Form renders
  // (config.copy.testimonials) and the same card language: white card, #e2e4ea hairline, rounded,
  // amber stars, quote, then name — city. Only genuine entries reach here; the built-in samples
  // are filtered out upstream, so an agent who never wrote a testimonial shows none.
  const TestimonialCards = () => (
    <div className="grid gap-3 sm:grid-cols-2">
      {testimonials.map((t, i) => (
        <div key={i} className="rounded-2xl border border-[#e2e4ea] bg-white p-5">
          <div className="flex gap-0.5 text-amber-400">
            {Array.from({ length: 5 }).map((_, j) => (
              <HiStar key={j} className="h-5 w-5" />
            ))}
          </div>
          <p className="mt-2.5 break-words text-[16px] leading-relaxed text-[#3a3f4d] sm:text-[15.5px]">&ldquo;{t.quote}&rdquo;</p>
          <div className="mt-3 flex min-w-0 items-center gap-2.5">
            {t.photoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={t.photoUrl} alt={t.name} className="h-8 w-8 shrink-0 rounded-full object-cover" />
            )}
            <p className="min-w-0 break-words text-[15px] font-semibold text-[#111318]">
              {t.name}
              {t.city && <span className="font-normal text-[#9098a8]"> — {t.city}</span>}
            </p>
          </div>
        </div>
      ))}
    </div>
  )

  // One intentional closing composition: the final client message + the dynamic
  // locator identity in a single polished card. No contact buttons.
  const ClosingCard = () => (
    <section className="ty-close mt-9 rounded-[20px] border border-[#e7ebf2] bg-[#f7f9fc] px-5 py-6 sm:px-7 sm:py-7">
      <h2 className="text-center text-[26px] font-extrabold tracking-[-0.01em] text-[#0e2545] sm:text-[22px]">
        You&apos;re all set!
      </h2>
      <p className="mt-2.5 text-center text-[17px] leading-[1.6] text-[#4b5468] sm:mt-2 sm:text-[15.5px] sm:leading-relaxed">
        Keep an eye on your texts! I&rsquo;ll be reaching out shortly to help you get started.
      </p>
      {/* Canonical shared agent signature (identical to the Recommendations page). */}
      <div className="mt-6 border-t border-[#e3e8f1] pt-6">
        <AgentSignature name={agentName} photoUrl={photoUrl} title={title} brokerage={brokerage} phone={agentPhone} serviceAreas={config.copy?.serviceAreas ?? null} />
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
            <h1 className="max-w-[16ch] text-left text-[34px] font-extrabold leading-[1.1] tracking-[-0.02em] text-white sm:text-[40px]">
              {name ? `Thanks, ${name}!` : "Thank you!"}
            </h1>
            <p className="mt-4 max-w-xl text-[18px] leading-[1.6] text-white/90 sm:mt-4 sm:text-[17px] sm:leading-relaxed">{intro}</p>
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

            {showTestimonials && (
              <div className="mt-9 max-w-2xl">
                <TestimonialCards />
              </div>
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
