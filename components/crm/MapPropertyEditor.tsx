"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import PropertyThumb from "@/components/crm/PropertyThumb"
import { StarRating } from "@/components/crm/StarRating"
import { commissionToInput } from "@/components/crm/PropertyPricingEditor"
import {
  CATALOG_WD_INCLUDED_OPTIONS, CATALOG_WD_CONNECTIONS_OPTIONS,
  asCatalogWasherDryerIncluded, asCatalogWasherDryerConnections,
} from "@/lib/propertyIntel/washerDryerCatalog"
import { MOVE_IN_SPECIAL_OPTIONS, specialToSelection, selectionToSpecial } from "@/lib/propertyIntel/moveInSpecials"
import { ageLabel } from "@/lib/propertyIntel/relativeAge"

/**
 * MAP PROPERTY EDITOR — the right-side panel behind "Edit Property" on a map card.
 *
 * ── IT IS A PRESENTATION, NOT A SECOND SYSTEM ───────────────────────────────────────────
 * Every value here is read from and written to the SAME endpoint the Recommended Properties
 * pencil uses, /api/admin/owner/property-pricing, which is guarded by requirePlatformAdmin()
 * and writes through the patch-only enrichment writer. There is no second property store, no
 * second save path, and no field that exists only on the map. What is new is reach: an agent
 * can now correct a property straight from a search, without recommending or favouriting it
 * first, which is the whole point.
 *
 * ── BLANK MEANS "LEAVE IT ALONE" ────────────────────────────────────────────────────────
 * Inherited from the route, and the reason the panel is safe to open on hundreds of
 * properties: an untouched field is omitted from the payload entirely, so saving one number
 * cannot disturb the other forty. Clearing a value back to unknown is a SEPARATE, explicit
 * act — see the Clear control on commission and the gift card.
 *
 * ── UNKNOWN IS NOT NO ───────────────────────────────────────────────────────────────────
 * The distinction runs through every control here. A blank commission means nobody has
 * checked; "0%" means somebody checked and it is zero. A gift card with no status is
 * unresearched; "No" is a confirmed finding. An absent attribute row is unknown; a stored
 * "no" is a fact. The panel never renders one as the other, and never sends one as the other.
 */

type Loaded = {
  placeId: string
  propertyName: string | null
  address: string | null
  currentSpecial: string | null
  sendCommission: string | null
  escortCommission: string | null
  bonusFlat: string | null
  washerDryerIncluded: string | null
  washerDryerConnections: string | null
  giftCardStatus: string | null
  giftCardAmount: number | null
  giftCardCheckedAt: string | null
  currentSpecialCheckedAt: string | null
  /** Per-field: did provenance record a VERIFICATION, or just a write? Decides whether the age
   *  line below reads "Verified" or "Updated". */
  fieldVerified: Record<string, boolean>
  googleRating: number | null
  imageUrl: string | null
  imageUrlBackup: string | null
  nearbyLandmark: string | null
  crossStreets: string | null
  attributes: Record<string, string>
  commissionVerified: Record<string, boolean>
}

const ENDPOINT = "/api/admin/owner/property-pricing"

/** The three attribute controls, in the order the panel shows them. */
const ATTRIBUTES = [
  { key: "private_yard", field: "privateYard", label: "Private Yard" },
  { key: "attached_garage", field: "attachedGarage", label: "Attached Garage" },
  { key: "detached_garage", field: "detachedGarage", label: "Detached Garage" },
] as const

type Tri = "yes" | "no" | "unknown"

/** A stored dollar amount → what the input shows. Null stays BLANK, never "0". */
function amountToInput(n: number | null | undefined): string {
  return typeof n === "number" && Number.isFinite(n) ? String(n) : ""
}

export default function MapPropertyEditor({
  placeId,
  open,
  onClose,
  onSaved,
}: {
  placeId: string
  open: boolean
  onClose: () => void
  /** Fired after a successful save so the map can refetch the catalog and the card updates. */
  onSaved?: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  // ── FORM STATE ──────────────────────────────────────────────────────────────────────────
  const [send, setSend] = useState("")
  const [escort, setEscort] = useState("")
  const [bonus, setBonus] = useState("")
  const [specialChoice, setSpecialChoice] = useState("")
  const [specialDetails, setSpecialDetails] = useState("")
  const [giftStatus, setGiftStatus] = useState<Tri>("unknown")
  const [giftAmount, setGiftAmount] = useState("")
  const [wdIncluded, setWdIncluded] = useState("")
  const [wdConnections, setWdConnections] = useState("")
  const [attrs, setAttrs] = useState<Record<string, Tri>>({})
  const [landmark, setLandmark] = useState("")
  const [crossStreets, setCrossStreets] = useState("")
  const [source, setSource] = useState("")
  /** Commission fields the owner has explicitly cleared back to unknown this session. */
  const [cleared, setCleared] = useState<Record<string, boolean>>({})

  const panelRef = useRef<HTMLDivElement | null>(null)

  const hydrate = useCallback((d: Loaded) => {
    setSend(commissionToInput(d.sendCommission))
    setEscort(commissionToInput(d.escortCommission))
    setBonus(commissionToInput(d.bonusFlat))
    const sel = specialToSelection(d.currentSpecial)
    setSpecialChoice(sel.choice)
    setSpecialDetails(sel.details)
    setGiftStatus(d.giftCardStatus === "yes" || d.giftCardStatus === "no" ? d.giftCardStatus : "unknown")
    setGiftAmount(amountToInput(d.giftCardAmount))
    setWdIncluded(d.washerDryerIncluded ?? "")
    setWdConnections(d.washerDryerConnections ?? "")
    const a: Record<string, Tri> = {}
    for (const { key } of ATTRIBUTES) {
      const v = d.attributes?.[key]
      a[key] = v === "yes" || v === "no" ? v : "unknown"
    }
    setAttrs(a)
    setLandmark(d.nearbyLandmark ?? "")
    setCrossStreets(d.crossStreets ?? "")
    setSource("")
    setCleared({})
    setSaveError(null)
    setSavedAt(null)
  }, [])

  // Load when the panel opens, and whenever it is pointed at a different property.
  useEffect(() => {
    if (!open || !placeId) return
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    fetch(`${ENDPOINT}?placeId=${encodeURIComponent(placeId)}`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(body?.error ?? `http_${r.status}`)
        return body as Loaded
      })
      .then((d) => { if (!cancelled) { setLoaded(d); hydrate(d) } })
      .catch((e) => { if (!cancelled) setLoadError(String(e?.message ?? e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open, placeId, hydrate])

  // ── WHAT CHANGED ────────────────────────────────────────────────────────────────────────
  // The payload is built from this, so an untouched field is never sent and therefore can
  // never be rewritten. It also drives the unsaved-changes guard, so the two can never
  // disagree about whether there is anything to lose.
  const changes = useMemo(() => {
    if (!loaded) return {} as Record<string, unknown>
    const out: Record<string, unknown> = {}
    const commission: [string, string, string | null][] = [
      ["sendCommission", send, loaded.sendCommission],
      ["escortCommission", escort, loaded.escortCommission],
      ["bonusFlat", bonus, loaded.bonusFlat],
    ]
    for (const [key, value, stored] of commission) {
      if (cleared[key]) { out[key] = null; continue }
      if (value.trim() !== commissionToInput(stored)) out[key] = value.trim()
    }
    // `loaded.currentSpecial` as the third argument: when the dropdown and details still
    // describe what is stored, this returns the stored text verbatim, so an older
    // "… on Select Homes" value is never quietly restated in the newer wording.
    const nextSpecial = selectionToSpecial(specialChoice, specialDetails, loaded.currentSpecial)
    if (nextSpecial !== null && nextSpecial !== (loaded.currentSpecial ?? "")) out.currentSpecial = nextSpecial

    const storedGift = loaded.giftCardStatus === "yes" || loaded.giftCardStatus === "no" ? loaded.giftCardStatus : "unknown"
    if (giftStatus !== storedGift) {
      // "Unknown" is an explicit RESET to not-researched, which the route models as null —
      // the same shape commission uses, and the only way a stored status goes back to unknown.
      out.giftCardStatus = giftStatus === "unknown" ? null : giftStatus
    }
    if (giftStatus === "yes") {
      // A confirmed offer always travels WITH its amount, even when the amount itself did not
      // change: the route validates the pair, and sending a bare "yes" would be rejected.
      if (giftAmount.trim() !== amountToInput(loaded.giftCardAmount) || "giftCardStatus" in out) {
        out.giftCardAmount = giftAmount.trim()
        if (!("giftCardStatus" in out)) out.giftCardStatus = "yes"
      }
    }

    if (wdIncluded !== (loaded.washerDryerIncluded ?? "")) out.washerDryerIncluded = wdIncluded
    if (wdConnections !== (loaded.washerDryerConnections ?? "")) out.washerDryerConnections = wdConnections
    for (const { key, field } of ATTRIBUTES) {
      const stored = loaded.attributes?.[key] === "yes" || loaded.attributes?.[key] === "no" ? loaded.attributes[key] : "unknown"
      if ((attrs[key] ?? "unknown") !== stored) out[field] = attrs[key]
    }
    if (landmark.trim() !== (loaded.nearbyLandmark ?? "")) out.nearbyLandmark = landmark.trim()
    if (crossStreets.trim() !== (loaded.crossStreets ?? "")) out.crossStreets = crossStreets.trim()
    return out
  }, [loaded, send, escort, bonus, specialChoice, specialDetails, giftStatus, giftAmount,
      wdIncluded, wdConnections, attrs, landmark, crossStreets, cleared])

  const dirty = Object.keys(changes).length > 0
  // "Yes" means a confirmed offer, and a confirmed offer has a value. Caught here so the locator
  // sees it next to the field instead of as a rejected field name after a round trip.
  const giftAmountNumber = Number(giftAmount.trim().replace(/[$,\s]/g, ""))
  const giftCardInvalid =
    giftStatus === "yes" && (!giftAmount.trim() || !Number.isFinite(giftAmountNumber) || giftAmountNumber <= 0)

  // ── CLOSING WITH UNSAVED WORK ───────────────────────────────────────────────────────────
  const requestClose = useCallback(() => {
    if (dirty && !window.confirm("Discard unsaved changes to this property?")) return
    onClose()
  }, [dirty, onClose])

  // Escape closes, through the same guard as the ✕ — a stray keypress must not lose an edit.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") requestClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, requestClose])

  // The browser's own guard, for a refresh or a tab close — which React cannot intercept.
  useEffect(() => {
    if (!open || !dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = "" }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [open, dirty])

  async function save() {
    if (!loaded || !dirty || saving || giftCardInvalid) return
    setSaving(true)
    setSaveError(null)
    try {
      const payload: Record<string, unknown> = { placeId: loaded.placeId, ...changes }
      if (source.trim()) payload.pricingSource = source.trim()
      const r = await fetch(ENDPOINT, {
        // PUT, matching the route's exported handler. It exports GET and PUT — a POST is a 405,
        // and that is exactly how this shipped broken once: the endpoint URL was asserted, the
        // VERB was not.
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      })
      const body = await r.json().catch(() => ({}))
      if (!r.ok) {
        // The route's own vocabulary, said plainly. conflict_retry is the one worth naming:
        // nothing was overwritten, and re-reading is the correct response.
        const code = String(body?.error ?? `http_${r.status}`)
        throw new Error(
          code === "conflict_retry" ? "Someone else saved this property while you were editing. Reopen it and try again — nothing was overwritten."
          : code === "bad_value" ? `Check these fields: ${(body?.fields ?? []).join(", ")}`
          : code === "property_not_found" ? "This property is not in the catalog yet, so there is nothing to update."
          : code,
        )
      }
      // Re-read rather than assume: the response says what was WRITTEN, and a field the writer
      // preserved must not be shown as saved.
      const fresh = await fetch(`${ENDPOINT}?placeId=${encodeURIComponent(loaded.placeId)}`).then((x) => x.json())
      setLoaded(fresh)
      hydrate(fresh)
      setSavedAt(Date.now())
      onSaved?.()
    } catch (e) {
      setSaveError(String((e as Error)?.message ?? e))
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null
  if (typeof document === "undefined") return null

  const field = "w-full rounded-lg border border-[var(--crm-border)] bg-[var(--crm-inset)] px-3 py-2 text-[13px] text-[var(--crm-text-primary)] outline-none focus:border-[var(--crm-accent)]"
  const label = "block text-[11px] font-semibold text-[var(--crm-text-secondary)] mb-1"
  const sectionTitle = "text-[13px] font-semibold text-[var(--crm-text-primary)]"

  const triControl = (value: Tri, onChange: (v: Tri) => void, name: string) => (
    <div className="flex gap-1" role="radiogroup" aria-label={name}>
      {(["yes", "no", "unknown"] as const).map((v) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={`flex-1 rounded-md border px-2 py-1 text-[11px] font-semibold capitalize transition ${
            value === v
              ? v === "yes"
                ? "border-emerald-500 bg-emerald-500/15 text-emerald-400"
                : v === "no"
                  ? "border-[var(--crm-border)] bg-[var(--crm-card)] text-[var(--crm-text-primary)]"
                  : "border-[var(--crm-border)] bg-[var(--crm-card)] text-[var(--crm-text-muted)]"
              : "border-[var(--crm-border-soft)] bg-transparent text-[var(--crm-text-muted)] hover:border-[var(--crm-border)]"
          }`}
        >
          {v === "unknown" ? "Unknown" : v}
        </button>
      ))}
    </div>
  )

  return createPortal(
    // The map stays visible and usable: this is a panel pinned to the right edge, NOT a modal
    // with a backdrop. No overlay intercepts clicks on the map behind it.
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Edit Property"
      className="fixed right-0 top-0 z-[70] flex h-full w-full max-w-[420px] flex-col border-l border-[var(--crm-border)] bg-[var(--crm-panel)] shadow-2xl sm:w-[420px]"
    >
      {/* HEADER — fixed, so Save and Cancel below are always reachable. */}
      <div className="flex items-center justify-between border-b border-[var(--crm-border)] px-4 py-3">
        <h2 className="text-[15px] font-semibold text-[var(--crm-text-primary)]">Edit Property</h2>
        <button
          type="button"
          onClick={requestClose}
          aria-label="Close"
          className="rounded-md p-1 text-[var(--crm-text-muted)] hover:bg-[var(--crm-card)] hover:text-[var(--crm-text-primary)]"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading && <p className="text-[12px] text-[var(--crm-text-muted)]">Loading property…</p>}
        {loadError && (
          <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">
            {loadError === "property_not_found"
              ? "This property is not in the catalog yet, so there is nothing to edit."
              : `Could not load this property: ${loadError}`}
          </p>
        )}

        {loaded && !loading && (
          <div className="space-y-5">
            {/* ── IDENTITY ───────────────────────────────────────────────────────────────
                Read-only on purpose. property_name and address are NOT in
                OWNER_CORRECTABLE_FIELDS, so an edit to a populated name would be refused by
                preserve-by-default and silently discarded. Showing an input that cannot save
                would be worse than showing the truth. */}
            <div className="flex gap-3">
              {/* The shared thumb takes src/alt/size only — the backup URL is the card's own
                  primary→backup→placeholder fallback and is not this component's contract. */}
              <div className="flex-none">
                <PropertyThumb src={loaded.imageUrl ?? loaded.imageUrlBackup} alt={loaded.propertyName ?? "Property"} size={64} />
              </div>
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold text-[var(--crm-text-primary)]">
                  {loaded.propertyName ?? "Unnamed property"}
                </p>
                {loaded.address && (
                  <p className="mt-0.5 text-[12px] text-[var(--crm-text-secondary)]">{loaded.address}</p>
                )}
                {typeof loaded.googleRating === "number" && (
                  <div className="mt-1 flex items-center gap-1">
                    <StarRating value={loaded.googleRating} />
                    <span className="text-[11px] text-[var(--crm-text-muted)]">{loaded.googleRating.toFixed(1)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* ── COMMISSION ─────────────────────────────────────────────────────────── */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className={sectionTitle}>Commission</h3>
                {/* DERIVED from provenance, never a stored flag — a flag keeps claiming
                    "verified" after the value under it changes. */}
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  loaded.commissionVerified?.send_commission
                    ? "bg-emerald-500/15 text-emerald-400"
                    : "bg-[var(--crm-card)] text-[var(--crm-text-muted)]"
                }`}>
                  {loaded.commissionVerified?.send_commission ? "Verified ✓" : "Not verified"}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {([
                  ["Send %", send, setSend, "sendCommission", loaded.sendCommission],
                  ["Escort %", escort, setEscort, "escortCommission", loaded.escortCommission],
                ] as const).map(([lbl, value, set, key, stored]) => (
                  <div key={key}>
                    <label className={label}>{lbl}</label>
                    <input
                      inputMode="decimal"
                      className={field}
                      value={cleared[key] ? "" : value}
                      placeholder="Unknown"
                      onChange={(e) => { set(e.target.value); setCleared((c) => ({ ...c, [key]: false })) }}
                    />
                    {stored !== null && !cleared[key] && (
                      <button
                        type="button"
                        onClick={() => { set(""); setCleared((c) => ({ ...c, [key]: true })) }}
                        className="mt-1 text-[10px] text-[var(--crm-text-muted)] hover:text-[var(--crm-text-primary)] hover:underline"
                      >
                        Clear to unknown
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div>
                <label className={label}>Agent Bonus ($)</label>
                <input
                  inputMode="decimal"
                  className={field}
                  value={cleared.bonusFlat ? "" : bonus}
                  placeholder="Unknown"
                  onChange={(e) => { setBonus(e.target.value); setCleared((c) => ({ ...c, bonusFlat: false })) }}
                />
                <p className="mt-1 text-[10px] text-[var(--crm-text-muted)]">
                  Paid to the locator. Separate from any resident gift card under Specials.
                </p>
              </div>
              <p className="text-[10px] text-[var(--crm-text-muted)]">
                Blank means nobody has checked. Enter 0 to record a confirmed no-pay property.
              </p>
            </section>

            {/* ── SPECIALS ───────────────────────────────────────────────────────────── */}
            <section className="space-y-3 border-t border-[var(--crm-border-soft)] pt-4">
              <h3 className={sectionTitle}>Specials</h3>
              <div>
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <label className={label} style={{ marginBottom: 0 }}>Move-In Special</label>
                  {/* AGE, NOT A GATE. Nothing is hidden by this — it is here so a locator
                      preparing recommendations can see at a glance what might need a phone
                      call. "Verified" only when provenance says the write was verified. */}
                  <span className="text-[10px] text-[var(--crm-text-muted)]">
                    {ageLabel({ at: loaded.currentSpecialCheckedAt, verified: loaded.fieldVerified?.current_special })}
                  </span>
                </div>
                <select className={field} value={specialChoice} onChange={(e) => setSpecialChoice(e.target.value)}>
                  {MOVE_IN_SPECIAL_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={label}>
                  {specialChoice === "custom" ? "Custom special" : "Additional details"}
                </label>
                <textarea
                  className={`${field} min-h-[60px]`}
                  value={specialDetails}
                  placeholder="Waived app + admin fees, 12-month lease"
                  onChange={(e) => setSpecialDetails(e.target.value)}
                />
                <p className="mt-1 text-[10px] text-[var(--crm-text-muted)]">
                  Kept alongside the dropdown — choosing an option never discards what is written here.
                </p>
              </div>
              <div>
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <label className={label} style={{ marginBottom: 0 }}>Gift Card</label>
                  <span className="text-[10px] text-[var(--crm-text-muted)]">
                    {ageLabel({ at: loaded.giftCardCheckedAt, verified: loaded.fieldVerified?.gift_card_status })}
                  </span>
                </div>
                {triControl(giftStatus, setGiftStatus, "Gift card")}
                <p className="mt-1 text-[10px] text-[var(--crm-text-muted)]">
                  Unknown means not researched. No is a confirmed finding, and clears any stored amount.
                </p>
              </div>
              {giftStatus === "yes" && (
                <div>
                  <label className={label}>Gift Card Amount ($)</label>
                  <input inputMode="decimal" className={field} value={giftAmount} placeholder="500"
                    onChange={(e) => setGiftAmount(e.target.value)} />
                  {giftCardInvalid && (
                    <p className="mt-1 text-[10px] text-amber-400">
                      A confirmed gift card needs an amount above $0. Choose No if the property does not offer one.
                    </p>
                  )}
                </div>
              )}

            </section>

            {/* ── AMENITIES ──────────────────────────────────────────────────────────── */}
            <section className="space-y-3 border-t border-[var(--crm-border-soft)] pt-4">
              <h3 className={sectionTitle}>Amenities / Features</h3>
              <div>
                <label className={label}>Washer / Dryer</label>
                <select className={field} value={wdIncluded} onChange={(e) => setWdIncluded(asCatalogWasherDryerIncluded(e.target.value) ?? "")}>
                  <option value="">Not verified</option>
                  {CATALOG_WD_INCLUDED_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className={label}>W/D Connections</label>
                <select className={field} value={wdConnections} onChange={(e) => setWdConnections(asCatalogWasherDryerConnections(e.target.value) ?? "")}>
                  <option value="">Not verified</option>
                  {CATALOG_WD_CONNECTIONS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              {ATTRIBUTES.map(({ key, label: lbl }) => (
                <div key={key}>
                  <label className={label}>{lbl}</label>
                  {triControl(attrs[key] ?? "unknown", (v) => setAttrs((a) => ({ ...a, [key]: v })), lbl)}
                </div>
              ))}
              <p className="text-[10px] text-[var(--crm-text-muted)]">
                Unknown leaves a recorded answer alone — it does not erase one.
              </p>
            </section>

            {/* ── LOCATION NOTES ─────────────────────────────────────────────────────── */}
            <section className="space-y-3 border-t border-[var(--crm-border-soft)] pt-4">
              <h3 className={sectionTitle}>Property Intelligence</h3>
              <div>
                <label className={label}>Nearby landmark</label>
                <input className={field} value={landmark} placeholder="Near Brooks City Base"
                  onChange={(e) => setLandmark(e.target.value)} />
              </div>
              <div>
                <label className={label}>Cross streets</label>
                <input className={field} value={crossStreets} placeholder="I-37 and Loop 410"
                  onChange={(e) => setCrossStreets(e.target.value)} />
              </div>
            </section>

            {/* ── SOURCE ─────────────────────────────────────────────────────────────── */}
            <section className="space-y-2 border-t border-[var(--crm-border-soft)] pt-4">
              <label className={label}>Source (optional)</label>
              <input className={field} value={source} placeholder="Called leasing office, Oct 24"
                onChange={(e) => setSource(e.target.value)} />
              <p className="text-[10px] text-[var(--crm-text-muted)]">
                With a source this save is recorded as verified; without one, as unverified. Either way it saves.
              </p>
            </section>
          </div>
        )}
      </div>

      {/* FOOTER — outside the scroll area, so Save and Cancel never scroll out of reach. */}
      <div className="border-t border-[var(--crm-border)] px-4 py-3">
        {saveError && (
          <p className="mb-2 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-[12px] text-red-300">{saveError}</p>
        )}
        {savedAt && !dirty && !saveError && (
          <p className="mb-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-300">
            Saved. The map card now shows these values.
          </p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={requestClose}
            className="flex-1 rounded-lg border border-[var(--crm-border)] px-4 py-2 text-[13px] font-semibold text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!dirty || saving || !loaded || giftCardInvalid}
            className="flex-1 rounded-lg bg-[var(--crm-accent)] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
