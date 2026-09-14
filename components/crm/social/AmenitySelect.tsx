"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { AMENITY_BANK, canonicalizeAmenity, sanitizeCustomAmenity } from "@/lib/social/amenities"

// Searchable multi-select for Amenities / Features. Selections are ORDERED, removable chips; the
// first selection is the primary {feature} for the future overlay Template 3, and the caption uses
// the first up to 3. A canonical bank powers search; an "Add custom feature" fallback allows
// property-specific selling points (wording preserved, never AI-rewritten). Values are display
// strings — the parent serializes/persists them (newline-joined) via the existing content PATCH.

const key = (s: string) => s.toLowerCase()

export default function AmenitySelect({
  value,
  onChange,
}: {
  value: string[]
  onChange: (next: string[]) => void
}) {
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Close the dropdown when clicking outside the control.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [open])

  const selectedKeys = useMemo(() => new Set(value.map(key)), [value])

  const q = query.trim()
  const matches = useMemo(() => {
    const qq = q.toLowerCase()
    return AMENITY_BANK.filter((a) => !selectedKeys.has(key(a)) && (!qq || a.toLowerCase().includes(qq)))
  }, [q, selectedKeys])

  // The custom row is offered only when there is a query that is not already an exact canonical or
  // selected value.
  const canonicalOfQuery = canonicalizeAmenity(q)
  const customCandidate = sanitizeCustomAmenity(q)
  const showCustom =
    !!customCandidate &&
    !selectedKeys.has(key(canonicalizeAmenity(customCandidate) || customCandidate)) &&
    !AMENITY_BANK.some((a) => key(a) === key(canonicalOfQuery))

  const add = (raw: string) => {
    const v = canonicalizeAmenity(raw) // known variant → canonical display; unknown → trimmed custom
    if (!v) return
    if (selectedKeys.has(key(v))) { setQuery(""); return } // no exact duplicates
    onChange([...value, v])
    setQuery("")
  }
  const addCustom = () => {
    const v = sanitizeCustomAmenity(query)
    if (!v) return
    add(v)
  }
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i))

  const control = "rounded-lg border border-[var(--crm-border)] bg-[var(--crm-card)]"

  return (
    <div ref={wrapRef} className="relative">
      <div className={`mt-1 flex flex-wrap gap-1.5 ${control} p-2 min-h-[40px] content-start`}>
        {value.map((a, i) => (
          <span
            key={`${a}-${i}`}
            className="inline-flex items-center gap-1 h-fit text-[12px] font-semibold px-2 py-0.5 rounded-full bg-[var(--crm-panel)] border border-[var(--crm-border)] text-[var(--crm-text-primary)]"
          >
            {i === 0 && <span className="text-[9px] uppercase tracking-wide text-[var(--crm-text-muted)]" title="Primary feature (first selected)">1st</span>}
            {a}
            <button type="button" aria-label={`Remove ${a}`} className="text-[var(--crm-text-muted)] hover:text-[var(--crm-text-primary)]" onClick={() => remove(i)}>×</button>
          </span>
        ))}
        <input
          className="flex-1 min-w-[130px] bg-transparent text-[12.5px] text-[var(--crm-text-primary)] outline-none"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && q) { e.preventDefault(); if (matches.length && !showCustom) add(matches[0]); else if (showCustom) addCustom() }
            else if (e.key === "Escape") setOpen(false)
            else if (e.key === "Backspace" && !query && value.length) remove(value.length - 1)
          }}
          placeholder={value.length ? "Add another…" : "Search amenities…"}
        />
      </div>

      {open && (matches.length > 0 || showCustom) && (
        <div className={`absolute z-20 mt-1 w-full max-h-[240px] overflow-auto ${control} shadow-lg py-1`}>
          {matches.map((a) => (
            <button
              key={a}
              type="button"
              className="block w-full text-left text-[13px] px-3 py-1.5 text-[var(--crm-text-primary)] hover:bg-[var(--crm-panel)]"
              onMouseDown={(e) => { e.preventDefault(); add(a) }}
            >
              {a}
            </button>
          ))}
          {showCustom && (
            <button
              type="button"
              className="block w-full text-left text-[13px] px-3 py-1.5 text-[var(--crm-text-secondary)] hover:bg-[var(--crm-panel)] border-t border-[var(--crm-border)]"
              onMouseDown={(e) => { e.preventDefault(); addCustom() }}
            >
              Add custom feature: <span className="font-semibold text-[var(--crm-text-primary)]">“{customCandidate}”</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
