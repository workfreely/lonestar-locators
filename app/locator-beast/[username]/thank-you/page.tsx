import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { mergeSmartFormConfig } from "@/app/smart-lead-form/_lib/mergeConfig"
import { youtubeEmbedUrl } from "@/lib/smartForm/thankYouVideo"

export const dynamic = "force-dynamic"

type PublicForm = {
  agent_name: string
  brokerage_name: string | null
  photo_url: string | null
  form_config: unknown
}

// Post-submission confirmation for a per-agent Smart Lead Form, served at
// locatorbeast.com/{username}/thank-you.
//
// A single, centered, guided "what happens next" experience in the agent's own
// voice: personal greeting, a step progression (the just-completed form shown as
// done), an optional intro video, and the agent's signature block at the bottom.
// It never shows any acquisition/attribution data (source, utm, campaign/ad ids).
//
// Identity + the optional video resolve through the SAME public resolver the
// form uses (lb_resolve_public_form → form_config), so nothing private is
// exposed and nothing drifts from the live form.
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

  const intro = where
    ? `You're one step closer to finding the perfect home in ${where}. I'm already working on your best list of options and I'll be in touch soon.`
    : `You're one step closer to finding the perfect home. I'm already working on your best list of options and I'll be in touch soon.`

  // The just-submitted form is Step 1 and is already done — shown completed so the
  // page reads as real progress, not three generic blurbs.
  const steps: { title: string; body: string; done?: boolean }[] = [
    { title: "Fill out the form", body: "", done: true },
    {
      title: "I review your search",
      body: "I go over your budget, move date, preferred areas, and any notes you shared.",
    },
    {
      title: "I send your best options",
      body: "You'll get a personalized list of apartments that match what you're looking for.",
    },
    {
      title: "You tour and apply",
      body: "I'll help with questions, touring, and the next steps when you're ready to apply.",
    },
  ]

  return (
    <main className="min-h-screen bg-[#fbfbfd] px-5 py-14 sm:py-20">
      <div className="mx-auto w-full max-w-[620px]">
        {/* ── A. Headline + B. intro ────────────────────────────────────── */}
        <h1 className="text-[30px] font-bold leading-[1.12] tracking-[-0.02em] text-[#111318] sm:text-[38px]">
          {name ? `Thanks, ${name}!` : "Thank you!"}
        </h1>
        <p className="mt-4 text-[16px] leading-relaxed text-[#4b5162] sm:text-[17px]">{intro}</p>

        {/* ── C. What happens next (guided progression) ─────────────────── */}
        <section className="mt-11">
          <h2 className="text-[12.5px] font-semibold uppercase tracking-[0.08em] text-[#9098a8]">What happens next</h2>
          <ol className="mt-6">
            {steps.map((step, i) => {
              const isLast = i === steps.length - 1
              return (
                <li key={i} className="relative flex gap-4 pb-7 last:pb-0">
                  {/* connecting rail between markers */}
                  {!isLast && (
                    <span
                      className={`absolute left-[15px] top-9 bottom-1 w-px ${step.done ? "bg-[#bfe6cf]" : "bg-[#e6e8ee]"}`}
                      aria-hidden
                    />
                  )}
                  {/* marker: completed = green check; upcoming = numbered circle */}
                  {step.done ? (
                    <span className="relative z-10 flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[#12a150] text-white">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    </span>
                  ) : (
                    <span className="relative z-10 flex h-8 w-8 flex-none items-center justify-center rounded-full border border-[#e2e5ec] bg-white text-[14px] font-bold text-[#111318]">
                      {i + 1}
                    </span>
                  )}
                  <div className="pt-1">
                    {step.done ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[15.5px] font-semibold text-[#9aa3b2] line-through">{step.title}</p>
                        <span className="rounded-full bg-[#e7f6ee] px-2 py-0.5 text-[11.5px] font-semibold uppercase tracking-wide text-[#0f7a48]">
                          Completed
                        </span>
                      </div>
                    ) : (
                      <>
                        <p className="text-[15.5px] font-semibold text-[#111318]">{step.title}</p>
                        <p className="mt-1 text-[14px] leading-relaxed text-[#4b5162]">{step.body}</p>
                      </>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        </section>

        {/* ── D. Optional intro video (integrated, never required) ───────── */}
        {embedUrl && (
          <div className="mt-11 overflow-hidden rounded-2xl border border-[#e9ebf0] bg-black shadow-[0_1px_2px_rgba(16,19,24,0.05)]">
            <div className="aspect-video w-full">
              <iframe
                src={embedUrl}
                title={`A message from ${agentName}`}
                className="h-full w-full"
                loading="lazy"
                allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          </div>
        )}

        {/* ── G. Closing line ───────────────────────────────────────────── */}
        <p className="mt-11 text-[15.5px] leading-relaxed text-[#4b5162]">
          Keep an eye on your texts and email. I'll be in touch soon.
        </p>

        {/* ── E. Agent signature (bottom) ───────────────────────────────── */}
        <div className="mt-8 flex items-center gap-4 border-t border-[#eef0f5] pt-8">
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
          <div>
            <p className="text-[16px] font-semibold text-[#111318]">{agentName}</p>
            {brokerage && <p className="mt-0.5 text-[13.5px] text-[#6b7280]">{brokerage}</p>}
            <p className="mt-1 text-[13px] text-[#9098a8]">Your personal apartment locator</p>
          </div>
        </div>
      </div>
    </main>
  )
}
