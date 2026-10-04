"use client"

import { useCallback, useEffect, useState } from "react"
import AmenitySelect from "@/components/crm/social/AmenitySelect"
import { parseAmenities, serializeAmenities } from "@/lib/social/amenities"

/**
 * PROPERTY RESEARCH — a collapsed disclosure under "Matched property".
 *
 * Captures what the locator noticed on the property's website while editing the
 * video. OBSERVATIONS ONLY: this writes two Social Beast tables and nothing else.
 * Property Intelligence is never touched here — Mini Beast stays the authoritative
 * writer, and nothing consumes these yet.
 *
 * ── TWO PRICE CONCEPTS, KEPT APART ──────────────────────────────────────────
 * The video's own "Starting At / Exact Unit Shown" above is MARKETING copy for
 * the overlay. The price in here is RESEARCH about the unit on screen. They may
 * legitimately disagree — a video can show the $3,500 2BC while the post markets
 * the property from $2,300 — so they live in different columns in different
 * tables and neither reads the other.
 *
 * ── CLUTTER BUDGET ──────────────────────────────────────────────────────────
 * Collapsed, this is ONE line. It renders only when the video is matched to a
 * property, because research with nothing to attach to cannot be saved. Every
 * field is optional: "2 Bed" alone is a legitimate observation.
 */

type FloorPlan = {
  planName: string
  beds: string
  baths: string
  sqft: string
  observedPrice: string
  priceContext: "" | "starting_at" | "exact_unit"
}

/** Phase 1 property-level fields, labelled for humans but keyed by the
 *  AUTHORITATIVE property_catalog column name so a later comparison is a field
 *  lookup rather than a mapping table. */
const CORE_FIELDS: [string, string][] = [
  ["studio_starting_rent", "Studio"],
  ["onebr_starting_rent", "1 Bed"],
  ["twobr_starting_rent", "2 Bed"],
  ["threebr_starting_rent", "3 Bed"],
]
const MORE_FIELDS: [string, string][] = [
  ["fourbr_starting_rent", "4 Bed"],
  ["loft_starting_rent", "Loft"],
  ["penthouse_starting_rent", "Penthouse"],
  ["townhome_starting_rent", "Townhome"],
]

const EMPTY_PLAN: FloorPlan = { planName: "", beds: "", baths: "", sqft: "", observedPrice: "", priceContext: "" }

function todayLocalIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

export default function PropertyResearch({ sourceContentId }: { sourceContentId: string }) {
  // Mounted only while expanded (PostEditor owns the toggle), so "open" is true
  // for this component's whole life.
  const open = true
  const [showMore, setShowMore] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle")

  const [plan, setPlan] = useState<FloorPlan>(EMPTY_PLAN)
  const [fields, setFields] = useState<Record<string, string>>({})
  const [sourceUrl, setSourceUrl] = useState("")
  const [observedAt, setObservedAt] = useState(todayLocalIso())

  // Loaded on first expand, not on editor mount — a collapsed control should
  // cost nothing on a page that already issues a burst of requests.
  useEffect(() => {
    if (!open || loaded) return
    let alive = true
    void (async () => {
      try {
        const res = await fetch(`/api/admin/social-autopilot/content/${sourceContentId}/research`, {
          headers: { Accept: "application/json" },
        })
        if (!res.ok || !alive) return
        const j = (await res.json()) as {
          fields?: Record<string, string>
          floorPlan?: Record<string, unknown> | null
          sourceUrl?: string | null
          observedAt?: string | null
        }
        if (!alive) return
        setFields(j.fields ?? {})
        const fp = j.floorPlan
        if (fp) {
          setPlan({
            planName: String(fp.plan_name ?? ""),
            beds: fp.beds == null ? "" : String(fp.beds),
            baths: fp.baths == null ? "" : String(fp.baths),
            sqft: fp.sqft == null ? "" : String(fp.sqft),
            observedPrice: String(fp.observed_price ?? ""),
            priceContext: (fp.price_context as FloorPlan["priceContext"]) ?? "",
          })
        }
        if (j.sourceUrl) setSourceUrl(j.sourceUrl)
        if (j.observedAt) setObservedAt(j.observedAt)
        // Reveal the optional row if anything is already stored there.
        if (MORE_FIELDS.some(([k]) => (j.fields ?? {})[k])) setShowMore(true)
      } finally {
        if (alive) setLoaded(true)
      }
    })()
    return () => { alive = false }
  }, [open, loaded, sourceContentId])

  const save = useCallback(async () => {
    setState("saving")
    try {
      // Every known field is SENT, including the blank ones — a blank is how the
      // server is told to delete a previously stored observation. The server
      // never stores "" itself.
      const payload = {
        sourceUrl,
        observedAt,
        fields: Object.fromEntries([...CORE_FIELDS, ...MORE_FIELDS].map(([k]) => [k, fields[k] ?? ""]).concat([
          ["current_special", fields.current_special ?? ""],
          ["observed_features", fields.observed_features ?? ""],
        ])),
        floorPlan: plan,
      }
      const res = await fetch(`/api/admin/social-autopilot/content/${sourceContentId}/research`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(String(res.status))
      setState("saved")
      setTimeout(() => setState("idle"), 2500)
    } catch {
      setState("error")
    }
  }, [sourceContentId, fields, plan, sourceUrl, observedAt])

  const inputCls =
    "w-full text-[12.5px] rounded-lg border border-[var(--crm-border)] bg-[var(--crm-card)] text-[var(--crm-text-primary)] px-2 py-1"
  const tiny = "text-[10px] uppercase tracking-wide text-[var(--crm-text-muted)]"
  const setField = (k: string, v: string) => setFields((f) => ({ ...f, [k]: v }))

  return (
    <div className="w-full min-w-0">
      {/* Spans the full editor content width beneath the Property/Type/Market row.
          It previously lived inside that row's 2fr cell, where its inner grids
          overflowed and dragged the page layout sideways. */}
      <div className="rounded-lg border border-[var(--crm-border)] bg-[var(--crm-inset)] p-3 flex flex-col gap-3">
          {/* ── THIS VIDEO ─────────────────────────────────────────────── */}
          <div>
            <div className={tiny}>This Video</div>
            <div className="mt-1 grid grid-cols-2 md:grid-cols-3 gap-1.5">
              <label className="block"><span className="sr-only">Floor Plan</span>
                <input className={inputCls} placeholder="Floor Plan" value={plan.planName}
                  onChange={(e) => setPlan((p) => ({ ...p, planName: e.target.value }))} /></label>
              <label className="block"><span className="sr-only">Beds</span>
                <input className={inputCls} inputMode="decimal" placeholder="Beds" value={plan.beds}
                  onChange={(e) => setPlan((p) => ({ ...p, beds: e.target.value }))} /></label>
              <label className="block"><span className="sr-only">Baths</span>
                <input className={inputCls} inputMode="decimal" placeholder="Baths" value={plan.baths}
                  onChange={(e) => setPlan((p) => ({ ...p, baths: e.target.value }))} /></label>
            </div>
            <div className="mt-1.5 grid grid-cols-2 md:grid-cols-3 gap-1.5">
              <label className="block"><span className="sr-only">Sq Ft</span>
                <input className={inputCls} inputMode="numeric" placeholder="Sq Ft" value={plan.sqft}
                  onChange={(e) => setPlan((p) => ({ ...p, sqft: e.target.value }))} /></label>
              <label className="block"><span className="sr-only">Price</span>
                <input className={inputCls} placeholder="Price" value={plan.observedPrice}
                  onChange={(e) => setPlan((p) => ({ ...p, observedPrice: e.target.value }))} /></label>
              <label className="block"><span className="sr-only">Price context</span>
                <select className={`${inputCls} cursor-pointer`} value={plan.priceContext}
                  onChange={(e) => setPlan((p) => ({ ...p, priceContext: e.target.value as FloorPlan["priceContext"] }))}>
                  <option value="">Context…</option>
                  <option value="starting_at">Starting At</option>
                  <option value="exact_unit">Exact Unit Shown</option>
                </select></label>
            </div>
          </div>

          {/* ── PROPERTY STARTING PRICES ───────────────────────────────── */}
          <div>
            <div className={tiny}>Property Starting Prices</div>
            <div className="mt-1 grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {CORE_FIELDS.map(([key, label]) => (
                <label key={key} className="block">
                  <span className="sr-only">{label}</span>
                  <input className={inputCls} placeholder={label} value={fields[key] ?? ""}
                    onChange={(e) => setField(key, e.target.value)} />
                </label>
              ))}
            </div>
            {showMore ? (
              <div className="mt-1.5 grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {MORE_FIELDS.map(([key, label]) => (
                  <label key={key} className="block">
                    <span className="sr-only">{label}</span>
                    <input className={inputCls} placeholder={label} value={fields[key] ?? ""}
                      onChange={(e) => setField(key, e.target.value)} />
                  </label>
                ))}
              </div>
            ) : (
              <button type="button" onClick={() => setShowMore(true)}
                className="mt-1 text-[11px] font-semibold text-[var(--crm-text-secondary)] hover:text-[var(--crm-text-primary)]">
                + More
              </button>
            )}
          </div>

          {/* ── OBSERVATIONS ───────────────────────────────────────────── */}
          <div className="flex flex-col gap-1.5">
            <input className={inputCls} placeholder="Current Special" value={fields.current_special ?? ""}
              onChange={(e) => setField("current_special", e.target.value)} />
            {/* Separate from the video's max-3 MARKETING amenities on purpose:
                those 3 are a curated ranking layer, never the property's feature
                list — the same distinction property_catalog.amenity_keywords
                already draws against property_attributes. */}
            <div>
              <div className={tiny}>Features Observed</div>
              {/* The SAME canonical bank + search the marketing field uses, with the
                  3-cap lifted: three curated keywords are a ranking layer, never the
                  property's feature list. Stored newline-joined in the observation
                  layer only — never written back to social_content.amenities. */}
              <div className="mt-1">
                <AmenitySelect
                  max={25}
                  value={parseAmenities(fields.observed_features ?? "")}
                  onChange={(next) => setField("observed_features", serializeAmenities(next))}
                />
              </div>
            </div>
            <input className={inputCls} placeholder="Source URL" value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)} />
            {/* Bottom row: compact date · flexible gap · roomy Save. Wraps instead
                of overflowing on narrow widths. */}
            <div className="flex flex-wrap items-center gap-2">
              {/* A REAL date input — the native picker still opens on click. The
                  oversized "icon" was the marketing base rule stretching
                  ::-webkit-calendar-picker-indicator to fill the whole field
                  (width/height 100%, position absolute, inset 0), which covered the
                  text. .lb-date-native restores a small trailing glyph and
                  .sb-research-date restores sane width/type size; both live in
                  globals.css because that base rule is unlayered and out-ranks
                  utilities. Value stays YYYY-MM-DD — no timezone conversion. */}
              {/* Chrome opens the native picker only from the trailing indicator, so a
                  click on the text half of a 150px field appears to do nothing. showPicker()
                  on click opens it from anywhere in the control. It throws if the picker is
                  already open (clicking the indicator itself) or if the browser doesn't
                  support it, and in both cases the native behaviour is already correct —
                  so the throw is swallowed rather than handled. Display only: the value is
                  still YYYY-MM-DD from the same onChange, with no timezone conversion. */}
              <input type="date" aria-label="Observed date" value={observedAt}
                onChange={(e) => setObservedAt(e.target.value)}
                onClick={(e) => { try { e.currentTarget.showPicker() } catch {} }}
                className="lb-date-native [color-scheme:dark] sb-research-date" />
              <div className="flex-1 min-w-[12px]" />
              {state === "error" && <span className="text-[11px] text-[#c0264b]">Couldn’t save.</span>}
              {state === "saved" && <span className="text-[11px] text-emerald-500">Saved.</span>}
              <button type="button" onClick={save} disabled={state === "saving"}
                className="crm-cta px-10 py-2 rounded-lg text-[12px] font-semibold whitespace-nowrap disabled:opacity-50">
                {state === "saving" ? "Saving…" : "Save Property Research"}
              </button>
            </div>
          </div>
      </div>
    </div>
  )
}
