// Shared presentation for the PUBLIC destination-authorization pages (recipient-facing). Pure,
// self-contained styling (no CRM chrome, no account concepts) so a family member sees only a
// simple "connect your Instagram" experience. Reveals nothing about the owner or Social Beast.
//
// ── PRESENTATION ONLY ───────────────────────────────────────────────────────────────────────
// This file renders a state it is GIVEN. It does not validate a token, read the database, decide
// whether a link is live, or build the OAuth URL — [token]/page.tsx does all of that and hands
// down a state and (when valid) an opaque `beginHref`. Redesigning this component therefore
// cannot change the single-use token flow, the 7-day expiry, OAuth, permissions or ownership.
//
// The look REUSES the client recommendation page (/locator-beast/r/[token]): the same bundled
// city-skyline photograph (SKYLINE_PATH), the same navy-over-photo gradient treatment, the same
// Inter + navy/gold tokens. Nothing new is introduced — the skyline is the generic asset the
// recommendation hero already falls back to, so there is no per-recipient image to resolve and
// nothing about the owner or the invited account is in the picture.
//
// The overlay is deliberately heavier than the recommendation hero's. That page sets type against
// the photo; this one sets a single icon against it, and the icon has to be the first thing the
// recipient sees. The one colour that is not brand palette is the Instagram ramp on the badge and
// the button — the recipient is being asked to recognise Instagram, and that ramp is how they do it.
import { Inter } from "next/font/google"
import LocatorBeastWordmark, { NAV_LOGO_HEIGHT } from "@/components/brand/LocatorBeastWordmark"
import { SKYLINE_PATH } from "@/lib/clientShare/skylinePath"

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--sbi-sans", display: "swap" })

type State =
  | "valid"
  | "connected"
  | "used"
  | "revoked"
  | "expired"
  | "invalid"
  | "denied"
  | "state"
  | "exchange"
  | "store"
  | "no_account"
  | "account_taken"
  | "already_connected"
  | "not_configured"

/** Which badge a state wears. `platform` is the invitation itself; the rest are outcomes. */
type Tone = "platform" | "success" | "warn" | "neutral"

/** The network being authorized. Presentation only — it picks an icon, a wordmark and a colour
 *  ramp. It does NOT reach the token, the OAuth URL or anything the caller does; `beginHref` is
 *  still built entirely by the page above. Instagram is the default because it is the only
 *  invitation flow that exists today. */
export type AuthorizePlatform = "instagram" | "tiktok"

const PLATFORM: Record<AuthorizePlatform, { name: string; subheading: string }> = {
  instagram: { name: "Instagram", subheading: "Connect your Instagram account to get started." },
  tiktok: { name: "TikTok", subheading: "Connect your TikTok account to get started." },
}

const COPY: Record<State, { title: string; body: string; tone: Tone }> = {
  valid: {
    title: "Social Beast Auto Posting",
    // Replaced at render time with the platform's own subheading; see PLATFORM.
    body: PLATFORM.instagram.subheading,
    tone: "platform",
  },
  connected: {
    // Deliberately says nothing about WHICH network connected. The confirmation is the same
    // sentence whatever was authorized, so this screen needs no per-platform variant.
    title: "You’re all set!",
    body: "You can now close this window.",
    tone: "success",
  },
  used: {
    title: "This link was already used",
    body: "The invitation has already been completed. Contact the admin if you need to connect again.",
    tone: "neutral",
  },
  revoked: {
    title: "This link is no longer active",
    body: "This invitation was cancelled. Please ask for a new link if you still need to connect.",
    tone: "neutral",
  },
  expired: {
    title: "This link has expired",
    body: "For security, invitation links are only valid for 7 days. Please ask for a new link.",
    tone: "warn",
  },
  invalid: {
    title: "This link isn’t valid",
    body: "We couldn’t recognize this invitation link. Please double-check the link you were sent.",
    tone: "warn",
  },
  denied: {
    title: "Authorization cancelled",
    body: "It looks like the Instagram authorization was cancelled. You can try again using your link.",
    tone: "neutral",
  },
  state: {
    title: "Something interrupted the sign-in",
    body: "We couldn’t safely verify the request. Please open your invitation link again and retry.",
    tone: "warn",
  },
  exchange: {
    title: "Instagram sign-in didn’t finish",
    body: "Instagram couldn’t complete the connection. Please try again in a moment using your link.",
    tone: "warn",
  },
  store: {
    title: "Almost there — please retry",
    body: "We connected to Instagram but couldn’t finish saving. Please open your link and try once more.",
    tone: "warn",
  },
  no_account: {
    title: "No Instagram account found",
    body: "We couldn’t read an Instagram account from that authorization. Make sure you’re signed in to the right Instagram account and try again.",
    tone: "warn",
  },
  account_taken: {
    title: "This Instagram is already connected",
    body: "This Instagram account is already set up elsewhere. If that’s unexpected, let the person who sent you the link know.",
    tone: "neutral",
  },
  already_connected: {
    // Not an error the recipient caused, and not one they need help with — the account they chose
    // is simply already set up. It deliberately does not name either account: this page is public.
    title: "That account is already connected",
    body: "This Instagram account is already set up for posting, so nothing was changed.\n\nIf you meant to connect a different account, switch accounts in Instagram and open your link again.",
    tone: "neutral",
  },
  not_configured: {
    title: "Not available yet",
    body: "Instagram connection isn’t available right now. Please try again later.",
    tone: "neutral",
  },
}

// ── The approved presentation, as scoped CSS (every selector prefixed `sbi-`). ──
const CSS = `
.sbi-root{--navy:#0e2545;--navy-deep:#061226;--ink:#3a4658;--muted:#7a869a;--faint:#9aa6b8;--line:#e7ebf2;--bg:#f5f7fb;--gold:#f5a524;--green:#1f9d55;font-family:var(--sbi-sans),-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:var(--ink);line-height:1.5;-webkit-font-smoothing:antialiased}
.sbi-root *{box-sizing:border-box}

/* The recommendation hero's composition, full-bleed: the same bundled skyline under a navy
   gradient. Heavier than /r's, because a single icon has to carry the page. */
.sbi-page{position:relative;min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:36px 20px 40px;background:var(--navy-deep);overflow:hidden}
.sbi-sky{position:absolute;inset:0;background-image:linear-gradient(165deg,rgba(6,18,38,.86) 0%,rgba(7,20,42,.78) 40%,rgba(10,28,52,.70) 70%,rgba(14,37,69,.82) 100%),var(--hero-img);background-size:cover;background-position:center 42%}
/* A second, centred darkening: it is what makes the badge read against the buildings without
   flattening the skyline at the edges of the frame. */
.sbi-sky::after{content:"";position:absolute;inset:0;background:radial-gradient(70% 52% at 50% 44%,rgba(6,18,38,.70),rgba(6,18,38,.26) 78%)}
.sbi-brand{position:relative;margin:0 0 26px;display:flex;justify-content:center}

/* Not a card so much as a column of content laid over the skyline. The faint panel exists only
   to hold the body copy away from the photograph's detail. */
.sbi-card{position:relative;width:100%;max-width:440px;text-align:center;text-shadow:0 1px 16px rgba(6,18,38,.6)}
/* The panels carry their own backing, so they don't need the shadow the loose type does. */
.sbi-cta{text-shadow:none}

.sbi-badge{width:92px;height:92px;margin:0 auto 24px;border-radius:26px;display:flex;align-items:center;justify-content:center;color:#fff}
.sbi-badge svg{width:46px;height:46px;display:block}
.sbi-badge-instagram{background:linear-gradient(135deg,#f9ce34 0%,#f58529 25%,#dd2a7b 60%,#8134af 100%);box-shadow:0 0 0 1px rgba(255,255,255,.14),0 22px 48px -18px rgba(221,42,123,.85),0 0 64px -14px rgba(221,42,123,.55)}
/* TikTok's own mark is black on white, which disappears on this backdrop. Its two accent
   colours (#25F4EE / #FE2C55) carry the recognition instead, over the brand's near-black. */
.sbi-badge-tiktok{background:linear-gradient(135deg,#25f4ee 0%,#0f1014 42%,#0f1014 58%,#fe2c55 100%);box-shadow:0 0 0 1px rgba(255,255,255,.16),0 22px 48px -18px rgba(254,44,85,.7),0 0 64px -16px rgba(37,244,238,.45)}
.sbi-badge-success{background:linear-gradient(135deg,#3ddc84 0%,#1f9d55 100%);box-shadow:0 0 0 1px rgba(255,255,255,.18),0 22px 48px -18px rgba(31,157,85,.9),0 0 70px -12px rgba(61,220,132,.6)}
.sbi-badge-warn{background:rgba(245,165,36,.16);color:#f5c070;box-shadow:inset 0 0 0 1px rgba(245,165,36,.35)}
.sbi-badge-neutral{background:rgba(255,255,255,.10);color:rgba(255,255,255,.72);box-shadow:inset 0 0 0 1px rgba(255,255,255,.18)}

.sbi-title{font-size:30px;font-weight:800;letter-spacing:-.02em;color:#fff;margin:0;line-height:1.16;text-wrap:balance}
.sbi-rule{width:62px;height:3px;border-radius:3px;background:linear-gradient(90deg,var(--gold),#f7c66b);margin:16px auto 0}
.sbi-body{font-size:16px;line-height:1.6;color:rgba(255,255,255,.88);margin:16px 0 0;white-space:pre-line}
.sbi-label{font-size:13px;color:rgba(255,255,255,.62);margin:14px 0 0}
.sbi-label strong{color:#fff;font-weight:600}

.sbi-cta{display:flex;align-items:center;justify-content:center;gap:9px;width:100%;margin:26px 0 0;padding:16px 22px;border-radius:14px;color:#fff;font-size:16.5px;font-weight:700;text-decoration:none}
.sbi-cta-instagram{background:linear-gradient(90deg,#f58529,#dd2a7b,#8134af);box-shadow:0 18px 36px -18px rgba(221,42,123,.95)}
.sbi-cta-tiktok{background:linear-gradient(90deg,#25f4ee,#0f1014 46%,#fe2c55);box-shadow:0 18px 36px -18px rgba(254,44,85,.9)}
.sbi-cta svg{width:20px;height:20px;flex:none}
.sbi-cta:hover{filter:brightness(1.08)}
.sbi-cta:active{transform:translateY(1px)}

/* One line, centred under the button. No panel: a single sentence in a bordered box read as a
   warning rather than a reassurance. The lock is INLINE rather than a flex column, so that when
   the sentence wraps on a narrow screen the icon stays with the first word instead of floating
   beside a centred two-line block. */
.sbi-secure{margin:18px 0 0;font-size:13px;line-height:1.5;color:rgba(255,255,255,.74)}
.sbi-secure svg{width:13px;height:13px;display:inline-block;vertical-align:-1px;margin-right:6px;color:var(--gold)}
.sbi-secure b{color:#fff;font-weight:600}

@media (max-width:480px){
  .sbi-page{padding:30px 18px 34px}
  .sbi-sky{background-position:center 42%}
  .sbi-title{font-size:25px}
  .sbi-body{font-size:15px}
  .sbi-badge{width:80px;height:80px;border-radius:23px;margin-bottom:20px}
  .sbi-badge svg{width:40px;height:40px}
}
`

function InstagramGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" aria-hidden="true">
      <rect x="2.5" y="2.5" width="19" height="19" rx="5.4" />
      <circle cx="12" cy="12" r="4.6" />
      <circle cx="17.6" cy="6.4" r="1.15" fill="currentColor" stroke="none" />
    </svg>
  )
}

function TikTokGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 1 1-1.82-2.48V9.66a5.69 5.69 0 1 0 4.91 5.64V9.01a7.35 7.35 0 0 0 4.3 1.38V7.3a4.35 4.35 0 0 1-3.24-1.48Z" />
    </svg>
  )
}

function PlatformGlyph({ platform }: { platform: AuthorizePlatform }) {
  return platform === "tiktok" ? <TikTokGlyph /> : <InstagramGlyph />
}

function ToneGlyph({ tone, platform }: { tone: Tone; platform: AuthorizePlatform }) {
  if (tone === "platform") return <PlatformGlyph platform={platform} />
  if (tone === "success") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 6.5 9.4 17.1 4 11.7" />
      </svg>
    )
  }
  if (tone === "warn") {
    // A clock, not an alert triangle: every `warn` state here is "this link can't be used — ask
    // for another", which is an inconvenience, not a danger.
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7.2v5.1l3.2 1.9" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.6 14.4a3.6 3.6 0 0 0 5.1 0l3-3a3.6 3.6 0 0 0-5.1-5.1l-.8.8" />
      <path d="M14.4 9.6a3.6 3.6 0 0 0-5.1 0l-3 3a3.6 3.6 0 0 0 5.1 5.1l.8-.8" />
    </svg>
  )
}

function LockGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4.4" y="10.4" width="15.2" height="10.2" rx="2.6" />
      <path d="M8.2 10.4V7.6a3.8 3.8 0 0 1 7.6 0v2.8" />
    </svg>
  )
}

export default function AuthorizeShell({
  state,
  beginHref,
  platform = "instagram",
}: {
  state: string
  /** Still accepted so the token page needs no change; the invitation label is no longer shown. */
  label?: string | null
  beginHref?: string
  platform?: AuthorizePlatform
}) {
  const key = (state in COPY ? state : "invalid") as State
  const copy = COPY[key]
  const isInvite = key === "valid" && !!beginHref
  const net = PLATFORM[platform]
  const body = key === "valid" ? net.subheading : copy.body
  return (
    <div className={`sbi-root ${inter.variable}`}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="sbi-page">
        {/* The recommendation page's skyline, as a backdrop. Generic asset, no per-recipient
            resolution — there is nothing here to leak. */}
        <div className="sbi-sky" aria-hidden style={{ ["--hero-img" as string]: `url('${SKYLINE_PATH}')` }} />

        <div className="sbi-brand">
          <LocatorBeastWordmark variant="white" height={NAV_LOGO_HEIGHT} priority />
        </div>

        <main className="sbi-card">
          <div className={`sbi-badge sbi-badge-${copy.tone === "platform" ? platform : copy.tone}`}>
            <ToneGlyph tone={copy.tone} platform={platform} />
          </div>

          <h1 className="sbi-title">{copy.title}</h1>
          <div className="sbi-rule" />
          <p className="sbi-body">{body}</p>

          {isInvite && (
            <a className={`sbi-cta sbi-cta-${platform}`} href={beginHref}>
              <PlatformGlyph platform={platform} />
              Connect {net.name}
            </a>
          )}

          {isInvite && (
            <p className="sbi-secure">
              <LockGlyph />
              <b>Secure authorization.</b> Link expires after 7 days or once used.
            </p>
          )}
        </main>
      </div>
    </div>
  )
}
