import { notFound } from "next/navigation"
import { Inter, Caveat } from "next/font/google"
import { createClient } from "@/lib/supabase/server"
import { mergeSmartFormConfig } from "@/app/smart-lead-form/_lib/mergeConfig"
import AgentSignature from "@/components/clientShare/AgentSignature"
import Footer from "@/app/smart-lead-form/_components/form/sections/Footer"
import { clientHeroImage } from "@/lib/clientShare/heroImage"
import { formatDateDisplay } from "@bc/companion-shared"
import OutOfOfficeCard from "./OutOfOfficeCard"

/**
 * PUBLIC OUT-OF-OFFICE LANDING PAGE — /{username}/out-of-office
 *
 * Shown when a locator has marked themselves away. Visitors get the agent's
 * personalized page, an explanation, and a link into their normal Smart Lead Form
 * so an inbound client is captured rather than lost.
 *
 * ── WHAT THIS IS NOT ────────────────────────────────────────────────────────
 * NOT the paused recommendation page. /r/<token> pauses ONE CLIENT'S share, is
 * reached with a private token, and is reversed by that client tapping Resume
 * Search. This is a LOCATOR being away: workspace-wide, public, no token, no
 * client, no resume path, and no shared state of any kind. Nothing here imports
 * PausedResumeCard, /api/r/resume, lb_resolve_client_recommendations or
 * share.status, and the recommendation page is not modified.
 *
 * The visual language is copied on purpose so the two read as the same product.
 * The CSS below is a COPY of the subset this page needs — the /r page's own CSS
 * constant is deliberately left alone, because protecting a known-good
 * client-facing page is worth more than removing duplication.
 *
 * ── RESOLUTION ──────────────────────────────────────────────────────────────
 *   lb_resolve_public_form(username)      EXISTING, UNCHANGED → agent presentation
 *   lb_workspace_out_of_office(username)  NEW, read-only      → the OOO state
 * Two calls rather than one, so the function the live Smart Lead Form depends on
 * never had to change signature.
 */

export const dynamic = "force-dynamic"

const inter = Inter({ subsets: ["latin"], variable: "--lbr-sans", display: "swap" })
const caveat = Caveat({ subsets: ["latin"], weight: ["600"], variable: "--lbr-script", display: "swap" })

/**
 * Copied subset of the /r presentation — shell, hero, signature slot, legal
 * footer — plus this page's own card rules (`ooo-*`). The card is named
 * separately from `.lbr-paused` so the two pages can never drift into each other
 * by selector.
 */
const CSS = `
.lbr-root{--navy:#0e2545;--ink:#3a4658;--muted:#7a869a;--faint:#9aa6b8;--line:#e7ebf2;--line-soft:#eef1f7;--bg:#f5f7fb;--gold:#f5a524;font-family:var(--lbr-sans),-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:var(--ink);line-height:1.5;-webkit-font-smoothing:antialiased}
.lbr-root *{box-sizing:border-box}
.lbr-page{background:var(--bg);min-height:100vh}
.lbr-shell{max-width:1300px;margin:26px auto 40px;background:#fff;border:1px solid var(--line);border-radius:22px;overflow:hidden;box-shadow:0 30px 80px -50px rgba(14,37,69,.35)}
/* HERO */
.lbr-intro{position:relative;overflow:hidden;background:linear-gradient(180deg,#f7f9fc,#eef2f8)}
.lbr-sky{position:absolute;inset:0;background-image:linear-gradient(90deg,rgba(6,18,38,.99) 0%,rgba(7,20,42,.95) 32%,rgba(10,28,52,.68) 58%,rgba(14,37,69,.20) 80%,rgba(14,37,69,0) 92%),var(--hero-img);background-size:cover;background-position:right 42%}
.lbr-intro-inner{position:relative;padding:40px 44px 42px;max-width:640px}
.lbr-greet{font-size:36px;line-height:1.14;font-weight:800;color:#fff;letter-spacing:-.02em;margin:0;text-wrap:balance;max-width:16ch;text-align:left}
/* CARD SECTION */
.lbr-recs{padding:30px 40px 8px}
.ooo-card{max-width:520px;margin:6px auto 0;background:#fff;border:1px solid var(--line);border-radius:18px;padding:24px 28px;text-align:center;box-shadow:0 20px 60px -44px rgba(14,37,69,.4)}
.ooo-body{font-size:15px;color:var(--muted);margin:0 auto;max-width:390px;line-height:1.6}
.ooo-body + .ooo-body{margin-top:10px}
.ooo-btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;margin-top:20px;background:var(--navy);color:#fff;font-weight:700;font-size:15px;text-decoration:none;padding:12px 24px;border-radius:12px;appearance:none;border:none;cursor:pointer;font-family:inherit}
/* AGENT SIGNATURE */
.lbr-sig{margin:26px 40px 0;text-align:center;padding:8px 20px 4px}
/* FOOTER — identity row only, matching the paused page's simplified treatment. The
   shared Footer component is NOT modified; everything is scoped to .lbr-legal here. */
.lbr-legal{padding:22px 26px 26px;margin-top:8px;border-top:1px solid var(--line-soft)}
.lbr-legal a[href="https://locatorbeast.com"]{pointer-events:none;color:inherit;text-decoration:none;cursor:default}
.lbr-legal span:has(> a[href="/privacy"]),
.lbr-legal span:has(> a[href="/terms"]){display:none}
.lbr-legal div:has(> span > a[href="/privacy"]){display:none}
@media (max-width:640px){
  .lbr-shell{margin:0;border:none;border-radius:0;box-shadow:none;background:var(--bg)}
  .lbr-sky{display:block;background-image:linear-gradient(155deg,rgba(6,18,38,.99) 0%,rgba(7,20,42,.95) 45%,rgba(10,28,52,.70) 75%,rgba(14,37,69,.28) 100%),var(--hero-img);background-position:center 28%}
  .lbr-intro-inner{padding:26px 18px 14px;max-width:none}
  .lbr-greet{font-size:34px;line-height:1.16;max-width:none}
  .lbr-recs{padding:20px 16px 8px}
  .lbr-sig{margin:24px 16px 0;background:#fff;border:1px solid var(--line);border-radius:18px;box-shadow:0 6px 20px -12px rgba(14,37,69,.28);padding:24px 18px}
}
`

type PublicForm = {
  agent_name: string | null
  brokerage_name: string | null
  photo_url: string | null
  form_config: unknown
}
type OutOfOffice = {
  out_of_office_enabled: boolean | null
  out_of_office_until: string | null
}

export default async function OutOfOfficePage({
  params,
}: {
  params: Promise<{ username: string }>
}) {
  const { username } = await params
  const supabase = await createClient()

  const [formRes, oooRes] = await Promise.all([
    supabase.rpc("lb_resolve_public_form", { p_username: username }),
    supabase.rpc("lb_workspace_out_of_office", { p_username: username }),
  ])

  const agent = (Array.isArray(formRes.data) ? formRes.data[0] : formRes.data) as PublicForm | undefined
  const ooo = (Array.isArray(oooRes.data) ? oooRes.data[0] : oooRes.data) as OutOfOffice | undefined

  // Unknown username, or a locator who is not away: this page does not exist.
  // Not a redirect to the form — a visitor who typed this URL for an available
  // locator should not be told a story about them being out.
  if (!agent || !ooo?.out_of_office_enabled) notFound()

  const config = mergeSmartFormConfig(agent.form_config ?? {})
  const agentName = agent.agent_name?.trim() || "Your locator"
  const brokerage = agent.brokerage_name?.trim() || null
  const photo = agent.photo_url?.trim() || null
  const serviceAreas = config.copy?.serviceAreas ?? null
  // No client city on a public page — the generic skyline is the correct hero.
  const heroImg = clientHeroImage(null)
  // formatDateDisplay, never new Date(): out_of_office_until is a date-only value,
  // and parsing it as an instant renders the previous day in any timezone behind
  // UTC — the exact bug that made move_date read a day early.
  const returnDate = ooo.out_of_office_until ? formatDateDisplay(ooo.out_of_office_until) : null

  // Brokerage appears once in the signature; blank it in the footer so the legal
  // identity row reads "Equal Housing · Powered by Locator Beast".
  const footerConfig = { ...config, copy: { ...config.copy, brokerageName: "" } }

  return (
    <div className={`${inter.variable} ${caveat.variable} lbr-root`}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="lbr-page"><div className="lbr-shell">
        <section className="lbr-intro">
          <div className="lbr-sky" aria-hidden style={{ ["--hero-img" as string]: `url('${heroImg}')` }} />
          <div className="lbr-intro-inner">
            <h1 className="lbr-greet">Thanks for reaching out!</h1>
          </div>
        </section>

        <section className="lbr-recs">
          <OutOfOfficeCard username={username} returnDate={returnDate} />
        </section>

        <div className="lbr-sig">
          <AgentSignature
            name={agentName}
            photoUrl={photo}
            title="Apartment Locator"
            brokerage={brokerage}
            phone={null}
            serviceAreas={serviceAreas}
          />
        </div>

        <div className="lbr-legal">
          <Footer config={footerConfig} compact equalHousingText />
        </div>
      </div></div>
    </div>
  )
}
