import { notFound } from "next/navigation"
import { Inter, Caveat } from "next/font/google"
import { createClient } from "@/lib/supabase/server"
import { hashShareToken, looksLikeShareToken } from "@/lib/clientShare/token"
import { mergeSmartFormConfig } from "@/app/smart-lead-form/_lib/mergeConfig"
import Footer from "@/app/smart-lead-form/_components/form/sections/Footer"
import RecommendationList, { type ClientProperty } from "./RecommendationList"
import { SKYLINE_PATH } from "@/lib/clientShare/skyline"

export const dynamic = "force-dynamic"

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800", "900"], variable: "--lbr-sans", display: "swap" })
const caveat = Caveat({ subsets: ["latin"], weight: ["600", "700"], variable: "--lbr-script", display: "swap" })

/**
 * The client-facing Recommendation page — locatorbeast.com/r/<token>
 *
 * ONE canonical URL and ONE immutable snapshot; the presentation is fully responsive
 * (a premium desktop landing at wide widths, a compact properties-first layout on a
 * phone). Opened from a link the locator texts or emails; the renter has no account,
 * so the route is public and the unguessable token IS the credential.
 *
 * SCOPE: recommends properties and collects favourites. Every access decision is made
 * inside lb_resolve_client_recommendations — a disabled list returns no property payload
 * at all. Nothing internal is reachable (no lead/workspace id, notes, credit, stage, or
 * the locator-only property_url). All property facts (price/special/rating/reasons) are
 * whatever was FROZEN into the snapshot at send time — the page omits any that are absent.
 */

const CANONICAL_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL || "https://locatorbeast.com"
const OG_IMAGE_PATH = "/locator-beast/r/og-recommendations.jpg"

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
    const { data } = await supabase.rpc("lb_resolve_client_recommendations", { p_token_hash: hashShareToken(token) })
    const share = (Array.isArray(data) ? data[0] : data) as { agent_name?: string | null } | undefined
    agentName = share?.agent_name?.trim() || null
  } catch {
    /* preview metadata must never fail the page */
  }
  const description = agentName ? `Personalized for you by ${agentName}` : "Personalized apartment recommendations"
  return {
    ...base,
    description,
    openGraph: {
      title: base.title, description, type: "website" as const, siteName: "Locator Beast",
      images: [{ url: OG_IMAGE_PATH, width: 1200, height: 630, alt: "Your Apartment Recommendations — Locator Beast" }],
    },
    twitter: { card: "summary_large_image" as const, title: base.title, description, images: [OG_IMAGE_PATH] },
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

const LOGO = "/locator-beast/locator-beast-black-logo-transparent.png"

// ── The approved presentation, as scoped CSS (every selector prefixed `lbr-`). ──
const STYLES = `
.lbr-root{--navy:#0e2545;--ink:#3a4658;--muted:#7a869a;--faint:#9aa6b8;--line:#e7ebf2;--line-soft:#eef1f7;--bg:#f5f7fb;--green:#1f9d55;--pill-bg:#dff5e6;--pill-tx:#136c3a;--gold:#f5a524;--accentbg:#eaf1fc;--accentbg2:#e3ecfb;font-family:var(--lbr-sans),-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:var(--ink);line-height:1.5;-webkit-font-smoothing:antialiased}
.lbr-root *{box-sizing:border-box}
.lbr-script-f{font-family:var(--lbr-script),'Segoe Script',cursive}
.lbr-page{background:var(--bg);min-height:100vh;padding:0}
.lbr-shell{max-width:1160px;margin:26px auto 40px;background:#fff;border:1px solid var(--line);border-radius:22px;overflow:hidden;box-shadow:0 30px 80px -50px rgba(14,37,69,.35)}
.lbr-hdr{display:flex;align-items:center;justify-content:space-between;padding:16px 26px;border-bottom:1px solid var(--line-soft);background:#fff}
.lbr-brand img{height:26px;width:auto;display:block}
.lbr-hdr-right{display:flex;align-items:center;gap:16px}
.lbr-curated{font-size:12.5px;color:var(--muted);text-align:right;line-height:1.3}
.lbr-curated b{color:var(--navy)}
.lbr-textbtn{display:inline-flex;align-items:center;gap:8px;background:var(--navy);color:#fff;font-weight:600;font-size:13.5px;padding:9px 16px;border-radius:11px;border:none;text-decoration:none}
.lbr-hero{position:relative;overflow:hidden;background:linear-gradient(180deg,#f7f9fc,#eef2f8)}
.lbr-sky{position:absolute;inset:0;background-image:linear-gradient(90deg,rgba(247,249,252,.99) 0%,rgba(247,249,252,.9) 30%,rgba(247,249,252,.45) 60%,rgba(247,249,252,.2) 100%),url('${SKYLINE_PATH}');background-size:cover;background-position:right 38%}
.lbr-hero-inner{position:relative;display:grid;grid-template-columns:1.2fr .8fr;gap:26px;align-items:center;padding:34px 40px 36px}
.lbr-eyebrow{font-size:13px;color:var(--muted);font-weight:500;margin:0 0 12px}
.lbr-eyebrow b{color:var(--navy)}
.lbr-eyebrow .lbr-rule{display:block;width:66px;height:3px;border-radius:3px;background:linear-gradient(90deg,var(--gold),#f7c66b);margin-top:9px}
.lbr-greet{font-size:40px;line-height:1.08;font-weight:800;color:var(--navy);letter-spacing:-.02em;margin:0 0 14px}
.lbr-subcopy{font-size:15.5px;color:var(--ink);max-width:430px;margin:0}
.lbr-hero-agent{position:relative;justify-self:end;width:100%;max-width:320px}
.lbr-agent-photo{width:100%;aspect-ratio:1/1;border-radius:18px;object-fit:cover;box-shadow:0 20px 50px -24px rgba(14,37,69,.55);background:#dbe3ee}
.lbr-agent-fallback{width:100%;aspect-ratio:1/1;border-radius:18px;display:flex;align-items:center;justify-content:center;font-size:56px;font-weight:800;color:#fff;background:linear-gradient(135deg,#22406e 0%,#16305a 100%);box-shadow:0 20px 50px -24px rgba(14,37,69,.55)}
.lbr-agent-card{position:relative;z-index:2;margin-top:-46px;margin-left:auto;width:248px;background:#fff;border:1px solid var(--line);border-radius:16px;padding:15px 18px;box-shadow:0 18px 44px -26px rgba(14,37,69,.4)}
.lbr-agent-card .lbr-an{font-size:18px;font-weight:800;color:var(--navy)}
.lbr-agent-card .lbr-ar{font-size:12.5px;color:var(--muted);margin-top:1px}
.lbr-agent-card .lbr-ascript{font-size:20px;color:var(--navy);line-height:1;margin:8px 0 12px}
.lbr-agent-card .lbr-arow{display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--ink);margin-top:6px;word-break:break-word}
.lbr-agent-card .lbr-arow svg{color:var(--gold);flex:none}
.lbr-hero-script{position:absolute;right:40px;bottom:14px;font-size:22px;color:var(--navy);text-align:right;line-height:1.05;opacity:.9}
.lbr-mobile-id{display:none}
.lbr-recs{padding:30px 40px 8px}
.lbr-recs-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:18px}
.lbr-recs-head h2{font-size:27px;font-weight:800;color:var(--navy);letter-spacing:-.02em;margin:0}
.lbr-recs-head p{margin:5px 0 0;font-size:14px;color:var(--muted)}
.lbr-recs-script{font-size:22px;color:var(--navy);text-align:right;line-height:1.05;opacity:.85}
.lbr-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
.lbr-card{background:#fff;border:1px solid var(--line);border-radius:18px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 10px 30px -22px rgba(14,37,69,.4)}
.lbr-ph{position:relative;aspect-ratio:16/10;background:linear-gradient(135deg,#c7d2e0,#9fb2c8);overflow:hidden}
.lbr-ph img{width:100%;height:100%;object-fit:cover;display:block}
.lbr-ph-fallback{position:absolute;inset:0;background:linear-gradient(135deg,#c7d2e0,#9fb2c8)}
.lbr-heart{position:absolute;top:12px;right:12px;width:40px;height:40px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(14,37,69,.28);cursor:pointer;border:none;padding:0}
.lbr-heart:active{transform:scale(.9)}
.lbr-pill{position:absolute;left:12px;bottom:12px;background:var(--pill-bg);color:var(--pill-tx);font-size:12.5px;font-weight:700;padding:6px 12px;border-radius:999px;box-shadow:0 4px 10px rgba(14,37,69,.14)}
.lbr-body{padding:16px 17px 17px;display:flex;flex-direction:column;flex:1}
.lbr-pname{font-size:18px;font-weight:800;color:var(--navy);letter-spacing:-.01em;margin:0}
.lbr-addr{display:flex;align-items:flex-start;gap:6px;font-size:13px;color:var(--muted);margin-top:5px;line-height:1.35}
.lbr-addr svg{color:var(--faint);flex:none;margin-top:2px}
.lbr-rating{display:flex;align-items:center;gap:6px;font-size:13.5px;color:var(--ink);margin-top:7px;font-weight:600}
.lbr-rating svg{color:var(--gold)}
.lbr-why{margin-top:13px}
.lbr-why-lbl{font-size:13px;font-weight:700;color:var(--navy);margin:0 0 7px}
.lbr-why ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.lbr-why li{display:flex;gap:8px;font-size:13.5px;color:var(--ink);line-height:1.35}
.lbr-check{color:var(--green);flex:none;margin-top:2px}
.lbr-cardfoot{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-top:16px}
.lbr-pl{font-size:12px;color:var(--muted)}
.lbr-pv{font-size:18px;font-weight:800;color:var(--navy);letter-spacing:-.01em}
.lbr-pmo{font-size:12px;font-weight:600;color:var(--muted)}
.lbr-view{display:inline-flex;align-items:center;gap:7px;background:var(--navy);color:#fff;font-weight:600;font-size:13px;padding:9px 15px;border-radius:11px;border:none;text-decoration:none;white-space:nowrap}
.lbr-close{margin:26px 40px 0;background:linear-gradient(180deg,var(--accentbg),var(--accentbg2));border:1px solid #dbe6f7;border-radius:20px;padding:26px 30px;display:grid;grid-template-columns:auto 1fr auto;gap:26px;align-items:center}
.lbr-close-photo{width:132px;height:132px;border-radius:50%;object-fit:cover;border:5px solid #fff;box-shadow:0 14px 34px -18px rgba(14,37,69,.5);background:#dbe3ee}
.lbr-close-fallback{width:132px;height:132px;border-radius:50%;border:5px solid #fff;display:flex;align-items:center;justify-content:center;font-size:44px;font-weight:800;color:#fff;background:linear-gradient(135deg,#22406e,#16305a);box-shadow:0 14px 34px -18px rgba(14,37,69,.5)}
.lbr-close-copy h3{font-size:23px;font-weight:800;color:var(--navy);margin:0 0 8px}
.lbr-close-copy p{font-size:14.5px;color:var(--ink);margin:0 0 12px;max-width:520px}
.lbr-sig{font-size:26px;color:var(--navy);line-height:.9}
.lbr-sigsub{font-size:13px;color:var(--muted);margin-top:2px}
.lbr-close-actions{display:flex;flex-direction:column;gap:10px;min-width:190px}
.lbr-act{display:inline-flex;align-items:center;justify-content:center;gap:9px;font-weight:600;font-size:14px;padding:12px 18px;border-radius:12px;text-decoration:none}
.lbr-act.lbr-primary{background:var(--navy);color:#fff}
.lbr-act.lbr-ghost{background:#fff;color:var(--navy);border:1px solid #cdd9ec}
.lbr-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin:22px 40px 0}
.lbr-step{display:flex;gap:12px;align-items:flex-start}
.lbr-step .lbr-n{flex:none;width:34px;height:34px;border-radius:50%;background:#eef2fb;color:var(--navy);font-weight:800;display:flex;align-items:center;justify-content:center;font-size:15px}
.lbr-step b{display:block;color:var(--navy);font-size:14.5px;font-weight:700}
.lbr-step span{font-size:13px;color:var(--muted)}
.lbr-foot{margin-top:26px;padding:22px 40px 26px;border-top:1px solid var(--line-soft);display:flex;align-items:center;justify-content:space-between;gap:16px}
.lbr-foot img{height:24px}
.lbr-foot .lbr-tag{font-size:13px;color:var(--muted)}
.lbr-legal{padding:6px 26px 26px}
.lbr-notice{max-width:520px;margin:34px auto;padding:0 20px}
.lbr-notice-card{background:#fff;border:1px solid var(--line);border-radius:18px;padding:30px 26px;text-align:center;box-shadow:0 20px 60px -44px rgba(14,37,69,.4)}
.lbr-notice-card h1{font-size:20px;font-weight:800;color:var(--navy);margin:0}
.lbr-notice-card p{font-size:14.5px;color:var(--muted);margin:10px auto 0;max-width:330px;line-height:1.5}
@media (max-width:640px){
.lbr-shell{margin:0;border:none;border-radius:0;box-shadow:none}
.lbr-hdr{padding:14px 16px}
.lbr-hdr-right .lbr-curated,.lbr-hdr-right .lbr-textbtn{display:none}
.lbr-hdr-right .lbr-menu{display:block}
.lbr-hero{background:#fff}
.lbr-sky{display:none}
.lbr-hero-inner{grid-template-columns:1fr;gap:0;padding:18px 16px 6px}
.lbr-greet{font-size:30px;margin-bottom:10px}
.lbr-subcopy{font-size:14.5px}
.lbr-hero-script,.lbr-hero-agent{display:none}
.lbr-mobile-id{display:flex;align-items:center;gap:13px;margin:16px 16px 2px;padding:13px 14px;border:1px solid var(--line);border-radius:16px;background:#fff}
.lbr-mobile-id img,.lbr-mobile-id .lbr-mid-fb{width:58px;height:58px;border-radius:50%;object-fit:cover;flex:none}
.lbr-mobile-id .lbr-mid-fb{display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800;color:#fff;background:linear-gradient(135deg,#22406e,#16305a)}
.lbr-mobile-id .lbr-an{font-size:16px;font-weight:800;color:var(--navy)}
.lbr-mobile-id .lbr-ar{font-size:12px;color:var(--muted)}
.lbr-mobile-id .lbr-ascript{font-size:17px;color:var(--navy);margin-top:2px}
.lbr-recs{padding:20px 16px 8px}
.lbr-recs-head{flex-direction:column;align-items:flex-start;gap:2px}
.lbr-recs-head h2{font-size:23px}
.lbr-recs-script{display:none}
.lbr-grid{grid-template-columns:1fr;gap:16px}
.lbr-ph{aspect-ratio:16/11}
.lbr-close{margin:22px 16px 0;grid-template-columns:1fr;text-align:center;gap:14px;padding:24px 20px}
.lbr-close-photo,.lbr-close-fallback{width:104px;height:104px;margin:0 auto}
.lbr-close-copy p{margin-left:auto;margin-right:auto}
.lbr-close-actions{min-width:0}
.lbr-steps{grid-template-columns:1fr;margin:20px 16px 0;gap:14px}
.lbr-foot{margin-top:22px;padding:20px 16px 24px;flex-direction:column;text-align:center;gap:10px}
.lbr-legal{padding:6px 16px 24px}
}
`

// Fix an accidental token in the gradient literals above (kept single-source):
const CSS = STYLES

function Phone() {
  return (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .3 1.9.6 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.1a2 2 0 0 1 2.1-.5c.9.3 1.8.5 2.8.6a2 2 0 0 1 1.7 2Z" /></svg>)
}
function Mail() {
  return (<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></svg>)
}
function ChatIcon() {
  return (<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>)
}
function PhoneBig() {
  return (<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .3 1.9.6 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.1a2 2 0 0 1 2.1-.5c.9.3 1.8.5 2.8.6a2 2 0 0 1 1.7 2Z" /></svg>)
}
function MailBig() {
  return (<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></svg>)
}

/** The agent's OWN configured legal block (TREC presets + custom disclosures), rendered
 *  by the SAME component the public Smart Lead Form uses. */
function LegalFooter({ config, brokerage }: { config: unknown; brokerage: string | null }) {
  const merged = mergeSmartFormConfig(config ?? {})
  const withBrokerage = brokerage ? { ...merged, copy: { ...merged.copy, brokerageName: brokerage } } : merged
  return (
    <div className="lbr-legal">
      <Footer config={withBrokerage} compact />
    </div>
  )
}

function NoticeScreen({
  title, body, config, brokerage,
}: { title: string; body: string; config: unknown; brokerage: string | null }) {
  return (
    <div className={`${inter.variable} ${caveat.variable} lbr-root`}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="lbr-page"><div className="lbr-shell">
        <header className="lbr-hdr">
          <span className="lbr-brand">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={LOGO} alt="Locator Beast" /></span>
        </header>
        <div className="lbr-notice">
          <div className="lbr-notice-card">
            <h1>{title}</h1>
            <p>{body}</p>
          </div>
        </div>
        <LegalFooter config={config} brokerage={brokerage} />
      </div></div>
    </div>
  )
}

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

  // Deduped viewing session + first/last viewed. Unchanged.
  void supabase.rpc("lb_record_client_share_view", { p_token_hash: tokenHash })

  const firstName = share.client_first_name?.trim() || null
  const agentName = share.agent_name?.trim() || "Your locator"
  const agentFirst = agentName.split(/\s+/)[0]
  const agentTitle = share.agent_title?.trim() || "Apartment Locator"
  const brokerage = share.agent_brokerage?.trim() || null
  const email = share.agent_email?.trim() || null
  const phoneRaw = share.agent_phone?.trim() || null
  const phoneHref = phoneRaw ? phoneRaw.replace(/[^\d+]/g, "") : null
  const photo = share.agent_photo_url?.trim() || null
  const initial = agentName.slice(0, 1).toUpperCase()

  if (share.status === "disabled") {
    return (
      <NoticeScreen
        title="This list isn't available right now"
        body="Please reach out to your locator for access, or when you're ready to continue your apartment search."
        config={share.smart_form_config}
        brokerage={brokerage}
      />
    )
  }

  const properties = share.properties ?? []
  if (properties.length === 0) {
    return (
      <NoticeScreen
        title="Your list is being prepared"
        body={`${agentFirst} is still putting your recommendations together — you'll get a text as soon as they're ready.`}
        config={share.smart_form_config}
        brokerage={brokerage}
      />
    )
  }

  const curated = firstName ? `Curated for ${firstName} · by ${agentName}` : `Curated by ${agentName}`
  const countLine = `${properties.length} ${properties.length === 1 ? "property" : "properties"} selected for you · Tap the heart on any property you like.`

  return (
    <div className={`${inter.variable} ${caveat.variable} lbr-root`}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="lbr-page"><div className="lbr-shell">

        {/* HEADER */}
        <header className="lbr-hdr">
          <span className="lbr-brand">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={LOGO} alt="Locator Beast" /></span>
          <div className="lbr-hdr-right">
            <div className="lbr-curated">
              {firstName ? (<>Curated for <b>{firstName}</b><br />by <b>{agentName}</b></>) : (<>by <b>{agentName}</b></>)}
            </div>
            {phoneHref && (
              <a className="lbr-textbtn" href={`sms:${phoneHref}`}><ChatIcon />Text {agentFirst}</a>
            )}
          </div>
        </header>

        {/* HERO — desktop: agent + skyline; the sky + agent hide on mobile */}
        <section className="lbr-hero">
          <div className="lbr-sky" aria-hidden />
          <div className="lbr-hero-inner">
            <div>
              <p className="lbr-eyebrow">{curated}<span className="lbr-rule" /></p>
              <h1 className="lbr-greet">{firstName ? `Hey ${firstName},` : "Hey there,"}<br />I found some great options for you.</h1>
              <p className="lbr-subcopy">These apartments match what you&rsquo;re looking for. Favorite the ones you like and I&rsquo;ll take care of the next steps.</p>
            </div>
            <div className="lbr-hero-agent">
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="lbr-agent-photo" src={photo} alt={agentName} />
              ) : (
                <div className="lbr-agent-fallback" aria-hidden>{initial}</div>
              )}
              <div className="lbr-agent-card">
                <div className="lbr-an">{agentName}</div>
                <div className="lbr-ar">{agentTitle}</div>
                <div className="lbr-ascript lbr-script-f">Here to help you find home.</div>
                {phoneRaw && <div className="lbr-arow"><Phone />{phoneRaw}</div>}
                {email && <div className="lbr-arow"><Mail />{email}</div>}
                {brokerage && <div className="lbr-arow" style={{ color: "#4a4f58", fontWeight: 500 }}>{brokerage}</div>}
              </div>
            </div>
          </div>
        </section>

        {/* MOBILE compact identity (no big portrait before the properties) */}
        <div className="lbr-mobile-id">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt={agentName} />
          ) : (
            <div className="lbr-mid-fb" aria-hidden>{initial}</div>
          )}
          <div>
            <div className="lbr-an">{agentName}</div>
            <div className="lbr-ar">{agentTitle}{brokerage ? ` · ${brokerage}` : ""}</div>
            <div className="lbr-ascript lbr-script-f">Here to help you find home.</div>
          </div>
        </div>

        {/* RECOMMENDATIONS */}
        <section className="lbr-recs">
          <div className="lbr-recs-head">
            <div>
              <h2>Your Recommendations</h2>
              <p>{countLine}</p>
            </div>
            <div className="lbr-recs-script lbr-script-f">Great apartments.<br />A brighter tomorrow.</div>
          </div>
          <RecommendationList properties={properties} token={token} />
        </section>

        {/* AGENT CLOSE */}
        <section className="lbr-close">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="lbr-close-photo" src={photo} alt={agentName} />
          ) : (
            <div className="lbr-close-fallback" aria-hidden>{initial}</div>
          )}
          <div className="lbr-close-copy">
            <h3>See something you like?</h3>
            <p>Favorite your top choices and {agentFirst} will help you schedule tours, answer any questions, and take care of the next steps.</p>
            <div className="lbr-sig lbr-script-f">{agentName}</div>
            <div className="lbr-sigsub">{agentName} · {agentTitle}{brokerage ? ` · ${brokerage}` : ""}</div>
          </div>
          <div className="lbr-close-actions">
            {phoneHref && <a className="lbr-act lbr-primary" href={`sms:${phoneHref}`}><ChatIcon />Text {agentFirst}</a>}
            {phoneHref && <a className="lbr-act lbr-ghost" href={`tel:${phoneHref}`}><PhoneBig />Call {agentFirst}</a>}
            {email && <a className="lbr-act lbr-ghost" href={`mailto:${email}`}><MailBig />Email {agentFirst}</a>}
          </div>
        </section>

        {/* NEXT STEPS */}
        <div className="lbr-steps">
          <div className="lbr-step"><div className="lbr-n">1</div><div><b>Favorite</b><span>the properties you like</span></div></div>
          <div className="lbr-step"><div className="lbr-n">2</div><div><b>I&rsquo;ll reach out</b><span>to confirm your top choices</span></div></div>
          <div className="lbr-step"><div className="lbr-n">3</div><div><b>We&rsquo;ll schedule tours</b><span>and take the next steps</span></div></div>
        </div>

        {/* FOOTER */}
        <footer className="lbr-foot">
          {/* eslint-disable-next-line @next/next/no-img-element */}<img src={LOGO} alt="Locator Beast" />
          <div className="lbr-tag">More apartments. A brighter tomorrow.</div>
        </footer>

        <LegalFooter config={share.smart_form_config} brokerage={brokerage} />
      </div></div>
    </div>
  )
}
