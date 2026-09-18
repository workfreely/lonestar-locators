"use client"

import { useState } from "react"

/**
 * The client-facing recommendation cards — the approved premium presentation.
 *
 * A client component only because the heart is interactive; everything else is
 * server-rendered. The card shows only real snapshot data and GRACEFULLY OMITS any
 * field that is absent (an un-enriched historical list may have no price / special /
 * rating / reasons): no "$0", no empty badge, no fake rating, no placeholder reason.
 *
 * FAVOURITES PERSIST. The heart toggles page state optimistically and writes through
 * the token-scoped /api/r/favorite endpoint — unchanged. The item is referenced by its
 * public sort_order (`index`), never a database id.
 */

export type ClientProperty = {
  name: string
  address: string | null
  imageUrl: string | null
  websiteUrl: string | null
  reasons: string[]
  /** Frozen at snapshot time (Phase 1); null on an un-enriched list. */
  startingPrice: number | null
  currentSpecial: string | null
  googleRating: number | null
  index: number
  favorited: boolean
}

function Heart({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden
      fill={filled ? "#e0245e" : "none"} stroke={filled ? "#e0245e" : "#0e2545"} strokeWidth="1.9"
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l8.8 8.8 8.8-8.8a5.5 5.5 0 0 0 0-7.8Z" />
    </svg>
  )
}
function Check() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden className="lbr-check"
      fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}
function Pin() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0Z" /><circle cx="12" cy="10" r="3" />
    </svg>
  )
}
function Star() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden fill="currentColor">
      <path d="M12 2l2.9 6.3 6.9.7-5.1 4.6 1.4 6.8L12 17.8 6 20.4l1.4-6.8L2.3 9l6.9-.7z" />
    </svg>
  )
}
function Arrow() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}

/** Whole-dollar price display. NEVER stores/derives a formatted string — the number
 *  is the snapshot value; this is display only. */
function money(n: number): string {
  return "$" + Math.round(n).toLocaleString("en-US")
}

/**
 * Display-only cleanup for the CARD TITLE ONLY. Strips a single trailing generic
 * "Apartments" suffix (case-insensitive, must be preceded by whitespace, at the very
 * end of the name) so "Archer Medical District Apartments" reads "Archer Medical
 * District". Deliberately narrow:
 *   • only the exact word "Apartments" — never "Apartment", "Apartment Homes",
 *     "Residences", "Lofts", or any other suffix;
 *   • only when trailing — "Landing Furnished Apartments at Toscana at Sonterra"
 *     keeps its mid-name "Apartments" untouched;
 *   • only preceded by whitespace — a bare "Apartments" (no space before it) is left
 *     as-is, and the guard below rejects any result that collapses to an article/blank
 *     (e.g. "The Apartments" stays "The Apartments") so the title is never unusable.
 * The RAW p.name is still used everywhere else (alt text, aria-labels, favourites, and
 * — upstream — the stored snapshot, resolver, CRM, Companion, and Sent Lists).
 */
function displayPropertyName(name: string): string {
  const cleaned = name.replace(/\s+Apartments\s*$/i, "").trim()
  if (!cleaned) return name
  // Reject degenerate results (only an article/filler left → not a usable title).
  if (/^(the|a|an)$/i.test(cleaned)) return name
  return cleaned
}

export default function RecommendationList({
  properties,
  token,
}: {
  properties: ClientProperty[]
  token: string
}) {
  const [favorites, setFavorites] = useState<Set<number>>(
    () => new Set(properties.filter((p) => p.favorited).map((p) => p.index)),
  )
  const [pending, setPending] = useState<Set<number>>(new Set())

  async function toggle(index: number) {
    const next = !favorites.has(index)
    setFavorites((prev) => {
      const s = new Set(prev)
      next ? s.add(index) : s.delete(index)
      return s
    })
    setPending((prev) => new Set(prev).add(index))
    try {
      const res = await fetch("/api/r/favorite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, index, favorited: next }),
      })
      if (!res.ok) throw new Error("favorite failed")
    } catch {
      setFavorites((prev) => {
        const s = new Set(prev)
        next ? s.delete(index) : s.add(index)
        return s
      })
    } finally {
      setPending((prev) => {
        const s = new Set(prev)
        s.delete(index)
        return s
      })
    }
  }

  return (
    <div className="lbr-grid">
      {properties.map((p) => {
        const isFav = favorites.has(p.index)
        const isPending = pending.has(p.index)
        const hasPrice = typeof p.startingPrice === "number" && Number.isFinite(p.startingPrice)
        const hasRating = typeof p.googleRating === "number" && Number.isFinite(p.googleRating)
        const reasons = (p.reasons ?? []).filter((r) => (r ?? "").trim().length > 0).slice(0, 3)
        const showFoot = hasPrice || !!p.websiteUrl
        return (
          <article className="lbr-card" key={p.index}>
            <div className="lbr-ph">
              {p.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.imageUrl} alt={p.name} loading="lazy" />
              ) : (
                <div className="lbr-ph-fallback" aria-hidden />
              )}
              <button
                type="button"
                className="lbr-heart"
                onClick={() => toggle(p.index)}
                aria-pressed={isFav}
                aria-busy={isPending}
                aria-label={isFav ? `Remove ${p.name} from your favorites` : `Save ${p.name} to your favorites`}
              >
                <Heart filled={isFav} />
              </button>
              {p.currentSpecial && <div className="lbr-pill">{p.currentSpecial}</div>}
            </div>
            <div className="lbr-body">
              <h3 className="lbr-pname">{displayPropertyName(p.name)}</h3>
              {p.address && (
                <div className="lbr-addr"><Pin /><span>{p.address}</span></div>
              )}
              {hasRating && (
                <div className="lbr-rating"><Star /><span>{(p.googleRating as number).toFixed(1)}</span></div>
              )}
              {reasons.length > 0 && (
                <div className="lbr-why">
                  <p className="lbr-why-lbl">Why I chose this for you</p>
                  <ul>
                    {reasons.map((r, j) => (
                      <li key={j}><Check /><span>{r}</span></li>
                    ))}
                  </ul>
                </div>
              )}
              {showFoot && (
                <div className="lbr-cardfoot">
                  {hasPrice ? (
                    <div className="lbr-price">
                      <div className="lbr-pl">Starting at</div>
                      <div className="lbr-pv">{money(p.startingPrice as number)}<span className="lbr-pmo">/mo</span></div>
                    </div>
                  ) : (
                    <div />
                  )}
                  {p.websiteUrl && (
                    <a className="lbr-view" href={p.websiteUrl} target="_blank" rel="noopener noreferrer nofollow">
                      View Property <Arrow />
                    </a>
                  )}
                </div>
              )}
            </div>
          </article>
        )
      })}
    </div>
  )
}
