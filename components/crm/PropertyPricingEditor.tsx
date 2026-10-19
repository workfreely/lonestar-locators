"use client"

import { useEffect, useState } from "react"
import DateTimePicker from "./DateTimePicker"

/**
 * Owner-only property pricing editor — the pencil on a Recommended Properties card.
 *
 * ── IT DOES NOT CHANGE THE CARD ─────────────────────────────────────────────────────────
 * Collapsed, this renders exactly one 22×22 button sized to match the existing ✕ and ♡, so
 * the card's height, padding and layout are untouched. Open, the editor is a FIXED overlay
 * rather than an inline panel — an inline editor would push the card taller and reflow the
 * list, which is the one thing the design must not do.
 *
 * ── VISIBILITY IS NOT THE BOUNDARY ──────────────────────────────────────────────────────
 * The caller renders this only for a platform admin, but that is presentation. The real
 * guard is requirePlatformAdmin() inside /api/admin/owner/property-pricing, which re-checks
 * on every call and is what actually stops a non-owner.
 *
 * ── WHY SAVING NEVER CLEARS ─────────────────────────────────────────────────────────────
 * A blank field means "leave it alone", never "erase it". The route drops blanks before
 * building candidates and the writer refuses a null, so there is no way to empty a stored
 * price from here. That is deliberate: every field is optional, and the common case is
 * filling ONE of them.
 */

type Loaded = {
  propertyName: string | null
  address: string | null
  onebr: number | null
  twobr: number | null
  threebr: number | null
  currentSpecial: string | null
  pricingSource: string | null
  checkedAt: string | null
  sendCommission: string | null
  escortCommission: string | null
  bonusFlat: string | null
}

const ENDPOINT = "/api/admin/owner/property-pricing"

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

/**
 * A stored commission value → what the numeric input shows.
 *
 * "100%" → "100", "0%" → "0", "500" → "500". NULL/blank → "" — and that distinction is the whole
 * point: "" means nobody has checked, "0" means somebody checked and it is zero. A value we
 * cannot read as a number (a legacy "No", "1 month") is returned VERBATIM rather than blanked,
 * so opening the editor can never silently discard a rate it did not understand.
 */
export function commissionToInput(stored: string | null | undefined): string {
  const t = (stored ?? "").trim()
  if (!t) return ""
  const m = /^\$?\s*([\d,]+(?:\.\d+)?)\s*%?$/.exec(t)
  if (!m) return t
  const n = Number(m[1].replace(/,/g, ""))
  return Number.isFinite(n) ? String(n) : t
}

/** Present a stored "YYYY-MM-DD" as "Oct 19, 2026" on the picker button; blank stays blank.
 *  Purely presentational — the canonical stored value is unchanged. Mirrors the same helper in
 *  GetInvoiceDetailsModal rather than extracting a shared one, to keep this change UI-only. */
function formatCheckedDateDisplay(value: string): string {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return value
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })
}

export default function PropertyPricingEditor({
  placeId,
  propertyName,
  onSaved,
}: {
  /** Resolved from the row's property_url. Absent ⇒ the caller does not render this at all. */
  placeId: string
  propertyName?: string | null
  /** Fired after a successful save so the card can re-read the derived pricing reason. */
  onSaved?: () => void
}) {
  const [open, setOpen] = useState(false)
  // STARTS TRUE. With `false`, the first render after opening showed the FORM — holding the
  // PREVIOUS property's values, because closing does not reset the fields — and only then did the
  // effect flip it to "Loading…", collapsing the dialog, before it grew back populated. Three
  // layouts and a vertical jump, every time, plus a flash of another property's prices.
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const [onebr, setOnebr] = useState("")
  const [twobr, setTwobr] = useState("")
  const [threebr, setThreebr] = useState("")
  const [special, setSpecial] = useState("")
  const [source, setSource] = useState("")
  const [checkedAt, setCheckedAt] = useState(todayIso())
  // The shared CRM picker is a normal element we render, so it has to be opened explicitly —
  // that is precisely what makes it containable, unlike the native input's browser-drawn popup.
  const [dateOpen, setDateOpen] = useState(false)
  const [address, setAddress] = useState<string | null>(null)
  // Commission, as TEXT the owner typed. "" means UNTOUCHED/unknown and is never sent; "0" is a
  // deliberate zero and is. They are deliberately separate from the pricing fields.
  const [send, setSend] = useState("")
  const [escort, setEscort] = useState("")
  const [bonus, setBonus] = useState("")
  // What the three commission fields held WHEN LOADED. A field still equal to this was not
  // edited, and an unedited field is never resubmitted — see the save handler.
  const [loadedCommission, setLoadedCommission] = useState({ send: "", escort: "", bonus: "" })

  // Load the CURRENT stored values every time it opens, so a cancelled edit never leaks
  // into the next one and two cards for the same property can never disagree.
  useEffect(() => {
    if (!open) return
    let alive = true
    setLoading(true)
    setError(null)
    setNote(null)
    setDateOpen(false)
    // BLANK THE FORM BEFORE FETCHING. Opening the editor on a second property must never show
    // the first one's figures, not even for a frame — these are prices and commission rates, and
    // a glimpse of the wrong building's numbers is worse than a moment of nothing.
    setOnebr(""); setTwobr(""); setThreebr("")
    setSpecial(""); setSource("")
    setSend(""); setEscort(""); setBonus("")
    setLoadedCommission({ send: "", escort: "", bonus: "" })
    setAddress(null)
    setCheckedAt(todayIso())
    void (async () => {
      try {
        const res = await fetch(`${ENDPOINT}?placeId=${encodeURIComponent(placeId)}`, { cache: "no-store" })
        if (!alive) return
        if (res.status === 404) { setError("This property has no catalog record yet, so pricing can't be saved against it."); return }
        if (res.status === 401 || res.status === 403) { setError("You're not authorized to edit property pricing."); return }
        if (!res.ok) { setError("Couldn't load the current pricing."); return }
        const d = (await res.json()) as Loaded
        if (!alive) return
        setOnebr(d.onebr == null ? "" : String(d.onebr))
        setTwobr(d.twobr == null ? "" : String(d.twobr))
        setThreebr(d.threebr == null ? "" : String(d.threebr))
        setSpecial(d.currentSpecial ?? "")
        setSource(d.pricingSource ?? "")
        setAddress(d.address ?? null)
        // VERBATIM, and blank stays blank. Rendering a null as "0" would turn "nobody checked"
        // into "checked, and it is zero" the moment the owner pressed Save.
        const loadedSend = commissionToInput(d.sendCommission)
        const loadedEscort = commissionToInput(d.escortCommission)
        const loadedBonus = commissionToInput(d.bonusFlat)
        setSend(loadedSend); setEscort(loadedEscort); setBonus(loadedBonus)
        setLoadedCommission({ send: loadedSend, escort: loadedEscort, bonus: loadedBonus })
        setCheckedAt(d.checkedAt ? String(d.checkedAt).slice(0, 10) : todayIso())
      } catch {
        if (alive) setError("Couldn't load the current pricing.")
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [open, placeId])

  // Escape closes, matching every other dismissible surface in the CRM.
  useEffect(() => {
    if (!open) return
    // Escape closes the calendar first when it is showing, then the editor — so one press
    // never discards an edit the user was still in the middle of.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      setDateOpen((cal) => { if (cal) return false; setOpen(false); return false })
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  async function save() {
    setSaving(true)
    setError(null)
    setNote(null)
    try {
      // Only non-empty fields are sent. An untouched field is simply absent from the body,
      // which is what makes a one-price save incapable of disturbing the other two.
      const body: Record<string, unknown> = { placeId, checkedAt }
      if (onebr.trim()) body.onebr = onebr.trim()
      if (twobr.trim()) body.twobr = twobr.trim()
      if (threebr.trim()) body.threebr = threebr.trim()
      if (special.trim()) body.currentSpecial = special.trim()
      if (source.trim()) body.pricingSource = source.trim()
      // TWO REASONS A COMMISSION FIELD IS OMITTED, and the second one matters more than it looks.
      //
      // BLANK means "nobody has checked". Sending 0 for it would manufacture a verified zero out
      // of an absence, which is the one thing this model exists to prevent.
      //
      // UNCHANGED means the owner did not touch it, so it must travel nowhere near the numeric
      // validator. property_catalog holds legacy TEXT commissions — "No", "Not Paying",
      // "1 month" — that the editor shows VERBATIM. Resubmitting one would fail validation and
      // reject the WHOLE save, so editing a 2BR rent on such a property would be impossible. It
      // would also be wrong in principle: converting a legacy value is an intentional act, and
      // this is how it stays one. Change the field and it is sent, validated, and stored.
      // THREE outcomes per commission field, and the change-tracking is what separates them:
      //   untouched           → omitted entirely; the stored value, legacy text included, stands
      //   edited to a number  → sent; "0" is a verified zero, and saves as one
      //   CLEARED (was set,
      //     now blank)        → sent as null; the owner is returning it to UNKNOWN
      // A field that was already blank and stays blank is untouched, so it is omitted — never
      // sent as null, which would write an audit row for a change that did not happen.
      const changed = (now: string, before: string) => now.trim() !== before.trim()
      const commit = (key: string, now: string, before: string) => {
        if (!changed(now, before)) return
        body[key] = now.trim() === "" ? null : now.trim()
      }
      commit("sendCommission", send, loadedCommission.send)
      commit("escortCommission", escort, loadedCommission.escort)
      commit("bonusFlat", bonus, loadedCommission.bonus)

      // `in` rather than truthiness: a deliberate clear sends null, which is falsy but IS a save.
      const anyCommission = "sendCommission" in body || "escortCommission" in body || "bonusFlat" in body
      if (!body.onebr && !body.twobr && !body.threebr && !body.currentSpecial && !anyCommission) {
        setError("Enter at least one price, a special, or a commission value.")
        return
      }

      const res = await fetch(ENDPOINT, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      })
      const out = (await res.json().catch(() => ({}))) as { error?: string; written?: string[]; skipped?: { field: string; reason: string }[] }

      if (res.status === 401 || res.status === 403) { setError("You're not authorized to edit property pricing."); return }
      if (res.status === 404) { setError("This property has no catalog record yet, so pricing can't be saved against it."); return }
      if (res.status === 409) { setError("Someone else updated this property just now. Reopen the editor and try again."); return }
      if (!res.ok) { setError(out.error === "bad_value" ? "Check the prices — they need to be plain numbers." : "Couldn't save. Please try again."); return }

      // A skip is not a failure, but it must not look like a save either.
      const skipped = (out.skipped ?? []).filter((s) => s.reason !== "unchanged" && s.reason !== "no_value")
      if (skipped.length > 0) setNote(`Saved. ${skipped.length} field(s) were left unchanged by the write policy.`)

      onSaved?.()
      if (skipped.length === 0) setOpen(false)
    } catch {
      setError("Couldn't save. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  const field = "w-full rounded-lg border border-[var(--crm-border)] bg-[var(--crm-panel)] px-2 py-1 text-[12px] text-[var(--crm-text-primary)] outline-none focus:border-[var(--crm-text-muted)]"
  const label = "text-[10px] font-semibold uppercase tracking-[.05em] text-[var(--crm-text-muted)]"

  return (
    <>
      {/* Collapsed: one control, the SAME 22×22 footprint as the existing ✕ and ♡, so the
          controls row and the card height are unchanged. */}
      <button
        type="button"
        aria-label="Edit property pricing"
        title="Edit property pricing"
        onClick={() => setOpen(true)}
        className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-md text-[12px] leading-none text-[var(--crm-text-muted)] transition-colors duration-[120ms] hover:text-[var(--crm-accent)]"
      >
        {/* Inline SVG rather than an emoji: the two neighbouring controls are glyphs whose
            rendered weight varies by platform, and a pencil emoji sits visibly heavier. */}
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M11.2 1.8a1.6 1.6 0 0 1 2.3 2.3l-7.6 7.6-3 .7.7-3 7.6-7.6Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        // FIXED overlay — the card itself never grows, reflows, or changes height.
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Edit property pricing"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
        >
          {/* max-h + overflow-y-auto: with the calendar open the dialog grows, and on a short
              viewport it must SCROLL rather than push Save/Cancel off-screen. The overlay's own
              p-4 is what the 2rem subtraction accounts for. */}
          {/* 475px (was 380). The lg: translate shifts it RIGHT by half the growth, so the extra
              width is added on the right and the Recommended Properties list stays visible on the
              left. The offset is dropped below lg, where there is no room to give — and max-h +
              overflow-y-auto still clamp it to the viewport on short screens. */}
          <div className="w-full max-w-[475px] max-h-[calc(100vh-2rem)] overflow-y-auto rounded-xl border border-[var(--crm-border)] bg-[var(--crm-panel)] p-4 shadow-xl lg:translate-x-[48px]">
            <div className="mb-3">
              <p className="text-[13px] font-semibold text-[var(--crm-text-primary)]">Property Intelligence</p>
              {/* Name and the VERIFIED street address from the catalog record. Nothing is
                  assembled from guesses — a property with no stored street line simply shows
                  its name, because an invented address is worse than a missing one. */}
              <p className="mt-[2px] truncate text-[11.5px] font-medium text-[var(--crm-text-secondary)]">{propertyName ?? "This property"}</p>
              {address && <p className="mt-[1px] truncate text-[10.5px] text-[var(--crm-text-muted)]">{address}</p>}
            </div>

            {loading ? (
              <p className="py-6 text-center text-[12px] text-[var(--crm-text-muted)]">Loading…</p>
            ) : (
              <>
                {/* Section header, matching the commission block below it — the two groups are
                    different kinds of fact and should read as such. */}
                <span className={label}>Starting monthly rent</span>
                <div className="mt-1.5 grid grid-cols-3 gap-2">
                  {([["1BR", onebr, setOnebr], ["2BR", twobr, setTwobr], ["3BR", threebr, setThreebr]] as const).map(([lbl, val, set]) => (
                    <div key={lbl}>
                      <span className={label}>{lbl}</span>
                      <input
                        value={val}
                        inputMode="numeric"
                        placeholder="—"
                        onChange={(e) => set(e.target.value)}
                        className={`${field} mt-1 tabular-nums`}
                      />
                    </div>
                  ))}
                </div>
                <p className="mt-1.5 text-[10px] text-[var(--crm-text-muted)]">
                  Starting rents. Leave a field blank to keep its stored value — saving never clears a price.
                </p>

                <div className="mt-3">
                  <span className={label}>Current special</span>
                  <input value={special} placeholder="Optional" onChange={(e) => setSpecial(e.target.value)} className={`${field} mt-1`} />
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div>
                    <span className={label}>Pricing source</span>
                    <input value={source} placeholder="Link or note" onChange={(e) => setSource(e.target.value)} className={`${field} mt-1`} />
                  </div>
                  <div>
                    <span className={label}>Date checked</span>
                    {/* A BUTTON, NOT <input type="date">. The native input draws its calendar in
                        the browser's TOP LAYER — outside the page's stacking context entirely —
                        so no z-index, portal or overflow rule on this dialog can contain it, and
                        it painted over Pricing source and the Save/Cancel row. The CRM's own
                        DateTimePicker (Add Task, Reschedule, Get Invoice Details) exists for
                        exactly this reason and is reused here unchanged. */}
                    <button
                      type="button"
                      onClick={() => setDateOpen((v) => !v)}
                      aria-expanded={dateOpen}
                      className={`${field} mt-1 flex items-center justify-between text-left`}
                    >
                      <span className={checkedAt ? "tabular-nums" : "text-[var(--crm-text-muted)]"}>
                        {checkedAt ? formatCheckedDateDisplay(checkedAt) : "Select date"}
                      </span>
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 flex-none text-[var(--crm-text-muted)]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                        <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* The calendar renders FULL WIDTH, BELOW the two-column row and IN NORMAL FLOW.
                    In flow it pushes the dialog taller instead of covering anything, and the
                    dialog's own max-height scrolls it — so every field plus Save/Cancel stays
                    reachable. Full width because a calendar inside a ~170px grid cell would be
                    unusable; the compact 2-column layout above is untouched. */}
                {dateOpen && (
                  <DateTimePicker
                    value={checkedAt}
                    dateOnly
                    onApply={(v) => { setCheckedAt(v); setDateOpen(false) }}
                    onCancel={() => setDateOpen(false)}
                  />
                )}
                <p className="mt-1.5 text-[10px] text-[var(--crm-text-muted)]">
                  With a source, the entry is recorded as verified; without one it is recorded as unverified. Either way it saves.
                </p>

                {/* ── LOCATOR COMMISSION ───────────────────────────────────────────────────
                    INTERNAL ONLY. These never reach a client recommendation page, a public
                    property list, a caption or a video — the client resolver does not carry
                    them and this editor does not change that.

                    Send and Escort are always percentages of one month's rent and Bonus is
                    always a flat dollar amount, so there is no type selector to get wrong.
                    The source and date above cover these too: one save, one provenance. */}
                <div className="mt-4 border-t border-[var(--crm-border)] pt-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={label}>Locator commission</span>
                    <span className="text-[9.5px] text-[var(--crm-text-muted)]">Internal only</span>
                  </div>
                  <div className="mt-1.5 grid grid-cols-3 gap-2">
                    {([
                      ["Send (%)", send, setSend, "—"],
                      ["Escort (%)", escort, setEscort, "—"],
                      ["Bonus ($)", bonus, setBonus, "—"],
                    ] as const).map(([lbl, val, set, ph]) => (
                      <div key={lbl}>
                        <span className={label}>{lbl}</span>
                        <input
                          value={val}
                          inputMode="numeric"
                          placeholder={ph}
                          onChange={(e) => set(e.target.value)}
                          className={`${field} mt-1 tabular-nums`}
                        />
                      </div>
                    ))}
                  </div>
                  {/* THE DISTINCTION THAT MATTERS, said plainly — it is the one thing about this
                      section that is easy to get wrong and impossible to see afterwards. */}
                  <p className="mt-1.5 text-[10px] text-[var(--crm-text-muted)]">
                    Leave blank if unknown. Enter <span className="font-semibold text-[var(--crm-text-secondary)]">0</span> only to record a
                    confirmed zero — blanks are never saved as 0.
                  </p>
                </div>

                {error && <p className="mt-2.5 text-[11px] font-medium text-red-500">{error}</p>}
                {note && <p className="mt-2.5 text-[11px] text-[var(--crm-text-secondary)]">{note}</p>}

                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className="rounded-lg px-2.5 py-1 text-[11px] font-medium text-[var(--crm-text-muted)] transition-colors hover:text-[var(--crm-text-primary)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void save()}
                    className="rounded-lg bg-[var(--crm-accent)] px-3 py-1 text-[11px] font-semibold text-white transition-[filter,opacity] hover:brightness-110 disabled:opacity-60"
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
