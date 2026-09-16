import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { hashShareToken, looksLikeShareToken } from "@/lib/clientShare/token"
import { mergeSmartFormConfig } from "@/app/smart-lead-form/_lib/mergeConfig"
import Footer from "@/app/smart-lead-form/_components/form/sections/Footer"
import RecommendationList, { type ClientProperty } from "./RecommendationList"
import { SKYLINE_PATH } from "@/lib/clientShare/skyline"

export const dynamic = "force-dynamic"

/**
 * The client-facing Recommendation page — locatorbeast.com/r/<token>
 *
 * Opened from a link the locator texts. The renter has no Locator Beast account,
 * so the route is public; the unguessable token IS the credential.
 *
 * SCOPE: this page recommends properties and collects favourites. It is not a
 * listing site. Rent, floor plans, availability, amenity lists and management
 * details are deliberately absent — the property's own website owns that data.
 *
 * WHY IT LIVES UNDER app/locator-beast/ RATHER THAN THE APP ROOT
 * middleware.ts rewrites everything on the locatorbeast.com host under
 * /locator-beast/* unless the path matches APP_PATH_PATTERN. `r` is not in that
 * list, so a page at app/r/[token] would 404 on the live domain.
 *
 * EVERY access decision is made inside lb_resolve_client_recommendations, not
 * here. A paused list comes back with no property payload whatsoever.
 * Nothing internal is reachable: no lead id, no workspace id, no notes, no
 * credit or background information, no commissions, no CRM stage, and never
 * property_url — the locator-only source link.
 */

// The stable, client-facing origin for anything that ends up in a shared link's
// metadata. NEVER process.env.VERCEL_URL: that is the ephemeral per-deployment
// hostname, and a texted preview must not carry it (it leaks internal infra and
// rots as soon as the next deploy supersedes it).
const CANONICAL_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL || "https://locatorbeast.com"
// Static, pre-optimized preview image on the stable domain — one file for every
// share (nothing client-specific in a cached preview).
const OG_IMAGE_PATH = "/locator-beast/r/og-recommendations.jpg"

/**
 * Link-preview metadata. This page is delivered by text message, so the unfurled
 * preview IS part of the product. Title + image are fixed; only the description
 * is personalised, and only with the LOCATOR's name — never anything about the
 * client, and never the token.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const base = {
    metadataBase: new URL(CANONICAL_ORIGIN),
    title: "Your Apartment Recommendations",
    robots: { index: false, follow: false },
  }

  const { token } = await params
  if (!looksLikeShareToken(token)) return base

  let agentName: string | null = null
  try {
    const supabase = await createClient()
    const { data } = await supabase.rpc("lb_resolve_client_recommendations", {
      p_token_hash: hashShareToken(token),
    })
    const share = (Array.isArray(data) ? data[0] : data) as { agent_name?: string | null } | undefined
    agentName = share?.agent_name?.trim() || null
  } catch {
    // Preview metadata must never be the reason a page fails to render.
  }

  const description = agentName ? `Personalized for you by ${agentName}` : "Personalized apartment recommendations"

  return {
    ...base,
    description,
    openGraph: {
      title: base.title,
      description,
      type: "website" as const,
      siteName: "Locator Beast",
      images: [{ url: OG_IMAGE_PATH, width: 1200, height: 630, alt: "Your Apartment Recommendations — Locator Beast" }],
    },
    twitter: {
      card: "summary_large_image" as const,
      title: base.title,
      description,
      images: [OG_IMAGE_PATH],
    },
  }
}

type Resolved = {
  status: "active" | "disabled"
  agent_name: string | null
  agent_photo_url: string | null
  agent_title: string | null
  agent_phone: string | null
  agent_email: string | null
  agent_brokerage: string | null
  smart_form_config: unknown
  client_first_name: string | null
  properties: ClientProperty[] | null
}

const SERIF = "font-['Georgia',_'Times_New_Roman',_serif]"

// ─── Shared bits ───────────────────────────────────────────────────────────

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .map((n) => n[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "•"
  )
}

/** Agent-first identity strip — the FIRST thing the renter sees, so provenance is
 *  immediate: "these were selected for me by Jay." Small and warm, not a banner. */
function AgentBar({
  name, title, brokerage, photoUrl,
}: { name: string; title: string; brokerage: string | null; photoUrl: string | null }) {
  return (
    <div className="flex items-center gap-3 px-5 pt-6 sm:pt-7">
      <div className="h-11 w-11 flex-none overflow-hidden rounded-full border border-[#e5ddcd] bg-[#e9e5de] shadow-sm">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photoUrl} alt={name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[15px] font-bold text-[#a8a49c]">
            {initialsOf(name)}
          </div>
        )}
      </div>
      <div className="min-w-0">
        <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[#a8792a]">Selected for you by</p>
        <p className="truncate text-[15px] font-semibold text-[#1c2b4a]">
          {name}
          {brokerage ? <span className="font-normal text-[#6b7280]"> · {brokerage}</span> : null}
        </p>
      </div>
    </div>
  )
}

/** Hero with a skyline wash. Copy is passed in so each state (list ready, list
 *  being prepared, unavailable) says something true — no "heart these" prompt on a
 *  page that has nothing to heart. */
function Hero({ eyebrow, headline, subline }: { eyebrow: string; headline: string; subline: string | null }) {
  return (
    <header className="relative overflow-hidden px-6 pb-8 pt-7">
      <div aria-hidden className="absolute inset-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={SKYLINE_PATH} alt="" className="h-full w-full object-cover object-bottom" />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(180deg, rgba(247,244,239,0.88) 0%, rgba(247,244,239,0.74) 42%, rgba(247,244,239,0.88) 78%, rgba(247,244,239,1) 100%)",
          }}
        />
      </div>
      <div className="relative mx-auto max-w-[620px] text-center">
        <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-[#a8792a]">{eyebrow}</p>
        <h1 className={`${SERIF} mx-auto mt-3 max-w-[15ch] text-[28px] font-bold leading-[1.14] text-[#1c2b4a] sm:text-[34px]`}>
          {headline}
        </h1>
        {subline && <p className="mx-auto mt-3 max-w-[42ch] text-[16px] leading-relaxed text-[#4a5164]">{subline}</p>}
      </div>
    </header>
  )
}

/** The renter's way to respond, placed high — never buried in the footer. Uses the
 *  agent's own client-facing phone/email. Text is primary because this arrives by
 *  text; Call/Email is the calm secondary. */
function ContactActions({
  agentFirst, phoneDigits, phone, email, size = "inline",
}: {
  agentFirst: string
  phoneDigits: string | null
  phone: string | null
  email: string | null
  size?: "inline" | "sticky"
}) {
  const smsBody = encodeURIComponent(`Hi ${agentFirst}! I went through my apartment recommendations — can we set up a few tours?`)
  const primaryCls =
    "flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#1c2b4a] px-4 py-3 text-[15.5px] font-semibold text-white shadow-[0_4px_14px_-4px_rgba(28,43,74,0.5)] transition-transform active:scale-[0.98]"
  const secondaryCls =
    "flex items-center justify-center gap-2 rounded-xl border border-[#d9d3c7] bg-white px-4 py-3 text-[15.5px] font-semibold text-[#1c2b4a] transition-colors hover:border-[#c9932f]"

  if (!phoneDigits && !email) return null

  return (
    <div className={`flex gap-2.5 ${size === "sticky" ? "" : "mx-auto max-w-[520px]"}`}>
      {phoneDigits ? (
        <a href={`sms:${phoneDigits}?&body=${smsBody}`} className={primaryCls}>
          <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
          </svg>
          Text {agentFirst}
        </a>
      ) : email ? (
        <a href={`mailto:${email}`} className={primaryCls}>Email {agentFirst}</a>
      ) : null}
      {phoneDigits && (
        <a href={`tel:${phoneDigits}`} className={size === "sticky" ? `${secondaryCls} flex-none` : secondaryCls} aria-label={`Call ${agentFirst}`}>
          <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .3 1.9.6 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.1a2 2 0 0 1 2.1-.5c.9.3 1.8.5 2.8.6a2 2 0 0 1 1.7 2Z" />
          </svg>
          {size === "sticky" ? "" : "Call"}
        </a>
      )}
    </div>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  // Mobile-first, but an intentional editorial width on desktop rather than a
  // phone column stranded in empty gutters. pb leaves room for the sticky bar.
  return (
    <div className="min-h-screen bg-[#f7f4ef]">
      <div className="mx-auto w-full max-w-[880px] pb-28 sm:pb-12">{children}</div>
    </div>
  )
}

function LegalFooter({ config, brokerage }: { config: unknown; brokerage: string | null }) {
  const merged = mergeSmartFormConfig(config ?? {})
  const withBrokerage = brokerage ? { ...merged, copy: { ...merged.copy, brokerageName: brokerage } } : merged
  return (
    <div className="px-4 pt-3">
      <Footer config={withBrokerage} compact />
    </div>
  )
}

/** The professional signature — the person behind the list. Same fields as the
 *  Smart Lead Form / Thank You signature: photo, name, title, brokerage, phone,
 *  client-facing email. */
function Signature({ share, agentName }: { share: Resolved; agentName: string }) {
  const title = share.agent_title ?? "Licensed Apartment Locator"
  const phoneDigits = share.agent_phone ? share.agent_phone.replace(/[^\d+]/g, "") : null
  return (
    <section className="px-4 pt-4">
      <div className="flex items-center gap-4 rounded-2xl bg-white px-5 py-5 shadow-[0_1px_3px_rgba(28,43,74,0.08)]">
        <div className="h-[84px] w-[84px] shrink-0 overflow-hidden rounded-full bg-[#e9e5de]">
          {share.agent_photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={share.agent_photo_url} alt={agentName} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[28px] font-bold text-[#a8a49c]">
              {initialsOf(agentName)}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className={`${SERIF} text-[19px] font-bold leading-tight text-[#1c2b4a]`}>{agentName}</p>
          <p className="mt-1 text-[12.5px] leading-snug text-[#6b7280]">{title}</p>
          {share.agent_brokerage && (
            <p className="mt-[3px] text-[12.5px] font-medium leading-snug text-[#4a4f58]">{share.agent_brokerage}</p>
          )}
          <div className="mt-2 flex flex-col gap-0.5">
            {phoneDigits && (
              <a href={`tel:${phoneDigits}`} className="flex items-center gap-1.5 text-[13px] text-[#1c2b4a]">
                <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden fill="none" stroke="#c9932f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .3 1.9.6 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.1a2 2 0 0 1 2.1-.5c.9.3 1.8.5 2.8.6a2 2 0 0 1 1.7 2Z" />
                </svg>
                {share.agent_phone}
              </a>
            )}
            {share.agent_email && (
              <a href={`mailto:${share.agent_email}`} className="flex items-center gap-1.5 truncate text-[13px] text-[#1c2b4a]">
                <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden className="shrink-0" fill="none" stroke="#c9932f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" />
                </svg>
                <span className="truncate">{share.agent_email}</span>
              </a>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

/** Fixed contact bar for phones only — a restrained single action that never
 *  covers content (Shell reserves bottom padding for it). */
function StickyBar({ agentFirst, phoneDigits, phone, email }: { agentFirst: string; phoneDigits: string | null; phone: string | null; email: string | null }) {
  if (!phoneDigits && !email) return null
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#e7e1d5] bg-[#f7f4ef]/95 backdrop-blur sm:hidden">
      <div className="mx-auto max-w-[880px] px-4 py-3">
        <ContactActions agentFirst={agentFirst} phoneDigits={phoneDigits} phone={phone} email={email} size="sticky" />
      </div>
    </div>
  )
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default async function ClientRecommendationsPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  if (!looksLikeShareToken(token)) notFound()

  const supabase = await createClient()
  const tokenHash = hashShareToken(token)

  const { data, error } = await supabase.rpc("lb_resolve_client_recommendations", { p_token_hash: tokenHash })
  const share = (Array.isArray(data) ? data[0] : data) as Resolved | undefined
  if (error || !share) notFound()

  void supabase.rpc("lb_record_client_share_view", { p_token_hash: tokenHash })

  const firstName = share.client_first_name?.trim() || null
  const agentName = share.agent_name?.trim() || "Your locator"
  const agentTitle = share.agent_title ?? "Licensed Apartment Locator"
  const agentFirst = agentName.split(/\s+/)[0]
  const phoneDigits = share.agent_phone ? share.agent_phone.replace(/[^\d+]/g, "") : null

  // A Disabled list withholds its properties and shows a neutral, client-facing
  // unavailable screen with a way to reach the locator — no recommendation
  // instructions, no "heart these".
  if (share.status === "disabled") {
    return (
      <Shell>
        <AgentBar name={agentName} title={agentTitle} brokerage={share.agent_brokerage} photoUrl={share.agent_photo_url} />
        <Hero
          eyebrow="Your Apartment Recommendations"
          headline="This list is paused right now"
          subline={`${agentFirst} may be updating your options. Reach out any time and they'll get you sorted.`}
        />
        <div className="px-4">
          <ContactActions agentFirst={agentFirst} phoneDigits={phoneDigits} phone={share.agent_phone} email={share.agent_email} />
        </div>
        <Signature share={share} agentName={agentName} />
        <LegalFooter config={share.smart_form_config} brokerage={share.agent_brokerage} />
        <StickyBar agentFirst={agentFirst} phoneDigits={phoneDigits} phone={share.agent_phone} email={share.agent_email} />
      </Shell>
    )
  }

  const properties = share.properties ?? []
  const hasProperties = properties.length > 0

  return (
    <Shell>
      <AgentBar name={agentName} title={agentTitle} brokerage={share.agent_brokerage} photoUrl={share.agent_photo_url} />

      <Hero
        eyebrow="Your Apartment Recommendations"
        headline={
          hasProperties
            ? firstName
              ? `${firstName}, I narrowed it down to your best options.`
              : "I narrowed it down to your best options."
            : firstName
              ? `${firstName}, your recommendations are on the way.`
              : "Your recommendations are on the way."
        }
        subline={
          hasProperties
            ? "Tap the heart on any you'd like to tour — I'll take it from there."
            : `${agentFirst} is putting your personalized list together and will send your options shortly.`
        }
      />

      <div className="px-4 pb-1">
        <ContactActions agentFirst={agentFirst} phoneDigits={phoneDigits} phone={share.agent_phone} email={share.agent_email} />
      </div>

      {hasProperties ? (
        <div className="pt-4">
          <RecommendationList properties={properties} token={token} />
        </div>
      ) : (
        <div className="px-4 pt-5">
          <div className="rounded-2xl bg-white px-6 py-8 text-center shadow-[0_2px_10px_rgba(10,26,60,0.08)]">
            <p className={`${SERIF} text-[18px] font-bold text-[#1c2b4a]`}>Your list is being prepared</p>
            <p className="mx-auto mt-2 max-w-[320px] text-[14px] leading-relaxed text-[#5b6270]">
              {agentFirst} is hand-picking properties for you right now. You'll get a text as soon as they're ready.
            </p>
          </div>
        </div>
      )}

      {hasProperties && (
        <section className="px-4 pt-5">
          <div className="rounded-2xl bg-white px-6 py-6 shadow-[0_1px_3px_rgba(28,43,74,0.07)]">
            <h2 className={`${SERIF} text-[22px] font-bold text-[#1c2b4a]`}>Next Steps</h2>
            <ol className="mt-4 grid gap-4 sm:grid-cols-3">
              {[
                { step: "Heart your top 2–3 favorites", detail: "Choose the properties you’d most like to tour." },
                { step: `${agentFirst} schedules your tours`, detail: "They’ll coordinate everything with the properties." },
                { step: "List them when you apply", detail: "This protects your referral and any rebates, movers, or incentives you may qualify for." },
              ].map((s, i) => (
                <li key={i} className="flex items-start gap-3.5 sm:flex-col sm:gap-2">
                  <span className={`${SERIF} mt-[1px] flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-[#f2e6cd] text-[16px] font-bold text-[#8a6218]`}>
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[16.5px] font-semibold leading-[1.3] text-[#1c2b4a]">{s.step}</p>
                    <p className="mt-1 text-[14px] leading-[1.4] text-[#5b6270]">{s.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
            <p className="mt-4 border-t border-[#f0ece5] pt-3 text-[13px] leading-snug text-[#8a8681]">
              Pricing and availability can change daily. Specials may not be reflected in advertised base rent.
            </p>
          </div>
        </section>
      )}

      <Signature share={share} agentName={agentName} />
      <LegalFooter config={share.smart_form_config} brokerage={share.agent_brokerage} />
      <StickyBar agentFirst={agentFirst} phoneDigits={phoneDigits} phone={share.agent_phone} email={share.agent_email} />
    </Shell>
  )
}
