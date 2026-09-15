import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { mergeSmartFormConfig } from "@/app/smart-lead-form/_lib/mergeConfig"
import { youtubeEmbedUrl } from "@/lib/smartForm/thankYouVideo"
import { buildThankYouSteps, buildThankYouIntro } from "@/lib/smartForm/thankYouSteps"
import { serviceAreasLabel } from "@/lib/markets/catalog"

export const dynamic = "force-dynamic"

type PublicForm = {
  agent_name: string
  brokerage_name: string | null
  photo_url: string | null
  form_config: unknown
  service_areas: string[] | null
  agent_phone: string | null
  agent_email: string | null
}

// Renders a step body, bolding a known emphasis substring (e.g. the agent +
// brokerage in the default apply step). Splits on the first occurrence only and
// wraps the substring in a real element — no HTML injection from config values.
function renderBody(body: string, emphasis?: string) {
  if (!emphasis) return body
  const i = body.indexOf(emphasis)
  if (i < 0) return body
  return (
    <>
      {body.slice(0, i)}
      <strong className="font-semibold text-[#111318]">{emphasis}</strong>
      {body.slice(i + emphasis.length)}
    </>
  )
}

// Post-submission confirmation for a per-agent Smart Lead Form, served at
// locatorbeast.com/{username}/thank-you. Renter-facing service-value page with
// an editable step flow, an optional portrait (9:16) intro video on the right,
// and a compact agent signature at the bottom. All dynamic values resolve from
// the current workspace; no acquisition/attribution data is shown.
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
  const agentName = (form.agent_name ?? "").trim() || "Your local locator"
  const brokerage = (form.brokerage_name ?? "").trim()
  const phone = (form.agent_phone ?? "").trim()
  const email = (form.agent_email ?? "").trim()
  const serving = serviceAreasLabel(form.service_areas).trim()
  const initials =
    agentName
      .split(/\s+/)
      .map((n) => n[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "•"

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

  const StepList = () => (
    <>
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[#9098a8]">What happens next</h2>
      <ol className="mt-4">
        {steps.map((step, i) => {
          const isLast = i === steps.length - 1
          return (
            <li key={i} className="relative flex gap-4 pb-6 last:pb-0 sm:gap-5">
              {!isLast && (
                <span
                  className={`absolute left-[17px] top-10 bottom-1 w-px ${step.done ? "bg-[#bfe6cf]" : "bg-[#e6e8ee]"}`}
                  aria-hidden
                />
              )}
              {step.done ? (
                <span className="relative z-10 flex h-9 w-9 flex-none items-center justify-center rounded-full bg-[#12a150] text-white">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                </span>
              ) : (
                <span className="relative z-10 flex h-9 w-9 flex-none items-center justify-center rounded-full border border-[#e2e5ec] bg-white text-[15px] font-bold text-[#111318]">
                  {i + 1}
                </span>
              )}
              <div className="pt-1">
                {step.done ? (
                  <div className="flex flex-wrap items-center gap-2.5">
                    <p className="text-[17px] font-semibold text-[#9aa3b2] line-through">{step.title}</p>
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#12a150] px-2.5 py-[3px] text-[11px] font-bold uppercase tracking-wide text-white">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                      Completed
                    </span>
                    <p className="w-full text-[14px] text-[#9aa3b2]">{step.body}</p>
                  </div>
                ) : (
                  <>
                    <p className="text-[17px] font-semibold leading-snug text-[#111318]">{step.title}</p>
                    <p className="mt-1.5 text-[15px] leading-relaxed text-[#4b5162]">{renderBody(step.body, step.emphasis)}</p>
                  </>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </>
  )

  // Portrait (9:16) intro video — a Shorts-style frame, capped so it never
  // dominates the page; right column on desktop, centered on mobile.
  const Video = () => (
    <div className="mx-auto w-full max-w-[280px] overflow-hidden rounded-2xl border border-[#e9ebf0] bg-black shadow-[0_1px_3px_rgba(16,19,24,0.08)]">
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

  return (
    <main className="min-h-screen bg-[#fbfbfd] px-5 py-8 sm:py-11">
      <div className="mx-auto w-full max-w-[1040px]">
        {/* ── Intro ─────────────────────────────────────────────────────── */}
        <header className="max-w-2xl">
          <h1 className="text-[28px] font-bold leading-[1.12] tracking-[-0.02em] text-[#111318] sm:text-[36px]">
            {name ? `Thanks, ${name}!` : "Thank you!"}
          </h1>
          <p className="mt-3 text-[16px] leading-relaxed text-[#4b5162]">{intro}</p>
        </header>

        {/* ── Main journey: steps + optional portrait video ────────────────
            With a video, this is a row (steps left, 9:16 video right on desktop;
            DOM order keeps mobile as intro -> video -> steps). No video => steps
            expand, no empty column. */}
        {embedUrl ? (
          <div className="mt-6 md:mt-8 md:flex md:flex-row-reverse md:items-start md:gap-10">
            <aside className="mb-7 w-full md:mb-0 md:w-[300px] md:flex-none">
              <Video />
            </aside>
            <section className="w-full md:flex-1">
              <StepList />
            </section>
          </div>
        ) : (
          <section className="mt-6 max-w-2xl md:mt-8">
            <StepList />
          </section>
        )}

        {/* ── Closing line ──────────────────────────────────────────────── */}
        <p className="mt-7 max-w-2xl text-[15.5px] leading-relaxed text-[#4b5162]">
          Keep an eye on your texts and email for your personalized options.
        </p>

        {/* ── Agent signature (bottom) — compact, horizontally efficient ── */}
        <div className="mt-6 border-t border-[#eef0f5] pt-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
            {/* photo + identity */}
            <div className="flex flex-none items-center gap-4">
              <div className="h-[72px] w-[72px] flex-none overflow-hidden rounded-full border border-[#e5e7ee] bg-[#f4f5f8] shadow-sm">
                {form.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={form.photo_url} alt={agentName} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[20px] font-semibold text-[#9098a8]">
                    {initials}
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-[16px] font-semibold text-[#111318]">{agentName}</p>
                <p className="mt-0.5 text-[13px] text-[#6b7280]">{title}</p>
                {brokerage && <p className="text-[13px] text-[#6b7280]">{brokerage}</p>}
              </div>
            </div>

            {/* divider (desktop only) */}
            {(phone || email || serving) && <div className="hidden h-14 w-px flex-none bg-[#eceef3] sm:block" />}

            {/* contact group */}
            {(phone || email || serving) && (
              <div className="min-w-0 text-[13.5px] leading-relaxed text-[#4b5162]">
                {(phone || email) && (
                  <p>
                    {phone && (
                      <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className="text-[#4b5162] no-underline hover:underline">
                        {phone}
                      </a>
                    )}
                    {phone && email && <span className="px-1.5 text-[#c7ccd6]">·</span>}
                    {email && (
                      <a href={`mailto:${email}`} className="break-all text-[#2f6bff] no-underline hover:underline">
                        {email}
                      </a>
                    )}
                  </p>
                )}
                {serving && <p className="mt-0.5 text-[12.5px] text-[#9098a8]">Serving {serving}</p>}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
