"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { loadGoogleMaps, MapsConfigError } from "@/lib/propertyExplorer/loadMaps"
import { hasCoordinates, placeUrl, displayAddress, formatCommission, type ExplorerProperty } from "@/lib/propertyExplorer/types"
import { assessLocationFit, type ClientLocationContext } from "@/lib/propertyExplorer/locationFit"
import { computeSuggestions } from "@/lib/propertyExplorer/suggestions"
import { enrichProperties, fetchCatalog } from "@/lib/propertyExplorer/catalog"
import { supabase } from "@/lib/supabase/client"
import { readMapMarket, writeMapMarket } from "@/lib/preferences"
import { boundsForMarket, getMarketBySlug, isInsideMarket, isInsideState, isMarketInState, marketsForSlugs, resolveMapMarket } from "@/lib/markets/catalog"
import { resolveDesiredAreaCenters, searchAreas, mergeDedupeByPlaceId, type AreaCenter } from "@/lib/propertyExplorer/multiArea"
import { selectInMarketMatch, decideNameSearch, normalizePlace } from "@/lib/propertyExplorer/nameSearch"
import { StarRating } from "@/components/crm/StarRating"
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
  query?: string
  /** The toolbar text AT THE MOMENT ENTER WAS PRESSED — the explicit "find this
   *  exact property" signal. Unlike `query` (a live local filter), a non-empty
   *  submitted name escalates to a real Places Text Search so a specific community
   *  is found even when it isn't already loaded and isn't in the current viewport,
   *  WITHOUT running Unleash first. Cleared to "" by the toolbar on any keystroke,
   *  so it fires once per submission. */
  searchName?: string
  /** Called with the SELECTED property's canonical name after a SUCCESSFUL name
   *  search, so the toolbar input can reflect the exact match found (e.g. typing
   *  "vecina" → "Vecina Apartment Villas"). Reuses the already-returned name — no
   *  extra Places request. Never called on a failed/out-of-market search, and never
   *  from live substring filtering. */
  onResolveName?: (name: string) => void
  /** Reports the CURRENT number of matching properties, or null while the map is
   *  not settled. Read-only reporting — the explorer's own filtering, pins and
   *  search behaviour are untouched; LeadBoard uses it to decide whether an
   *  Enter press found nothing. */
  onMatchCount?: (count: number | null) => void
  /** Toolbar node supplied by LeadBoard in Map mode. When present, "Search this
   *  area" is portalled there so it reads as the third toolbar control instead of
   *  floating over the middle of the map. Absent → the original centered
   *  placement, so any other consumer is unchanged. */
  actionsHost?: HTMLElement | null
  /** Toolbar node for the compact market switcher, left of the search field. */
  marketHost?: HTMLElement | null
}

type Status = "loading" | "ready" | "searching" | "error" | "unconfigured"

// AdvancedMarkerElement requires a Map ID. A real one belongs in the environment
// for production styling; DEMO_MAP_ID keeps local development working without any
// cloud setup. This is the ONLY thing the Map ID changes here.
const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID"

// The property pins are AdvancedMarkerElements (so hover can use real DOM events).
type PropertyMarker = google.maps.marker.AdvancedMarkerElement

// AdvancedMarkerElement has no setOpacity/getOpacity; its "opacity" is just CSS on
// its content element. These keep the Unleash Beast dim/brighten behavior byte-for-
// byte the same, only expressed through the new marker's DOM content.
function setPinOpacity(m: PropertyMarker, o: number) {
  const el = m.content as HTMLElement | null
  if (el) el.style.opacity = String(o)
}
function getPinOpacity(m: PropertyMarker): number {
  const el = m.content as HTMLElement | null
  const v = el?.style.opacity
  return v ? parseFloat(v) : 1
}

export default function BeastPropertyExplorer({ serviceAreaSlugs, activeClient, primaryMarket = null, licenseState = null, onSelectProperty, query = "", searchName = "", onResolveName, recommendedUrls = [], onRecommend, actionsHost = null, marketHost = null, onMatchCount }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const markersRef = useRef<PropertyMarker[]>([])
  // placeId -> its map marker, so the Unleash Beast animation can highlight the
  // REAL ranked matches (Beast Suggestions) rather than arbitrary render order.
  const markerByIdRef = useRef<Map<string, PropertyMarker>>(new Map())
  // The current ranked suggestion order, mirrored into a ref for the handler.
  const suggestedIdsRef = useRef<string[]>([])

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
  const beastRestoreRef = useRef<{ m: PropertyMarker; o: number; z: number | null | undefined }[]>([])
  // The imported marker library. Under the async loader google.maps.Marker lives
  // here rather than on the global, so markers must be built from it.
  const markerLibRef = useRef<google.maps.MarkerLibrary | null>(null)
  const lastSearchRef = useRef<string | null>(null)
  // A no-op OverlayView kept on the map purely for its projection: it converts the
  // resolved desired-area center into a container pixel so the radar can sit over
  // that area rather than a fixed screen center.
  const projectionHelperRef = useRef<google.maps.OverlayView | null>(null)
  // One Unleash run: scan start (to hold the sonar for its full sweep before the
  // halo) and a guard so the halo fires once per scan. Needed because — with the
  // auto-preload removed — the first Unleash has no markers yet; the highlight
  // runs from an effect once the search results have rendered.
  const beastScanStartRef = useRef(0)
  const beastHighlightedRef = useRef(false)

  // Temporary map-session override chosen from the toolbar switcher. It moves the
  // map and nothing else: it is never written to Profile and never rewrites the
  // client's saved city or desired areas. Cleared when the client changes so the
  // next client starts from their own criteria, not the previous browse.
  const [marketOverride, setMarketOverride] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>("loading")
  const [beastPhase, setBeastPhase] = useState<"idle" | "scanning" | "matched">("idle")
  const [beastMatchCount, setBeastMatchCount] = useState(0)
  // Screen-pixel origins for the sonar sweeps — one per resolved desired-area
  // center, so 2 areas draw 2 simultaneous sweeps and 3 draw 3. Empty → the
  // original fixed viewport-center sweep (no-client / no resolved area).
  const [radarOrigins, setRadarOrigins] = useState<{ x: number; y: number }[]>([])
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<ExplorerProperty[]>([])
  const [hovered, setHovered] = useState<ExplorerProperty | null>(null)
  const [selected, setSelected] = useState<ExplorerProperty | null>(null)
  const [dirty, setDirty] = useState(false)
  // Place IDs returned by the most recent NAME search. They must render even when
  // the live substring filter (`q`) would hide them — the filter fragment the
  // agent typed is often not a contiguous substring of the real community name
  // ("standard legacy" vs "The Standard at Legacy") — so `visible` unions them in.
  // Reset when the market changes; a fresh name search replaces the set.
  const [nameMatchIds, setNameMatchIds] = useState<Set<string>>(() => new Set())
  // The last submitted name actually searched, so a re-render (e.g. a market
  // change rebuilding the callback) never re-fires the same search.
  const lastNameRef = useRef("")
  // Mirror `selected` and `nameMatchIds` into refs so the async name-search
  // callback can tell whether the CURRENT selection came from a prior name search
  // (and must be cleared when a new search surfaces nothing in-market) without
  // depending on them and re-running.
  const selectedRef = useRef<ExplorerProperty | null>(null)
  const nameMatchIdsRef = useRef<Set<string>>(nameMatchIds)
  useEffect(() => {
    selectedRef.current = selected
  }, [selected])
  useEffect(() => {
    nameMatchIdsRef.current = nameMatchIds
  }, [nameMatchIds])

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

  // ── Desired-area search centers (1–3) ──────────────────────────────────────
  // Every desired area the client selected (max 3, the form's combined cap),
  // each resolved to a deterministic market-aware centroid. Unleash searches one
  // 3 km radius around EACH — the camera is never touched. Empty → fall back to
  // the map center. marketSlug scopes the lookup so a label shared across metros
  // ("Medical Center", "Midtown") resolves to THIS market's centroid; an
  // unresolved area is dropped, never replaced with the downtown center.
  const desiredAreaCenters = useMemo(
    () => resolveDesiredAreaCenters(activeClient?.desiredAreas, marketSlug),
    [activeClient, marketSlug],
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

  // ── Remember the current Map market across a refresh ────────────────────────
  // The chosen market lives only in `marketOverride`, so a reload used to snap
  // back to the agent's Primary Market. Persist the RESOLVED market and reopen it
  // on load, exactly the way DashboardClient remembers Board-vs-Map — restore
  // AFTER mount (never in the useState initializer) so SSR and client agree.
  //
  // Restore is skipped when a client is already selected: that client's market
  // must win (client switching is untouched), and the clientKey effect above
  // owns clearing the override for the client path. With no client, the saved
  // market seeds the override and resolveMapMarket prefers it over the primary.
  const persistReadyRef = useRef(false)
  useEffect(() => {
    if (!activeClient) {
      const saved = readMapMarket()
      if (saved) setMarketOverride(saved)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  // Persist whenever the shown market changes — from the switcher OR a client —
  // so a reload reopens the last market. Skip the very first run so the initial
  // Primary-market resolve never clobbers a saved market before restore reads it.
  useEffect(() => {
    if (!persistReadyRef.current) {
      persistReadyRef.current = true
      return
    }
    if (marketSlug) writeMapMarket(marketSlug)
  }, [marketSlug])

  // The licensed state can change while the map is alive (Profile edit in another
  // tab, a late-arriving profile read). Re-apply the restriction rather than
  // rebuilding the map, so the constraint can never be older than the profile.
  //
  // `status` is a dependency so the restriction re-applies once the map exists
  // (mapRef is null on this effect's first run — the map is built in the async
  // bootstrap below). But the camera must be re-centered ONLY when the market
  // center actually changes — NEVER on a bare status flip. `searchByName` toggles
  // status (searching → ready) right after its own panTo/zoom; an unconditional
  // setCenter(center) here would snap the map back to the market center (downtown)
  // and undo the name-search focus. We track the last applied center and move the
  // camera only when it genuinely changed.
  const appliedCenterRef = useRef<{ lat: number; lng: number } | null>(null)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    // Order matters: drop the OLD restriction first, otherwise panTo into the new
    // market is clamped by the market we are leaving and the map never arrives.
    map.setOptions({ restriction: null })
    const prev = appliedCenterRef.current
    if (!prev || prev.lat !== center.lat || prev.lng !== center.lng) {
      map.setCenter(center)
      appliedCenterRef.current = { lat: center.lat, lng: center.lng }
    }
    if (marketBounds) {
      map.setOptions({ restriction: { latLngBounds: marketBounds, strictBounds: false } })
    }
  }, [marketBounds, center, status])

  const clearMarkers = useCallback(() => {
    // Listeners go with the marker; nothing accumulates across searches.
    for (const m of markersRef.current) {
      google.maps.event.clearInstanceListeners(m)
      m.map = null
    }
    markersRef.current = []
    markerByIdRef.current.clear()
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
          // Required for AdvancedMarkerElement (the property pins). Only the pin
          // rendering path depends on this; camera, zoom and controls are unchanged.
          mapId: MAP_ID,
          // Between the two extremes we tried: 12 framed the downtown too tightly,
          // 11 left most of the metro empty around a small cluster of pins. Maps JS
          // supports fractional zoom, so the half step sits where the first loaded
          // results fill the usable map. Center logic is untouched.
          zoom: 11.0,
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
        // A no-op overlay kept on the map so its projection is available: the
        // radar reads the desired-area center's screen pixel from it.
        const helper = new maps.OverlayView()
        helper.onAdd = () => {}
        helper.draw = () => {}
        helper.onRemove = () => {}
        helper.setMap(mapRef.current)
        projectionHelperRef.current = helper
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

  // Re-centering on a market change is handled by the restriction effect above,
  // which is VALUE-guarded (appliedCenterRef). A second effect keyed on `center` by
  // reference used to live here — but `center` is a fresh {lat,lng} object on many
  // renders even when the market is unchanged, so it re-centered spuriously and
  // could snap a name-search panTo back to the market center (the ALARO focus bug).
  // Removed: one guarded re-center path only.

  useEffect(() => () => clearMarkers(), [clearMarkers])

  // ── Deliberate area search ────────────────────────────────────────────────
  // One Places search per center. With resolved desired areas (1–3) it fans out
  // over each, merges the pools and dedupes by Place ID; with none it falls back
  // to a single search on the current map center. The CAMERA IS NEVER MOVED —
  // only where Places searches changes.
  const searchThisArea = useCallback(async (overrideCenters?: AreaCenter[]) => {
    const map = mapRef.current
    if (!map) return

    // Decide the search centers and the boundary guard for this run.
    let centers: AreaCenter[]
    const viaAreas = Boolean(overrideCenters && overrideCenters.length > 0)
    if (viaAreas) {
      // Desired-area centers are validated against the licensed STATE — a
      // legitimate area (e.g. Stone Oak) can sit just outside the market's
      // conservative pan box, so gating on the market would wrongly reject it.
      // Any area failing the state guard is dropped; if none survive we simply
      // don't search (no downtown fallback for a rejected area).
      centers = overrideCenters!.filter((c) => isInsideState(c, licenseState))
      if (centers.length === 0) {
        setDirty(false)
        return
      }
    } else {
      // Map-center path keeps the tighter market guard (its old behavior).
      const g = map.getCenter()
      if (!g) return
      const c = { lat: g.lat(), lng: g.lng() }
      if (!isInsideMarket(c, marketSlug)) {
        const back = boundsForMarket(marketSlug)
        if (back) map.setCenter(center)
        setDirty(false)
        return
      }
      centers = [c]
    }

    // Skip an identical repeat of the same area set (order-independent).
    const key = viaAreas
      ? "areas:" + centers.map((c) => `${c.lat.toFixed(4)},${c.lng.toFixed(4)}`).sort().join("|")
      : `${centers[0].lat.toFixed(4)},${centers[0].lng.toFixed(4)},${map.getZoom()}`
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

      // One Places search around a single center → normalized ExplorerProperty[].
      const searchOne = async (c: AreaCenter): Promise<ExplorerProperty[]> => {
        const { places } = await Place.searchNearby({
          // Minimum fields only — no rich Place Details.
          fields: ["id", "displayName", "formattedAddress", "location"],
          locationRestriction: { center: c, radius: 3000 },
          includedPrimaryTypes: ["apartment_complex", "apartment_building"],
          maxResultCount: 20,
          rankPreference: SearchNearbyRankPreference.POPULARITY,
        })
        return (places ?? [])
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
            searchCenter: { lat: c.lat, lng: c.lng },
          }))
      }

      // Fan out over every center, then merge + dedupe by Place ID so an overlap
      // between two areas yields a single property.
      const merged = await searchAreas(centers, searchOne)

      // Enrich the MERGED pool once with structured Property Intelligence by Place
      // ID. Unmatched results pass through unchanged; a lookup failure is swallowed
      // inside fetchCatalog, so the search never breaks on enrichment. Ranking then
      // runs over this one combined set — no area is ranked ahead of another.
      const catalog = await fetchCatalog(merged.map((m) => m.placeId), supabase)
      const enriched = enrichProperties(merged, catalog)

      lastSearchRef.current = key
      setResults(enriched)
      setDirty(false)
      setStatus("ready")
    } catch (e) {
      if (process.env.NODE_ENV !== "production") {
        console.error("[Beast Property Explorer] area search failed:", e)
      }
      setError("We couldn't search this area. Please try again.")
      setStatus("ready")
    }
  }, [marketSlug, center, licenseState])

  // ── Name search (find one specific community) ───────────────────────────────
  // The toolbar text FILTERS loaded pins (cheap, no request); pressing Enter
  // escalates to a real Places TEXT SEARCH for that community. This is the path
  // that lets an agent who already knows the property type its name and find it
  // immediately — it does NOT require Unleash to have run, and does NOT require the
  // property to be inside the current viewport. Found places run through the SAME
  // normalize → catalog-enrich pipeline as the area search: catalogued rows gain
  // website + Google rating, uncatalogued rows pass through unchanged (never
  // fabricated). Results are merged into the pool deduped by Place ID (existing
  // pins win, so Unleash's own set/ranking is untouched), and the strongest name
  // match is selected and centered. Ranking/match-scoring/PI are all unchanged.
  const searchByName = useCallback(
    async (rawName: string) => {
      const name = rawName.trim()
      const map = mapRef.current
      if (!name || !map) return

      setStatus("searching")
      setError(null)
      try {
        const { places: placesLib } = await loadGoogleMaps()
        const { Place } = placesLib

        // SOFT bias to the current market so a bare "The Standard" resolves in this
        // metro — but a bias, never a restriction, so a strong name match just past
        // the market edge still returns. Falls back to a wide circle on the map
        // center when the market has no bounds.
        let bias: google.maps.places.SearchByTextRequest["locationBias"]
        if (marketBounds) {
          bias = marketBounds
        } else {
          const g = map.getCenter()
          bias = g ? { center: { lat: g.lat(), lng: g.lng() }, radius: 50000 } : undefined
        }

        const { places } = await Place.searchByText({
          // Minimum fields, plus `types` so obvious non-apartment businesses (a
          // brokerage, a vacation rental, a restaurant) can be qualified out below.
          fields: ["id", "displayName", "formattedAddress", "location", "types"],
          textQuery: name,
          ...(bias ? { locationBias: bias } : {}),
          // No apartment-type gate on purpose: a community whose Google primary type
          // differs must still be findable BY NAME. Relevance ranking plus the
          // exact-name preference below keeps the right property on top.
          maxResultCount: 8,
        })

        // Normalize each Place, reading its real coordinates EXACTLY. A place with
        // no id/location or non-finite coordinates returns null and is dropped — it
        // is a result that cannot be mapped, never a fake/center pin.
        const found: ExplorerProperty[] = (places ?? [])
          .map((p) => normalizePlace(p, marketSlug))
          .filter((p): p is ExplorerProperty => p !== null)

        // Enrich exactly like the area path — website + rating for catalogued
        // Place IDs, untouched pass-through otherwise (no fabricated enrichment).
        const catalog = await fetchCatalog(
          found.map((f) => f.placeId),
          supabase,
        )
        const enriched = enrichProperties(found, catalog)
        // Place IDs present in property_catalog — a preference signal for selection,
        // never a requirement (uncatalogued apartments still qualify).
        const cataloguedIds = new Set(catalog.keys())

        // MARKET RESTRICTION + CANDIDATE QUALIFICATION: coordinates are authoritative
        // (drop anything outside the selected market's envelope; Dallas/Fort Worth
        // share the DFW box), then choose the SINGLE strongest valid apartment/
        // community candidate — catalogued or apartment-typed, exact name preferred —
        // rejecting brokerages / vacation rentals / other businesses a bare name
        // search drags in. No in-market qualified candidate ⇒ no property surfaced
        // (never an out-of-market or noise fallback). locationBias only steers result
        // quality; this is the final gate.
        const decision = decideNameSearch(
          selectInMarketMatch(enriched, marketSlug, name, cataloguedIds),
          {
            selectedPlaceId: selectedRef.current?.placeId ?? null,
            nameMatchIds: nameMatchIdsRef.current,
          },
        )

        // Merge ONLY in-market results — and only when there are some — so existing
        // pins (area/Unleash) are never disturbed on a failed search. Then set the
        // name-search focus (empty on a failed search, clearing the prior focus).
        if (decision.addResults.length > 0) {
          setResults((prev) => mergeDedupeByPlaceId([prev, decision.addResults]))
        }
        setNameMatchIds(decision.nameMatchIds)

        if (decision.focus && hasCoordinates(decision.focus)) {
          // In-market match: open its normal card (existing match/fit, rating,
          // website, recommend controls render as usual — no fabricated match %) and
          // center on it. Pan/zoom happens ONLY here, on a successful match.
          setSelected(decision.focus)
          onSelectProperty?.(decision.focus)
          // Reflect the exact match in the toolbar input (reuses the returned name,
          // no extra request). Only here — the successful-match branch.
          onResolveName?.(decision.focus.propertyName)
          map.panTo({ lat: decision.focus.lat, lng: decision.focus.lng })
          if ((map.getZoom() ?? 0) < 13) map.setZoom(14)
        } else if (decision.clearPriorSelection) {
          // Nothing in-market: if the current card was a PRIOR name-search result,
          // close it so it can't look like this search's result. Normal/area pins,
          // the camera, and Unleash are all untouched; the search text stays.
          setSelected(null)
        }

        setStatus("ready")
      } catch (e) {
        if (process.env.NODE_ENV !== "production") {
          console.error("[Beast Property Explorer] name search failed:", e)
        }
        setError("We couldn't search for that property. Please try again.")
        setStatus("ready")
      }
    },
    [marketBounds, marketSlug, onSelectProperty, onResolveName],
  )

  // Enter in the toolbar (a submitted name) runs the name search. Once per distinct
  // submitted name; clearing the field (searchName → "") resets the guard so the
  // same name can be searched again later.
  useEffect(() => {
    const name = (searchName ?? "").trim()
    if (!name) {
      lastNameRef.current = ""
      return
    }
    if (name === lastNameRef.current) return
    lastNameRef.current = name
    void searchByName(name)
  }, [searchName, searchByName])

  // Switching markets discards the previous market's apartments immediately, so
  // San Antonio results are never briefly shown on the Austin map while the new
  // search runs. The auto-search effect below then loads the new market.
  useEffect(() => {
    setResults([])
    setError(null)
    lastSearchRef.current = null
    // A different market is a different search context — drop any name-search focus
    // so its pins don't linger over the new metro.
    setNameMatchIds(new Set())
  }, [marketSlug])

  // ── No automatic search on open ─────────────────────────────────────────────
  // The map deliberately opens with NO pins. It used to auto-run a 3 km search on
  // the market center, dropping a downtown cluster on every client before they
  // did anything. Pins now appear ONLY when the agent clicks Unleash Beast, which
  // searches the client's resolved desired-area center (or the map center when
  // there is no client / no resolved area).

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
      setPinOpacity(m, o ?? 1)
      m.zIndex = z ?? null
    }
    beastRestoreRef.current = []
    beastPhaseRef.current = "idle"
    beastHighlightedRef.current = false
    setRadarOrigins([])
  }, [])

  // The dim/lift/halo pass over the CURRENT markers, using the REAL ranked Beast
  // Suggestions. Split out of the click handler because — with the preload removed
  // — the markers do not exist on the first Unleash; they arrive after the search,
  // so this runs from an effect once results have rendered.
  const runHighlight = useCallback(() => {
    const map = mapRef.current
    const markers = markersRef.current
    if (!map) return

    beastRestoreRef.current = markers.map((m) => ({ m, o: getPinOpacity(m), z: m.zIndex }))
    for (const m of markers) setPinOpacity(m, 1)

    // matches = the REAL ranked Beast Suggestions (structured Neighborhood /
    // Location Keyword / Location fit, strongest tier first). Fallback to the first
    // 10 when there is no ranked evidence, so the sweep still reads as a gesture.
    const ranked = suggestedIdsRef.current
      .map((id) => markerByIdRef.current.get(id))
      .filter((m): m is PropertyMarker => Boolean(m))
    const matches = ranked.length > 0 ? ranked : markers.slice(0, 10)
    const matchSet = new Set(matches)

    for (const m of markers) if (!matchSet.has(m)) setPinOpacity(m, 0.22)
    for (const m of matches) {
      setPinOpacity(m, 1)
      m.zIndex = 50
      const pos = m.position
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
  }, [])

  const unleashTheBeast = useCallback(() => {
    const map = mapRef.current
    if (!map) return

    // The SEARCH centers: the client's resolved desired areas (1–3) when we have
    // them, otherwise the current map center. The CAMERA IS NEVER MOVED.
    const hasAreas = desiredAreaCenters.length > 0
    const g = map.getCenter()
    if (!hasAreas && !g) return

    // Restartable: a click mid-run rewinds and starts over.
    beastReset()
    beastScanStartRef.current = typeof performance !== "undefined" ? performance.now() : 0
    beastPhaseRef.current = "scanning"
    setBeastPhase("scanning")

    // Radar origins = each desired-area center projected to a screen pixel, so a
    // sweep sits OVER each area (even one near/off the viewport edge — the camera
    // stays put). 2 areas → 2 sweeps, 3 areas → 3. No resolved area → [] → the
    // centered fallback sweep.
    const projection = projectionHelperRef.current?.getProjection()
    if (hasAreas && projection) {
      const origins = desiredAreaCenters
        .map((c) => projection.fromLatLngToContainerPixel(new google.maps.LatLng(c.lat, c.lng)))
        .filter((pt): pt is google.maps.Point => Boolean(pt))
        .map((pt) => ({ x: pt.x, y: pt.y }))
      setRadarOrigins(origins)
    } else {
      setRadarOrigins([])
    }

    // The REAL search/ranking path: Places around EACH center -> merge/dedupe ->
    // catalog enrichment -> assessLocationFit -> computeSuggestions. The halo pass
    // runs from the effect below once these results have rendered.
    void searchThisArea(hasAreas ? desiredAreaCenters : undefined)
  }, [beastReset, desiredAreaCenters, searchThisArea])

  useEffect(() => () => beastReset(), [beastReset])

  const visible = useMemo(() => {
    const base = q ? results.filter((p) => p.propertyName.toLowerCase().includes(q)) : results
    if (nameMatchIds.size === 0) return base
    // A name-search hit must render even when the live substring filter would hide
    // it (e.g. filter "standard legacy" vs the real name "The Standard at Legacy").
    // Append any loaded name-search match missing from the base filter.
    const inBase = new Set(base.map((p) => p.placeId))
    const extra = results.filter((p) => nameMatchIds.has(p.placeId) && !inBase.has(p.placeId))
    return extra.length ? [...base, ...extra] : base
  }, [results, q, nameMatchIds])

  // Report upward AFTER render, never during — this only observes `visible`.
  // null while loading/searching so the toolbar can tell "no matches" apart from
  // "not settled yet" and never reacts mid-resolve.
  useEffect(() => {
    onMatchCount?.(status === "ready" ? visible.length : null)
  }, [status, visible.length, onMatchCount])

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
    const lib = markerLibRef.current
    const PinCtor = lib?.PinElement ?? google.maps.marker.PinElement
    const MarkerCtor = lib?.AdvancedMarkerElement ?? google.maps.marker.AdvancedMarkerElement
    for (const p of visible.filter(hasCoordinates)) {
      const isSuggested = suggestions.has(p.placeId)
      // The standard red Google pin — same look as before (no star, no halo, no
      // recolor, no resize). AdvancedMarkerElement's default is this pin; we build
      // the PinElement explicitly only to get a DOM node for the hover listeners.
      const pin = new PinCtor()
      const el = pin.element
      el.style.cursor = "pointer"
      const marker = new MarkerCtor({
        map,
        position: { lat: p.lat, lng: p.lng },
        title: p.propertyName,
        zIndex: isSuggested ? 2 : 1,
        content: el,
      })
      // Hover uses NATIVE DOM events on the marker's own element — reliable, unlike
      // the legacy Marker's mouseover. Same in-memory property object, no request.
      el.addEventListener("mouseenter", () => setHovered(p))
      el.addEventListener("mouseleave", () => setHovered(null))
      // Click PERSISTS — unchanged: selects the card and fires onSelectProperty.
      marker.addListener("click", () => {
        setSelected(p)
        onSelectProperty?.(p)
      })
      markersRef.current.push(marker)
      markerByIdRef.current.set(p.placeId, marker)
    }
  }, [visible, suggestions, clearMarkers, onSelectProperty])

  // Keep the handler's view of the ranked matches current.
  useEffect(() => {
    suggestedIdsRef.current = Array.from(suggestions.keys())
  }, [suggestions])

  // Runs the halo pass once the Unleash search has settled AND its markers are on
  // the map. Placed AFTER the marker/suggestion effects so, in the commit where
  // results arrive, markersRef and suggestedIdsRef are already current. The sonar
  // is held for its full sweep before the halo; a slow search highlights on land.
  useEffect(() => {
    if (beastPhase !== "scanning") return
    if (status !== "ready") return
    if (beastHighlightedRef.current) return
    beastHighlightedRef.current = true
    const elapsed =
      (typeof performance !== "undefined" ? performance.now() : 0) - beastScanStartRef.current
    const remaining = Math.max(0, 2200 - elapsed)
    beastTimersRef.current.push(window.setTimeout(runHighlight, remaining))
    // visible / suggestions are read through refs inside runHighlight; they are
    // dependencies here only to signal the render carrying them has committed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beastPhase, status, visible, suggestions, runHighlight])

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
  const switcherMarkets = marketsForSlugs(serviceAreaSlugs)
    .filter((m) => isMarketInState(m.slug, licenseState))
    // DROPDOWN DISPLAY ORDER ONLY — alphabetical by market name (Austin, Dallas,
    // Fort Worth, Houston, San Antonio). marketsForSlugs deliberately preserves the
    // agent's SELECTION order (primary market first) for the hero-theme semantics it
    // drives elsewhere, so we sort a COPY here rather than change that shared list.
    // `.filter` already returns a fresh array, so this sort mutates nothing shared;
    // slugs, selection, and search behavior are all unchanged.
    .sort((a, b) => a.name.localeCompare(b.name))
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
          ? `${beastMatchCount} Beast ${beastMatchCount === 1 ? "Match" : "Matches"}`
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
          {/* One sweep per resolved desired-area pixel (2 areas → 2 sweeps, 3 → 3);
              a single centered fallback sweep (no client / no resolved area) when
              there are no origins. */}
          {(radarOrigins.length > 0 ? radarOrigins : [null]).map((origin, i) => (
            <span
              key={i}
              className={origin ? "lb-sonar-origin" : "lb-sonar-origin lb-sonar-origin-center"}
              style={origin ? { left: origin.x, top: origin.y } : undefined}
            >
              <span className="lb-sonar" />
              <span className="lb-sonar lb-sonar-2" />
              <span className="lb-sonar lb-sonar-3" />
            </span>
          ))}
          <style>{`
            .lb-sonar-origin {
              position: absolute;
              width: 0;
              height: 0;
            }
            .lb-sonar-origin-center {
              left: 50%;
              top: 50%;
            }
            .lb-sonar {
              position: absolute;
              left: 0;
              top: 0;
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

      {/* The "No loaded property matches …" toast is intentionally gone: the search
          control itself now shows that state after Enter, and both at once said the
          same thing twice. ONLY this toast is suppressed — the error pill above and
          the empty-area-search pill below are unchanged. */}

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
            <p className="mt-1 text-[12.5px] leading-snug text-[#4b5162]">{displayAddress(card.propertyAddress)}</p>
          )}
          {/* Google rating — numeric first (one decimal), then a compact 5-star
              visual whose gold fill reflects the decimal. Shown ONLY when a real
              catalogued rating exists; omitted entirely otherwise. No review
              count, no fabricated value, and it never touches ranking or search. */}
          {typeof card.googleRating === "number" && (
            <div className="mt-1.5 flex items-center gap-1.5">
              <span className="text-[12.5px] font-semibold tabular-nums text-[#111318]">
                {card.googleRating.toFixed(1)}
              </span>
              <StarRating value={card.googleRating} />
            </div>
          )}
          {/* Future-ready fields — each renders ONLY when a real value is present
              on the in-memory property, and is omitted entirely otherwise. No
              fetch, no fabrication. Order: Match %, Commission, Current Special. */}
          {typeof card.matchScore === "number" && (
            <p className="mt-2 text-[12.5px] font-semibold text-[#111318]">
              Match: {Math.round(card.matchScore)}%
            </p>
          )}
          {formatCommission(card.commission) && (
            <p className="mt-1 text-[12.5px] text-[#4b5162]">
              <span className="font-semibold text-[#111318]">Commission:</span> {formatCommission(card.commission)}
            </p>
          )}
          {card.currentSpecial && card.currentSpecial.trim() && (
            <p className="mt-1 text-[12.5px] text-emerald-700">
              <span className="font-semibold">Special:</span> {card.currentSpecial.trim()}
            </p>
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
                {/* A match reads as "100% Match" — the same treatment as Beast
                    Companion — replacing the old tier label (e.g. "Preferred Area
                    Match"). Non-match tones keep their descriptive label. The
                    underlying assessLocationFit tiers/logic are unchanged. */}
                {fit.tone === "match" ? "100% Match" : fit.label}
              </span>
              <p className="mt-1 text-[11.5px] text-[#6b7280]">{fit.reason}</p>
            </div>
          )}
          {/* Discreet lower-right link to the property's OWN website. Shown only
              when a real websiteUrl exists (hidden otherwise). Opens in a new tab
              and stops propagation so it never triggers the pin-card select/close.
              No request — the URL is read from the already-loaded property. */}
          {card.websiteUrl && (
            <div className="mt-3 text-right">
              <a
                href={card.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-[11.5px] font-medium text-[#2f6bff] hover:underline"
              >
                Visit Website
              </a>
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
