"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { AMENITY_BANK, amenityEquivalenceKey, canonicalizeAmenity, resolveAmenityForEntry, sanitizeCustomAmenity } from "@/lib/social/amenities"

// Searchable multi-select for Amenities / Features. Selections are ORDERED, removable chips; the
// first selection is the primary {feature} for the future overlay Template 3, and the caption uses
// the first up to 3. A canonical bank powers search; an "Add custom feature" fallback allows
// property-specific selling points (wording preserved, never AI-rewritten). Values are display
// strings — the parent serializes/persists them (newline-joined) via the existing content PATCH.

// DE-DUPLICATION IS BY MEANING, NOT SPELLING. A chip saved as "Hardwood Floors" must suppress the
// bank's "Hardwood Flooring" from the dropdown, or the operator is offered the same feature twice.
// amenityEquivalenceKey owns that mapping; a value with no alias returns its own key, so this is a
// drop-in for the plain lowercase compare it replaces. It is used for COMPARISON ONLY — the saved
// chip keeps its own wording and is never rewritten.
/**
 * THE VOCABULARY THIS CONTROL SEARCHES.
 *
 * Social Beast's own bank is the DEFAULT, so every existing call site — the Post Editor and
 * Research — behaves exactly as before, down to the 3-feature cap. The recommendation editor
 * passes its own, because "Why I chose this for you" offers the client's Smart Form must-haves
 * rather than marketing keywords, and because its stored wording must survive a round trip
 * untouched: `resolveEntry` there keeps a typed phrase as typed instead of canonicalizing it.
 *
 * Only the vocabulary is swappable. The chips, the typeahead, the custom fallback, the
 * equivalence-aware de-duplication and the keyboard handling are the same control either way,
 * which is the entire point of reusing it.
 */
export type AmenityVocabulary = {
  /** The searchable options. */
  bank: readonly string[]
  /** A value being ENTERED now → what gets stored. */
  resolveEntry: (raw: string) => string
  /** Typed text → a storable custom value, or "" when there is nothing usable in it. */
  sanitizeCustom: (raw: string) => string
  /** Comparison only — two spellings that mean the same thing share a key. */
  equivalenceKey: (raw: string) => string
}

export const SOCIAL_AMENITY_VOCABULARY: AmenityVocabulary = {
  bank: AMENITY_BANK,
  resolveEntry: resolveAmenityForEntry,
  sanitizeCustom: sanitizeCustomAmenity,
  equivalenceKey: amenityEquivalenceKey,
}

const MAX = 3 // Post Editor workflow: at most 3 amenities (the caption uses the first 3, in order)
// Research reuses this control for OBSERVED features, where the 3-cap must not
// apply: three marketing keywords are a curated ranking layer, never the
// property's feature list — the same distinction property_catalog.amenity_keywords
// already draws against property_attributes. Callers that omit `max` keep MAX.

export default function AmenitySelect({
  value,
  onChange,
  max = MAX,
  vocabulary = SOCIAL_AMENITY_VOCABULARY,
  placeholder,
}: {
  value: string[]
  onChange: (next: string[]) => void
  /** Selection cap. Defaults to the marketing MAX of 3; research passes a higher one. */
  max?: number
  /** Defaults to Social Beast's own bank — see AmenityVocabulary. */
  vocabulary?: AmenityVocabulary
  placeholder?: string
}) {
  const { bank: BANK, resolveEntry, sanitizeCustom, equivalenceKey } = vocabulary
  const key = (s: string) => equivalenceKey(s)
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const atMax = value.length >= max

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
    return BANK.filter((a) => !selectedKeys.has(key(a)) && (!qq || a.toLowerCase().includes(qq)))
  }, [q, selectedKeys, BANK])

  // The custom row is offered only when there is a query that is not already an exact canonical or
  // selected value.
  const canonicalOfQuery = resolveEntry(q)
  const customCandidate = sanitizeCustom(q)
  // Typing an ALIAS of a bank entry must not offer "Add custom" — that is how a duplicate wording
  // gets created in the first place. key() is equivalence-aware, so the bank check below now
  // catches "Hardwood Floors" as well as "Hardwood Flooring".
  const showCustom =
    !!customCandidate &&
    !selectedKeys.has(key(resolveEntry(customCandidate) || customCandidate)) &&
    !BANK.some((a) => key(a) === key(canonicalOfQuery))

  const add = (raw: string) => {
    if (value.length >= max) return // cap (3 for marketing, higher for research)
    // resolveAmenityForEntry, not canonicalizeAmenity: this value is being entered NOW, so an
    // alias ("Hardwood Floors") should land on the canonical spelling rather than become a second
    // variant. Stored values are never passed through here.
    const v = resolveEntry(raw) // known variant or alias → canonical; unknown → kept as entered
    if (!v) return
    if (selectedKeys.has(key(v))) { setQuery(""); return } // no exact duplicates
    const next = [...value, v]
    onChange(next)
    setQuery("")
    // Keep the picker open + focused so "Add another" flows without re-clicking, until we hit 3.
    if (next.length < max) { setOpen(true); setTimeout(() => inputRef.current?.focus(), 0) } else setOpen(false)
  }
  const addCustom = () => {
    const v = sanitizeCustom(query)
    if (!v) return
    add(v)
  }
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i))

  const control = "rounded-lg border border-[var(--crm-border)] bg-[var(--crm-card)]"

  return (
    <div ref={wrapRef} className="relative">
      {/* Chips stay on ONE line: flex-nowrap + compact padding/gap so up to 3 canonical amenities
          fit the (widest) column; if a rare long combo overflows it scrolls horizontally rather than
          wrapping onto a second row, shrinking, or truncating. Chip styling itself is unchanged. */}
      <div className={`mt-1 flex flex-nowrap items-center gap-1 ${control} px-1.5 py-1 min-h-[40px] overflow-x-auto`}>
        {value.map((a, i) => (
          <span
            key={`${a}-${i}`}
            className="inline-flex flex-none whitespace-nowrap items-center gap-1 h-fit text-[12px] font-semibold px-2 py-0.5 rounded-full bg-[var(--crm-panel)] border border-[var(--crm-border)] text-[var(--crm-text-primary)]"
          >
            {a}
            <button type="button" aria-label={`Remove ${a}`} className="text-[var(--crm-text-muted)] hover:text-[var(--crm-text-primary)]" onClick={() => remove(i)}>×</button>
          </span>
        ))}
        {!atMax && (
          <input
            ref={inputRef}
            className="flex-1 min-w-[130px] bg-transparent text-[12.5px] text-[var(--crm-text-primary)] outline-none"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
            onFocus={() => setOpen(true)}
            onClick={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && q) { e.preventDefault(); if (matches.length && !showCustom) add(matches[0]); else if (showCustom) addCustom() }
              else if (e.key === "Escape") setOpen(false)
              else if (e.key === "Backspace" && !query && value.length) remove(value.length - 1)
            }}
            placeholder={value.length ? "Add another…" : (placeholder ?? "Search amenities…")}
          />
        )}
      </div>

      {open && !atMax && (matches.length > 0 || showCustom) && (
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
