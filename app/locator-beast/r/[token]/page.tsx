import { notFound } from "next/navigation"
import { Inter, Caveat } from "next/font/google"
import { createClient } from "@/lib/supabase/server"
import { hashShareToken, looksLikeShareToken } from "@/lib/clientShare/token"
import { mergeSmartFormConfig } from "@/app/smart-lead-form/_lib/mergeConfig"
import AgentSignature from "@/components/clientShare/AgentSignature"
import PausedResumeCard from "./PausedResumeCard"
import Footer from "@/app/smart-lead-form/_components/form/sections/Footer"
import RecommendationList, { type ClientProperty } from "./RecommendationList"
import type { TourType, TourWindow } from "@bc/companion-shared"
import { clientHeroImage } from "@/lib/clientShare/heroImage"

import ViewBeacon from "./ViewBeacon"

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
 * HERO IMAGE: the backdrop is the CLIENT's submitted SEARCH-city skyline, resolved by
 * clientHeroImage() ONLY through the canonical market/theme catalog (never inferred from
 * property data, never an arbitrary path). The city is surfaced presentation-only by the
 * resolver as `client_city` (the lead's city, which the resolver already has in scope) —
 * it does NOT touch the immutable property snapshot. Unknown or imageless cities fall
 * back to the generic SKYLINE_PATH, so the hero is never broken/empty.
 */

const CANONICAL_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL || "https://locatorbeast.com"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  // Generic fallback title (no client info). Rendered server-side so link-preview
  // crawlers get it without running client JS. The visual is the per-share
  // opengraph-image.tsx (Next wires og:image/twitter:image from it automatically),
  // family-consistent with the Smart Form preview.
  // Kept short deliberately: this is the line iMessage prints UNDER the image, where
  // it is truncated with an ellipsis rather than wrapped. "Jay Morris | Your Custom
  // List" is 31 characters and survives the narrowest preview width.
  const genericTitle = "Your Custom List"
  const base = {
    metadataBase: new URL(CANONICAL_ORIGIN),
    title: genericTitle,
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
  // Locator-branded, image-first preview. NO description (the image carries the
  // message). NEVER any client data in the title.
  const title = agentName ? `${agentName} | ${genericTitle}` : genericTitle
  return {
    ...base,
    title,
    openGraph: { title, type: "website" as const, siteName: "Locator Beast" },
    twitter: { card: "summary_large_image" as const, title },
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
  // Presentation-only: the client's submitted search city (lead.city), used only
  // to pick the hero skyline. Not part of the immutable recommendation snapshot.
  client_city: string | null
  properties: ClientProperty[] | null
}

// ── The approved presentation, as scoped CSS (every selector prefixed `lbr-`). ──
const CSS = `
.lbr-root{--navy:#0e2545;--ink:#3a4658;--muted:#7a869a;--faint:#9aa6b8;--line:#e7ebf2;--line-soft:#eef1f7;--bg:#f5f7fb;--green:#1f9d55;--pill-bg:#dff5e6;--pill-tx:#136c3a;--gold:#f5a524;font-family:var(--lbr-sans),-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:var(--ink);line-height:1.5;-webkit-font-smoothing:antialiased}
.lbr-root *{box-sizing:border-box}
.lbr-script-f{font-family:var(--lbr-script),'Segoe Script',cursive}
.lbr-page{background:var(--bg);min-height:100vh}
.lbr-shell{max-width:1300px;margin:26px auto 40px;background:#fff;border:1px solid var(--line);border-radius:22px;overflow:hidden;box-shadow:0 30px 80px -50px rgba(14,37,69,.35)}
/* INTRO — no header, no agent */
.lbr-intro{position:relative;overflow:hidden;background:linear-gradient(180deg,#f7f9fc,#eef2f8)}
.lbr-sky{position:absolute;inset:0;background-image:linear-gradient(90deg,rgba(6,18,38,.99) 0%,rgba(7,20,42,.95) 32%,rgba(10,28,52,.68) 58%,rgba(14,37,69,.20) 80%,rgba(14,37,69,0) 92%),var(--hero-img);background-size:cover;background-position:right 42%}
.lbr-intro-inner{position:relative;padding:40px 44px 42px;max-width:640px}
.lbr-eyebrow{font-size:13px;color:rgba(255,255,255,.82);font-weight:500;margin:0 0 14px}
.lbr-eyebrow b{color:#fff}
.lbr-eyebrow .lbr-rule{display:block;width:66px;height:3px;border-radius:3px;background:linear-gradient(90deg,var(--gold),#f7c66b);margin-top:9px}
.lbr-greet{font-size:36px;line-height:1.14;font-weight:800;color:#fff;letter-spacing:-.02em;margin:0 0 15px;text-wrap:balance;max-width:16ch}
/* App/marketing globals center h1/h2; keep the intro + section headings LEFT-aligned. */
.lbr-greet,.lbr-recs-head h2,.lbr-steps h2{text-align:left}
.lbr-subcopy{font-size:15.5px;color:rgba(255,255,255,.90);max-width:440px;margin:0}
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
/* Image is a link to the verified property website; fills the frame, sits under the heart/pill. */
.lbr-ph-link{position:absolute;inset:0;display:block;cursor:pointer}
.lbr-ph-fallback{position:absolute;inset:0;background:linear-gradient(135deg,#c7d2e0,#9fb2c8)}
.lbr-heart{position:absolute;top:12px;right:12px;width:40px;height:40px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(14,37,69,.28);cursor:pointer;border:none;padding:0}
.lbr-heart:active{transform:scale(.9)}
/* Favorite pop: on favoriting, the heart quickly scales up and settles back (~240ms).
   Transform-only (no layout movement; heart is absolutely positioned, so nothing shifts).
   Unfavoriting has no reverse animation — it just returns to the outline state. The
   React side adds .is-popping only when favoriting and clears it on animationend, so the
   pop replays every time. Works identically on iOS Safari / Android Chrome (plain CSS
   keyframes + transform, no prefixes/platform APIs). */
@keyframes lbr-heart-pop{0%{transform:scale(1)}55%{transform:scale(1.30)}100%{transform:scale(1)}}
.lbr-heart.is-popping{animation:lbr-heart-pop 300ms ease-out}
@media (prefers-reduced-motion:reduce){.lbr-heart.is-popping{animation:none}}
.lbr-pill{position:absolute;left:12px;bottom:12px;background:#e8f0fe;color:#1c3f75;font-size:12.5px;font-weight:600;padding:5px 11px;border:1px solid #8fb6ea;border-radius:8px;box-shadow:0 4px 10px rgba(14,37,69,.14)}
.lbr-body{padding:16px 17px 17px;display:flex;flex-direction:column;flex:1}
.lbr-pname{font-size:18px;font-weight:800;color:var(--navy);letter-spacing:-.01em;margin:0}
/* Name is a link to the verified property website — inherits the heading style, underline on hover. */
.lbr-pname-link{color:inherit;text-decoration:none}
.lbr-pname-link:hover{text-decoration:underline}
.lbr-addr{display:flex;align-items:flex-start;gap:6px;font-size:13px;color:var(--muted);margin-top:5px;line-height:1.35}
.lbr-addr svg{color:var(--faint);flex:none;margin-top:2px}
.lbr-addr-stacked{display:none}
.lbr-rating{display:flex;align-items:center;gap:6px;font-size:13.5px;color:var(--ink);margin-top:7px;font-weight:600}
.lbr-stars{position:relative;display:inline-block;line-height:1;white-space:nowrap}
.lbr-stars-base{display:block;font-size:14px;letter-spacing:1px;color:#cfd6e0}
.lbr-stars-fill{position:absolute;top:0;left:0;overflow:hidden;white-space:nowrap;font-size:14px;letter-spacing:1px;color:var(--gold)}
.lbr-rating-val{font-weight:800;color:var(--navy)}
.lbr-rating-lbl{font-weight:600;color:var(--muted);font-size:12.5px;margin-left:-3px}
.lbr-why{margin-top:13px}
.lbr-why-lbl{font-size:13px;font-weight:700;color:var(--navy);margin:0 0 7px}
.lbr-why ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.lbr-why li{display:flex;gap:8px;font-size:13.5px;color:var(--ink);line-height:1.35}
/* AVERAGE RENT — nested beneath the bedroom rent it qualifies, in the page's own green. Smaller
   than the highlight above it, because it explains that number rather than competing with it.
   display:block so it starts its own line under the rent; it wraps naturally on a narrow screen
   and the middot separators keep it readable when it does. */
.lbr-avg{display:block;margin-top:3px;font-size:12px;font-weight:600;color:var(--green);line-height:1.35}
/* WASHER & DRYER pill — the same 999px treatment as .lbr-ta-badge, on the palette tokens the
   page already defines. ALIGN-SELF IS LOad-BEARING: .lbr-body is a flex column, and the CSS
   spec blockifies a flex item's inline-flex to flex, so without it the pill stretches to the
   full column width and reads as a bar rather than a pill. flex-start makes it hug its text
   again. white-space:nowrap keeps "Washer & Dryer Included" on one line. */
.lbr-wd{display:inline-flex;align-self:flex-start;align-items:center;margin-top:10px;padding:4px 11px;
  border-radius:999px;font-size:12.5px;font-weight:700;line-height:1.2;white-space:nowrap}
.lbr-wd--inc{background:var(--pill-bg);color:var(--pill-tx)}
.lbr-wd--hk{background:var(--line-soft);color:var(--ink)}
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
.lbr-disclaimer{margin:16px 0 0;border-top:1px solid var(--line-soft);padding-top:14px;font-size:13px;color:var(--faint);line-height:1.5;text-align:center}
/* Next Steps as a compact roadmap ABOVE the property cards — reuses the .lbr-steps content,
   navy circles and typography, just laid out lighter. Desktop: one horizontal 1→2→3 row so it
   reads as a lightweight roadmap and doesn't push the recommendations down. */
.lbr-steps--roadmap{margin:0 0 24px;padding:20px 24px;box-shadow:none;border-radius:14px}
.lbr-steps--roadmap h2{font-size:15px;margin:0 0 15px}
.lbr-steps--roadmap ol{flex-direction:row;gap:24px}
.lbr-steps--roadmap li{flex:1;min-width:0;gap:16px;align-items:center}
.lbr-steps--roadmap .lbr-n{width:52px;height:52px;font-size:22px}
.lbr-steps--roadmap b{font-size:16px;line-height:1.25}
.lbr-steps--roadmap span{font-size:13px}
/* AGENT SIGNATURE (once, no buttons) */
/* Outer spacing for the shared <AgentSignature> block (its inner typography is self-contained). */
.lbr-sig{margin:26px 40px 0;text-align:center;padding:8px 20px 4px}
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
/* PAUSED STATE — reuses the /r card language (white, light border, subtle shadow, same
   radius). Sits where the recommendations normally appear. Mobile sizes bump below. */
.lbr-paused{max-width:520px;margin:6px auto 0;background:#fff;border:1px solid var(--line);border-radius:18px;padding:24px 28px;text-align:center;box-shadow:0 20px 60px -44px rgba(14,37,69,.4)}
.lbr-paused-body{font-size:15px;color:var(--muted);margin:0 auto;max-width:390px;line-height:1.6}
.lbr-paused-btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;margin-top:20px;background:var(--navy);color:#fff;font-weight:700;font-size:15px;text-decoration:none;padding:12px 24px;border-radius:12px;appearance:none;border:none;cursor:pointer;font-family:inherit}
.lbr-paused-btn:disabled{opacity:.6;cursor:default}
.lbr-paused-title{font-size:19px;font-weight:800;color:var(--navy);margin:0 0 8px}
.lbr-paused-err{font-size:13.5px;color:#c0264b;margin:14px 0 0}
/* PAUSED footer = SIMPLIFIED: keep only the identity row (Equal Housing · Powered by
   Locator Beast). Hide the legal-links row (the two TREC disclosures — Information About
   Brokerage Services, Consumer Protection Notice — plus the already-hidden Privacy/Terms)
   by hiding the row that contains the Privacy link. Scoped to .lbr-shell--paused so the
   active list + NoticeScreen footers keep their full disclosures. The shared Footer
   component is not modified. */
.lbr-shell--paused .lbr-legal div:has(> span > a[href="/privacy"]){display:none}
/* DONE SELECTING FAVORITES — primary conversion CTA (theme token, never hard-coded). */
.lbr-done{margin:22px 0 0;text-align:center}
/* MOBILE STICKY FAVORITES BAR. Desktop never renders it (display:none below); the phone
   breakpoint turns it on and hides the inline .lbr-done block so there is exactly ONE
   "Done Selecting Favorites" on screen. env(safe-area-inset-bottom) clears the iPhone home
   indicator and Safari's bottom chrome. A matching pad on .lbr-wrap keeps the last card and
   its View Property button scrollable clear of the bar rather than underneath it. */
.lbr-sticky{display:none}
.lbr-sticky-count{display:flex;align-items:center;justify-content:center;gap:6px;font-size:14px;font-weight:700;color:var(--navy);white-space:nowrap}
.lbr-sticky-count svg{flex:none}
.lbr-sticky-btn{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;appearance:none;border:none;cursor:pointer;background:var(--navy);color:#fff;font-family:inherit;font-weight:700;font-size:15px;letter-spacing:-.01em;min-height:48px;padding:0 18px;border-radius:12px;transition:transform .06s ease,background .15s ease,color .15s ease}
.lbr-sticky-btn:active{transform:scale(.98)}
/* Disabled is a DIFFERENT surface, not a faded navy: at zero favorites the button must
   read as not-yet-available at a glance, and a translucent navy still reads as a live
   primary action. :active is neutralised so a tap gives no affordance either. */
.lbr-sticky-btn:disabled{background:var(--line);color:var(--muted);cursor:default;opacity:1}
.lbr-sticky-btn:disabled:active{transform:none}
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
.lbr-modal-head{position:relative;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:20px 22px 12px;border-bottom:1px solid var(--line-soft)}
.lbr-modal-grab{display:none}
.lbr-modal-title{font-size:22px;font-weight:800;color:var(--navy);letter-spacing:-.01em;margin:0}
.lbr-modal-x{flex:none;appearance:none;border:1px solid var(--line);background:#fff;color:var(--navy);width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer}
.lbr-modal-x:active{transform:scale(.94)}
.lbr-modal-body{overflow-y:auto;padding:16px 22px 10px;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}
.lbr-modal-body .lbr-ta-field:first-of-type{margin-top:6px}
.lbr-modal-foot{padding:14px 22px 18px;border-top:1px solid var(--line-soft);background:#fff}
.lbr-modal-foot .lbr-ta-send{margin-top:0}
/* Compact completed state on the page after availability is submitted. */
.lbr-avsent{margin:22px 0 0;background:#fff;border:1px solid var(--line);border-radius:16px;padding:18px}
.lbr-avsent-head{display:flex;align-items:center;justify-content:space-between;gap:12px}
.lbr-avsent-msg{font-size:14px;color:var(--ink);margin:12px 0 0;line-height:1.5}
@media (max-width:640px){
.lbr-shell{margin:0;border:none;border-radius:0;box-shadow:none;background:var(--bg)}
.lbr-intro{background:#fff}
/* Mobile hero: the same per-request city photograph (--hero-img), under the approved
   dark-navy diagonal so the top stays dark for white-text legibility while the lower
   image keeps real skyline richness. Adapted for the stacked composition, not the
   desktop percentages. */
.lbr-sky{display:block;background-image:linear-gradient(155deg,rgba(6,18,38,.99) 0%,rgba(7,20,42,.95) 45%,rgba(10,28,52,.70) 75%,rgba(14,37,69,.28) 100%),var(--hero-img);background-position:center 28%}
.lbr-intro-inner{padding:26px 18px 14px;max-width:none}
/* Greeting + major headings stay ~where they are; increase the smaller supporting text. */
.lbr-greet{font-size:34px;line-height:1.16;max-width:none}
.lbr-recs-head h2{font-size:28px}
.lbr-eyebrow{font-size:14.5px}
.lbr-recs-head p{font-size:19px}
.lbr-pname{font-size:25px}
/* Mobile address: ONE line whenever it fits — "Street, City, State ZIP" — wrapping
   naturally at the comma when it does not. The street line stays readable, the
   city/state/ZIP slightly muted. Desktop single-line (.lbr-addr-full) is unchanged. */
.lbr-addr{font-size:18px;line-height:1.3;gap:0;margin-top:6px}
/* Remove the location pin on mobile so name / street / city-state-ZIP / rating all
   sit on the exact same left edge. */
.lbr-addr svg{display:none}
.lbr-addr-full{display:none}
/* inline, not a column: the parts flow as one address and the line breaks only
   where the text runs out of room. */
.lbr-addr-stacked{display:inline}
.lbr-addr-street{color:var(--ink);font-weight:600;font-size:18px}
/* nowrap keeps "Frisco, TX 75034" together, so a wrap can never leave the state and
   ZIP alone on a line of their own. */
.lbr-addr-locality{color:var(--muted);font-size:17px;white-space:nowrap}
.lbr-rating{font-size:18px}
.lbr-rating-lbl{font-size:18px}
/* Mobile star-size override (base is 14px; scale up with the rating text). */
.lbr-stars-base,.lbr-stars-fill{font-size:17px}
.lbr-why-lbl{font-size:17px}
.lbr-why li{font-size:18px}
.lbr-wd{font-size:15px;padding:5px 13px;margin-top:12px}
.lbr-avg{font-size:15px;margin-top:5px}
.lbr-pl{font-size:16px}
.lbr-pv{font-size:19px}
.lbr-pmo{font-size:16px}
.lbr-pill{font-size:13.5px}
.lbr-view{font-size:17px}
.lbr-disclaimer{font-size:16px}
.lbr-disc-2{display:block}
/* Heart — larger, unmistakable primary interaction (circle/position/behavior kept). */
.lbr-heart{width:46px;height:46px}
.lbr-heart svg{width:25px;height:25px}
/* Footer/legal: keep secondary but comfortably legible (shared Footer forces 11px). */
.lbr-legal .slf-compact a,.lbr-legal .slf-compact span{font-size:15px!important}
/* Disclosure links wrap to separate rows on mobile at the approved size — drop the
   trailing separator dot so no dangling "·" hangs after Information About Brokerage
   Services. Targets only the dot that trails a disclosure link (an external
   target="_blank" anchor); the identity-row dots and the desktop one-row separator are
   untouched. Mobile-only (inside this media query); shared Footer not modified. */
.lbr-legal span:has(> a[target="_blank"]) > span[aria-hidden="true"]{display:none}
.lbr-recs{padding:20px 16px 8px}
.lbr-grid{grid-template-columns:1fr;gap:20px}
.lbr-ph{aspect-ratio:16/11}
/* Mobile breathing room (spacing only — card structure unchanged). */
.lbr-body{padding-top:18px}
.lbr-rating{margin-top:10px}
.lbr-why{margin-top:16px}
.lbr-why li + li{margin-top:9px}
.lbr-cardfoot{margin-top:18px}
/* Mobile surface definition — one shared soft shadow so the white cards lift off the
   faint page background (subtle/premium). Also applied to Next Steps + the agent
   signature card below. Property-card structure/radius unchanged. */
.lbr-card{box-shadow:0 6px 20px -12px rgba(14,37,69,.28)}
.lbr-avsent{box-shadow:0 6px 20px -12px rgba(14,37,69,.28)}
/* Touch targets ≥ ~44px (tap area only). */
.lbr-view{min-height:44px;padding:11px 16px;box-sizing:border-box}
.lbr-ta-cell{min-height:44px}
.lbr-ta-chip{min-height:44px;padding:10px 16px;box-sizing:border-box}
.lbr-steps{margin:22px 16px 0;padding:22px 20px}
/* Mobile roadmap: vertical 1/2/3, more compact than the old large bottom card. */
.lbr-steps--roadmap{margin:0 0 16px;padding:15px 16px;border-radius:16px;box-shadow:0 6px 20px -12px rgba(14,37,69,.28)}
/* Next Steps mobile sizes live on the --roadmap selectors (the ones that WIN over the
   generic .lbr-steps mobile rules), so the intended sizes actually apply. */
.lbr-steps--roadmap h2{font-size:26px;margin:0 0 14px}
.lbr-steps--roadmap ol{flex-direction:column;gap:14px}
.lbr-steps--roadmap li{flex:none;gap:14px;align-items:flex-start}
.lbr-steps--roadmap .lbr-n{width:38px;height:38px;font-size:18px}
.lbr-steps--roadmap b{font-size:20px}
.lbr-steps--roadmap span{font-size:18px}
/* Done CTA: full-width, prominent, ~54px; count/copy sized for phone legibility. */
.lbr-done-count{font-size:15.5px}
.lbr-done-btn{width:100%;min-height:54px;font-size:18px}
.lbr-done-copy{font-size:14.5px}
/* Tour Availability modal → bottom-sheet on mobile; larger supporting text. */
.lbr-modal-overlay{align-items:flex-end;padding:0}
/* iOS Safari: size the bottom-sheet to the DYNAMIC (visible) viewport, not the large
   vh viewport. With the URL bar showing, 92vh is taller than what's on screen, so a
   bottom-anchored sheet pushes its header up behind the browser chrome. dvh tracks the
   visible height so the fixed header stays on screen; vh is the fallback for old engines. */
.lbr-modal{max-width:none;max-height:92vh;max-height:92dvh;border-radius:22px 22px 0 0}
.lbr-modal-grab{display:block;position:absolute;top:8px;left:50%;transform:translateX(-50%);width:40px;height:4px;border-radius:2px;background:var(--line)}
/* Bottom-sheet: pin the header (title + X) and the footer (Send CTA); only the middle
   scheduling content scrolls. flex:none keeps head/foot from compressing; the body becomes
   the sole scroller (flex:1 + min-height:0 lets it shrink so overflow-y:auto engages). */
.lbr-modal-head{padding-top:16px;flex:none}
.lbr-modal-title{font-size:23px}
/* Close/X control: enlarge on mobile so it clears the 44px touch-target min (kept top-right,
   same circle/border/background). Icon bump overrides the inline svg width/height attrs. */
.lbr-modal-x{width:52px;height:52px}
.lbr-modal-x svg{width:24px;height:24px}
.lbr-modal-body{padding-left:18px;padding-right:18px;padding-top:10px;flex:1 1 auto;min-height:0}
.lbr-modal-body .lbr-ta-field:first-of-type{margin-top:4px}
.lbr-ta-field{margin-top:18px}
.lbr-ta-cal{padding:10px}
.lbr-ta-calhead{margin-bottom:6px}
.lbr-ta-dow{margin-bottom:2px}
.lbr-modal-foot{padding-left:18px;padding-right:18px;padding-bottom:calc(18px + env(safe-area-inset-bottom));flex:none}
.lbr-avsent-msg{font-size:15px}
.lbr-ta-h{font-size:26px}
.lbr-ta-sub{font-size:16px}
.lbr-ta-lbl{font-size:18px;margin-bottom:6px}
.lbr-ta-segbtn{font-size:17px;padding:13px 8px}
.lbr-ta-month{font-size:17px}
.lbr-ta-dow span{font-size:13px}
.lbr-ta-cell{font-size:17px}
.lbr-ta-chip{font-size:17px}
.lbr-ta-dayname{font-size:17px}
.lbr-ta-send{font-size:19px}
.lbr-ta-summary-lead{font-size:15px}
/* Submitted "Availability Sent" card — modest mobile bump so the completed state matches
   the rest of the mobile /r page. Card structure/border/shadow/radius/spacing unchanged. */
.lbr-ta-badge{font-size:15px}
.lbr-ta-edit{font-size:15px}
.lbr-ta-srow{font-size:16px}
.lbr-sig{margin:24px 16px 0;background:#fff;border:1px solid var(--line);border-radius:18px;box-shadow:0 6px 20px -12px rgba(14,37,69,.28);padding:24px 18px}
.lbr-legal{padding:20px 16px 26px}
/* ── MOBILE FAVORITES BAR ──────────────────────────────────────────────────────
   Turn the sticky bar on and hide the inline CTA, so exactly ONE "Done Selecting
   Favorites" exists on a phone. The bar sits above Safari's chrome via the safe-area
   inset, and .lbr-shell gains matching bottom padding so the last card's View Property
   button can always be scrolled clear of it rather than sitting underneath. */
.lbr-sticky{display:flex;flex-direction:column;align-items:stretch;gap:8px;position:fixed;left:0;right:0;bottom:0;z-index:50;
  padding:10px 14px calc(10px + env(safe-area-inset-bottom));
  background:rgba(255,255,255,.96);backdrop-filter:blur(10px);
  border-top:1px solid var(--line-soft);box-shadow:0 -8px 24px -14px rgba(14,37,69,.4)}
.lbr-sticky-count{font-size:15px}
.lbr-sticky-btn{font-size:16px}
.lbr-done{display:none}
/* Clearance for the two-row bar, so the last card's View Property button can always be
   scrolled clear of it rather than sitting underneath. Measured: ~22 count + 8 gap +
   48 button + 20 padding + 1 border. */
.lbr-shell{padding-bottom:calc(118px + env(safe-area-inset-bottom))}
}
`

/** The agent's OWN configured legal block (TREC presets + custom disclosures) + the
 *  subtle non-clickable "Powered by Locator Beast" line — rendered by the SAME component
 *  the public Smart Lead Form uses. */
function LegalFooter({ config }: { config: unknown }) {
  const merged = mergeSmartFormConfig(config ?? {})
  // Brokerage is shown ONCE in the agent signature above; blank it in the footer so the legal
  // identity row reads "Equal Housing · Powered by Locator Beast" (no duplicate brokerage).
  const footerConfig = { ...merged, copy: { ...merged.copy, brokerageName: "" } }
  return (
    <div className="lbr-legal">
      <Footer config={footerConfig} compact equalHousingText />
    </div>
  )
}

// Client-facing PAUSED state — shown when the locator disables (pauses) this list.
// Reuses the SAME /r shell, city-skyline hero, card language, agent signature, and legal
// footer as the active page, so it reads as the same personalized page — just paused. NO
// property data is present here (the resolver returns none when disabled). Reversible: the
// same link returns to the active experience the moment the locator re-activates.
function PausedScreen({
  token, heroImg, agentName, agentFirst, agentTitle, brokerage, photo, serviceAreas, phone, config,
}: {
  token: string
  heroImg: string
  agentName: string
  agentFirst: string
  agentTitle: string
  brokerage: string | null
  photo: string | null
  serviceAreas: string | null
  phone: string | null
  config: unknown
}) {
  return (
    <div className={`${inter.variable} ${caveat.variable} lbr-root`}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="lbr-page"><div className="lbr-shell lbr-shell--paused">
        {/* HERO — same city-skyline treatment; the greeting is replaced by the paused line. */}
        <section className="lbr-intro">
          <div className="lbr-sky" aria-hidden style={{ ["--hero-img" as string]: `url('${heroImg}')` }} />
          <div className="lbr-intro-inner">
            <h1 className="lbr-greet">Your apartment search is currently paused.</h1>
          </div>
        </section>

        {/* Single paused-state card — body + "Resume Your Search" CTA (client-side; swaps to
            the resumed confirmation on success). Reactivates the LEAD, never the list. */}
        <section className="lbr-recs">
          <PausedResumeCard token={token} agentFirst={agentFirst} />
        </section>

        {/* AGENT SIGNATURE — the SAME canonical shared component as the active page. Kept. */}
        <div className="lbr-sig">
          <AgentSignature name={agentName} photoUrl={photo} title={agentTitle} brokerage={brokerage} phone={phone} serviceAreas={serviceAreas} />
        </div>

        {/* FOOTER — SIMPLIFIED on the paused state: the shared legal footer renders, but the
            legal-links row (TREC disclosures) is hidden via scoped CSS (.lbr-shell--paused),
            leaving only "Equal Housing · Powered by Locator Beast". */}
        <LegalFooter config={config} />
      </div></div>
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
        <LegalFooter config={config} />
      </div></div>
    </div>
  )
}

export default async function ClientRecommendationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ preview?: string }>
}) {
  const { token } = await params
  // The agent's own Preview action opens the real list with ?preview=1. It suppresses the view
  // beacon ONLY — the page renders byte-identically to what the client sees, which is the entire
  // value of Preview. A client link never carries this and is unaffected.
  const isPreview = (await searchParams)?.preview === "1"
  if (!looksLikeShareToken(token)) notFound()

  const supabase = await createClient()
  const tokenHash = hashShareToken(token)

  const { data, error } = await supabase.rpc("lb_resolve_client_recommendations", { p_token_hash: tokenHash })
  const share = (Array.isArray(data) ? data[0] : data) as Resolved | undefined
  if (error || !share) notFound()

  // VIEW RECORDING MOVED TO THE BROWSER — see ViewBeacon + /api/r/view.
  //
  // This used to be `void supabase.rpc("lb_record_client_share_view", ...)` right here. Un-awaited
  // work is dropped when the serverless function freezes after the response, and production proved
  // it: 4 shares had favorites a client could only set by opening the page, yet not one view was
  // ever recorded. The render ALSO counted link-preview crawlers, because this page is
  // force-dynamic and every unfurl re-ran it.
  //
  // The RPC itself is unchanged and still the only writer, so sessionization, first/last-viewed and
  // hit_count semantics are exactly as before.

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
  // Hero photograph = the CLIENT's submitted search city, resolved only through the
  // canonical market/theme catalog (never an arbitrary path), generic SKYLINE_PATH
  // fallback for unknown/imageless cities. Presentation-only; snapshot is untouched.
  const heroImg = clientHeroImage(share.client_city)
  const agentName = share.agent_name?.trim() || "Your locator"
  const agentFirst = agentName.split(/\s+/)[0]
  const agentTitle = share.agent_title?.trim() || "Apartment Locator"
  const brokerage = share.agent_brokerage?.trim() || null
  const photo = share.agent_photo_url?.trim() || null
  // The locator's configured service markets (public marketing info) for the canonical signature.
  const serviceAreas = mergeSmartFormConfig(share.smart_form_config).copy?.serviceAreas ?? null

  if (share.status === "disabled") {
    // Paused/disabled: NO property data is present (the resolver returns none). Render the
    // personalized paused state — same shell/hero/signature/footer as the active page.
    return (
      <PausedScreen
        token={token}
        heroImg={heroImg}
        agentName={agentName}
        agentFirst={agentFirst}
        agentTitle={agentTitle}
        brokerage={brokerage}
        photo={photo}
        serviceAreas={serviceAreas}
        phone={share.agent_phone}
        config={share.smart_form_config}
      />
    )
  }

  const properties = share.properties ?? []
  if (properties.length === 0) {
    return (
      <>
      <ViewBeacon token={token} disabled={isPreview} />
      <NoticeScreen
        title="Your list is being prepared"
        body={`${agentFirst} is still putting your recommendations together — you'll get a text as soon as they're ready.`}
        config={share.smart_form_config}
        brokerage={brokerage}
      />
      </>
    )
  }

  const curated = firstName ? `Custom List for ${firstName} · by ${agentName}` : `Custom List by ${agentName}`
  const countLine = `${properties.length} ${properties.length === 1 ? "property" : "properties"} recommended for you`
  const greeting = firstName ? `${firstName}, I found some great options for you!` : "I found some great options for you!"

  return (
    <div className={`${inter.variable} ${caveat.variable} lbr-root`}>
      {/* Records the view from the BROWSER so it is actually awaited, and so link-preview crawlers,
          which never run JS, stop counting. Suppressed for the agent's own Preview. */}
      <ViewBeacon token={token} disabled={isPreview} />
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="lbr-page"><div className="lbr-shell">

        {/* INTRO — one clean composition, no header logo, no agent card */}
        <section className="lbr-intro">
          <div className="lbr-sky" aria-hidden style={{ ["--hero-img" as string]: `url('${heroImg}')` }} />
          <div className="lbr-intro-inner">
            <p className="lbr-eyebrow">{curated}<span className="lbr-rule" /></p>
            <h1 className="lbr-greet">{greeting}</h1>
          </div>
        </section>

        {/* RECOMMENDATIONS */}
        <section className="lbr-recs">
          <div className="lbr-recs-head">
            <h2>Your Recommendations</h2>
            <p>{countLine}</p>
          </div>

          {/* NEXT STEPS — same content/circles, now a compact roadmap ABOVE the cards so the
              client knows to heart their favorites before interacting. Horizontal 1→2→3 on
              desktop, vertical on mobile (see .lbr-steps--roadmap). */}
          <section className="lbr-steps lbr-steps--roadmap">
            <h2>Next Steps</h2>
            <ol>
              <li><div className="lbr-n">1</div><div><b>&#10084;&#65039; Your top 2&ndash;3 favorites</b><span>Choose the ones you&rsquo;d like to tour.</span></div></li>
              <li><div className="lbr-n">2</div><div><b>I&rsquo;ll get your tours scheduled</b><span>We coordinate everything for you.</span></div></li>
              <li><div className="lbr-n">3</div><div><b>List your Realtor/Locator</b><span>List me on your application for cash rebates, free movers or incentives.</span></div></li>
            </ol>
          </section>

          <RecommendationList
            properties={properties}
            token={token}
            initialDoneSelecting={doneSelecting}
            initialAvailability={availability}
          />
        </section>

        {/* AGENT SIGNATURE — canonical shared component (identical on the Thank You page). */}
        <div className="lbr-sig">
          <AgentSignature name={agentName} photoUrl={photo} title={agentTitle} brokerage={brokerage} phone={share.agent_phone} serviceAreas={serviceAreas} />
        </div>

        {/* FOOTER — legal/brokerage + subtle non-clickable "Powered by Locator Beast" */}
        <LegalFooter config={share.smart_form_config} />
      </div></div>
    </div>
  )
}
