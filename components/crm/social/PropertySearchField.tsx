"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { loadGoogleMaps } from "@/lib/propertyExplorer/loadMaps"
import { nameSearchTextQuery } from "@/lib/propertyExplorer/nameSearch"

// Shared Social Autopilot property-name field. REUSES the Map/Explorer property search
// (loadGoogleMaps + Place.searchByText + nameSearchTextQuery) as a lightweight autocomplete —
// no map, no CRM/tour logic, no duplicate property DB. Typing (or a filename-inferred seed)
// returns matching canonical Google places; selecting one persists its place_id + name via
// onMatch. Free-text edits still work and clear a prior match. If Maps can't load, it silently
// degrades to a plain text input (manual entry always works).

export type PropertyMatch = { placeId: string; name: string; address: string | null }

type Candidate = { placeId: string; name: string; address: string | null }

export default function PropertySearchField({
  value,
  matched,
  onChange,
  onMatch,
  onClearMatch,
  placeholder,
  inputClassName,
}: {
  value: string
  matched?: boolean
  onChange: (name: string) => void
  onMatch: (m: PropertyMatch) => void
  onClearMatch?: () => void
  placeholder?: string
  inputClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<Candidate[]>([])
  const [searching, setSearching] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const run = useCallback(async (q: string) => {
    const query = q.trim()
    if (query.length < 3) { setResults([]); setOpen(false); return }
    setSearching(true)
    try {
      const maps = await loadGoogleMaps()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Place = (maps as any).places.Place
      const { places } = await Place.searchByText({
        fields: ["id", "displayName", "formattedAddress"],
        textQuery: nameSearchTextQuery(query),
        maxResultCount: 8,
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const list: Candidate[] = (places ?? [])
        .map((p: any) => ({ placeId: p.id as string, name: (p.displayName as string) ?? "", address: (p.formattedAddress as string) ?? null }))
        .filter((c: Candidate) => c.placeId && c.name)
      setResults(list)
      setOpen(list.length > 0)
    } catch {
      // Maps unavailable / config error → manual entry only (no dropdown).
      setResults([])
      setOpen(false)
    } finally {
      setSearching(false)
    }
  }, [])

  const onInput = (v: string) => {
    onChange(v)
    if (matched && onClearMatch) onClearMatch() // editing the text drops the prior canonical match
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void run(v), 350)
  }

  return (
    <div className="relative">
      <input
        value={value}
        onChange={(e) => onInput(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className={inputClassName}
        autoComplete="off"
      />
      {matched && (
        <span className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Matched property
          {onClearMatch && (
            <button type="button" className="text-[var(--crm-text-muted)] hover:text-[var(--crm-text-primary)]" onClick={onClearMatch}>· clear</button>
          )}
        </span>
      )}
      {open && results.length > 0 && (
        <div className="absolute z-30 mt-1 left-0 right-0 max-h-[220px] overflow-y-auto rounded-lg border border-[var(--crm-border)] bg-[var(--crm-panel)] shadow-lg">
          {searching && <div className="px-3 py-2 text-[11.5px] text-[var(--crm-text-muted)]">Searching…</div>}
          {results.map((r) => (
            <button
              key={r.placeId}
              type="button"
              // onMouseDown (not onClick) so it fires before the input's onBlur closes the list.
              onMouseDown={(e) => { e.preventDefault(); onMatch(r); setOpen(false) }}
              className="block w-full text-left px-3 py-1.5 hover:bg-[var(--crm-card)]"
            >
              <div className="text-[12.5px] font-semibold text-[var(--crm-text-primary)] truncate">{r.name}</div>
              {r.address && <div className="text-[11px] text-[var(--crm-text-muted)] truncate">{r.address}</div>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
