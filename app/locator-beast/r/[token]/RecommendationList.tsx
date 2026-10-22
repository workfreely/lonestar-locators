"use client"

import { useEffect, useState } from "react"
import { TOUR_TYPE_LABELS, TOUR_WINDOW_LABELS, normalizeShortSpecial, starFillPercent } from "@bc/companion-shared"
import TourAvailabilityModal, { type Availability, type InitialAvailability } from "./TourAvailability"
import { washerDryerLabel, washerDryerPillClass } from "@/lib/leads/washerDryer"
import { averageRentSegments } from "@/lib/leads/averageRent"
import { isPricingReason } from "@/lib/leads/bedroomPricing"

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
  /** Frozen client-facing washer/dryer status: "included" | "hookups". Absent = not verified. */
  washerDryer?: string | null
  /**
   * The frozen average-rent result, already computed by lb_compose_average_rent — or absent when
   * the locator did not confirm one. The client page never recalculates it; the snapshot is the
   * authority for what this client was told.
   */
  averageRent?: { average: number; quotedRent: number; concessionWeeks: number | null; concessionMonths: number | null; leaseMonths: number } | null
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

function Heart({ filled, size = 21 }: { filled: boolean; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden
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
/** The submitted-state mark. 15px to match <Heart> so the sticky line keeps its exact height. */
function CheckCircle() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden className="lbr-sticky-ok"
      fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" /><path d="m8.5 12.3 2.4 2.4 4.6-4.9" />
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

/** MOBILE address, split at the first comma into the street and "City, State ZIP".
 *  The two parts are rendered INLINE, so the address reads as one line whenever it
 *  fits and wraps at the comma when it does not — and the locality carries
 *  white-space:nowrap, so "Frisco, TX 75034" never breaks across lines, which is
 *  what left a bare state and ZIP stranded on their own. Desktop keeps the
 *  single-line displayCardAddress; both are rendered and CSS toggles which shows,
 *  so desktop formatting is unchanged. */
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
  // Index of the heart currently playing its favorite "pop" (only one at a time — the
  // one just tapped). Set when favoriting, cleared on animationend so the pop replays
  // on every favorite. Unfavoriting never sets it (no reverse animation).
  const [popIndex, setPopIndex] = useState<number | null>(null)

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
    if (next) setPopIndex(index) // pop only on favorite; unfavorite just returns to outline
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
      {properties.map((p, i) => {
        const isFav = favorites.has(p.index)
        const isPending = pending.has(p.index)
        const hasPrice = typeof p.startingPrice === "number" && Number.isFinite(p.startingPrice)
        const hasRating = typeof p.googleRating === "number" && Number.isFinite(p.googleRating)
        const reasons = (p.reasons ?? []).filter((r) => (r ?? "").trim().length > 0).slice(0, 3)
        // The frozen result, formatted by the one function that owns this sentence. `show: true`
        // because the snapshot only carries an object at all when the locator switched it on —
        // the decision was made and frozen at send time, not re-evaluated here.
        const avgParts = p.averageRent
          ? averageRentSegments({
              quotedRent: p.averageRent.quotedRent,
              concessionWeeks: p.averageRent.concessionWeeks,
              concessionMonths: p.averageRent.concessionMonths,
              leaseMonths: p.averageRent.leaseMonths,
              show: true,
            })
          : null
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
                    // THE FIRST CARD IS ABOVE THE FOLD on every phone, so it loads EAGERLY and
                    // is fetch-prioritised; everything below stays lazy. Opening the link from
                    // Messages, the first photo is the one the client waits on.
                    loading={i === 0 ? "eager" : "lazy"}
                    fetchPriority={i === 0 ? "high" : "auto"}
                    // async decoding keeps a large JPEG from blocking paint on a slow phone.
                    decoding="async"
                    // The .lbr-ph box is a fixed 16:10 frame in CSS; stating the intrinsic ratio
                    // lets the browser reserve the space before bytes arrive, so cards do not
                    // jump as photos land. Presentational only — no URL is changed.
                    width={1600}
                    height={1000}
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
                className={`lbr-heart${popIndex === p.index ? " is-popping" : ""}`}
                onClick={() => toggle(p.index)}
                onAnimationEnd={() => setPopIndex((cur) => (cur === p.index ? null : cur))}
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
                    {/* Desktop: single line (unchanged). Mobile: the same address, inline,
                        wrapping at the comma only when the width demands it. The comma
                        belongs to the street part so a wrap never starts a line with it. */}
                    <span className="lbr-addr-full">{displayCardAddress(p.address)}</span>
                    <span className="lbr-addr-stacked">
                      <span className="lbr-addr-street">{street}{locality ? "," : ""}</span>
                      {locality && <>{" "}<span className="lbr-addr-locality">{locality}</span></>}
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
              {/* The frozen figures, rendered through the SAME formatter the workspace previews
                  with, so the locator saw this exact sentence before sending it. */}
              {reasons.length > 0 && (
                <div className="lbr-why">
                  <p className="lbr-why-lbl">Why I chose this for you</p>
                  <ul>
                    {reasons.map((r, j) => (
                      <li key={j}>
                        <Check />
                        <span>
                          {r}
                          {/* AVERAGE RENT — nested UNDER the bedroom rent it qualifies, not a
                              fourth highlight. It belongs to that number: the rent above is what
                              the lease says, this is what the concession makes it work out to,
                              and separating them would invite reading either one alone. Rendered
                              only on the price line, and only when the locator confirmed every
                              figure — the snapshot carries the result, so nothing is recomputed
                              in the client's browser. */}
                          {avgParts && isPricingReason(r) && (
                            <span className="lbr-avg">
                              {avgParts.map((seg, k) => (
                                <span key={k} className="lbr-avg-seg">
                                  {k > 0 && <span className="lbr-avg-sep"> · </span>}
                                  {seg}
                                </span>
                              ))}
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {/* WASHER & DRYER — one compact pill, directly beneath the highlights. It renders
                  ONLY for a status the locator confirmed for this client; "not verified" is the
                  absence of a pill, never a greyed-out "unknown". No icon and no check mark: the
                  highlights above already use ticks, and a second symbol here would read as a
                  fourth reason rather than a fact about the unit. */}
              {washerDryerLabel(p.washerDryer) && (
                <div className={washerDryerPillClass(p.washerDryer) as string}>
                  {washerDryerLabel(p.washerDryer)}
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
                  {/* siteHref, never the raw websiteUrl. A non-http(s) value (e.g.
                      "www.example.com") is truthy, so gating on the raw field
                      rendered an href the browser resolves RELATIVE to this page —
                      a link to /locator-beast/r/<token>/www.example.com. The image
                      and name links already used siteHref; this is the same gate. */}
                  {siteHref && (
                    <a className="lbr-view" href={siteHref} target="_blank" rel="noopener noreferrer nofollow">
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
    {/* Two spans, identical wording and spacing when inline. On mobile the second
        becomes a block (.lbr-disc-2) so the sentences sit on their own lines; on
        desktop it stays inline and the paragraph flows exactly as before. */}
    <p className="lbr-disclaimer">
      <span>Pricing and availability subject to change.</span>{" "}
      <span className="lbr-disc-2">Specials may not be reflected in advertised rent.</span>
    </p>

    {/* Done Selecting Favorites — the primary conversion CTA. Hidden at 0 favorites;
        NOT sticky. On success the Tour Availability modal opens immediately. */}
    {/* MOBILE STICKY ACTION BAR — mobile only, visible from the moment the page opens.
        It is present at ZERO favorites too: the bar is how a client learns the hearts are the
        mechanism, so showing it only after the first favorite hid the instruction from exactly
        the person who still needed it. At zero it states what to do and the button is disabled;
        from the first favorite it reports the running count and the button turns live. No extra
        instructional copy — Next Steps already carries that.

        It reuses the SAME `markDone` handler and the SAME favCount the full block below uses, so
        favourites persistence, tour scheduling and submission are untouched. The full block is
        hidden on mobile by CSS (.lbr-done{display:none}) so the two never compete; desktop is
        unchanged and never renders the bar. */}
    {/* ONE sticky bar, three states — not three bars. Same element, same styling, same
        position, so .lbr-shell:has(.lbr-sticky) clears whichever one is up without knowing
        which. A long list pushed the inline controls below the fold, where a client never
        found them; the bar is the only thing guaranteed to be on screen. */}
    {!done && (
      <div className="lbr-sticky" role="region" aria-label="Favorites selection">
        {/* aria-live: the count changes without a navigation, so a screen reader is told. */}
        <span className="lbr-sticky-count" aria-live="polite">
          <Heart filled={favCount > 0} size={15} />
          {favCount === 0
            ? "Choose your favorite properties"
            : `${favCount} ${favCount === 1 ? "favorite" : "favorites"} selected`}
        </span>
        <button
          type="button"
          className="lbr-sticky-btn"
          onClick={markDone}
          disabled={doneBusy || favCount === 0}
          aria-busy={doneBusy}
        >
          {doneBusy ? "Saving…" : <>Done Selecting Favorites <Arrow /></>}
        </button>
      </div>
    )}

    {/* AFTER DONE, NOTHING SUBMITTED. Hidden while the calendar is open so it cannot sit under
        the modal. Hearts stay editable throughout: toggling one is not gated on `done` and never
        touches done_selecting_at, the Ready-to-Tour stage or the locator's open action. */}
    {done && !availability && !modalOpen && favCount > 0 && (
      <div className="lbr-sticky" role="region" aria-label="Tour availability">
        <span className="lbr-sticky-count" aria-live="polite">
          <Heart filled size={15} />
          Your favorites are saved
        </span>
        <button type="button" className="lbr-sticky-btn" onClick={() => setModalOpen(true)}>
          Choose Tour Availability <Arrow />
        </button>
      </div>
    )}

    {/* DONE, BUT EVERYTHING UN-HEARTED. The bar reports the CURRENT selection, not the fact that
        Done was once tapped — "Your favorites are saved" over an empty list is simply untrue. The
        action is disabled rather than hidden so the bar keeps its geometry and the client can see
        what unlocks it. Re-hearting restores the state above with no second Done: both conditions
        read favCount, the live persisted count (a failed toggle reverts it), so this needs no new
        flag, no write, and cannot produce a second Ready-to-Tour action. */}
    {done && !availability && !modalOpen && favCount === 0 && (
      <div className="lbr-sticky" role="region" aria-label="Favorites selection">
        <span className="lbr-sticky-count" aria-live="polite">
          <Heart filled={false} size={15} />
          Choose your favorite properties
        </span>
        <button type="button" className="lbr-sticky-btn" disabled>
          Select Properties First
        </button>
      </div>
    )}

    {/* SUBMITTED. The dates summary stays in the card below; this carries the one Edit control on
        a phone, where the card's own Edit is hidden so there are never two. */}
    {done && availability && !modalOpen && (
      <div className="lbr-sticky" role="region" aria-label="Tour availability sent">
        <span className="lbr-sticky-count">
          <CheckCircle />
          Tour availability sent!
        </span>
        <button type="button" className="lbr-sticky-btn" onClick={() => setModalOpen(true)}>
          Edit Tour Availability <Arrow />
        </button>
      </div>
    )}

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

    {/* DESKTOP's way back into the calendar. Dismissing it without submitting leaves done=true —
        correctly: Done Selecting Favorites already reconciled the favorites into lead_favorites,
        advanced the lead to Ready to Tour and created the locator's Ready-to-Tour action, and
        closing a modal cannot undo a CRM stage change. On a PHONE this block is hidden
        (.lbr-done{display:none}) because the sticky bar carries the same action where it is
        always on screen — a long list put this one below the fold, unfound. */}
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
