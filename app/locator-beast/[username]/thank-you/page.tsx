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
// A warm, personal page in the agent's own voice: a personalized greeting, a
// compact "what happens next" walkthrough, and a real agent connection (an
// optional intro video, otherwise an enhanced agent card). It never shows any
// acquisition/attribution data (source, utm, campaign/ad ids) — that stays
// internal to analytics.
//
// Identity + the optional thank-you video resolve through the SAME public
// resolver the form itself uses (lb_resolve_public_form → form_config), so
// nothing private is exposed and nothing can drift from the live form.
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

  const steps = [
    {
      title: "I review your search",
      body: "I'll look over your budget, move date, preferred areas, and what you're looking for in your next home.",
    },
    {
      title: "I send your best options",
      body: "You'll receive personalized apartment options that match your search.",
    },
    {
      title: "You tour and apply",
      body: "I'll help with questions, touring, and next steps when you're ready to apply.",
    },
  ]

  const AgentIdentity = ({ size }: { size: "large" | "compact" }) => {
    const photoBox = size === "large" ? "h-20 w-20" : "h-12 w-12"
    const nameText = size === "large" ? "text-[16px]" : "text-[14px]"
    return (
      <div className={size === "large" ? "flex flex-col items-center text-center" : "flex items-center gap-3"}>
        <div
          className={`${photoBox} flex-none overflow-hidden rounded-full border border-[#e5e7ee] bg-[#f4f5f8] ${
            size === "large" ? "shadow-sm" : ""
          }`}
        >
          {form.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={form.photo_url} alt={agentName} className="h-full w-full object-cover" />
          ) : (
            <div
              className={`flex h-full w-full items-center justify-center font-semibold text-[#9098a8] ${
                size === "large" ? "text-[22px]" : "text-[14px]"
              }`}
            >
              {initials}
            </div>
          )}
        </div>
        <div className={size === "large" ? "mt-3" : "text-left"}>
          <p className={`${nameText} font-semibold text-[#111318]`}>{agentName}</p>
          <p className="mt-0.5 text-[12.5px] text-[#6b7280]">{brokerage || "Your apartment locator"}</p>
        </div>
      </div>
    )
  }

  return (
    <main className="min-h-screen bg-[#fbfbfd] px-5 py-12 sm:py-16">
      <div className="mx-auto w-full max-w-[980px]">
        {/* ── Intro ─────────────────────────────────────────────────────── */}
        <header className="max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#d8ebe0] bg-[#eafaf1] px-3 py-1 text-[12px] font-semibold tracking-wide text-[#0f7a48]">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M20 6 9 17l-5-5" />
            </svg>
            Request received
          </span>
          <h1 className="mt-4 text-[32px] font-bold leading-[1.1] tracking-[-0.02em] text-[#111318] sm:text-[40px]">
            {name ? `Thanks, ${name}!` : "Thank you!"}
          </h1>
          <p className="mt-4 text-[16px] leading-relaxed text-[#4b5162] sm:text-[17px]">{intro}</p>
        </header>

        {/* ── Two-column: steps (left) + video/agent (right) ────────────────
            DOM order puts the agent video/profile first so mobile stacks as
            intro → agent → steps; on desktop `order` swaps them back. */}
        <div className="mt-10 flex flex-col gap-8 md:mt-14 md:flex-row md:items-start md:gap-10">
          <aside className="w-full md:order-2 md:w-[42%] md:shrink-0">
            {embedUrl ? (
              <div className="rounded-2xl border border-[#e9ebf0] bg-white p-3 shadow-[0_1px_2px_rgba(16,19,24,0.04)]">
                <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
                  <iframe
                    src={embedUrl}
                    title={`A message from ${agentName}`}
                    className="h-full w-full"
                    loading="lazy"
                    allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />
                </div>
                <div className="px-1 pb-1 pt-3">
                  <AgentIdentity size="compact" />
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-[#e9ebf0] bg-white px-6 py-8 shadow-[0_1px_2px_rgba(16,19,24,0.04)]">
                <AgentIdentity size="large" />
                <p className="mx-auto mt-4 max-w-[240px] text-center text-[13px] leading-relaxed text-[#6b7280]">
                  I'm your personal apartment locator and I'll be helping with your search from here.
                </p>
              </div>
            )}
          </aside>

          <section className="w-full md:order-1 md:w-[58%]">
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.06em] text-[#9098a8]">What happens next</h2>
            <ol className="mt-5 space-y-5">
              {steps.map((step, i) => (
                <li key={i} className="flex gap-4">
                  <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[#eef3ff] text-[14px] font-bold text-[#2f6bff]">
                    {i + 1}
                  </span>
                  <div className="pt-0.5">
                    <p className="text-[15.5px] font-semibold text-[#111318]">{step.title}</p>
                    <p className="mt-1 text-[14px] leading-relaxed text-[#4b5162]">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        {/* ── Follow-up ─────────────────────────────────────────────────── */}
        <div className="mt-12 border-t border-[#eef0f5] pt-6">
          <p className="text-[14.5px] leading-relaxed text-[#4b5162]">
            Keep an eye on your texts and email. I'll be in touch soon.
          </p>
        </div>
      </div>
    </main>
  )
}
