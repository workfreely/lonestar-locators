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

// Post-submission confirmation for a per-agent Smart Lead Form, served at
// locatorbeast.com/{username}/thank-you.
//
// Renter-facing service-value page: a personal greeting, a substantial "what
// happens next" flow (personalized list, tours, applying with the locator
// listed, and an optional reward), an optional agent intro video on the right,
// and a full agent signature at the bottom. Every dynamic value resolves from
// the current workspace — nothing hardcoded to any agent. The signature uses the
// CLIENT-FACING phone + email (never a platform/support address) and never shows
// any acquisition/attribution data.
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
  // Same rule as the form page: an unknown slug is a 404, nothing else is.
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
  // Agent title — same source as the email signature (config.copy.agentTitle),
  // so it stays consistent and agent-controlled.
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
      <ol className="mt-5">
        {steps.map((step, i) => {
          const isLast = i === steps.length - 1
          return (
            <li key={i} className="relative flex gap-4 pb-7 last:pb-0 sm:gap-5">
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
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[17px] font-semibold text-[#9aa3b2] line-through">{step.title}</p>
                    <span className="rounded-full bg-[#e7f6ee] px-2 py-0.5 text-[11.5px] font-semibold uppercase tracking-wide text-[#0f7a48]">
                      Completed
                    </span>
                    <p className="w-full text-[14px] text-[#9aa3b2]">{step.body}</p>
                  </div>
                ) : (
                  <>
                    <p className="text-[17px] font-semibold leading-snug text-[#111318]">{step.title}</p>
                    <p className="mt-1.5 text-[15px] leading-relaxed text-[#4b5162]">{step.body}</p>
                  </>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </>
  )

  const Video = () => (
    <div className="overflow-hidden rounded-2xl border border-[#e9ebf0] bg-black shadow-[0_1px_2px_rgba(16,19,24,0.05)]">
      <div className="aspect-video w-full">
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
    <main className="min-h-screen bg-[#fbfbfd] px-5 py-10 sm:py-12">
      <div className="mx-auto w-full max-w-[980px]">
        {/* ── Intro ─────────────────────────────────────────────────────── */}
        <header className="max-w-2xl">
          <h1 className="text-[28px] font-bold leading-[1.12] tracking-[-0.02em] text-[#111318] sm:text-[36px]">
            {name ? `Thanks, ${name}!` : "Thank you!"}
          </h1>
          <p className="mt-3 text-[16px] leading-relaxed text-[#4b5162] sm:text-[16.5px]">{intro}</p>
        </header>

        {/* ── Main journey: steps + optional video ─────────────────────── */}
        {embedUrl ? (
          <div className="mt-7 md:mt-9 md:flex md:flex-row-reverse md:items-start md:gap-10">
            <aside className="mb-7 w-full md:mb-0 md:w-[40%] md:flex-none">
              <Video />
            </aside>
            <section className="w-full md:w-[60%]">
              <StepList />
            </section>
          </div>
        ) : (
          <section className="mt-7 max-w-2xl md:mt-9">
            <StepList />
          </section>
        )}

        {/* ── Closing line (no longer repeats the intro's "in touch soon") ─ */}
        <p className="mt-8 max-w-2xl text-[15.5px] leading-relaxed text-[#4b5162]">
          Keep an eye on your texts and email for your personalized options.
        </p>

        {/* ── Agent signature (bottom) — full contact block ─────────────── */}
        <div className="mt-6 flex items-start gap-4 border-t border-[#eef0f5] pt-6">
          <div className="h-16 w-16 flex-none overflow-hidden rounded-full border border-[#e5e7ee] bg-[#f4f5f8] shadow-sm">
            {form.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.photo_url} alt={agentName} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[18px] font-semibold text-[#9098a8]">
                {initials}
              </div>
            )}
          </div>
          <div className="min-w-0">
            <p className="text-[16px] font-semibold text-[#111318]">{agentName}</p>
            <p className="mt-0.5 text-[13.5px] text-[#6b7280]">{title}</p>
            {brokerage && <p className="text-[13.5px] text-[#6b7280]">{brokerage}</p>}
            {(phone || email) && (
              <p className="mt-2 text-[13.5px] leading-relaxed text-[#4b5162]">
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
            {serving && <p className="mt-1 text-[12.5px] text-[#9098a8]">Serving {serving}</p>}
          </div>
        </div>
      </div>
    </main>
  )
}
