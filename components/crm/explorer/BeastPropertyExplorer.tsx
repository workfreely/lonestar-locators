"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { loadGoogleMaps, MapsConfigError } from "@/lib/propertyExplorer/loadMaps"
import { hasCoordinates, placeUrl, type ExplorerProperty } from "@/lib/propertyExplorer/types"
import { assessLocationFit, type ClientLocationContext } from "@/lib/propertyExplorer/locationFit"
import { computeSuggestions } from "@/lib/propertyExplorer/suggestions"
import { boundsForMarket, getMarketBySlug, isInsideMarket, isMarketInState, marketsForSlugs, resolveMapMarket } from "@/lib/markets/catalog"
import { createPortal } from "react-dom"

/**
 * Beast Property Explorer — the Map workspace.
 *
 * Google supplies the map and the place data; the FEATURE is Locator Beast's, and
 * the normalized result mirrors the Companion's CurrentProperty so a discovered
 * property can later feed the existing Current Property → Recommendation →
 * Favorite workflow without a parallel Google-specific path.
 *
 * COST CONTROL IS A DESIGN CONSTRAINT, not a detail:
 *   • panning and zooming fire NO Places request — the map just moves
 *   • a search happens only when the agent clicks "Search this area"
 *   • hovering a marker fires NO request; the card is built from data already
 *     returned plus existing CRM client context
 *   • an unchanged area is not re-searched
 */

type Props = {
  /** Catalog slugs for the workspace, in selection order (first = primary). */
  serviceAreaSlugs: string[]
  /** The agent's saved default market. Used when no client is selected. */
  primaryMarket?: string | null
  /** Canonical profiles.license_state — the map may not leave this state. */
  licenseState?: string | null
  /** The CRM's currently selected lead, when there is one. Reused, never duplicated. */
  activeClient: ClientLocationContext | null
  /** Called when a property is selected — the normalized, workflow-ready object. */
  onSelectProperty?: (property: ExplorerProperty) => void
  /** property_url values already recommended for the active client — decides
   *  whether the card offers "+ Recommendation" or shows "✓ Recommended". */
  recommendedUrls?: string[]
  /** Dispatches the EXISTING add-recommendation workflow verb. Property Explorer
   *  owns no recommendation storage of its own. */
  onRecommend?: (property: ExplorerProperty) => void
  /** The toolbar search text. In Map mode it filters the properties ALREADY loaded
   *  — it never calls Places, so typing costs nothing. */
  query?: string  /** Toolbar node supplied by LeadBoard in Map mode. When present, "Search this
   *  area" is portalled there so it reads as the third toolbar control instead of
   *  floating over the middle of the map. Absent → the original centered
   *  placement, so any other consumer is unchanged. */
  actionsHost?: HTMLElement | null
  /** Toolbar node for the compact market switcher, left of the search field. */
  marketHost?: HTMLElement | null
}

type Status = "loading" | "ready" | "searching" | "error" | "unconfigured"

export default function BeastPropertyExplorer({ serviceAreaSlugs, activeClient, primaryMarket = null, licenseState = null, onSelectProperty, query = "", recommendedUrls = [], onRecommend, actionsHost = null, marketHost = null }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const markersRef = useRef<google.maps.Marker[]>([])

  // ── "Unleash the Beast" VISUAL PROTOTYPE ──────────────────────────────────
  // Front-end only: no query, no AI, no Supabase, no Recommendations write. It
  // re-styles markers that are ALREADY on the map and draws a CSS sonar sweep.
  // Everything it touches is snapshotted and restored, and the whole prototype
  // is this block plus the <style> and overlay below — delete those three and
  // the map is exactly as it was.
  const beastPhaseRef = useRef<"idle" | "scanning" | "matched">("idle")
  const beastTimersRef = useRef<number[]>([])
  // Halos are SEPARATE markers drawn beneath the real ones, so the actual
  // property markers — and their click/hover handlers — are never replaced.
  const beastHalosRef = useRef<google.maps.Marker[]>([])
  // Original opacity/zIndex per marker, captured at scan start.
  const beastRestoreRef = useRef<{ m: google.maps.Marker; o: number | null | undefined; z: number | null | undefined }[]>([])
  // The imported marker library. Under the async loader google.maps.Marker lives
  // here rather than on the global, so markers must be built from it.
  const markerLibRef = useRef<google.maps.MarkerLibrary | null>(null)
  const lastSearchRef = useRef<string | null>(null)

  // Temporary map-session override chosen from the toolbar switcher. It moves the
  // map and nothing else: it is never written to Profile and never rewrites the
  // client's saved city or desired areas. Cleared when the client changes so the
  // next client starts from their own criteria, not the previous browse.
  const [marketOverride, setMarketOverride] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>("loading")
  const [beastPhase, setBeastPhase] = useState<"idle" | "scanning" | "matched">("idle")
  const [beastMatchCount, setBeastMatchCount] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<ExplorerProperty[]>([])
  const [hovered, setHovered] = useState<ExplorerProperty | null>(null)
  const [selected, setSelected] = useState<ExplorerProperty | null>(null)
  const [dirty, setDirty] = useState(false)

  // ── Initial viewport ──────────────────────────────────────────────────────
  // 1) the active client's market, when we reliably have one
  // 2) otherwise the agent's primary (first-selected) service market
  // 3) otherwise the neutral fallback
  // ── Initial viewport ──────────────────────────────────────────────────────
  // Priority, using ONLY existing client data:
  //   1. the client's saved desired areas — resolved to their market through the
  //      catalog, because free-text neighborhoods have no coordinates and V1 does
  //      not geocode. This is the honest limit of what a saved area can do here:
  //      it decides WHICH market we open on, not a finer position within it.
  //   2. the client's saved city/market
  //   3. the agent's saved Primary Market
  //   4. the neutral fallback
  // Selection order is NEVER consulted — service_areas[1] used to decide this,
  // which opened the map in whichever market happened to be ticked first.
  const { center, slug: marketSlug, bounds: marketBounds } = useMemo(
    () =>
      resolveMapMarket({
        override: marketOverride,
        desiredAreas: activeClient?.desiredAreas,
        city: activeClient?.city,
        primaryMarket,
        serviceAreas: serviceAreaSlugs,
        licenseState,
      }),
    [marketOverride, activeClient, primaryMarket, serviceAreaSlugs, licenseState],
  )

  // A new client (or clearing the selection) invalidates a browse override: the
  // next client must start from their own criteria, and with no client the map
  // returns to the agent's Primary Market.
  // Keyed on the lead's IDENTITY when we have one. Keying on city|desiredAreas
  // alone meant two different clients with the same criteria — two Austin clients
  // wanting "All of Austin" — produced the same key, so switching between them
  // left the previous browse override in place. Falls back to the criteria for
  // any caller that supplies no id.
  const clientKey = activeClient
    ? `${activeClient.id ?? ""}|${activeClient.city ?? ""}|${activeClient.desiredAreas ?? ""}`
    : null
  useEffect(() => {
    setMarketOverride(null)
  }, [clientKey])

  // The licensed state can change while the map is alive (Profile edit in another
  // tab, a late-arriving profile read). Re-apply the restriction rather than
  // rebuilding the map, so the constraint can never be older than the profile.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    // Order matters: drop the OLD restriction first, otherwise panTo into the new
    // market is clamped by the market we are leaving and the map never arrives.
    map.setOptions({ restriction: null })
    map.setCenter(center)
    if (marketBounds) {
      map.setOptions({ restriction: { latLngBounds: marketBounds, strictBounds: false } })
    }
  }, [marketBounds, center, status])

  const clearMarkers = useCallback(() => {
    // Listeners go with the marker; nothing accumulates across searches.
    for (const m of markersRef.current) {
      google.maps.event.clearInstanceListeners(m)
      m.setMap(null)
    }
    markersRef.current = []
  }, [])

  // ── Map bootstrap (once) ──────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    loadGoogleMaps()
      .then(({ maps, marker }) => {
        markerLibRef.current = marker
        if (cancelled || !hostRef.current) return
        if (mapRef.current) return // never build a second instance on re-render
        // From the IMPORTED library — guaranteed constructible, unlike the global
        // at bootstrap time.
        mapRef.current = new maps.Map(hostRef.current, {
          center,
          // Between the two extremes we tried: 12 framed the downtown too tightly,
          // 11 left most of the metro empty around a small cluster of pins. Maps JS
          // supports fractional zoom, so the half step sits where the first loaded
          // results fill the usable map. Center logic is untouched.
          zoom: 11.5,
          mapTypeControl: false,
          streetViewControl: false, // Street View is explicitly out of V1
          fullscreenControl: false,
          clickableIcons: false,
          // ACTIVE MARKET boundary — one supported market at a time. `restriction`
          // is a standard MapOptions field, so this needs no new Google API and no
          // extra request: Maps JS clamps panning natively, and a drag toward the
          // next metro slides back instead of being fought with our own
          // bounds_changed handler.
          //
          // strictBounds:false restricts the CENTER, so neighbouring geography
          // stays visible at the edge of the frame (useful context) while the map
          // itself cannot travel into another market. Moving markets is the
          // switcher's job, not the drag gesture's.
          ...(marketBounds ? { restriction: { latLngBounds: marketBounds, strictBounds: false } } : {}),
        })
        // Moving the map NEVER searches. It only offers the deliberate control.
        mapRef.current.addListener("idle", () => setDirty(true))
        setStatus("ready")
      })
      .catch((e: unknown) => {
        if (cancelled) return
        if (e instanceof MapsConfigError) {
          setStatus("unconfigured")
          return
        }
        // The user sees one calm sentence; a developer sees what actually threw.
        // Only the error is logged — never the key or any configuration.
        if (process.env.NODE_ENV !== "production") {
          console.error("[Beast Property Explorer] map initialization failed:", e)
        }
        setError("The map could not be loaded.")
        setStatus("error")
      })
    return () => {
      cancelled = true
    }
  }, [center])

  // Re-center when the resolved market changes, without rebuilding the map.
  useEffect(() => {
    if (mapRef.current) mapRef.current.setCenter(center)
  }, [center])

  useEffect(() => () => clearMarkers(), [clearMarkers])

  // ── Deliberate area search ────────────────────────────────────────────────
  const searchThisArea = useCallback(async () => {
    const map = mapRef.current
    if (!map) return
    const c = map.getCenter()
    if (!c) return

    // Never search outside the licensed state. `restriction` above already keeps
    // the centre in-state, so this is the backstop for the cases it cannot cover
    // — a programmatic move, or a state whose bounds arrive after the map was
    // built. Results from another state are areas the agent cannot work.
    // Search only within the ACTIVE market. `restriction` already keeps the centre
    // inside it, so this is the backstop for a programmatic move or a late-arriving
    // market — results from the next metro are not what the agent asked for.
    if (!isInsideMarket({ lat: c.lat(), lng: c.lng() }, marketSlug)) {
      const back = boundsForMarket(marketSlug)
      if (back) map.setCenter(center)
      setDirty(false)
      return
    }

    // Skip an identical repeat of the same area.
    const key = `${c.lat().toFixed(4)},${c.lng().toFixed(4)},${map.getZoom()}`
    if (key === lastSearchRef.current) {
      setDirty(false)
      return
    }

    setStatus("searching")
    setError(null)
    try {
      // Already imported by the loader; importLibrary de-duplicates, so this
      // resolves from cache rather than fetching again.
      const { places: placesLib } = await loadGoogleMaps()
      const { Place, SearchNearbyRankPreference } = placesLib

      const { places } = await Place.searchNearby({
        // Minimum fields only — no rich Place Details.
        fields: ["id", "displayName", "formattedAddress", "location"],
        locationRestriction: { center: c, radius: 3000 },
        includedPrimaryTypes: ["apartment_complex", "apartment_building"],
        maxResultCount: 20,
        rankPreference: SearchNearbyRankPreference.POPULARITY,
      })

      const mapped: ExplorerProperty[] = (places ?? [])
        .filter((p) => p.id && p.location)
        .map((p) => ({
          placeId: p.id!,
          propertyId: p.id!,
          propertyName: p.displayName ?? "Unnamed property",
          propertyAddress: p.formattedAddress ?? null,
          propertyUrl: placeUrl(p.id!),
          lat: p.location!.lat(),
          lng: p.location!.lng(),
          source: "google_places",
          marketSlug,
          searchCenter: { lat: c.lat(), lng: c.lng() },
        }))

      lastSearchRef.current = key
      setResults(mapped)
      setDirty(false)
      setStatus("ready")
    } catch (e) {
      if (process.env.NODE_ENV !== "production") {
        console.error("[Beast Property Explorer] area search failed:", e)
      }
      setError("We couldn't search this area. Please try again.")
      setStatus("ready")
    }
  }, [marketSlug, center])

  // Switching markets discards the previous market's apartments immediately, so
  // San Antonio results are never briefly shown on the Austin map while the new
  // search runs. The auto-search effect below then loads the new market.
  useEffect(() => {
    setResults([])
    setError(null)
    lastSearchRef.current = null
  }, [marketSlug])

  // ── First result set loads itself ─────────────────────────────────────────
  // Opening the Map should show apartments, not an empty map with a button. This
  // runs ONCE per resolved market: lastSearchRef makes a repeat of the same
  // viewport a no-op, so toggling Board ↔ Map does not re-search, and pan/zoom
  // still never searches on its own.
  const autoSearchedFor = useRef<string | null>(null)
  useEffect(() => {
    if (status !== "ready") return
    const key = marketSlug ?? `${center.lat},${center.lng}`
    if (autoSearchedFor.current === key) return
    autoSearchedFor.current = key
    void searchThisArea()
  }, [status, marketSlug, center, searchThisArea])

  // Toolbar query filters what is ALREADY loaded. No Places request, no debounce
  // needed, because nothing network-bound happens per keystroke.
  const q = query.trim().toLowerCase()
  // Restores every marker this prototype touched and clears the halos/timers.
  // Called before each run (so it is restartable), and on unmount.
  const beastReset = useCallback(() => {
    for (const t of beastTimersRef.current) window.clearTimeout(t)
    beastTimersRef.current = []
    for (const h of beastHalosRef.current) h.setMap(null)
    beastHalosRef.current = []
    for (const { m, o, z } of beastRestoreRef.current) {
      m.setOpacity(o ?? 1)
      m.setZIndex(z ?? undefined)
    }
    beastRestoreRef.current = []
    beastPhaseRef.current = "idle"
  }, [])

  const unleashTheBeast = useCallback(() => {
    const map = mapRef.current
    const markers = markersRef.current
    if (!map || markers.length === 0) return

    // Restartable: a click mid-run rewinds and starts over.
    beastReset()
    beastPhaseRef.current = "scanning"
    setBeastPhase("scanning")

    beastRestoreRef.current = markers.map((m) => ({ m, o: m.getOpacity(), z: m.getZIndex() }))
    const later = (fn: () => void, ms: number) => {
      beastTimersRef.current.push(window.setTimeout(fn, ms))
    }

    // 1. every visible marker brightens as the sweep passes.
    for (const m of markers) m.setOpacity(1)

    // 2. matches = the first 10 in existing render order. Deterministic on
    //    purpose — this is a look-and-feel prototype, NOT ranking.
    const matches = markers.slice(0, 10)
    const matchSet = new Set(matches)

    later(() => {
      // 3. dim everything else, lift and halo the matches.
      for (const m of markers) if (!matchSet.has(m)) m.setOpacity(0.22)
      for (const m of matches) {
        m.setOpacity(1)
        m.setZIndex(50)
        const pos = m.getPosition()
        if (!pos) continue
        const halo = new google.maps.Marker({
          map,
          position: pos,
          clickable: false,
          zIndex: 10,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 15,
            fillColor: "#2f6bff",
            fillOpacity: 0.18,
            strokeColor: "#2f6bff",
            strokeOpacity: 0.55,
            strokeWeight: 1.5,
          },
        })
        beastHalosRef.current.push(halo)
      }
      beastPhaseRef.current = "matched"
      setBeastMatchCount(matches.length)
      setBeastPhase("matched")
    }, 2200)
  }, [beastReset])

  useEffect(() => () => beastReset(), [beastReset])

  const visible = useMemo(
    () => (q ? results.filter((p) => p.propertyName.toLowerCase().includes(q)) : results),
    [results, q],
  )

  const recommended = useMemo(() => new Set(recommendedUrls), [recommendedUrls])
  // Map-local only. Recomputed from the loaded results; nothing is persisted, and
  // no recommendation is written without the agent clicking.
  const suggestions = useMemo(() => computeSuggestions(results, activeClient), [results, activeClient])
  // ── Markers reflect the current result set ────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    clearMarkers()
    // A marker REQUIRES a real point. Google's own filter above already drops a
    // place with no location, so this changes nothing for Places today — it is
    // the guarantee that holds when a provider with partial coordinates
    // normalizes into the same shape. Such a property still lists and still
    // reaches the workflow; it simply cannot be plotted, which is the honest
    // outcome when nobody knows where it is.
    for (const p of visible.filter(hasCoordinates)) {
      const MarkerCtor = markerLibRef.current?.Marker ?? google.maps.Marker
      const isSuggested = suggestions.has(p.placeId)
      const marker = new MarkerCtor({
        map,
        position: { lat: p.lat, lng: p.lng },
        // Suggested properties are visually distinguished with a star; ordinary
        // results keep the default pin so both remain readable side by side.
        title: isSuggested ? `${p.propertyName} — Beast Suggestion` : p.propertyName,
        zIndex: isSuggested ? 2 : 1,
        icon: isSuggested
          ? {
              path: "M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.3 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z",
              fillColor: "#f5a524",
              fillOpacity: 1,
              strokeColor: "#7a4a00",
              strokeWeight: 1.25,
              scale: 1.5,
              anchor: new google.maps.Point(12, 20),
            }
          : undefined,
      })
      // Hover previews, click PERSISTS — hover is never the only way in, so
      // trackpad and touch users get the same card.
      marker.addListener("mouseover", () => setHovered(p))
      marker.addListener("mouseout", () => setHovered(null))
      marker.addListener("click", () => {
        setSelected(p)
        onSelectProperty?.(p)
      })
      markersRef.current.push(marker)
    }
  }, [visible, suggestions, clearMarkers, onSelectProperty])

  const card = selected ?? hovered
  const fit = card ? assessLocationFit(card, activeClient) : null

  if (status === "unconfigured") {
    return (
      <Panel
        title="Beast Property Explorer is unavailable"
        body="The map isn't configured in this environment. Board mode is unaffected."
      />
    )
  }

  // Compact current-market control. Name + caret only ("San Antonio ▾") — no
  // "Market:" label and no second toolbar row. A native <select> keeps keyboard
  // and screen-reader behaviour for free; it is styled to match the dark floating
  // controls, with the visible name rendered beneath a transparent select so the
  // width tracks the text instead of the longest option.
  // Service areas are already state-scoped by Profile/onboarding, so this filter
  // is a belt-and-braces guard for a stale selection saved before a state change.
  // It also means a session override can never be chosen out of state, because
  // the only way to set one is picking from this list.
  const switcherMarkets = marketsForSlugs(serviceAreaSlugs).filter((m) =>
    isMarketInState(m.slug, licenseState),
  )
  const currentMarketName = marketSlug ? getMarketBySlug(marketSlug)?.name ?? null : null
  const marketSwitcher =
    switcherMarkets.length > 0 && currentMarketName ? (
      <div className="pointer-events-auto relative inline-flex items-center rounded-full border border-[rgba(255,255,255,0.16)] bg-[#10131d] pl-3 pr-2 py-2 text-[13px] font-semibold text-[#f4f6fb] shadow-[0_4px_16px_rgba(0,0,0,0.5)] transition-colors hover:bg-[#181d2b]">
        <span className="whitespace-nowrap">{currentMarketName}</span>
        <span aria-hidden className="ml-1.5 text-[10px] leading-none opacity-80">▾</span>
        <select
          aria-label="Map market"
          value={marketSlug ?? ""}
          // Session-only. Moves the map; the existing per-market search effect
          // then loads that market exactly as it does on first open. Profile and
          // client criteria are untouched.
          onChange={(e) => setMarketOverride(e.target.value || null)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        >
          {switcherMarkets.map((m) => (
            <option key={m.slug} value={m.slug}>
              {m.name}
            </option>
          ))}
        </select>
      </div>
    ) : null

  // ONE definition of the control, mounted in one of two places. Placement,
  // styling and the location glyph are unchanged — this is the same pill in the
  // same spot.
  //
  // PROTOTYPE: it now runs the local "Unleash the Beast" visual sequence instead
  // of searchThisArea(). Markers still populate the map on their own — the
  // effect below still calls searchThisArea() when the market or centre changes
  // — but the manual "search this area again" trigger is not reachable from
  // this control while the prototype is in place.
  const searchAreaButton = (
    <button
      type="button"
      onClick={unleashTheBeast}
      disabled={status === "searching" || beastPhase === "scanning"}
      className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-[rgba(255,255,255,0.16)] bg-[#10131d] px-4 py-2 text-[13px] font-semibold text-[#f4f6fb] shadow-[0_4px_16px_rgba(0,0,0,0.5)] transition-colors hover:bg-[#181d2b] disabled:opacity-60"
    >
      {/* Same location glyph the CRM uses, so the control reads as ours
          rather than as a Google map control. */}
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M21 10c0 6-9 12-9 12s-9-6-9-12a9 9 0 0 1 18 0Z" />
        <circle cx="12" cy="10" r="3" />
      </svg>
      {beastPhase === "scanning"
        ? "Beast is searching…"
        : beastPhase === "matched"
          ? `${beastMatchCount} Beast Matches`
          : "Unleash Beast"}
    </button>
  )

  return (
    <div className="relative h-full w-full">
      <div ref={hostRef} className="h-full w-full" />

      {/* ── Sonar sweep (VISUAL PROTOTYPE) ───────────────────────────────────
          pointer-events-none so panning, zooming and every marker click behave
          exactly as before — this only paints. Three rings on one keyframe,
          staggered by delay, so it is a handful of composited transforms rather
          than anything per-frame in JS. Delete this block, the <style> below and
          the beast* refs to remove the prototype entirely. */}
      {beastPhase === "scanning" && (
        <div className="pointer-events-none absolute inset-0 z-[5] overflow-hidden" aria-hidden>
          <span className="lb-sonar" />
          <span className="lb-sonar lb-sonar-2" />
          <span className="lb-sonar lb-sonar-3" />
          <style>{`
            .lb-sonar {
              position: absolute;
              left: 50%;
              top: 50%;
              width: 22vmin;
              height: 22vmin;
              margin-left: -11vmin;
              margin-top: -11vmin;
              border-radius: 9999px;
              border: 1px solid rgba(47, 107, 255, 0.55);
              background: radial-gradient(circle, rgba(47,107,255,0.12) 0%, rgba(47,107,255,0) 70%);
              opacity: 0;
              animation: lb-sonar-expand 2200ms cubic-bezier(0.22, 0.61, 0.36, 1) 1 both;
            }
            .lb-sonar-2 { animation-delay: 420ms; }
            .lb-sonar-3 { animation-delay: 840ms; }
            @keyframes lb-sonar-expand {
              0%   { transform: scale(0.35); opacity: 0; }
              12%  { opacity: 0.55; }
              100% { transform: scale(4.2); opacity: 0; }
            }
            @media (prefers-reduced-motion: reduce) {
              .lb-sonar { animation-duration: 1ms; opacity: 0; }
            }
          `}</style>
        </div>
      )}

      {status === "loading" && <Overlay text="Loading map…" />}

      {/* Compact market switcher — sits between Board | Map and the search field. */}
      {marketHost && marketSwitcher ? createPortal(marketSwitcher, marketHost) : null}

      {/* Deliberate search control — the ONLY thing that calls Places. Rendered
          into the toolbar when a host is supplied (Map mode), otherwise in its
          original centered position. Same element, same handler, same styling —
          only where it is mounted changes. */}
      {status !== "loading" && (actionsHost
        ? createPortal(searchAreaButton, actionsHost)
        : (
        <div className="pointer-events-none absolute inset-x-0 top-16 flex justify-center">
          {searchAreaButton}
        </div>
      ))}

      {error && (
        <div className="pointer-events-none absolute inset-x-0 bottom-12 flex justify-center">
          <p className="pointer-events-auto rounded-full bg-white px-4 py-2 text-[12.5px] font-semibold text-red-600 shadow-lg ring-1 ring-black/10">
            {error}
          </p>
        </div>
      )}

      {status === "ready" && !error && q && results.length > 0 && visible.length === 0 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-12 flex justify-center">
          <p className="pointer-events-auto rounded-full bg-white px-4 py-2 text-[12.5px] font-medium text-[#4b5162] shadow-lg ring-1 ring-black/10">
            No loaded property matches &ldquo;{query.trim()}&rdquo;.
          </p>
        </div>
      )}

      {status === "ready" && !error && results.length === 0 && !dirty && lastSearchRef.current && (
        <div className="pointer-events-none absolute inset-x-0 bottom-12 flex justify-center">
          <p className="pointer-events-auto rounded-full bg-white px-4 py-2 text-[12.5px] font-medium text-[#4b5162] shadow-lg ring-1 ring-black/10">
            No apartments found in this area.
          </p>
        </div>
      )}

      {/* Lightweight property card. Built entirely from data already returned plus
          existing CRM client context — showing it costs no Google request. */}
      {card && (
        <div className="pointer-events-auto absolute bottom-12 left-4 w-[280px] rounded-xl bg-white p-4 shadow-xl ring-1 ring-black/10">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[14px] font-semibold leading-snug text-[#111318]">{card.propertyName}</p>
            {selected && (
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Close property card"
                className="-mr-1 -mt-1 flex-none rounded p-1 text-[#9098a8] hover:text-[#111318]"
              >
                ✕
              </button>
            )}
          </div>
          {card.propertyAddress && (
            <p className="mt-1 text-[12.5px] leading-snug text-[#4b5162]">{card.propertyAddress}</p>
          )}
          {/* Beast Suggestion — computed, never stored. Shown whether the card is
              hovered or pinned, because it is information rather than an action. */}
          {suggestions.has(card.placeId) && !recommended.has(card.propertyUrl) && (
            <div className="mt-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11.5px] font-semibold text-amber-700">
                ⭐ Beast Suggestion
              </span>
              <p className="mt-1 text-[11.5px] text-[#6b7280]">
                {suggestions.get(card.placeId)!.reason}
              </p>
            </div>
          )}

          {/* RECOMMENDATION ONLY. Favorite state and promotion stay in the
              Companion's Recommendations workflow — Property Explorer never shows
              or writes a Favorite. The action needs the card pinned, so it appears
              once a marker has been clicked rather than merely hovered. */}
          {selected && (
            <div className="mt-3">
              {!activeClient ? (
                <p className="text-[11.5px] leading-snug text-[#6b7280]">
                  Select a client to add this as a recommendation.
                </p>
              ) : recommended.has(card.propertyUrl) ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11.5px] font-semibold text-emerald-700">
                  ✓ Recommended
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onRecommend?.(card)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#e5e7ee] bg-white px-3 py-1.5 text-[11.5px] font-semibold text-[#111318] transition-colors hover:bg-[#f7f8fa]"
                >
                  + Recommendation
                </button>
              )}
            </div>
          )}

          {fit && (
            <div className="mt-3">
              <span
                className={`inline-block rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${
                  fit.tone === "match"
                    ? "bg-emerald-50 text-emerald-700"
                    : fit.tone === "outside"
                    ? "bg-amber-50 text-amber-700"
                    : "bg-[#f1f3f8] text-[#4b5162]"
                }`}
              >
                {fit.label}
              </span>
              <p className="mt-1 text-[11.5px] text-[#6b7280]">{fit.reason}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Overlay({ text }: { text: string }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[#f7f8fa]">
      <p className="text-[13px] font-medium text-[#6b7280]">{text}</p>
    </div>
  )
}

function Panel({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#f7f8fa] p-6">
      <div className="max-w-sm text-center">
        <p className="text-[14px] font-semibold text-[#111318]">{title}</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-[#6b7280]">{body}</p>
      </div>
    </div>
  )
}
