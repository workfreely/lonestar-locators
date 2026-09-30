"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { loadGoogleMaps } from "@/lib/propertyExplorer/loadMaps"
import { displayDestinationLabel } from "@/lib/commute/destinationAliases"

// The ONE control for a client's Commute / Destination — the place they need to
// live near. Renders wherever client search criteria are edited (Add Lead and Edit
// Client are the same LeadFields instance), and writes the two canonical columns:
//
//   leads.commute_anchor_place_id  the Google Place ID — the CANONICAL destination
//   leads.commute_anchor_label     what the client is shown ("12 min to Fort Sam")
//
// WHY A PLACE ID AND NOT COORDINATES. A large site has no single point: a guessed
// lat/lng for Fort Sam Houston produced 12 minutes where the locator's own Google
// Maps said 10. Only the place_id reproduces the figure the locator would quote, so
// the drive-time pass (not this one) must resolve routes from the ID, never a point.
//
// WHY ITS OWN COMPONENT AND NOT PropertySearchField. That field sends the query
// through nameSearchTextQuery, which appends " apartments" to bias Text Search
// toward communities — correct there, wrong here, where "Fort Sam" must find a
// military base and not an apartment complex near one. Everything else (350ms
// debounce, 3-char floor, onMouseDown-before-blur, silent degrade to plain text
// when Maps is unavailable) deliberately mirrors it; AgentSearchField is the
// existing precedent for a sibling rather than a flag on the shared one.

type Candidate = { placeId: string; name: string; address: string | null }

export default function CommuteDestinationField({
  label,
  placeId,
  onChange,
  inputClassName,
}: {
  /** commute_anchor_label — the client-facing wording, locator-editable. */
  label: string
  /** commute_anchor_place_id — the canonical Google destination. */
  placeId: string
  /** Always writes BOTH columns together so they can never disagree. */
  onChange: (next: { label: string; placeId: string }) => void
  inputClassName?: string
}) {
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [results, setResults] = useState<Candidate[]>([])
  const [searching, setSearching] = useState(false)
  // The Google name of the anchored place, kept so the locator can shorten the
  // label to "Fort Sam" and still see which destination it resolves to.
  const [canonicalName, setCanonicalName] = useState("")
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  // An anchored field is one with a place_id. A label alone (e.g. a future Beast
  // Sync suggestion) is NOT anchored — it seeds the search box so the locator can
  // confirm it against a real Google place rather than it silently looking saved.
  const anchored = !!placeId

  const run = useCallback(async (q: string) => {
    const textQuery = q.trim()
    if (textQuery.length < 3) { setResults([]); setOpen(false); return }
    setSearching(true)
    try {
      const maps = await loadGoogleMaps()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const Place = (maps as any).places.Place
      // The raw query, unbiased: a destination may be an address, an employer, a
      // base, a school, a hospital or a landmark, so no includedType and no
      // appended context term — either would exclude most of those.
      const { places } = await Place.searchByText({
        fields: ["id", "displayName", "formattedAddress"],
        textQuery,
        maxResultCount: 8,
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const list: Candidate[] = (places ?? [])
        .map((p: any) => ({
          placeId: p.id as string,
          name: (p.displayName as string) ?? "",
          address: (p.formattedAddress as string) ?? null,
        }))
        .filter((c: Candidate) => c.placeId && c.name)
      setResults(list)
      setOpen(list.length > 0)
    } catch {
      // Maps unavailable / key misconfigured → no dropdown. The locator can still
      // type a label; it just isn't anchored to a place yet.
      setResults([])
      setOpen(false)
    } finally {
      setSearching(false)
    }
  }, [])

  function onSearchInput(v: string) {
    setQuery(v)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void run(v), 350)
  }

  function choose(c: Candidate) {
    setCanonicalName(c.name)
    setOpen(false)
    setQuery("")
    // The approved short label seeds the field when the bank knows this place, so the
    // locator does not have to shorten "Joint Base San Antonio: Fort Sam Houston" by
    // hand every time. It is a SEED, not a lock — the input below stays editable, and
    // the place id (the routing identity) is unaffected either way.
    onChange({ label: displayDestinationLabel(c.name), placeId: c.placeId })
  }

  function clear() {
    setCanonicalName("")
    setQuery("")
    setResults([])
    setOpen(false)
    onChange({ label: "", placeId: "" })
  }

  return (
    <div>
      <p className="text-[11px] text-[var(--crm-text-muted)] mb-1.5">
        Commute / Destination — optional; where they need to be near
      </p>

      {anchored ? (
        <div className="space-y-1.5">
          {/* The canonical destination, and the way back out of it. */}
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 flex-none" />
            <span className="font-semibold text-emerald-600 dark:text-emerald-400 truncate">
              {canonicalName || label || "Destination set"}
            </span>
            <button
              type="button"
              onClick={clear}
              className="text-[var(--crm-text-muted)] hover:text-[var(--crm-text-primary)] flex-none"
            >
              · change
            </button>
          </div>
          {/* The client-facing wording. Shortening this never moves the destination. */}
          <input
            value={label}
            onChange={(e) => onChange({ label: e.target.value, placeId })}
            placeholder="Shown to the client — e.g. Fort Sam"
            className={inputClassName}
            autoComplete="off"
          />
        </div>
      ) : (
        <div className="relative">
          <input
            value={query || label}
            onChange={(e) => onSearchInput(e.target.value)}
            onFocus={() => results.length > 0 && setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder="Address, workplace, base, school or landmark"
            className={inputClassName}
            autoComplete="off"
          />
          {open && results.length > 0 && (
            <div className="absolute z-30 mt-1 left-0 right-0 max-h-[220px] overflow-y-auto rounded-lg border border-[var(--crm-border)] bg-[var(--crm-panel)] shadow-lg">
              {searching && <div className="px-3 py-2 text-[11.5px] text-[var(--crm-text-muted)]">Searching…</div>}
              {results.map((r) => (
                <button
                  key={r.placeId}
                  type="button"
                  // onMouseDown (not onClick) so it fires before the input's onBlur.
                  onMouseDown={(e) => { e.preventDefault(); choose(r) }}
                  className="block w-full text-left px-3 py-1.5 hover:bg-[var(--crm-card)]"
                >
                  <div className="text-[12.5px] font-semibold text-[var(--crm-text-primary)] truncate">{r.name}</div>
                  {r.address && <div className="text-[11px] text-[var(--crm-text-muted)] truncate">{r.address}</div>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
