import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { serviceAreasLabel } from "@/lib/markets/catalog"
import { mergeSmartFormConfig } from "@/app/smart-lead-form/_lib/mergeConfig"
import type { SmartLeadFormConfig } from "@/app/smart-lead-form/_lib/types"
import AgentPhoto from "@/app/smart-lead-form/_components/form/sections/AgentPhoto"
import AgentInfoText from "@/app/smart-lead-form/_components/form/sections/AgentInfoText"
import Footer from "@/app/smart-lead-form/_components/form/sections/Footer"
import JoinCtas from "./_components/JoinCtas"

export const dynamic = "force-dynamic"

// The Locator Beast homepage — opened in a new tab so a prospect can learn more
// without losing this recruiting page.
const LOCATOR_BEAST_FEATURES_URL = "https://locatorbeast.com"

type PublicJoin = {
  agent_name: string
  brokerage_name: string | null
  photo_url: string | null
  service_areas: string[]
  has_referral_url: boolean
}

// Public Beast Network recruiting page — served at locatorbeast.com/join/{agent-slug}
// (rewritten to /locator-beast/join/{slug} on the marketing host). Resolved
// SERVER-SIDE from public data only (lb_resolve_public_join), which returns a row
// ONLY when the slug maps to an ACTIVE network member. Every brokerage reference is
// dynamic (sponsor.brokerage_name) — nothing brokerage-specific is hard-coded.
// Intentionally short and scannable: hero + two-step action + benefit notice + FAQ
// + disclosure.
export default async function JoinPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params

  const supabase = await createClient()
  // Resolve the sponsor (gates the page: a row exists only for an ACTIVE member)
  // AND the sponsor's SAVED smart-form config, so the shared footer renders the
  // SAME legal/disclosure links here as on their Smart Lead Form. Both RPCs key on
  // the same workspace slug; lb_resolve_public_form is public (granted to anon) and
  // reused as-is — no new RPC, no schema change. The join page still 404s purely on
  // the membership gate below; the form lookup only supplies footer disclosures.
  const [{ data, error }, { data: formData }] = await Promise.all([
    supabase.rpc("lb_resolve_public_join", { p_slug: slug }),
    supabase.rpc("lb_resolve_public_form", { p_username: slug }),
  ])

  const sponsor = (Array.isArray(data) ? data[0] : data) as PublicJoin | undefined
  if (error || !sponsor) {
    notFound()
  }

  const formRow = (Array.isArray(formData) ? formData[0] : formData) as { form_config?: unknown } | undefined

  // Reuse the Smart Form identity components (photo/name/brokerage/areas) by
  // shaping their config — same visual language, live sponsor identity. Seed from
  // the sponsor's SAVED config so footer disclosures come through the canonical
  // source (workspaces.smart_form_config); identity fields are overridden below
  // with the live join-resolver values.
  const base = mergeSmartFormConfig(formRow?.form_config ?? {})
  const config: SmartLeadFormConfig = {
    ...base,
    sections: {
      ...base.sections,
      visibility: {
        ...base.sections.visibility,
        brokerageInfo: false, // brokerage is stated prominently in the hero eyebrow/copy
        serviceAreas: false, // service areas intentionally not shown on the recruiting page
        phoneNumber: false,
      },
    },
    branding: {
      ...base.branding,
      agentPhotoUrl: sponsor.photo_url,
      // The recruiting page always uses the Smart Lead Form's Large photo
      // (168px mobile / 208px desktop) rather than inheriting whichever size the
      // sponsor happens to have chosen for their own form. Pinning the SIZE NAME
      // here means AgentPhoto keeps reading AGENT_PHOTO_SIZES — there is no
      // second definition of those pixel values, and no size control on this page.
      agentPhotoSize: "large",
    },
    copy: {
      ...base.copy,
      agentName: sponsor.agent_name,
      brokerageName: sponsor.brokerage_name ?? base.copy.brokerageName,
      serviceAreas: sponsor.service_areas?.length ? serviceAreasLabel(sponsor.service_areas) : "",
    },
  }

  // Dynamic brokerage name everywhere.
  const brokerage = (sponsor.brokerage_name ?? "").trim() || "my brokerage"
  const hasBrokerageName = Boolean((sponsor.brokerage_name ?? "").trim())

  return (
    <main className="min-h-full bg-white">
      {/* ── HERO — exclusive opportunity ─────────────────────────────────── */}
      <section className="bg-[#0b0f1a] px-5 pb-8 pt-8 text-center text-white sm:px-8 sm:pb-12 sm:pt-12">
        <div className="mx-auto max-w-lg">
          <p className="text-[15px] font-semibold uppercase tracking-[0.16em] text-[#8fb3ff]">
            {hasBrokerageName ? `Join my network at ${brokerage}` : "Join my network"}
          </p>
          <h1 className="mt-4 text-balance break-words text-[clamp(22px,6.1vw,26px)] font-bold leading-[1.12] tracking-tight sm:text-[clamp(26px,7vw,36px)]">
            {/* Two clean lines on ALL viewports — "Get Free Access to the" /
                "AI-Powered Locator Beast CRM" — via the intentional <br> before
                "AI-Powered" plus a nowrap so it never splits at the hyphen. On
                MOBILE the base font is the LARGEST that still keeps line 2 on one
                line at common iPhone widths (375/390/430) with no overflow:
                clamp(22px,6.1vw,26px) → ~23px @375, ~24px @390, 26px @430. sm+
                restores the original desktop size (clamp 26–36px), unchanged. */}
            Get Free Access to the{" "}
            <br />
            <span className="whitespace-nowrap">AI-Powered</span> Locator Beast CRM
          </h1>

          <div className="mt-8 flex justify-center">
            <AgentPhoto config={config} />
          </div>
          {/* The 208px photo needs more air beneath it than the identity block
              needs internally: this wrapper's margin now exceeds AgentInfoText's
              own mt-3 (which was winning the collapse), and `tight` pulls the
              title up under the name so name+title read as one unit. */}
          <div className="mt-[20px]">
            {/* verifiedBadge: the shield was removed from the public Smart Lead Form,
                but this recruiting page is a different audience and was not part of
                that decision — it keeps its existing look until changed deliberately. */}
            <AgentInfoText config={config} theme="dark" tight verifiedBadge />
          </div>

          <a
            href={LOCATOR_BEAST_FEATURES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-[18px] font-semibold text-[#8fb3ff] transition-colors hover:text-white"
          >
            See what&rsquo;s included in Locator Beast <span aria-hidden="true">&rarr;</span>
          </a>
        </div>
      </section>

      {/* ── THREE-STEP ACTION ────────────────────────────────────────────── */}
      <section className="px-5 py-8 sm:px-8 sm:py-12">
        <div className="mx-auto max-w-lg">
          <JoinCtas slug={slug} hasReferralUrl={sponsor.has_referral_url} brokerageName={brokerage} />
        </div>
      </section>

      {/* ── FAQ — comfortable, readable body text (16–18px) ──────────────── */}
      <section className="bg-[#f8f9fb] px-5 py-8 sm:px-8 sm:py-12">
        <div className="mx-auto max-w-lg">
          <h2 className="text-[22px] font-bold text-[#0b0f1a] sm:text-[26px]">FAQs</h2>
          <div className="mt-6 space-y-7">
            <Faq q="Do I have to use this referral link?">
              Yes. You must join {brokerage} through the referral link on this page to qualify for free
              Locator Beast access.
            </Faq>
            <Faq q={`What if I'm already with ${brokerage}?`}>
              To qualify, you must join {brokerage} through a Locator Beast Referral Network member&rsquo;s
              referral link. Free access cannot be added after joining through an agent who is not a Locator
              Beast member.
            </Faq>
            <Faq q="When do I get access to Locator Beast?">
              After joining, create your Locator Beast account. Your free access will be activated once
              your Network Membership is verified.
            </Faq>
            <Faq q="Can I invite other agents?">
              Yes. Once active, you&rsquo;ll get your own personal referral link to invite other agents and
              give them free access to Locator Beast.
            </Faq>
            <Faq q={`Is Locator Beast provided by ${brokerage}?`}>
              No. Locator Beast is an independent platform and is not owned, operated, or offered by{" "}
              {brokerage}.
            </Faq>
          </div>
        </div>
      </section>

      <Footer config={config} />
    </main>
  )
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[17px] font-semibold text-[#0b0f1a] sm:text-[18px]">{q}</p>
      <p className="mt-2 text-[16px] leading-relaxed text-[#4b5563] sm:text-[17px]">{children}</p>
    </div>
  )
}
