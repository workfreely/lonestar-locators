"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import PropertyThumb from "@/components/crm/PropertyThumb"
import { StarRating } from "@/components/crm/StarRating"
import { commissionToInput } from "@/components/crm/PropertyPricingEditor"
import DateTimePicker from "@/components/crm/DateTimePicker"
import {
  CATALOG_WD_INCLUDED_OPTIONS, CATALOG_WD_CONNECTIONS_OPTIONS,
  asCatalogWasherDryerIncluded, asCatalogWasherDryerConnections,
} from "@/lib/propertyIntel/washerDryerCatalog"
import { MOVE_IN_SPECIAL_OPTIONS, specialToSelection, selectionToSpecial } from "@/lib/propertyIntel/moveInSpecials"
import { ageLabel, updatedLabel, formatDayLabel } from "@/lib/propertyIntel/relativeAge"
import {
  APPROVAL_FIELDS, BROKEN_LEASE_STATUS_OPTIONS, EVICTION_STATUS_OPTIONS,
  BALANCE_REQUIREMENT_OPTIONS, POSITIVE_HISTORY_OPTIONS, approvalValueToInput, parseApprovalValue,
  groupHasStoredDetail, FELONY_POLICY_OPTIONS, MISDEMEANOR_POLICY_OPTIONS,
  LOOKBACK_BASIS_OPTIONS, OFFENSE_TYPE_OPTIONS, toggleOffenseType,
} from "@/lib/propertyIntel/approvalCriteria"

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
 * act: emptying a commission field sends null rather than a blank, and the gift card and the
 * approval criteria have "Unknown" as a real, selectable answer.
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
  /** CREDIT SCREENING. Null status = nobody asked; it is NOT "they don't check". */
  creditMinimumStatus: string | null
  creditMinimumScore: number | null
  creditObservedApprovalScore: number | null
  creditScreeningNotes: string | null
  creditScreeningCheckedAt: string | null
  giftCardAmount: number | null
  giftCardCheckedAt: string | null
  currentSpecialCheckedAt: string | null
  /** Per-field: did provenance record a VERIFICATION, or just a write? Decides whether the age
   *  line below reads "Verified" or "Updated". */
  fieldVerified: Record<string, boolean>
  /** Per-field: when provenance last recorded a write. The ONLY source for the approval fields'
   *  age lines — nothing stamps a column just because a save happened. */
  fieldCheckedAt: Record<string, string>
  /** False until the prepared screening migration is applied on this database. The panel says so
   *  rather than showing sixteen empty controls, which would read as "no requirements entered". */
  approvalAvailable: boolean
  /** False until the prepared CRIMINAL BACKGROUND migration is applied. Separate from the flag
   *  above on purpose: one unapplied migration must not hide the requirement fields that are
   *  already live, and vice versa. */
  criminalAvailable: boolean
  /** The approval columns as stored, keyed by COLUMN name. Empty when unavailable. */
  approval: Record<string, unknown>
  googleRating: number | null
  imageUrl: string | null
  imageUrlBackup: string | null
  nearbyLandmark: string | null
  crossStreets: string | null
  attributes: Record<string, string>
  /** Per-commission-field: an authenticated owner typed this value here, and it is still stored. */
  commissionVerified: Record<string, boolean>
  /** The section's own answer: at least one commission field has a value and every valued one was
   *  owner-entered. Derived in the route from provenance plus the stored row, never a flag. */
  commissionAgentVerified: boolean
  /** When an agent last entered a commission here. Verified says WHO, not HOW FRESH. */
  commissionCheckedAt: string | null
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
  // CREDIT SCREENING. "" is the unknown state and is what the dropdown shows when nobody has
  // asked; selecting it on a property that HAS a stored minimum is the deliberate clear.
  const [creditStatus, setCreditStatus] = useState("")
  const [creditScore, setCreditScore] = useState("")
  const [creditObserved, setCreditObserved] = useState("")
  const [creditNotes, setCreditNotes] = useState("")
  const [wdIncluded, setWdIncluded] = useState("")
  const [wdConnections, setWdConnections] = useState("")
  const [attrs, setAttrs] = useState<Record<string, Tri>>({})
  const [landmark, setLandmark] = useState("")
  const [crossStreets, setCrossStreets] = useState("")
  // APPROVAL CRITERIA, as one record keyed by the payload key. One state for sixteen fields is
  // not a shortcut: it is what lets the change set, the validation and the hydrate below iterate
  // the SAME list the route validates against, so a field cannot be added to one and missed by
  // another. Every value is the string the control shows, and "" is the unknown state throughout.
  const [approval, setApproval] = useState<Record<string, string>>({})
  const [source, setSource] = useState("")
  /** Is the leasing-office confirmation calendar open? Purely presentational — the value itself
   *  lives in `approval`, exactly as it did under the native input. */
  const [dateOpen, setDateOpen] = useState(false)

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
    setCreditStatus(d.creditMinimumStatus === "reported_minimum" || d.creditMinimumStatus === "no_check_reported" ? d.creditMinimumStatus : "")
    setCreditScore(d.creditMinimumScore === null ? "" : String(d.creditMinimumScore))
    setCreditObserved(d.creditObservedApprovalScore === null ? "" : String(d.creditObservedApprovalScore))
    setCreditNotes(d.creditScreeningNotes ?? "")
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
    {
      const a: Record<string, string> = {}
      for (const [key, spec] of Object.entries(APPROVAL_FIELDS)) {
        a[key] = approvalValueToInput(d.approval?.[spec.column])
      }
      setApproval(a)
    }
    setSource("")
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
      const now = value.trim()
      if (now === commissionToInput(stored)) continue
      // EMPTIED ON PURPOSE TRAVELS AS NULL.
      //
      // The route reads a blank string as "leave it alone" — that is what makes a blank rent
      // safe — so with the Clear button gone, deleting the number by hand would have looked
      // like it worked and quietly changed nothing. An emptied field now sends exactly the
      // payload the button used to send, down the same ownerClear path the writer already has.
      //
      // An explicit 0 is untouched by this: "0" is not "", so it travels as a value and is
      // written as a confirmed zero. Blank and 0 stay different all the way to the column.
      out[key] = now === "" ? null : now
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

    // ── CREDIT SCREENING ──────────────────────────────────────────────────
    // Each piece travels only when it changed, and "" always means the unknown/absent state the
    // route models as null. The score rides along with a 'reported_minimum' status even when the
    // number itself did not change, because the route validates the pair and would reject a
    // bare status — the same rule the gift card follows above.
    const storedCreditStatus = loaded.creditMinimumStatus === "reported_minimum" || loaded.creditMinimumStatus === "no_check_reported"
      ? loaded.creditMinimumStatus : ""
    if (creditStatus !== storedCreditStatus) out.creditMinimumStatus = creditStatus === "" ? null : creditStatus
    if (creditStatus === "reported_minimum") {
      const storedScore = loaded.creditMinimumScore === null ? "" : String(loaded.creditMinimumScore)
      if (creditScore.trim() !== storedScore || "creditMinimumStatus" in out) {
        out.creditMinimumScore = creditScore.trim()
        if (!("creditMinimumStatus" in out)) out.creditMinimumStatus = "reported_minimum"
      }
    }
    {
      const storedObserved = loaded.creditObservedApprovalScore === null ? "" : String(loaded.creditObservedApprovalScore)
      if (creditObserved.trim() !== storedObserved) out.creditObservedApprovalScore = creditObserved.trim() === "" ? null : creditObserved.trim()
    }
    if (creditNotes.trim() !== (loaded.creditScreeningNotes ?? "")) out.creditScreeningNotes = creditNotes.trim()

    if (wdIncluded !== (loaded.washerDryerIncluded ?? "")) out.washerDryerIncluded = wdIncluded
    if (wdConnections !== (loaded.washerDryerConnections ?? "")) out.washerDryerConnections = wdConnections
    for (const { key, field } of ATTRIBUTES) {
      const stored = loaded.attributes?.[key] === "yes" || loaded.attributes?.[key] === "no" ? loaded.attributes[key] : "unknown"
      if ((attrs[key] ?? "unknown") !== stored) out[field] = attrs[key]
    }
    if (landmark.trim() !== (loaded.nearbyLandmark ?? "")) out.nearbyLandmark = landmark.trim()
    if (crossStreets.trim() !== (loaded.crossStreets ?? "")) out.crossStreets = crossStreets.trim()

    // ── APPROVAL CRITERIA ───────────────────────────────────────────────────────────────
    // Compared against what was STORED, so a field the agent never touched is absent from the
    // payload and cannot be rewritten — which is also why a field hidden by a conditional keeps
    // its value: its state still holds what was loaded, so it compares equal and is not sent.
    //
    // A field the agent EMPTIED is sent as "", which the route reads as the deliberate clear back
    // to unknown. Those two cases are distinguishable here and nowhere else, which is why the
    // comparison lives in the same place the payload is built.
    for (const [key, spec] of Object.entries(APPROVAL_FIELDS)) {
      // Gated per GROUP, by the same two facts the panel renders from. Sending a field whose
      // column does not exist yet would earn a 409 for the whole save, including the fields that
      // would have landed.
      const live = spec.group === "criminal" ? loaded.criminalAvailable : loaded.approvalAvailable
      if (!live) continue
      const stored = approvalValueToInput(loaded.approval?.[spec.column])
      const now = (approval[key] ?? "").trim()
      if (now !== stored) out[key] = now
    }
    return out
  }, [loaded, send, escort, bonus, specialChoice, specialDetails, giftStatus, giftAmount,
      creditStatus, creditScore, creditObserved, creditNotes,
      wdIncluded, wdConnections, attrs, landmark, crossStreets, approval])

  const dirty = Object.keys(changes).length > 0
  // "Yes" means a confirmed offer, and a confirmed offer has a value. Caught here so the locator
  // sees it next to the field instead of as a rejected field name after a round trip.
  const giftAmountNumber = Number(giftAmount.trim().replace(/[$,\s]/g, ""))
  const giftCardInvalid =
    giftStatus === "yes" && (!giftAmount.trim() || !Number.isFinite(giftAmountNumber) || giftAmountNumber <= 0)
  /** A score outside 300–850, or missing under a reported minimum. Mirrors the route's own rule
   *  and the database CHECK, so the agent sees it here instead of as a rejected field name. */
  const scoreOutOfRange = (v: string) => {
    const t = v.trim()
    if (t === "") return false
    const n = Number(t)
    return !Number.isInteger(n) || n < 300 || n > 850
  }
  const creditScoreInvalid =
    scoreOutOfRange(creditScore) || (creditStatus === "reported_minimum" && !creditScore.trim())
  const creditObservedInvalid = scoreOutOfRange(creditObserved)
  /**
   * APPROVAL CRITERIA, validated against the SAME parser the route uses.
   *
   * Not a second rule written to resemble the first — literally the same function, so a value the
   * route would reject cannot pass here, and the agent sees the problem beside the field instead
   * of as a field name in an error after a round trip.
   */
  const approvalErrors = useMemo(() => {
    const out: Record<string, boolean> = {}
    for (const [key, spec] of Object.entries(APPROVAL_FIELDS)) {
      const v = (approval[key] ?? "").trim()
      if (v === "") continue // blank is the clear back to unknown, and is always valid
      out[key] = "bad" in parseApprovalValue(spec.kind, v)
    }
    return out
  }, [approval])
  const approvalInvalid = Object.values(approvalErrors).some(Boolean)
  /** The gift card's rule, applied to credit and to the approval criteria: a field the route
   *  would REJECT must not be savable, or the save reports success while the value silently
   *  never lands. */
  const blockSave = giftCardInvalid || creditScoreInvalid || creditObservedInvalid || approvalInvalid

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
    if (!loaded || !dirty || saving || blockSave) return
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
  /** A GROUP inside a section — Credit Score, Broken Lease, Eviction… One step below a section
   *  heading on purpose: Approval Criteria is ONE section, not six. */
  const groupTitle = "text-[11px] font-bold uppercase tracking-wide text-[var(--crm-text-secondary)]"

  /** A field's age line, read from PROVENANCE. No approval column is stamped by a save, so this
   *  is the only honest answer to "when was this entered?" — and it says "Verified" only when
   *  provenance says a source was supplied. */
  const ageFor = (column: string) =>
    updatedLabel({ at: loaded?.fieldCheckedAt?.[column] ?? null, verified: loaded?.fieldVerified?.[column] })

  /** The commission columns in the panel's own words, in the order the row shows them. */
  const COMMISSION_LABELS: [column: string, word: string][] = [
    ["send_commission", "Send"],
    ["escort_commission", "Escort"],
    ["bonus_flat", "Bonus"],
  ]
  /** Which of the three the "Verified" pill actually covers. The pill sits over three boxes, and a
   *  property with only a Send rate entered must not be read as a claim about the two empty ones —
   *  so the pill's own title names them, and each field carries its own tick below. */
  const verifiedFields = COMMISSION_LABELS
    .filter(([column]) => loaded?.commissionVerified?.[column])
    .map(([, word]) => word)

  /**
   * THERE IS NO NATIVE DATE INPUT IN THIS PANEL ANY MORE.
   *
   * The one date field here — the leasing-office confirmation — now opens the CRM's own calendar
   * (components/crm/DateTimePicker, the Add Task / Reschedule / Get Invoice Details picker) in
   * `dateOnly` mode, triggered by a button that fills the field. Three separate problems go away
   * with the native control, and all three were really one problem:
   *
   *   • globals.css carries a legacy marketing rule keyed on `input[type="date"]`, which outranks
   *     a utility class and rendered this control half again as tall as its neighbours;
   *   • a second rule stretched ::-webkit-calendar-picker-indicator across the whole field, which
   *     is why a white calendar glyph sat over the date instead of beside it;
   *   • the browser draws a native date picker in the TOP LAYER, outside the page's stacking
   *     context, so no z-index or overflow rule on this panel could contain it.
   *
   * Only a small part of the native field opened its calendar, too. A button opens it from
   * anywhere inside, which is what was asked for. PropertyPricingEditor — the pencil editor on a
   * Recommended Properties card — already did exactly this for its own "Date checked" field, so
   * this is the existing pattern rather than a new one, and globals.css is untouched.
   */

  const setA = (key: string, v: string) => setApproval((a) => ({ ...a, [key]: v }))

  /** One approval dropdown. "" is always the first option and always means UNKNOWN. */
  const aSelect = (key: string, lbl: string, options: { value: string; label: string }[], note?: string) => (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <label className={label} style={{ marginBottom: 0 }}>{lbl}</label>
        <span className="text-[10px] text-[var(--crm-text-muted)]">{ageFor(APPROVAL_FIELDS[key].column)}</span>
      </div>
      <select className={field} value={approval[key] ?? ""} onChange={(e) => setA(key, e.target.value)}>
        {options.map((o) => <option key={o.value || "unknown"} value={o.value}>{o.label}</option>)}
      </select>
      {note && <p className="mt-1 text-[10px] leading-snug text-[var(--crm-text-muted)]">{note}</p>}
    </div>
  )

  /** One approval input. The warning under it is the SAME parser the route runs, so a value that
   *  would be rejected is named here instead of after a round trip. */
  const aInput = (key: string, lbl: string, placeholder: string, mode: "numeric" | "decimal" | "text", bad: string, note?: string) => (
    <div>
      <label className={label}>{lbl}</label>
      {/* NO `type` AT ALL. Declaring type="text" is what pulled these inputs into the legacy
          global form rule in globals.css and made them taller than the rest of the panel; omitting
          it matches every other input here, and text is the default anyway. There is no date mode:
          the one date field uses the shared calendar, above. */}
      <input
        inputMode={mode === "text" ? undefined : mode}
        className={field}
        value={approval[key] ?? ""}
        placeholder={placeholder}
        onChange={(e) => setA(key, e.target.value)}
      />
      {approvalErrors[key] ? (
        <p className="mt-1 text-[10px] text-amber-400">{bad}</p>
      ) : note ? (
        <p className="mt-1 text-[10px] leading-snug text-[var(--crm-text-muted)]">{note}</p>
      ) : null}
    </div>
  )

  /** Should a group's DETAIL fields be shown?
   *
   *  Hidden under "Not accepted", where an age or a balance rule is moot — unless something is
   *  already stored in them. A hidden field keeps its value either way (the panel only sends what
   *  changed), but hiding a stored requirement would leave the agent unable to see or correct it,
   *  which is its own kind of loss. So stored data always wins over the tidier layout. */
  const showDetail = (statusKey: string, columns: string[], closed = "not_accepted") =>
    (approval[statusKey] ?? "") !== closed ||
    groupHasStoredDetail(columns.map((c) => loaded?.approval?.[c]))

  /** The offense categories, as toggles.
   *
   *  A SET, not a dropdown: an office that says "nothing assault related, no sex offenses" has
   *  named two restrictions, and a single-select would make the second erase the first. Nothing
   *  selected is UNKNOWN — it is never stored as "no categories are restricted", which is a
   *  different claim and one nobody made. */
  const offenseChips = (key: string) => {
    const current = approval[key] ?? ""
    const on = new Set(current.split(",").filter(Boolean))
    return (
      <div>
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <label className={label} style={{ marginBottom: 0 }}>Offense types restricted</label>
          <span className="text-[10px] text-[var(--crm-text-muted)]">{ageFor(APPROVAL_FIELDS[key].column)}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {OFFENSE_TYPE_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              aria-pressed={on.has(o.value)}
              onClick={() => setA(key, toggleOffenseType(current, o.value))}
              className={`rounded-md border px-2 py-1 text-[11px] font-semibold transition ${
                on.has(o.value)
                  ? "border-[var(--crm-accent)] bg-[var(--crm-accent)]/15 text-[var(--crm-text-primary)]"
                  : "border-[var(--crm-border-soft)] bg-transparent text-[var(--crm-text-muted)] hover:border-[var(--crm-border)]"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
    )
  }

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
                {/* AGENT-VERIFIED MEANS AN AGENT ENTERED IT.
                    It used to require a supporting source in the Source box as well, so a rate the
                    owner had just typed came back "Not verified" — the editor calling its own
                    author an unreliable witness. The route now derives this from whether an
                    authenticated owner wrote the value HERE (provenance source_type
                    manual_verified, the only way a commission can be written at all) and whether a
                    value is still stored. Still grey, deliberately: a commission with no
                    provenance, one whose last write came from a bulk import, and one with no value.

                    Derived per read, never a stored flag — a flag keeps claiming "verified" after
                    the value under it changes. The green is the commission green the map card's own
                    chip uses (CommissionBadge), so one colour means "a locator established this"
                    wherever a commission is shown. */}
                <span
                  // VERIFIED SAYS WHO, NOT HOW FRESH, AND IT SAYS WHAT IT COVERS. A rate entered a
                  // year ago is the one most worth re-checking, and a pill that reads "Verified"
                  // over a row where two of the three boxes are empty must not be read as a claim
                  // about the empty ones. The title names the fields it actually covers; the ticks
                  // beside the labels below show the same thing without a hover.
                  title={
                    loaded.commissionAgentVerified
                      ? `${verifiedFields.join(" and ")} entered in this editor${loaded.commissionCheckedAt ? ` · ${formatDayLabel(loaded.commissionCheckedAt.slice(0, 10))}` : ""}`
                      : "Nobody has entered a commission here yet"
                  }
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                    loaded.commissionAgentVerified
                      ? "border-[#1e5235] bg-[#0f2a1d] text-[#4ade80]"
                      : "border-transparent bg-[var(--crm-card)] text-[var(--crm-text-muted)]"
                  }`}
                >
                  {loaded.commissionAgentVerified ? "Verified" : "Not verified"}
                </span>
              </div>
              {/* THREE ACROSS. Send, Escort and Bonus are one answer about one property, and
                  stacking the bonus under the other two pushed everything below it down a row for
                  no reason. The controls themselves are unchanged: same state, same placeholder,
                  same blank-versus-zero rule, same columns. */}
              {/* THE TICK IS PER FIELD, BECAUSE THE PROVENANCE IS PER FIELD.
                  Send, Escort and Bonus each carry their own provenance row, and one of them being
                  agent-entered says nothing about the other two. A single pill above three boxes
                  could be read as a claim about all three — so each field that an agent actually
                  entered carries its own mark, and a field nobody has entered carries none and
                  shows "Unknown" in the box. The route already returned `commissionVerified` per
                  field; this is the panel finally showing it.

                  A BLANK FIELD NEVER GETS A TICK, because the route requires a stored value as well
                  as owner provenance — which is the same rule that stops an absence being read as a
                  confirmed zero everywhere else in this panel. */}
              <div className="grid grid-cols-3 gap-2">
                {([
                  ["Send %", send, setSend, "sendCommission", "send_commission"],
                  ["Escort %", escort, setEscort, "escortCommission", "escort_commission"],
                  ["Bonus ($)", bonus, setBonus, "bonusFlat", "bonus_flat"],
                ] as const).map(([lbl, value, set, key, column]) => (
                  <div key={key}>
                    {/* THE TICK SITS AGAINST ITS OWN LABEL, NOT AT THE EDGE OF THE CELL.
                        Pushed right in a ~120px column it landed a few pixels from the NEXT
                        field's label and read as a mark on that one — the precise misreading this
                        is here to prevent. `justify-start` keeps it as "Send % ✓". */}
                    <div className="mb-1 flex items-baseline gap-1">
                      <label className={label} style={{ marginBottom: 0 }}>{lbl}</label>
                      {loaded.commissionVerified?.[column] && (
                        <span
                          title={`Entered in this editor${loaded.commissionCheckedAt ? ` · ${formatDayLabel(loaded.commissionCheckedAt.slice(0, 10))}` : ""}`}
                          className="flex-none text-[10px] leading-none text-[#4ade80]"
                        >
                          <span aria-hidden="true">✓</span>
                          <span className="sr-only">entered by an agent</span>
                        </span>
                      )}
                    </div>
                    {/* NO CLEAR BUTTON. Selecting the value and deleting it does the same job,
                        and the change set above turns an emptied field into the explicit null the
                        button used to send. `stored` and `clearable` are gone with it. */}
                    <input
                      inputMode="decimal"
                      className={field}
                      value={value}
                      placeholder="Unknown"
                      onChange={(e) => set(e.target.value)}
                    />
                  </div>
                ))}
              </div>
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
              </div>
              <div>
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <label className={label} style={{ marginBottom: 0 }}>Gift Card</label>
                  <span className="text-[10px] text-[var(--crm-text-muted)]">
                    {ageLabel({ at: loaded.giftCardCheckedAt, verified: loaded.fieldVerified?.gift_card_status })}
                  </span>
                </div>
                {triControl(giftStatus, setGiftStatus, "Gift card")}
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

            {/* ── APPROVAL CRITERIA ──────────────────────────────────────────────────────
                Directly below Property Intelligence, in the SAME panel. One section with six
                compact groups — not a tab, not a modal, not a second editor.

                INTERNAL ONLY. Nothing here reaches a client page: lb_resolve_client_recommendations
                does not select these columns, which is a guarantee rather than a rule anyone has
                to remember.

                NOT A PROMISE. Every value is what a leasing office is REPORTED to accept. The
                heading says so, the labels say "reported", and whether an office itself confirmed
                it is a separate fact carried by provenance and by one explicit date at the end. */}
            <section className="space-y-4 border-t border-[var(--crm-border-soft)] pt-4">
              <h3 className={sectionTitle}>
                Approval Criteria <span className="font-normal text-[10px] text-[var(--crm-text-muted)]">· internal only</span>
              </h3>
              <p className="text-[10px] leading-snug text-[var(--crm-text-muted)]">
                What a property is reported to accept. Blank means Unknown, never No.
              </p>

              {/* The structured columns live in a prepared, UNAPPLIED migration. Saying so beats
                  showing a dozen empty controls, which would read as "no requirements entered". */}
              {!loaded.approvalAvailable && (
                <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] leading-snug text-amber-600 dark:text-amber-400">
                  The structured requirement fields are not on this database yet — the prepared
                  migration has not been applied. Credit Score and Additional Approval Notes below
                  still save normally, and nothing you enter there is affected.
                </p>
              )}

              {/* ── CREDIT SCORE ─────────────────────────────────────────────────────────
                  The five columns that already ship, moved here unchanged rather than duplicated.
                  Same state, same payload keys, same validation. */}
              <div className="space-y-3">
                <h4 className={groupTitle}>Credit Score</h4>
                <div>
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <label className={label} style={{ marginBottom: 0 }}>Minimum Credit Score</label>
                    <span className="text-[10px] text-[var(--crm-text-muted)]">{ageFor("credit_minimum_status")}</span>
                  </div>
                  <select className={field} value={creditStatus} onChange={(e) => setCreditStatus(e.target.value)}>
                    <option value="">Unknown</option>
                    <option value="reported_minimum">Reported minimum score…</option>
                    <option value="no_check_reported">No credit check reported</option>
                  </select>
                  <p className="mt-1 text-[10px] leading-snug text-[var(--crm-text-muted)]">
                    Unknown is not the same as an office telling us they do not score credit.
                  </p>
                </div>
                {creditStatus === "reported_minimum" && (
                  <div>
                    <label className={label}>Reported Minimum (300–850)</label>
                    <input inputMode="numeric" className={field} value={creditScore} placeholder="550"
                      onChange={(e) => setCreditScore(e.target.value)} />
                    {creditScoreInvalid && (
                      <p className="mt-1 text-[10px] text-amber-400">
                        A reported minimum needs a whole number between 300 and 850. Choose Unknown if the office would not say.
                      </p>
                    )}
                  </div>
                )}
                <div>
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    {/* HISTORY, NOT POLICY — and a separate column (credit_observed_approval_score)
                        from the reported minimum above it. The two are never combined: one is what
                        the office says it requires, the other is what somebody was actually
                        approved with. The range moved into the line underneath to keep the two
                        labels readable side by side. */}
                    <label className={label} style={{ marginBottom: 0 }}>Lowest Previously Approved</label>
                    <span className="text-[10px] text-[var(--crm-text-muted)]">{ageFor("credit_observed_approval_score")}</span>
                  </div>
                  <input inputMode="numeric" className={field} value={creditObserved} placeholder="450"
                    onChange={(e) => setCreditObserved(e.target.value)} />
                  {creditObservedInvalid ? (
                    <p className="mt-1 text-[10px] text-amber-400">A whole number between 300 and 850, or blank.</p>
                  ) : (
                    <p className="mt-1 text-[10px] leading-snug text-[var(--crm-text-muted)]">
                      A score somebody was actually approved with, 300–850. Kept apart from the minimum on purpose —
                      one approval is not a policy, and recording it as one would send the next renter wrong.
                    </p>
                  )}
                </div>
              </div>

              {loaded.approvalAvailable && (
                <>
                  {/* ── BROKEN LEASE ───────────────────────────────────────────────────── */}
                  <div className="space-y-3 border-t border-[var(--crm-border-soft)] pt-3">
                    <h4 className={groupTitle}>Broken Lease</h4>
                    {aSelect("brokenLeaseStatus", "Policy", BROKEN_LEASE_STATUS_OPTIONS)}
                    {showDetail("brokenLeaseStatus", [
                      "broken_lease_min_age_years", "broken_lease_balance_requirement",
                      "broken_lease_max_balance", "broken_lease_positive_history_required",
                    ]) && (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          {aInput("brokenLeaseMinAgeYears", "Minimum age (years)", "3", "numeric",
                            "A whole number of years, 0–20.")}
                          {aInput("brokenLeaseMaxBalance", "Max balance ($)", "2000", "decimal",
                            "A dollar amount, or blank for no known ceiling.")}
                        </div>
                        {aSelect("brokenLeaseBalanceRequirement", "Outstanding balance", BALANCE_REQUIREMENT_OPTIONS)}
                        {aSelect("brokenLeasePositiveHistoryRequired", "Rental history afterward", POSITIVE_HISTORY_OPTIONS)}
                      </>
                    )}
                  </div>

                  {/* ── EVICTION ───────────────────────────────────────────────────────────
                      Separate from the broken lease throughout: separate status, separate age,
                      separate balance rule. A property may accept one and refuse the other. */}
                  <div className="space-y-3 border-t border-[var(--crm-border-soft)] pt-3">
                    <h4 className={groupTitle}>Eviction</h4>
                    {aSelect("evictionStatus", "Policy", EVICTION_STATUS_OPTIONS,
                      "Anything conditional on something other than the balance belongs in the notes.")}
                    {showDetail("evictionStatus", [
                      "eviction_min_age_years", "eviction_balance_requirement", "eviction_positive_history_required",
                    ]) && (
                      <>
                        {aInput("evictionMinAgeYears", "Minimum age (years)", "5", "numeric",
                          "A whole number of years, 0–20.")}
                        {aSelect("evictionBalanceRequirement", "Outstanding balance", BALANCE_REQUIREMENT_OPTIONS)}
                        {aSelect("evictionPositiveHistoryRequired", "Rental history afterward", POSITIVE_HISTORY_OPTIONS)}
                      </>
                    )}
                  </div>

                </>
              )}

              {/* ── CRIMINAL BACKGROUND ─────────────────────────────────────────────────────
                  DIRECTLY BENEATH EVICTION, in the same section, with the same controls and the
                  same save. Its own availability flag, because it is its own prepared migration:
                  a database without it still shows and saves everything above.

                  WHAT THIS GROUP IS. Nine columns describing what a PROPERTY will consider —
                  seven of them named exactly as property_approval_policy names them, so the
                  proposed backfill is a column-to-column copy and one reader understands both.

                  WHAT IT IS NOT. It says nothing about any renter, and nothing here feeds
                  matching: Quick Match does not read these columns, by omission rather than by a
                  flag. "Considered" is not approval, "Case-by-Case" is not a soft no, and a
                  charge is not a conviction — which is why the lookback carries its own basis
                  instead of assuming one. */}
              {!loaded.criminalAvailable && (
                <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] leading-snug text-amber-600 dark:text-amber-400">
                  The criminal-background fields are not on this database yet — their prepared
                  migration has not been applied.
                </p>
              )}

              {loaded.criminalAvailable && (
                <div className="space-y-3 border-t border-[var(--crm-border-soft)] pt-3">
                  <h4 className={groupTitle}>Criminal Background</h4>
                  <div className="grid grid-cols-2 gap-3">
                    {aSelect("felonyPolicy", "Felony policy", FELONY_POLICY_OPTIONS)}
                    {aSelect("misdemeanorPolicy", "Misdemeanor policy", MISDEMEANOR_POLICY_OPTIONS)}
                  </div>
                  {/* Hidden only when BOTH policies are Not Considered, and never when something
                      is already stored — a lookback entered before the policy was tightened is
                      still a fact, and hiding it would leave it uncorrectable. */}
                  {(showDetail("felonyPolicy", [
                      "felony_min_age_years", "felony_restrictions", "criminal_lookback_basis",
                      "criminal_restricted_offense_types",
                    ], "not_considered") ||
                    showDetail("misdemeanorPolicy", [
                      "misdemeanor_min_age_years", "misdemeanor_restrictions",
                    ], "not_considered")) && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        {aInput("felonyMinAgeYears", "Felony minimum age (years)", "7", "numeric",
                          "A whole number of years, 0–20.")}
                        {aInput("misdemeanorMinAgeYears", "Misdemeanor minimum age (years)", "3", "numeric",
                          "A whole number of years, 0–20.")}
                      </div>
                      {aSelect("criminalLookbackBasis", "Lookback measured from", LOOKBACK_BASIS_OPTIONS)}
                      {offenseChips("criminalRestrictedOffenseTypes")}
                      <div className="grid grid-cols-2 gap-3">
                        {aInput("felonyRestrictions", "Felony restrictions", "Nothing assault related", "text",
                          "Up to 300 characters.")}
                        {aInput("misdemeanorRestrictions", "Misdemeanor restrictions", "No time frame, case by case", "text",
                          "Up to 300 characters.")}
                      </div>
                    </>
                  )}
                  <div>
                    <div className="mb-1 flex items-baseline justify-between gap-2">
                      <label className={label} style={{ marginBottom: 0 }}>Background notes</label>
                      <span className="text-[10px] text-[var(--crm-text-muted)]">{ageFor("background_screening_notes")}</span>
                    </div>
                    <textarea
                      className={`${field} min-h-[64px]`}
                      value={approval.backgroundScreeningNotes ?? ""}
                      placeholder="Exceptions, corporate review, who said so."
                      onChange={(e) => setA("backgroundScreeningNotes", e.target.value)}
                    />
                    {approvalErrors.backgroundScreeningNotes && (
                      <p className="mt-1 text-[10px] text-amber-400">Up to 4,000 characters.</p>
                    )}
                  </div>
                </div>
              )}

              {loaded.approvalAvailable && (
                <>
                  {/* ── RENTAL DEBT — REMOVED FROM THE PANEL, NOT FROM THE RECORD ────────
                      The group duplicated the broken-lease answer in day-to-day use, so it is no
                      longer drawn. Nothing else changed:

                        • rental_debt_status, rental_debt_balance_requirement and
                          rental_debt_max_balance are still columns, still in APPROVAL_FIELDS,
                          still owner-only and still firewalled from enrichment;
                        • hydrate still loads whatever they hold, so a stored value is carried in
                          this panel's state and compared on every save;
                        • BECAUSE it is compared and never edited, it always equals what is
                          stored, so it is never put in the payload — which is precisely why
                          removing the controls cannot clear anybody's data;
                        • the route, the writer and Quick Match read them exactly as before.

                      Restoring the group is re-adding the three lines that drew it. */}

                  {/* ── DEPOSITS & RISK FEES ───────────────────────────────────────────────
                      SCREENING charges, in their own owner-controlled columns. Deliberately NOT
                      deposit_amount / deposit_range: those are the property's standard deposit and
                      automated enrichment may write them from a marketing page, which would put a
                      screening condition outside the firewall protecting every value above.

                      Free text, because a risk fee is quoted as a range, or as a month's rent, or
                      with the condition that decides whether it applies at all. */}
                  <div className="space-y-3 border-t border-[var(--crm-border-soft)] pt-3">
                    <h4 className={groupTitle}>Deposits &amp; Risk Fees</h4>
                    {aInput("screeningAdditionalDeposit", "Additional / conditional deposit", "One month, nonrefundable", "text",
                      "Up to 300 characters.")}
                    {aInput("screeningRiskFee", "Risk fee", "$250–$500 depending on score", "text",
                      "Up to 300 characters.")}
                    {aInput("screeningGuarantorProgram", "Guarantor / co-signer program", "Liberty Rent accepted", "text",
                      "Up to 300 characters.")}
                  </div>
                </>
              )}

              {/* ── ADDITIONAL APPROVAL NOTES ───────────────────────────────────────────────
                  THE SAME credit_screening_notes field the November screening batch was entered
                  into, for 43 properties. Relabelled, not replaced: the existing text is loaded
                  here verbatim and is never touched unless you edit it. */}
              <div className="space-y-3 border-t border-[var(--crm-border-soft)] pt-3">
                <h4 className={groupTitle}>Additional Approval Notes</h4>
                <div>
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <label className={label} style={{ marginBottom: 0 }}>Conditions and exceptions</label>
                    <span className="text-[10px] text-[var(--crm-text-muted)]">{ageFor("credit_screening_notes")}</span>
                  </div>
                  <textarea className={`${field} min-h-[96px]`} value={creditNotes}
                    placeholder="Case-by-case above $5,000. Corporate review for recent incidents. Who said so, and when."
                    onChange={(e) => setCreditNotes(e.target.value)} />
                  <p className="mt-1 text-[10px] leading-snug text-[var(--crm-text-muted)]">
                    Keep conflicting reports rather than picking one. Never shown to clients.
                  </p>
                </div>
                {/* CONFIRMED WITH THE LEASING OFFICE — the one date in this panel, and the one
                    piece of information here that is not agent-reported.

                    THE DISTINCTION IS STILL IN THE DATABASE, and it has not moved: blank means
                    agent-reported, a date means an office confirmed it, and nothing stamps this
                    column because a save happened. The route has no code that fills it in, which is
                    what guarantees an ordinary save cannot claim a confirmation nobody obtained;
                    the sentence that used to explain that under the control is gone, not the rule.

                    The whole field opens the calendar. The ✕ is how a date gets taken back off —
                    it sends "" and the route's own vocabulary turns that into NULL (unknown), so
                    clearing survives the round trip exactly as it did before. */}
                {loaded.approvalAvailable && (() => {
                  const picked = approval.screeningRequirementsCheckedAt ?? ""
                  return (
                    <div>
                      <div className="mb-1 flex items-baseline justify-between gap-2">
                        <label className={label} style={{ marginBottom: 0 }}>Confirmed with leasing office on</label>
                        <span className="text-[10px] text-[var(--crm-text-muted)]">
                          {ageFor(APPROVAL_FIELDS.screeningRequirementsCheckedAt.column)}
                        </span>
                      </div>
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setDateOpen((v) => !v)}
                          aria-expanded={dateOpen}
                          className={`${field} flex items-center justify-between gap-2 text-left ${picked ? "pr-9" : ""}`}
                        >
                          <span className={picked ? "tabular-nums" : "text-[var(--crm-text-muted)]"}>
                            {picked ? formatDayLabel(picked) : "Select date"}
                          </span>
                          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 flex-none text-[var(--crm-text-muted)]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                            <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
                          </svg>
                        </button>
                        {picked && (
                          <button
                            type="button"
                            onClick={() => { setA("screeningRequirementsCheckedAt", ""); setDateOpen(false) }}
                            aria-label="Clear the leasing office confirmation date"
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded px-1.5 py-0.5 text-[11px] leading-none text-[var(--crm-text-muted)] hover:bg-[var(--crm-card)] hover:text-[var(--crm-text-primary)]"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                      {/* IN NORMAL FLOW, FULL WIDTH, BELOW the field — the same choice
                          PropertyPricingEditor made. In flow it pushes the panel taller instead of
                          covering the controls under it, and the panel's own scroll keeps Save and
                          Cancel reachable. */}
                      {dateOpen && (
                        <DateTimePicker
                          value={picked}
                          dateOnly
                          onApply={(v) => { setA("screeningRequirementsCheckedAt", v); setDateOpen(false) }}
                          onCancel={() => setDateOpen(false)}
                        />
                      )}
                    </div>
                  )
                })()}
              </div>
            </section>

            {/* ── SOURCE ─────────────────────────────────────────────────────────────── */}
            <section className="space-y-2 border-t border-[var(--crm-border-soft)] pt-4">
              {/* THE CONTROL STAYS AND SO DOES WHAT IT DOES. A source still decides whether the
                  write is recorded `verified` or `inferred` in provenance, which is still what the
                  "Verified …" and "Updated …" age lines above follow. Only the paragraph under it
                  is gone; nothing about the save changed. It no longer governs the commission
                  badge, which asks a different question — see the Commission section. */}
              <label className={label}>Source (optional)</label>
              <input className={field} value={source} placeholder="Called leasing office, Oct 24"
                onChange={(e) => setSource(e.target.value)} />
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
            disabled={!dirty || saving || !loaded || blockSave}
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
