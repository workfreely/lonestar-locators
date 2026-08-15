"use client"

import { useState } from "react"

// Shared property thumbnail — the ONE visual treatment for Recommended
// Properties AND Favorite Properties (never two separate designs). Small square,
// subtly rounded, object-cover. It NEVER shows a broken-image glyph: a missing
// src OR a load error both fall back to the same clean Locator Beast placeholder
// on both surfaces.
//
// Uses a plain <img> (not next/image) on purpose: property images come from
// arbitrary external hosts (an og:image on whatever apartment site the agent
// pasted), which next/image would block unless every host is allow-listed.
export default function PropertyThumb({
  src,
  alt = "",
  size = 60,
}: {
  src?: string | null
  alt?: string
  // Square edge in px (spec: ~56–64). Defaults to 60.
  size?: number
}) {
  const [errored, setErrored] = useState(false)
  const showImage = !!src && !errored

  const box =
    "flex-none overflow-hidden rounded-lg border border-[var(--crm-border)] bg-[var(--crm-inset)]"
  const dim = { width: size, height: size } as const

  if (showImage) {
    return (
      <div className={box} style={dim}>
        <img
          src={src as string}
          alt={alt}
          width={size}
          height={size}
          loading="lazy"
          onError={() => setErrored(true)}
          className="h-full w-full object-cover"
        />
      </div>
    )
  }

  // Clean placeholder (a simple building) — the fallback on both surfaces.
  return (
    <div
      className={`${box} flex items-center justify-center text-[var(--crm-text-muted)]`}
      style={dim}
      aria-hidden
    >
      <svg
        width={Math.round(size * 0.5)}
        height={Math.round(size * 0.5)}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 21h18" />
        <path d="M5 21V5a1 1 0 011-1h7a1 1 0 011 1v16" />
        <path d="M14 21V9a1 1 0 011-1h3a1 1 0 011 1v12" />
        <path d="M8 8h2M8 12h2M8 16h2" />
      </svg>
    </div>
  )
}
