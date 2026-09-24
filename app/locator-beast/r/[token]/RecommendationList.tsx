"use client"

import { useState } from "react"
import { TOUR_TYPE_LABELS, TOUR_WINDOW_LABELS, normalizeShortSpecial, starFillPercent } from "@bc/companion-shared"
import TourAvailabilityModal, { type Availability, type InitialAvailability } from "./TourAvailability"

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
  /** Canonical backup photo — tried only if the primary fails to LOAD, before the
   *  neutral gradient (snapshot → canonical primary → canonical backup → fallback). */
  backupImageUrl?: string | null
  websiteUrl: string | null
  reasons: string[]
  /** Frozen at snapshot time (Phase 1); null on an un-enriched list. */
  startingPrice: number | null
  currentSpecial: string | null
  googleRating: number | null
  index: number
  favorited: boolean
}

// Only a real http(s) URL becomes a clickable website target — per the approved
// rule, if there is no VERIFIED website we leave the image + name non-clickable
// rather than linking somewhere uncertain. Sourced from the canonical verified
// website_url (snapshot-first, catalog fallback) via the resolver.
function websiteHref(url: string | null | undefined): string | null {
  const u = (url ?? "").trim()
  return /^https?:\/\/[^\s]+$/i.test(u) ? u : null
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
// Five-star rating — the SAME base-plus-gold-fill treatment as the Map card and the
// Beast Companion (shared starFillPercent math), so the rating reads identically
// everywhere. Never a single star.
function Stars({ value }: { value: number }) {
  return (
    <span className="lbr-stars" aria-hidden>
      <span className="lbr-stars-base">★★★★★</span>
      <span className="lbr-stars-fill" style={{ width: `${starFillPercent(value)}%` }}>★★★★★</span>
    </span>
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

/**
 * Display-only cleanup for the CARD ADDRESS ONLY. Strips a single trailing ", USA"
 * (case-insensitive, tolerant of surrounding whitespace) so
 * "…Dallas, TX 75235, USA" reads "…Dallas, TX 75235". Deliberately narrow: only a
 * TRAILING ", USA" is removed — "USA" anywhere else in the address is left intact,
 * and if stripping would leave nothing the original is returned. The RAW p.address is
 * still used everywhere else (upstream snapshot, resolver, CRM, Companion, catalog).
 */
function displayCardAddress(address: string): string {
  const cleaned = address.replace(/\s*,\s*USA\s*$/i, "").trim()
  return cleaned || address
}

/** MOBILE two-line address: street on line 1, "City, State ZIP" on line 2 (split at
 *  the first comma). Desktop keeps the single-line displayCardAddress; both are
 *  rendered and CSS toggles which shows, so desktop formatting is unchanged. */
function splitCardAddress(address: string): { street: string; locality: string } {
  const cleaned = address.replace(/\s*,\s*USA\s*$/i, "").trim()
  const i = cleaned.indexOf(",")
  if (i === -1) return { street: cleaned, locality: "" }
  return { street: cleaned.slice(0, i).trim(), locality: cleaned.slice(i + 1).trim() }
}

export default function RecommendationList({
  properties,
  token,
  initialDoneSelecting = false,
  initialAvailability = null,
}: {
  properties: ClientProperty[]
  token: string
  /** True once the client has pressed Done Selecting Favorites on this list. */
  initialDoneSelecting?: boolean
  /** The client's previously-submitted availability (for reload / Edit), if any. */
  initialAvailability?: InitialAvailability
}) {
  const [favorites, setFavorites] = useState<Set<number>>(
    () => new Set(properties.filter((p) => p.favorited).map((p) => p.index)),
  )
  const [pending, setPending] = useState<Set<number>>(new Set())
  const [done, setDone] = useState<boolean>(initialDoneSelecting)
  const [doneBusy, setDoneBusy] = useState(false)
  const [doneError, setDoneError] = useState<string | null>(null)
  const [availability, setAvailability] = useState<InitialAvailability>(initialAvailability)
  const [modalOpen, setModalOpen] = useState(false)

  async function markDone() {
    setDoneBusy(true)
    setDoneError(null)
    try {
      const res = await fetch("/api/r/done-selecting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      })
      if (!res.ok) throw new Error("failed")
      // Done succeeded (favorites committed, lead advanced): only now open the modal.
      setDone(true)
      setModalOpen(true)
    } catch {
      setDoneError("Something went wrong. Please try again.")
    } finally {
      setDoneBusy(false)
    }
  }

  function onAvailabilitySubmitted(a: Availability) {
    setAvailability(a)
    setModalOpen(false)
  }

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

  const favCount = favorites.size

  return (
    <>
    <div className="lbr-grid">
      {properties.map((p) => {
        const isFav = favorites.has(p.index)
        const isPending = pending.has(p.index)
        const hasPrice = typeof p.startingPrice === "number" && Number.isFinite(p.startingPrice)
        const hasRating = typeof p.googleRating === "number" && Number.isFinite(p.googleRating)
        const reasons = (p.reasons ?? []).filter((r) => (r ?? "").trim().length > 0).slice(0, 3)
        // Verified website target; null → image + name stay non-clickable.
        const siteHref = websiteHref(p.websiteUrl)
        const showFoot = hasPrice || !!siteHref
        return (
          <article className="lbr-card" key={p.index}>
            <div className="lbr-ph">
              {(() => {
                const media = p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.imageUrl}
                    alt={p.name}
                    loading="lazy"
                    data-backup={p.backupImageUrl ?? ""}
                    // primary → backup → neutral: if the primary fails to load, try the
                    // canonical backup once; if that also fails (or none), hide the broken
                    // <img> so the .lbr-ph gradient (identical to .lbr-ph-fallback) shows.
                    // No fake/placeholder photo is ever added.
                    onError={(e) => {
                      const img = e.currentTarget
                      const backup = img.getAttribute("data-backup")
                      if (backup && img.dataset.triedBackup !== "1") {
                        img.dataset.triedBackup = "1"
                        img.src = backup
                      } else {
                        img.style.display = "none"
                      }
                    }}
                  />
                ) : (
                  <div className="lbr-ph-fallback" aria-hidden />
                )
                // Clicking the property IMAGE opens the verified website in a new tab;
                // non-clickable when there is no verified website. The heart + special
                // pill stay OUTSIDE this link (siblings), so they remain independent.
                return siteHref ? (
                  <a
                    className="lbr-ph-link"
                    href={siteHref}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    aria-label={`Visit ${p.name} website`}
                  >
                    {media}
                  </a>
                ) : (
                  media
                )
              })()}
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
              {(() => {
                // Normalized SHORT special only (e.g. "1 Month Free", "$200 Gift Card") —
                // never the raw long snapshot text; hidden when it doesn't normalize.
                const shortSpecial = normalizeShortSpecial(p.currentSpecial)
                return shortSpecial ? <div className="lbr-pill">{shortSpecial}</div> : null
              })()}
            </div>
            <div className="lbr-body">
              <h3 className="lbr-pname">
                {siteHref ? (
                  // Clicking the property NAME opens the verified website in a new tab.
                  <a className="lbr-pname-link" href={siteHref} target="_blank" rel="noopener noreferrer nofollow">
                    {displayPropertyName(p.name)}
                  </a>
                ) : (
                  displayPropertyName(p.name)
                )}
              </h3>
              {p.address && (() => {
                const { street, locality } = splitCardAddress(p.address)
                return (
                  <div className="lbr-addr">
                    <Pin />
                    {/* Desktop: single line (unchanged). Mobile: stacked street / city-state-zip. */}
                    <span className="lbr-addr-full">{displayCardAddress(p.address)}</span>
                    <span className="lbr-addr-stacked">
                      <span className="lbr-addr-street">{street}</span>
                      {locality && <span className="lbr-addr-locality">{locality}</span>}
                    </span>
                  </div>
                )
              })()}
              {hasRating && (
                <div className="lbr-rating">
                  <span className="lbr-rating-val">{(p.googleRating as number).toFixed(1)}</span>
                  <Stars value={p.googleRating as number} />
                  <span className="lbr-rating-lbl">Google Rating</span>
                </div>
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

    {/* Pricing/availability qualifier — belongs with the property recommendations it qualifies,
        so it sits immediately after the grid and before the availability CTA. Subtle + secondary. */}
    <p className="lbr-disclaimer">Pricing and availability subject to change. Specials may not be reflected in advertised rent.</p>

    {/* Done Selecting Favorites — the primary conversion CTA. Hidden at 0 favorites;
        NOT sticky. On success the Tour Availability modal opens immediately. */}
    {!done && favCount > 0 && (
      <div className="lbr-done">
        <p className="lbr-done-count">{favCount} {favCount === 1 ? "favorite" : "favorites"} selected</p>
        <button type="button" className="lbr-done-btn" onClick={markDone} disabled={doneBusy} aria-busy={doneBusy}>
          {doneBusy ? "Saving…" : "Done Selecting Favorites"}
        </button>
        <p className="lbr-done-copy">Ready to tour these? Continue to choose your availability.</p>
        {doneError && <p className="lbr-done-err">{doneError}</p>}
      </div>
    )}

    {/* After Done: a compact completed state (availability submitted) OR a clear way to
        (re)open the modal. We never revert to the pre-Done CTA. */}
    {done && !modalOpen && availability && (
      <div className="lbr-avsent">
        <div className="lbr-avsent-head">
          <span className="lbr-ta-badge">Availability Sent</span>
          <button type="button" className="lbr-ta-edit" onClick={() => setModalOpen(true)}>Edit</button>
        </div>
        <div className="lbr-ta-summary">
          <div className="lbr-ta-srow"><span className="lbr-ta-slbl">Tour type</span><span>{TOUR_TYPE_LABELS[availability.tourType]}</span></div>
          {availability.dates.map((d) => (
            <div className="lbr-ta-srow" key={d.date}>
              <span className="lbr-ta-slbl">{new Date(`${d.date}T00:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span>
              <span>{d.windows.map((w) => TOUR_WINDOW_LABELS[w]).join(" · ")}</span>
            </div>
          ))}
        </div>
      </div>
    )}

    {done && !modalOpen && !availability && (
      <div className="lbr-done">
        <button type="button" className="lbr-done-btn" onClick={() => setModalOpen(true)}>Choose Tour Availability</button>
      </div>
    )}

    {modalOpen && (
      <TourAvailabilityModal
        token={token}
        initial={availability}
        onClose={() => setModalOpen(false)}
        onSubmitted={onAvailabilitySubmitted}
      />
    )}
    </>
  )
}
