"use client"

import { useState } from "react"

/**
 * The client-facing recommendation cards — full-image showcase panels.
 *
 * A client component only because the heart is interactive; everything else is
 * server-rendered, so the list does not depend on JS running.
 *
 * The card carries only what a client needs for a FIRST cut: a picture, the
 * name, roughly where it is, why it was picked for them, and a way through to
 * the property's own site. Rent, floor plans, availability and amenity lists are
 * deliberately absent — the property's website owns that data and keeps it
 * current, and duplicating it here would age badly.
 *
 * LEGIBILITY IS THE CONSTRAINT, not decoration. White text over an arbitrary
 * photo is only readable because of the left-weighted gradient below: it is
 * near-opaque behind the copy and fades out over the right of the image, so the
 * photograph still reads as a photograph. Every text element stays inside that
 * protected band; nothing floats over the bright side.
 *
 * FAVOURITES ARE LOCAL FOR NOW. The heart records the choice in page state so
 * the interaction is complete and testable, but it does NOT write to
 * lead_favorites — that is a public, unauthenticated mutation needing its own
 * token-scoped RPC and rate limiting (a later phase).
 */

export type ClientProperty = {
  name: string
  address: string | null
  imageUrl: string | null
  websiteUrl: string | null
  reasons: string[]
}

const SERIF = "font-['Georgia',_'Times_New_Roman',_serif]"

function Heart({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden
      fill={filled ? "#e0245e" : "none"} stroke={filled ? "#e0245e" : "#1c2b4a"} strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l8.8 8.8 8.8-8.8a5.5 5.5 0 0 0 0-7.8Z" />
    </svg>
  )
}

function Check() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden className="mt-[5px] shrink-0"
      fill="none" stroke="#e0b455" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

export default function RecommendationList({ properties }: { properties: ClientProperty[] }) {
  // Keyed by index: the page never receives a database id, and that is correct —
  // there is no internal identifier to leak onto a public URL.
  const [favorites, setFavorites] = useState<Set<number>>(new Set())
  const toggle = (i: number) =>
    setFavorites((prev) => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })

  return (
    <ul className="flex flex-col gap-4 px-4">
      {properties.map((p, i) => {
        const isFav = favorites.has(i)
        return (
          <li
            key={i}
            // Soft, wide, low-opacity drop shadow so the panel floats above the
            // warm background without a hard edge anywhere.
            className="relative overflow-hidden rounded-2xl bg-[#1c2b4a] shadow-[0_14px_28px_-12px_rgba(28,43,74,0.45),0_4px_10px_-6px_rgba(28,43,74,0.30)]"
          >
            {/* Tall enough to read as a gallery, short enough that 6–8 of them
                do not turn into an exhausting scroll on a phone. */}
            <div className="relative min-h-[320px]">
              {p.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.imageUrl} alt={p.name} loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <div className="absolute inset-0 bg-[#243554]" />
              )}

              {/* Strongest behind the copy on the left, fading across the photo. */}
              <div aria-hidden
                className="absolute inset-0"
                style={{
                  backgroundImage:
                    "linear-gradient(90deg, rgba(13,23,41,0.95) 0%, rgba(13,23,41,0.90) 58%, rgba(13,23,41,0.55) 76%, rgba(13,23,41,0.12) 90%, rgba(13,23,41,0) 100%)",
                }} />
              {/* A second, vertical pass keeps the bottom row legible on images
                  that are bright along their lower edge. */}
              <div aria-hidden
                className="absolute inset-0 bg-gradient-to-t from-[#0d1729]/55 via-transparent to-transparent" />

              {/* The heart's protected corner. pr-16 on the text column below
                  reserves this space, so a long name wraps rather than sliding
                  under it. */}
              <button
                type="button"
                onClick={() => toggle(i)}
                aria-pressed={isFav}
                aria-label={isFav ? `Remove ${p.name} from your favorites` : `Save ${p.name} to your favorites`}
                className="absolute right-4 top-4 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-[0_2px_8px_rgba(13,23,41,0.35)] transition-transform active:scale-90"
              >
                <Heart filled={isFav} />
              </button>

              <div className="relative flex min-h-[320px] flex-col px-5 py-5">
                {/* pr-16 is the heart's clearance; line-clamp-2 lets a long name
                    use a second line and stop there. */}
                <h3 className={`${SERIF} line-clamp-2 pr-[88px] text-[23px] font-bold leading-[1.18] text-white`}>
                  {p.name}
                </h3>

                {p.address && (
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-[16px] font-semibold tracking-wide text-[#e0b455]">{p.address}</span>
                    <span aria-hidden className="h-px w-5 bg-[#e0b455]/50" />
                  </div>
                )}

                {p.reasons.length > 0 && (
                  <ul className="mt-3.5 flex max-w-[72%] flex-col gap-[9px]">
                    {p.reasons.slice(0, 3).map((r, j) => (
                      <li key={j} className="flex gap-3 text-[17.5px] leading-[1.4] text-white">
                        <Check />
                        <span className="min-w-0">{r}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {/* mt-auto anchors the link to the bottom of every panel. It sits
                    in the text column, inside the protected gradient — over the
                    faded right-hand side it would be sitting on raw photograph
                    and stop being readable. The invisible twin keeps a
                    website-less card exactly the same height. */}
                <div className="mt-auto pt-3">
                  {p.websiteUrl ? (
                    <a href={p.websiteUrl} target="_blank" rel="noopener noreferrer nofollow"
                      className="-ml-1.5 inline-flex items-center gap-2 rounded-lg px-1.5 py-2 text-[18px] font-semibold text-[#e8bf68]">
                      View Property <span aria-hidden>→</span>
                    </a>
                  ) : (
                    <span aria-hidden className="-ml-1.5 inline-flex select-none items-center px-1.5 py-2 text-[18px] font-semibold text-transparent">
                      View Property →
                    </span>
                  )}
                </div>
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
