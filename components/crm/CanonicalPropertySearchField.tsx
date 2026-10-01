"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { supabase } from "@/lib/supabase/client"
import { searchProperties, shouldSearch } from "@/lib/propertyExplorer/propertySearch"
import { boundsForMarket, getMarketByName } from "@/lib/markets/catalog"
import type { ExplorerProperty } from "@/lib/propertyExplorer/types"

// A property picker backed by THE canonical Locator Beast search — the Map's own
// orchestration (lib/propertyExplorer/propertySearch), not another call to Places.
//
// WHY NOT PropertySearchField. That component also calls Place.searchByText, which
// made it look like reuse. It is not the same search: it has a 3-character floor
// and no market bias, so typing "ve" in Add Favorites produced NOTHING while the
// Map produced Vue at Sonoma Verde, Vecina Apartment Villas, The View at Westover
// Hills. Same API, different product.
//
// What this adds over a bare Places call, all of it inherited from the service:
//   • 2-character floor, so short brand fragments search
//   • market locationBias from the client's own city
//   • market-envelope filtering and name-relevance filtering
//   • property_catalog enrichment, so a selected property arrives already carrying
//     its catalogued image, website, rating and commission
//
// Deliberately NOT repointed yet: Guest Card and Social Autopilot. They work today
// on the old helper, and converging them is a separate, reviewable change.

export type CanonicalPropertyMatch = {
  placeId: string
  name: string
  address: string | null
  /** True when property_catalog already knows this property. */
  catalogued: boolean
  /** The enriched record, so callers can reuse what LB already knows. */
  property: ExplorerProperty
}

export default function CanonicalPropertySearchField({
  value,
  onChange,
  onMatch,
  marketCity,
  placeholder,
  inputClassName,
  autoFocus,
}: {
  value: string
  onChange: (next: string) => void
  onMatch: (m: CanonicalPropertyMatch) => void
  /**
   * The client's city, used to resolve the market bias. Without it the search
   * still runs — just unbiased and un-enveloped, which is the correct degradation
   * rather than a failure.
   */
  marketCity?: string | null
  placeholder?: string
  inputClassName?: string
  autoFocus?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<ExplorerProperty[]>([])
  const [searching, setSearching] = useState(false)
  const [failed, setFailed] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Only the newest query may write results — a slow "ve" must not overwrite "vel".
  const token = useRef(0)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const market = marketCity ? getMarketByName(marketCity.trim()) : undefined
  const marketSlug = market?.slug ?? null
  const bounds = boundsForMarket(marketSlug)

  const run = useCallback(
    async (q: string) => {
      const mine = ++token.current
      if (!shouldSearch(q)) { setResults([]); setOpen(false); setFailed(false); return }
      setSearching(true)
      setFailed(false)
      try {
        const res = await searchProperties({
          query: q,
          locationBias: bounds ?? undefined,
          marketSlug,
          supabase,
        })
        if (mine !== token.current) return
        // `qualified` is the Map's own notion of "a real property" — apartment-typed
        // or already catalogued. Falling back to inMarket keeps a catalogued oddity
        // reachable rather than silently unfindable.
        const list = (res?.qualified?.length ? res.qualified : res?.inMarket) ?? []
        setResults(list)
        setOpen(list.length > 0)
      } catch (err) {
        if (mine !== token.current) return
        // Distinguished from "no matches": the locator can still use the URL
        // fallback, but should know the search itself failed.
        console.error("[property-search] failed:", err)
        setResults([])
        setOpen(false)
        setFailed(true)
      } finally {
        if (mine === token.current) setSearching(false)
      }
    },
    [bounds, marketSlug],
  )

  function onInput(v: string) {
    onChange(v)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void run(v), 350)
  }

  return (
    <div className="relative">
      <input
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onInput(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className={inputClassName}
        autoComplete="off"
      />
      {/* NO in-flow loading or error text. The Map's search bar shows nothing under
          its input while searching, and anything rendered in flow here changes the
          field's height mid-type — the dropdown and the rest of the modal jump. A
          failure is surfaced in the SAME absolutely-positioned layer the results
          use, so the layout is identical whether it is empty, loading, showing
          results, or showing an error. */}
      {failed && !searching && (
        <div className="absolute z-30 mt-1 left-0 right-0 rounded-lg border border-[var(--crm-border)] bg-[var(--crm-panel)] px-3 py-2 shadow-lg">
          <span className="text-[11.5px] font-medium text-amber-600">
            Couldn&apos;t reach property search — you can still add by URL below.
          </span>
        </div>
      )}
      {open && results.length > 0 && (
        <div className="absolute z-30 mt-1 left-0 right-0 max-h-[240px] overflow-y-auto rounded-lg border border-[var(--crm-border)] bg-[var(--crm-panel)] shadow-lg">
          {results.map((p) => (
            <button
              key={p.placeId}
              type="button"
              // onMouseDown, not onClick — it must fire before the input's onBlur.
              onMouseDown={(e) => {
                e.preventDefault()
                setOpen(false)
                onMatch({
                  placeId: p.placeId,
                  name: p.propertyName,
                  address: p.propertyAddress ?? null,
                  // Enriched by the service from property_catalog — the signal that LB
                  // already knows this property.
                  catalogued: !!p.websiteUrl || p.googleRating != null,
                  property: p,
                })
              }}
              className="block w-full text-left px-3 py-1.5 hover:bg-[var(--crm-card)]"
            >
              <div className="text-[12.5px] font-semibold text-[var(--crm-text-primary)] truncate">{p.propertyName}</div>
              {p.propertyAddress && <div className="text-[11px] text-[var(--crm-text-muted)] truncate">{p.propertyAddress}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
