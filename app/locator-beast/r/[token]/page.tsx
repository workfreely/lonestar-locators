import { notFound } from "next/navigation"
import { Inter, Caveat } from "next/font/google"
import { createClient } from "@/lib/supabase/server"
import { hashShareToken, looksLikeShareToken } from "@/lib/clientShare/token"
import { mergeSmartFormConfig } from "@/app/smart-lead-form/_lib/mergeConfig"
import Footer from "@/app/smart-lead-form/_components/form/sections/Footer"
import RecommendationList, { type ClientProperty } from "./RecommendationList"
import type { TourType, TourWindow } from "@bc/companion-shared"
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
 * Every access decision is made inside lb_resolve_client_recommendations — a disabled
 * list returns no property payload at all. Nothing internal is reachable (no lead/
 * workspace id, notes, credit, stage, or the locator-only property_url). All property
 * facts (price/special/rating/reasons) are whatever was FROZEN into the snapshot at send
 * time; the page omits any that are absent.
 *
 * HERO IMAGE: SKYLINE_PATH is a deliberately GENERIC, non-market-specific city skyline
 * (see lib/clientShare/skyline.ts) — the safe neutral backdrop. The resolver does not
 * expose the client's market, so the page never claims a specific city and never infers
 * one from property data. If a per-market image is wanted later, the market would first
 * have to be surfaced by the resolver + backed by per-market assets.
 */

const CANONICAL_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL || "https://locatorbeast.com"
const OG_IMAGE_PATH = "/locator-beast/r/og-recommendations.jpg"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  // Generic fallback title (no client info). Rendered server-side so link-preview
  // crawlers get it without running client JS.
  const genericTitle = "Your Custom Property List"
  const base = {
    metadataBase: new URL(CANONICAL_ORIGIN),
    title: genericTitle,
    robots: { index: false, follow: false },
  }
  const { token } = await params
  if (!looksLikeShareToken(token)) return base
  let agentName: string | null = null
  let firstName: string | null = null
  try {
    const supabase = await createClient()
    const { data } = await supabase.rpc("lb_resolve_client_recommendations", { p_token_hash: hashShareToken(token) })
    const share = (Array.isArray(data) ? data[0] : data) as { agent_name?: string | null; client_first_name?: string | null } | undefined
    agentName = share?.agent_name?.trim() || null
    firstName = share?.client_first_name?.trim() || null
  } catch {
    /* preview metadata must never fail the page */
  }
  // Rich-preview / OG title. FIRST NAME ONLY — never last name, lead/list/property ids,
  // email, phone, or any other client data. The OG image artwork is unchanged.
  const title = firstName ? `${firstName}’s Custom Property List` : genericTitle
  const description = agentName ? `Personalized for you by ${agentName}` : "Personalized apartment recommendations"
  return {
    ...base,
    title,
    description,
    openGraph: {
      title, description, type: "website" as const, siteName: "Locator Beast",
      images: [{ url: OG_IMAGE_PATH, width: 1200, height: 630, alt: "Your Apartment Recommendations — Locator Beast" }],
    },
    twitter: { card: "summary_large_image" as const, title, description, images: [OG_IMAGE_PATH] },
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

// ── The approved presentation, as scoped CSS (every selector prefixed `lbr-`). ──
const CSS = `
.lbr-root{--navy:#0e2545;--ink:#3a4658;--muted:#7a869a;--faint:#9aa6b8;--line:#e7ebf2;--line-soft:#eef1f7;--bg:#f5f7fb;--green:#1f9d55;--pill-bg:#dff5e6;--pill-tx:#136c3a;--gold:#f5a524;font-family:var(--lbr-sans),-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:var(--ink);line-height:1.5;-webkit-font-smoothing:antialiased}
.lbr-root *{box-sizing:border-box}
.lbr-script-f{font-family:var(--lbr-script),'Segoe Script',cursive}
.lbr-page{background:var(--bg);min-height:100vh}
.lbr-shell{max-width:1160px;margin:26px auto 40px;background:#fff;border:1px solid var(--line);border-radius:22px;overflow:hidden;box-shadow:0 30px 80px -50px rgba(14,37,69,.35)}
/* INTRO — no header, no agent */
.lbr-intro{position:relative;overflow:hidden;background:linear-gradient(180deg,#f7f9fc,#eef2f8)}
.lbr-sky{position:absolute;inset:0;background-image:linear-gradient(90deg,rgba(247,249,252,.99) 0%,rgba(247,249,252,.9) 34%,rgba(247,249,252,.55) 66%,rgba(247,249,252,.28) 100%),url('${SKYLINE_PATH}');background-size:cover;background-position:right 38%}
.lbr-intro-inner{position:relative;padding:40px 44px 42px;max-width:640px}
.lbr-eyebrow{font-size:13px;color:var(--muted);font-weight:500;margin:0 0 14px}
.lbr-eyebrow b{color:var(--navy)}
.lbr-eyebrow .lbr-rule{display:block;width:66px;height:3px;border-radius:3px;background:linear-gradient(90deg,var(--gold),#f7c66b);margin-top:9px}
.lbr-greet{font-size:36px;line-height:1.14;font-weight:800;color:var(--navy);letter-spacing:-.02em;margin:0 0 15px;text-wrap:balance;max-width:16ch}
/* App/marketing globals center h1/h2; keep the intro + section headings LEFT-aligned. */
.lbr-greet,.lbr-recs-head h2,.lbr-steps h2{text-align:left}
.lbr-subcopy{font-size:15.5px;color:var(--ink);max-width:440px;margin:0}
/* RECS */
.lbr-recs{padding:30px 40px 8px}
.lbr-recs-head{margin-bottom:18px}
.lbr-recs-head h2{font-size:27px;font-weight:800;color:var(--navy);letter-spacing:-.02em;margin:0}
.lbr-recs-head p{margin:5px 0 0;font-size:14px;color:var(--muted)}
.lbr-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
/* CARD (approved design) */
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
.lbr-rating-val{font-weight:800;color:var(--navy)}
.lbr-rating-lbl{font-weight:600;color:var(--muted);font-size:12.5px;margin-left:2px}
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
/* NEXT STEPS (navy circles) */
.lbr-steps{margin:28px 40px 0;background:#fff;border:1px solid var(--line);border-radius:18px;padding:26px 28px;box-shadow:0 10px 30px -24px rgba(14,37,69,.35)}
.lbr-steps h2{font-size:23px;font-weight:800;color:var(--navy);letter-spacing:-.01em;margin:0 0 18px}
.lbr-steps ol{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:16px}
.lbr-steps li{display:flex;gap:14px;align-items:flex-start}
.lbr-steps .lbr-n{flex:none;width:36px;height:36px;border-radius:50%;background:var(--navy);color:#fff;font-weight:800;display:flex;align-items:center;justify-content:center;font-size:16px}
.lbr-steps b{display:block;color:var(--navy);font-size:16px;font-weight:700;line-height:1.3}
.lbr-steps span{display:block;font-size:14px;color:var(--muted);margin-top:2px;line-height:1.4}
.lbr-disclaimer{margin:16px 0 0;border-top:1px solid var(--line-soft);padding-top:14px;font-size:13px;color:var(--faint);line-height:1.5}
/* AGENT SIGNATURE (once, no buttons) */
.lbr-sig{margin:26px 40px 0;text-align:center;padding:8px 20px 4px}
.lbr-sig-photo{width:104px;height:104px;border-radius:50%;object-fit:cover;margin:0 auto;border:5px solid #fff;box-shadow:0 14px 34px -18px rgba(14,37,69,.5);background:#dbe3ee}
.lbr-sig-fallback{width:104px;height:104px;border-radius:50%;margin:0 auto;border:5px solid #fff;display:flex;align-items:center;justify-content:center;font-size:40px;font-weight:800;color:#fff;background:linear-gradient(135deg,#22406e,#16305a);box-shadow:0 14px 34px -18px rgba(14,37,69,.5)}
.lbr-sig-name{font-size:34px;color:var(--navy);line-height:.9;margin-top:12px}
.lbr-sig-role{font-size:13.5px;color:var(--ink);font-weight:600;margin-top:6px}
.lbr-sig-brok{font-size:13px;color:var(--muted);margin-top:2px}
.lbr-sig-tag{font-size:22px;color:var(--navy);margin-top:8px;opacity:.9}
/* FOOTER (legal + Powered by Locator Beast) */
.lbr-legal{padding:22px 26px 26px;margin-top:8px;border-top:1px solid var(--line-soft)}
/* "Powered by Locator Beast" — subtle, NON-clickable text on this client page (the
   shared Footer renders the brand name as a link; neutralize ONLY that link by its
   href, leaving the legal links clickable, without touching the shared component). */
.lbr-legal a[href="https://locatorbeast.com"]{pointer-events:none;color:inherit;text-decoration:none;cursor:default}
/* /r FOOTER ONLY: drop the two general site links (Privacy Policy / Terms of Service)
   and their trailing separators. The two required TREC disclosures (Information About
   Brokerage Services, Consumer Protection Notice) and the identity row are kept. This
   hides the wrapper span (link + its dot) by href — the shared Footer component is not
   modified; everything here is scoped to .lbr-legal on this page. */
.lbr-legal span:has(> a[href="/privacy"]),
.lbr-legal span:has(> a[href="/terms"]){display:none}
/* Remove the mobile-only full-width break that used to push the disclosures onto their
   own row, so the two remaining links flow as compactly as possible — on one row when
   they fit, otherwise a clean natural wrap (no text shrinking, no overflow). */
.lbr-legal span.basis-full{display:none}
.lbr-notice{max-width:520px;margin:34px auto;padding:0 20px}
.lbr-notice-card{background:#fff;border:1px solid var(--line);border-radius:18px;padding:30px 26px;text-align:center;box-shadow:0 20px 60px -44px rgba(14,37,69,.4)}
.lbr-notice-card h1{font-size:20px;font-weight:800;color:var(--navy);margin:0}
.lbr-notice-card p{font-size:14.5px;color:var(--muted);margin:10px auto 0;max-width:330px;line-height:1.5}
/* DONE SELECTING FAVORITES — primary conversion CTA (theme token, never hard-coded). */
.lbr-done{margin:22px 0 0;text-align:center}
.lbr-done-count{font-size:14px;font-weight:700;color:var(--navy);margin:0 0 10px}
.lbr-done-btn{appearance:none;border:none;cursor:pointer;background:var(--navy);color:#fff;font-family:inherit;font-weight:700;font-size:16px;letter-spacing:-.01em;min-height:54px;padding:0 30px;border-radius:14px;box-shadow:0 14px 30px -14px rgba(14,37,69,.55);transition:transform .06s ease,box-shadow .2s ease}
.lbr-done-btn:hover{box-shadow:0 18px 36px -14px rgba(14,37,69,.6)}
.lbr-done-btn:active{transform:scale(.98)}
.lbr-done-btn:disabled{opacity:.6;cursor:default}
.lbr-done-copy{font-size:13.5px;color:var(--muted);margin:11px 0 0}
.lbr-done-err{font-size:13.5px;color:#c0264b;margin:9px 0 0}
/* TOUR AVAILABILITY */
.lbr-ta{margin:26px 0 0;background:#fff;border:1px solid var(--line);border-radius:18px;padding:26px 28px;box-shadow:0 10px 30px -24px rgba(14,37,69,.35)}
.lbr-ta-h{font-size:23px;font-weight:800;color:var(--navy);letter-spacing:-.01em;margin:0;text-align:left}
.lbr-ta-sub{font-size:14px;color:var(--muted);margin:6px 0 0;line-height:1.5}
.lbr-ta-field{margin-top:20px}
.lbr-ta-lbl{font-size:13px;font-weight:700;color:var(--navy);margin:0 0 9px}
.lbr-ta-seg{display:flex;gap:8px}
.lbr-ta-segbtn{flex:1;appearance:none;cursor:pointer;background:#fff;border:1.5px solid var(--line);color:var(--ink);font-family:inherit;font-weight:600;font-size:14px;padding:11px 8px;border-radius:12px;transition:border-color .15s,background .15s,color .15s}
.lbr-ta-segbtn.is-on{border-color:var(--navy);background:var(--navy);color:#fff}
.lbr-ta-cal{border:1px solid var(--line);border-radius:14px;padding:12px 12px 14px}
.lbr-ta-calhead{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
.lbr-ta-month{font-size:14.5px;font-weight:700;color:var(--navy)}
.lbr-ta-nav{appearance:none;border:1px solid var(--line);background:#fff;color:var(--navy);width:34px;height:34px;border-radius:10px;font-size:19px;line-height:1;cursor:pointer}
.lbr-ta-nav:disabled{opacity:.35;cursor:default}
.lbr-ta-dow{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:4px}
.lbr-ta-dow span{text-align:center;font-size:11px;font-weight:700;color:var(--faint)}
.lbr-ta-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px}
/* touch-action:manipulation removes iOS Safari's ~300ms double-tap-zoom disambiguation
   delay so a date/window/type tap registers immediately (the render itself is already
   instant). No behavior/layout change. */
.lbr-ta-cell,.lbr-ta-chip,.lbr-ta-segbtn,.lbr-ta-nav,.lbr-ta-send,.lbr-modal-x{touch-action:manipulation}
.lbr-ta-cell{appearance:none;border:none;background:transparent;color:var(--ink);font-family:inherit;font-size:14px;aspect-ratio:1;border-radius:9px;cursor:pointer;display:flex;align-items:center;justify-content:center}
.lbr-ta-cell:not(.is-blank):not(:disabled):hover{background:var(--line-soft)}
.lbr-ta-cell:disabled{color:#c7cede;cursor:default}
.lbr-ta-cell.is-blank{cursor:default}
.lbr-ta-cell.is-on{background:var(--navy);color:#fff;font-weight:700}
.lbr-ta-days{display:flex;flex-direction:column;gap:12px}
.lbr-ta-day{border:1px solid var(--line-soft);border-radius:12px;padding:11px 12px}
.lbr-ta-dayname{font-size:13.5px;font-weight:700;color:var(--navy);margin-bottom:8px}
.lbr-ta-chips{display:flex;flex-wrap:wrap;gap:7px}
.lbr-ta-chip{appearance:none;cursor:pointer;background:#fff;border:1.5px solid var(--line);color:var(--ink);font-family:inherit;font-weight:600;font-size:13px;padding:7px 13px;border-radius:999px;transition:border-color .15s,background .15s,color .15s}
.lbr-ta-chip.is-on{border-color:var(--green);background:var(--pill-bg);color:var(--pill-tx)}
.lbr-ta-err{font-size:13.5px;color:#c0264b;margin:14px 0 0}
.lbr-ta-send{margin-top:20px;width:100%;appearance:none;border:none;cursor:pointer;background:var(--navy);color:#fff;font-family:inherit;font-weight:700;font-size:16px;min-height:54px;border-radius:14px;box-shadow:0 14px 30px -14px rgba(14,37,69,.55)}
.lbr-ta-send:disabled{opacity:.55;cursor:default}
.lbr-ta-badge{display:inline-block;background:var(--pill-bg);color:var(--pill-tx);font-size:13px;font-weight:800;padding:7px 14px;border-radius:999px}
.lbr-ta-summary-lead{font-size:14px;color:var(--ink);margin:12px 0 0}
.lbr-ta-summary{margin-top:10px;display:flex;flex-direction:column;gap:8px}
.lbr-ta-srow{display:flex;justify-content:space-between;gap:14px;font-size:14px;color:var(--ink);border-bottom:1px solid var(--line-soft);padding-bottom:8px}
.lbr-ta-slbl{font-weight:700;color:var(--navy)}
.lbr-ta-edit{appearance:none;background:#fff;border:1.5px solid var(--line);color:var(--navy);font-family:inherit;font-weight:700;font-size:14px;padding:9px 18px;border-radius:11px;cursor:pointer}
/* MODAL (desktop: centered; mobile: bottom-sheet — see media query). */
.lbr-modal-overlay{position:fixed;inset:0;z-index:50;background:rgba(14,37,69,.5);display:flex;align-items:center;justify-content:center;padding:24px}
.lbr-modal{background:#fff;border-radius:20px;width:100%;max-width:520px;max-height:88vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 40px 90px -30px rgba(14,37,69,.6);outline:none}
.lbr-modal-head{position:relative;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:20px 22px 14px;border-bottom:1px solid var(--line-soft)}
.lbr-modal-grab{display:none}
.lbr-modal-title{font-size:22px;font-weight:800;color:var(--navy);letter-spacing:-.01em;margin:0}
.lbr-modal-x{flex:none;appearance:none;border:1px solid var(--line);background:#fff;color:var(--navy);width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer}
.lbr-modal-x:active{transform:scale(.94)}
.lbr-modal-body{overflow-y:auto;padding:16px 22px 10px;-webkit-overflow-scrolling:touch}
.lbr-modal-body .lbr-ta-field:first-of-type{margin-top:14px}
.lbr-modal-foot{padding:14px 22px 18px;border-top:1px solid var(--line-soft);background:#fff}
.lbr-modal-foot .lbr-ta-send{margin-top:0}
/* Compact completed state on the page after availability is submitted. */
.lbr-avsent{margin:22px 0 0;background:#fff;border:1px solid var(--line);border-radius:16px;padding:18px}
.lbr-avsent-head{display:flex;align-items:center;justify-content:space-between;gap:12px}
.lbr-avsent-msg{font-size:14px;color:var(--ink);margin:12px 0 0;line-height:1.5}
@media (max-width:640px){
.lbr-shell{margin:0;border:none;border-radius:0;box-shadow:none}
.lbr-intro{background:#fff}
/* Mobile hero: the same deliberately generic SKYLINE_PATH, heavily white-washed and
   faded behind the personalized intro so the eyebrow/greeting/paragraph read as one
   polished hero and stay highly legible. Subtle texture only — never a claimed city. */
.lbr-sky{display:block;background-image:linear-gradient(180deg,rgba(255,255,255,.80) 0%,rgba(255,255,255,.9) 55%,rgba(255,255,255,.99) 100%),url('${SKYLINE_PATH}');background-position:center 20%}
.lbr-intro-inner{padding:26px 18px 14px;max-width:none}
/* Greeting + major headings stay ~where they are; increase the smaller supporting text. */
.lbr-greet{font-size:29px;line-height:1.16;max-width:none}
.lbr-recs-head h2{font-size:23px}
.lbr-steps h2{font-size:22px}
.lbr-eyebrow{font-size:14.5px}
.lbr-subcopy{font-size:18px}
.lbr-recs-head p{font-size:17px}
.lbr-pname{font-size:21px}
.lbr-addr{font-size:17px}
.lbr-rating{font-size:16px}
.lbr-rating-lbl{font-size:16px}
.lbr-why-lbl{font-size:14.5px}
.lbr-why li{font-size:17px}
.lbr-pl{font-size:16px}
.lbr-pv{font-size:19px}
.lbr-pmo{font-size:16px}
.lbr-pill{font-size:13.5px}
.lbr-view{font-size:14.5px}
.lbr-steps span{font-size:17px}
.lbr-disclaimer{font-size:16px}
.lbr-sig-role{font-size:17px}
.lbr-sig-brok{font-size:16px}
/* Heart — larger, unmistakable primary interaction (circle/position/behavior kept). */
.lbr-heart{width:46px;height:46px}
.lbr-heart svg{width:25px;height:25px}
/* Footer/legal: keep secondary but comfortably legible (shared Footer forces 11px). */
.lbr-legal .slf-compact a,.lbr-legal .slf-compact span{font-size:13.5px!important}
/* Disclosure links wrap to separate rows on mobile at the approved size — drop the
   trailing separator dot so no dangling "·" hangs after Information About Brokerage
   Services. Targets only the dot that trails a disclosure link (an external
   target="_blank" anchor); the identity-row dots and the desktop one-row separator are
   untouched. Mobile-only (inside this media query); shared Footer not modified. */
.lbr-legal span:has(> a[target="_blank"]) > span[aria-hidden="true"]{display:none}
.lbr-recs{padding:20px 16px 8px}
.lbr-grid{grid-template-columns:1fr;gap:16px}
.lbr-ph{aspect-ratio:16/11}
.lbr-steps{margin:22px 16px 0;padding:22px 20px}
/* Done CTA: full-width, prominent, ~54px; count/copy sized for phone legibility. */
.lbr-done-count{font-size:15.5px}
.lbr-done-btn{width:100%;min-height:54px;font-size:17px}
.lbr-done-copy{font-size:14.5px}
/* Tour Availability modal → bottom-sheet on mobile; larger supporting text. */
.lbr-modal-overlay{align-items:flex-end;padding:0}
.lbr-modal{max-width:none;max-height:92vh;border-radius:22px 22px 0 0}
.lbr-modal-grab{display:block;position:absolute;top:8px;left:50%;transform:translateX(-50%);width:40px;height:4px;border-radius:2px;background:var(--line)}
.lbr-modal-head{padding-top:22px}
.lbr-modal-title{font-size:21px}
.lbr-modal-body{padding-left:18px;padding-right:18px}
.lbr-modal-foot{padding-left:18px;padding-right:18px}
.lbr-avsent-msg{font-size:15px}
.lbr-ta-h{font-size:22px}
.lbr-ta-sub{font-size:15px}
.lbr-ta-lbl{font-size:14.5px}
.lbr-ta-segbtn{font-size:15px;padding:13px 8px}
.lbr-ta-cell{font-size:15px}
.lbr-ta-chip{font-size:14px}
.lbr-ta-dayname{font-size:14.5px}
.lbr-ta-send{font-size:17px}
.lbr-ta-srow,.lbr-ta-summary-lead{font-size:15px}
.lbr-sig{margin:24px 16px 0}
.lbr-legal{padding:20px 16px 26px}
}
`

/** The agent's OWN configured legal block (TREC presets + custom disclosures) + the
 *  subtle non-clickable "Powered by Locator Beast" line — rendered by the SAME component
 *  the public Smart Lead Form uses. */
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

  // Tour-availability workflow state (Done pressed? availability submitted?) — a
  // separate read RPC so the core resolver signature stays stable. Failure is
  // non-fatal: the page still renders in the pre-Done state.
  const { data: tourStateData } = await supabase.rpc("lb_get_client_tour_state", { p_token_hash: tokenHash })
  const tourState = (Array.isArray(tourStateData) ? tourStateData[0] : tourStateData) as
    | { doneSelecting?: boolean; availability?: { tourType: TourType; dates: { date: string; windows: TourWindow[] }[] } | null }
    | null
  const doneSelecting = tourState?.doneSelecting === true
  const availability = tourState?.availability ?? null

  const firstName = share.client_first_name?.trim() || null
  const agentName = share.agent_name?.trim() || "Your locator"
  const agentFirst = agentName.split(/\s+/)[0]
  const agentTitle = share.agent_title?.trim() || "Apartment Locator"
  const brokerage = share.agent_brokerage?.trim() || null
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

  const curated = firstName ? `Custom List for ${firstName} · by ${agentName}` : `Custom List by ${agentName}`
  const countLine = `${properties.length} ${properties.length === 1 ? "property" : "properties"} recommended for you · Tap the heart on any property you'd like to tour.`
  const greeting = firstName ? `${firstName}, I found some great options for you!` : "I found some great options for you!"

  return (
    <div className={`${inter.variable} ${caveat.variable} lbr-root`}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="lbr-page"><div className="lbr-shell">

        {/* INTRO — one clean composition, no header logo, no agent card */}
        <section className="lbr-intro">
          <div className="lbr-sky" aria-hidden />
          <div className="lbr-intro-inner">
            <p className="lbr-eyebrow">{curated}<span className="lbr-rule" /></p>
            <h1 className="lbr-greet">{greeting}</h1>
            <p className="lbr-subcopy">These apartments match what you&rsquo;re looking for. Favorite the ones you like and I&rsquo;ll take care of the next steps.</p>
          </div>
        </section>

        {/* RECOMMENDATIONS */}
        <section className="lbr-recs">
          <div className="lbr-recs-head">
            <h2>Your Recommendations</h2>
            <p>{countLine}</p>
          </div>
          <RecommendationList
            properties={properties}
            token={token}
            initialDoneSelecting={doneSelecting}
            initialAvailability={availability}
          />
        </section>

        {/* NEXT STEPS — navy circles */}
        <section className="lbr-steps">
          <h2>Next Steps</h2>
          <ol>
            <li><div className="lbr-n">1</div><div><b>Heart your top 2&ndash;3 favorites</b><span>Choose the properties you&rsquo;d like to tour.</span></div></li>
            <li><div className="lbr-n">2</div><div><b>I&rsquo;ll get your tour scheduled</b><span>We coordinate everything for you.</span></div></li>
            <li><div className="lbr-n">3</div><div><b>List Me as Your Realtor or Locator</b><span>When you apply, list me on your application to receive any rebates, movers, or other incentives.</span></div></li>
          </ol>
          <p className="lbr-disclaimer">Pricing and availability can change daily. Specials may not be reflected in advertised base rent.</p>
        </section>

        {/* AGENT SIGNATURE — once, no contact buttons */}
        <section className="lbr-sig">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="lbr-sig-photo" src={photo} alt={agentName} />
          ) : (
            <div className="lbr-sig-fallback" aria-hidden>{initial}</div>
          )}
          <div className="lbr-sig-name lbr-script-f">{agentName}</div>
          <div className="lbr-sig-role">{agentTitle}</div>
          {brokerage && <div className="lbr-sig-brok">{brokerage}</div>}
          <div className="lbr-sig-tag lbr-script-f">Helping you find the perfect home.</div>
        </section>

        {/* FOOTER — legal/brokerage + subtle non-clickable "Powered by Locator Beast" */}
        <LegalFooter config={share.smart_form_config} brokerage={brokerage} />
      </div></div>
    </div>
  )
}
