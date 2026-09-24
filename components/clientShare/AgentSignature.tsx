import { Caveat } from "next/font/google"

// Handwritten script for the agent name + closing tagline (matches the canonical Recommendations
// signature). Loaded here so the shared component looks identical on every client-facing surface.
const caveat = Caveat({ subsets: ["latin"], weight: ["600", "700"], display: "swap" })

/**
 * Canonical client-facing agent signature — the ONE source of truth shared by the Recommendations
 * (/r/[token]) and Thank You pages. Renders: photo → handwritten name → title → brokerage → an
 * optional dynamic "Serving …" service-markets line → handwritten closing tagline.
 *
 * Self-contained styling (its own fonts/colors) so it renders identically regardless of the host
 * page. Presentational only: callers pass already public-safe values; it never reads or exposes any
 * additional profile data. The legal/brokerage footer stays each page's existing (shared) Footer.
 */
export default function AgentSignature({
  name,
  photoUrl,
  title,
  brokerage,
  serviceAreas,
  tagline = "Helping you find the perfect home.",
}: {
  name: string
  photoUrl?: string | null
  title?: string | null
  brokerage?: string | null
  /** The locator's configured service-market label (e.g. "Austin, Dallas, Houston") — rendered as a
   *  centered, dot-separated, naturally-wrapping "Serving …" line. Hidden entirely when empty. */
  serviceAreas?: string | null
  tagline?: string
}) {
  const initial = (name?.trim().charAt(0) || "•").toUpperCase()
  // Split the configured label on commas (or existing dots) into canonical market names, then join
  // with centered dots. Names have no commas, so this is safe; empty ⇒ the whole line is omitted.
  const markets = (serviceAreas ?? "")
    .split(/\s*[,·]\s*/)
    .map((m) => m.trim())
    .filter(Boolean)

  return (
    <div className="text-center">
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt={name}
          className="mx-auto h-[140px] w-[140px] rounded-full border-[5px] border-white bg-[#dbe3ee] object-cover shadow-[0_14px_34px_-18px_rgba(14,37,69,0.5)] sm:h-[104px] sm:w-[104px]"
        />
      ) : (
        <div
          aria-hidden
          className="mx-auto flex h-[140px] w-[140px] items-center justify-center rounded-full border-[5px] border-white text-[54px] font-extrabold text-white shadow-[0_14px_34px_-18px_rgba(14,37,69,0.5)] sm:h-[104px] sm:w-[104px] sm:text-[40px]"
          style={{ background: "linear-gradient(135deg,#22406e,#16305a)" }}
        >
          {initial}
        </div>
      )}
      <div className={`${caveat.className} mt-3 text-[50px] leading-[0.9] text-[#0e2545] sm:text-[34px]`}>{name}</div>
      {title ? <div className="mt-1.5 text-[20px] font-semibold text-[#3a4658] sm:text-[17px]">{title}</div> : null}
      {brokerage ? <div className="mt-0.5 text-[19px] text-[#7a869a] sm:text-[16px]">{brokerage}</div> : null}
      {markets.length > 0 ? (
        // Subordinate profile info — small + muted, sized to fit the configured markets on ONE
        // centered line at normal mobile widths (full names + · separators preserved, never
        // abbreviated). It wraps rather than scrolling if a very long market list can't fit.
        <div className="-mx-4 mt-1.5 text-[13px] leading-snug text-[#7a869a] sm:mx-0 sm:text-[12px]">
          Serving {markets.join(" · ")}
        </div>
      ) : null}
      {/* Intentional breathing room before the handwritten tagline (the final identity element). */}
      <div className={`${caveat.className} -mx-4 mt-5 text-[28px] leading-tight text-[#0e2545] opacity-90 sm:mx-0 sm:text-[22px]`}>{tagline}</div>
    </div>
  )
}
