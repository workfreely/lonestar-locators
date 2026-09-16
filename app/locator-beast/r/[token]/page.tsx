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
 * details are deliberately absent — the property's own website owns that data
 * and keeps it current.
 *
 * WHY IT LIVES UNDER app/locator-beast/ RATHER THAN THE APP ROOT
 * middleware.ts rewrites everything on the locatorbeast.com host under
 * /locator-beast/* unless the path matches APP_PATH_PATTERN. `r` is not in that
 * list, so a page at app/r/[token] would 404 on the live domain.
 *
 * EVERY access decision is made inside lb_resolve_client_recommendations, not
 * here. A paused list comes back with no property payload whatsoever — fetching
 * the properties and then hiding them in JSX would still ship them in this
 * page's serialised data.
 *
 * Nothing internal is reachable: no lead id, no workspace id, no notes, no
 * credit or background information, no commissions, no CRM stage, no client
 * contact details, and never property_url — the locator-only source link.
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
    robots: { index: false, follow: false },   // a texted link should not be indexed
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

/**
 * Hero. Deliberately carries NO product branding: the client is here because
 * their locator sent them a list, not because they are evaluating software.
 *
 * The skyline is the SAME artwork the link preview uses. Copy is passed in so the
 * unavailable / being-prepared states can show the eyebrow masthead WITHOUT the
 * "narrowed it down" / "heart these" lines that only make sense over a real list.
 */
function Hero({ headline, subline }: { headline?: string | null; subline?: string | null }) {
  return (
    <header className="relative overflow-hidden px-6 pb-8 pt-9">
      {/* Photograph, then a wash of the page colour over it. */}
      <div aria-hidden className="absolute inset-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={SKYLINE_PATH} alt="" className="h-full w-full object-cover object-bottom" />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(180deg, rgba(247,244,239,0.86) 0%, rgba(247,244,239,0.72) 42%, rgba(247,244,239,0.86) 78%, rgba(247,244,239,1) 100%)",
          }}
        />
      </div>
      <div className="relative text-center">
        <p className="text-[12px] font-bold uppercase tracking-[0.2em] text-[#a8792a]">
          Your Apartment Recommendations
        </p>
        {headline && (
          <h1 className={`${SERIF} mt-3 text-[27px] font-bold leading-[1.16] text-[#1c2b4a]`}>{headline}</h1>
        )}
        {subline && <p className="mt-2.5 text-[16px] text-[#4a5164]">{subline}</p>}
      </div>
    </header>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  // Mobile is the design target — this arrives by text. The max-width keeps the
  // phone composition intact on desktop rather than stretching cards into
  // unreadable full-width rows.
  return (
    <div className="min-h-screen bg-[#f7f4ef]">
      <div className="mx-auto w-full max-w-[430px] pb-8">{children}</div>
    </div>
  )
}

/**
 * The agent's OWN configured legal block, rendered by the SAME component the
 * public Smart Lead Form uses. Texas TREC presets and custom disclosure rows come
 * straight from their saved smart_form_config, so there is one place to edit them.
 */
function LegalFooter({ config, brokerage }: { config: unknown; brokerage: string | null }) {
  const merged = mergeSmartFormConfig(config ?? {})
  const withBrokerage = brokerage ? { ...merged, copy: { ...merged.copy, brokerageName: brokerage } } : merged
  return (
    <div className="px-2 pt-3">
      <Footer config={withBrokerage} compact />
    </div>
  )
}

/**
 * Compact single-message screen for the non-list states (being prepared / paused).
 * Old page shell + typography: the eyebrow masthead, then ONE white card carrying
 * the message — no duplicated hero copy, no Next Steps, no extra CTA.
 */
function Notice({
  title, body, config, brokerage,
}: { title: string; body: string; config: unknown; brokerage: string | null }) {
  return (
    <Shell>
      <Hero />
      <div className="px-3.5 pt-4">
        <div className="rounded-2xl bg-white px-6 py-8 text-center shadow-[0_2px_10px_rgba(10,26,60,0.08)]">
          <h1 className="text-[19px] font-bold text-[#0a1a3c]">{title}</h1>
          <p className="mx-auto mt-2.5 max-w-[300px] text-[14px] leading-relaxed text-[#5b6270]">{body}</p>
        </div>
        {/* A disclosure is not property data, so it stays even while paused. */}
        <LegalFooter config={config} brokerage={brokerage} />
      </div>
    </Shell>
  )
}

export default async function ClientRecommendationsPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  if (!looksLikeShareToken(token)) notFound()   // junk path costs no DB round trip

  const supabase = await createClient()
  const tokenHash = hashShareToken(token)

  const { data, error } = await supabase.rpc("lb_resolve_client_recommendations", {
    p_token_hash: tokenHash,
  })
  const share = (Array.isArray(data) ? data[0] : data) as Resolved | undefined

  // Unknown AND revoked both land here, deliberately indistinguishable.
  if (error || !share) notFound()

  // Records a deduped viewing SESSION and stamps first/last viewed.
  void supabase.rpc("lb_record_client_share_view", { p_token_hash: tokenHash })

  const firstName = share.client_first_name?.trim() || null
  const agentName = share.agent_name?.trim() || "Your locator"
  const agentFirst = agentName.split(/\s+/)[0]
  const phoneHref = share.agent_phone ? share.agent_phone.replace(/[^\d+]/g, "") : null

  // A Disabled list withholds its properties and shows a neutral, client-facing
  // unavailable screen — compact, no recommendation instructions.
  if (share.status === "disabled") {
    return (
      <Notice
        title="This list isn't available right now"
        body="Please reach out to your locator for access, or when you're ready to continue your apartment search."
        config={share.smart_form_config}
        brokerage={share.agent_brokerage}
      />
    )
  }

  const properties = share.properties ?? []

  // An active link with an empty list is a real state: the locator is still
  // building it. Compact "being prepared" message in the same shell.
  if (properties.length === 0) {
    return (
      <Notice
        title="Your list is being prepared"
        body={`${agentFirst} is still putting your recommendations together — you'll get a text as soon as they're ready.`}
        config={share.smart_form_config}
        brokerage={share.agent_brokerage}
      />
    )
  }

  return (
    <Shell>
      <Hero
        headline={firstName ? `${firstName}, I narrowed it down to your best options.` : "I narrowed it down to your best options."}
        subline="Heart any you’d like to tour."
      />

      <RecommendationList properties={properties} token={token} />

      {/* Secondary by construction: smaller type, lighter card, and it sits
          after the list rather than competing with it. */}
      <section className="px-4 pt-3">
        <div className="rounded-xl bg-white px-5 py-5 shadow-[0_1px_3px_rgba(28,43,74,0.07)]">
          <h2 className={`${SERIF} text-[23px] font-bold text-[#1c2b4a]`}>Next Steps</h2>
          <ol className="mt-4 flex flex-col gap-4">
            {[
              { step: "Heart your top 2–3 favorites", detail: "Choose the properties you’d most like to tour." },
              { step: "I’ll get your tour scheduled", detail: "I’ll coordinate everything with the properties." },
              {
                step: "List me as your Realtor or Locator when you apply",
                detail: "This helps protect your referral and any rebates, movers, or other incentives you may qualify for.",
              },
            ].map((s, i) => (
              <li key={i} className="flex items-start gap-3.5">
                <span className={`${SERIF} mt-[1px] flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-full bg-[#f2e6cd] text-[17px] font-bold text-[#8a6218]`}>
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-[17.5px] font-semibold leading-[1.35] text-[#1c2b4a]">{s.step}</p>
                  <p className="mt-1 text-[15px] leading-[1.4] text-[#5b6270]">{s.detail}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-4 border-t border-[#f0ece5] pt-3 text-[13.5px] leading-snug text-[#8a8681]">
            Pricing and availability can change daily. Specials may not be reflected in advertised base rent.
          </p>
        </div>
      </section>

      {/* A professional signature — the person behind the list, sized to close
          the page rather than to become another content section. */}
      <section className="px-4 pt-3">
        <div className="flex items-center gap-4 rounded-xl bg-white px-4 py-4 shadow-[0_1px_3px_rgba(28,43,74,0.07)]">
          <div className="h-[92px] w-[92px] shrink-0 overflow-hidden rounded-full bg-[#e9e5de]">
            {share.agent_photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={share.agent_photo_url} alt={agentName} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[30px] font-bold text-[#a8a49c]">
                {agentName.slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className={`${SERIF} text-[19px] font-bold leading-tight text-[#1c2b4a]`}>{agentName}</p>
            <p className="mt-1 text-[12px] leading-snug text-[#6b7280]">
              {share.agent_title ?? "Licensed Apartment Locator"}
            </p>
            {share.agent_brokerage && (
              <p className="mt-[3px] text-[12px] font-medium leading-snug text-[#4a4f58]">{share.agent_brokerage}</p>
            )}
            {/* Tappable — this page is opened on a phone. */}
            {phoneHref && (
              <a href={`tel:${phoneHref}`} className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-[#1c2b4a]">
                <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden fill="none" stroke="#c9932f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .3 1.9.6 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.1a2 2 0 0 1 2.1-.5c.9.3 1.8.5 2.8.6a2 2 0 0 1 1.7 2Z" />
                </svg>
                {share.agent_phone}
              </a>
            )}
            {share.agent_email && (
              <a href={`mailto:${share.agent_email}`} className="mt-0.5 flex items-center gap-1.5 truncate text-[12.5px] text-[#1c2b4a]">
                <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden className="shrink-0" fill="none" stroke="#c9932f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" />
                </svg>
                <span className="truncate">{share.agent_email}</span>
              </a>
            )}
          </div>
        </div>
      </section>

      <LegalFooter config={share.smart_form_config} brokerage={share.agent_brokerage} />
    </Shell>
  )
}
