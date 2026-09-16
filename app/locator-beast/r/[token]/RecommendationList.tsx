"use client"

import { useState } from "react"

/**
 * The client-facing recommendation cards.
 *
 * Image-forward but READABLE: the photo sits at the top with the property name
 * over a bottom scrim, and the reasons + CTA sit below on the solid card colour —
 * so reason legibility never depends on how bright a given photo is, and every
 * card crops to the same aspect ratio for a consistent rhythm.
 *
 * The card carries only what a client needs for a FIRST cut: a picture, the name,
 * roughly where it is, why it was picked, and a way through to the property's own
 * site. Rent, floor plans, availability and amenity lists are deliberately absent —
 * the property's website owns that data and keeps it current.
 *
 * FAVOURITES PERSIST. The heart toggles page state optimistically and writes
 * through the token-scoped /api/r/favorite endpoint, so a refresh keeps the choice
 * and the locator sees which properties were hearted. The item is referenced by
 * its public sort_order (`index`), never a database id.
 */

export type ClientProperty = {
  name: string
  address: string | null
  imageUrl: string | null
  websiteUrl: string | null
  reasons: string[]
  index: number
  favorited: boolean
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
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden className="mt-[3px] shrink-0"
      fill="none" stroke="#e0b455" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
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
    // Optimistic — the heart responds instantly; a failed write reverts it.
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
    <ul className="grid grid-cols-1 gap-4 px-4 sm:grid-cols-2 sm:gap-5">
      {properties.map((p) => {
        const isFav = favorites.has(p.index)
        const isPending = pending.has(p.index)
        return (
          <li
            key={p.index}
            className="group overflow-hidden rounded-2xl bg-[#1c2b4a] shadow-[0_10px_24px_-14px_rgba(28,43,74,0.5),0_2px_6px_-3px_rgba(28,43,74,0.3)] transition-shadow duration-200 hover:shadow-[0_18px_36px_-16px_rgba(28,43,74,0.55),0_4px_10px_-4px_rgba(28,43,74,0.35)]"
          >
            {/* Image — fixed aspect for a consistent crop across every card. */}
            <div className="relative aspect-[16/11] w-full overflow-hidden">
              {p.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.imageUrl}
                  alt={p.name}
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                />
              ) : (
                <div className="absolute inset-0 bg-[#243554]" />
              )}
              {/* Bottom scrim carries the name only — a small, predictable band. */}
              <div aria-hidden className="absolute inset-x-0 bottom-0 h-[62%] bg-gradient-to-t from-[#0d1729] via-[#0d1729]/70 to-transparent" />

              <button
                type="button"
                onClick={() => toggle(p.index)}
                aria-pressed={isFav}
                aria-busy={isPending}
                aria-label={isFav ? `Remove ${p.name} from your favorites` : `Save ${p.name} to your favorites`}
                className="absolute right-3.5 top-3.5 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-[0_2px_8px_rgba(13,23,41,0.35)] transition-transform duration-150 hover:scale-105 active:scale-90"
              >
                <Heart filled={isFav} />
              </button>

              <div className="absolute inset-x-0 bottom-0 px-5 pb-4">
                <h3 className={`${SERIF} pr-12 text-[22px] font-bold leading-[1.15] text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]`}>
                  {p.name}
                </h3>
                {p.address && (
                  <p className="mt-1 text-[13.5px] font-semibold uppercase tracking-[0.06em] text-[#e0b455]">
                    {p.address}
                  </p>
                )}
              </div>
            </div>

            {/* Reasons + CTA on the solid card colour — always legible. */}
            <div className="px-5 pb-5 pt-4">
              {p.reasons.length > 0 && (
                <ul className="flex flex-col gap-2.5">
                  {p.reasons.slice(0, 3).map((r, j) => (
                    <li key={j} className="flex gap-2.5 text-[15.5px] leading-[1.4] text-[#dfe4ee]">
                      <Check />
                      <span className="min-w-0">{r}</span>
                    </li>
                  ))}
                </ul>
              )}

              {/* Only rendered when a URL exists — no reserved empty space otherwise. */}
              {p.websiteUrl && (
                <a
                  href={p.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className={`${p.reasons.length > 0 ? "mt-4" : ""} inline-flex items-center gap-2 text-[16px] font-semibold text-[#e8bf68] transition-colors hover:text-[#f2d089]`}
                >
                  View Property <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
                </a>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
