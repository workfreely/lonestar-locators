"use client"

import { useState } from "react"
import { MAX_REASONS } from "@bc/companion-shared"
import { WASHER_DRYER_OPTIONS, asWasherDryerStatus, type WasherDryerStatus } from "@/lib/leads/washerDryer"
import { averageRentLine, type AverageRentInputs } from "@/lib/leads/averageRent"

/**
 * "Why I chose this · Edit" — the locator-side editor for one recommendation's
 * client-facing reasons.
 *
 * Deliberately secondary: collapsed it is a small muted button plus, when reasons
 * exist, a one-line preview of them. It never competes with the property name or the
 * commission chip, and it does not change the client-facing card, where the section
 * stays directly under the Google rating.
 *
 * 0–3 reasons. Zero is a legitimate state — the client page hides the section
 * entirely — so "Save" with everything cleared is a valid action, not an error.
 * Blank rows are dropped on save rather than stored as empty bullets.
 */
export default function ReasonsControl({
  reasons,
  previewReasons,
  onSave,
  washerDryer,
  onSaveWasherDryer,
  averageRent,
  onSaveAverageRent,
}: {
  /** The SAVED reasons. This is what the editor seeds from and what onSave receives. */
  reasons: string[]
  /**
   * What the collapsed preview shows — the saved reasons plus any DERIVED one (today, the
   * bedroom starting price). Defaults to `reasons`, so every existing call site is unchanged.
   *
   * THE TWO ARE KEPT APART ON PURPOSE. If the editor seeded from the derived list, opening
   * it and pressing Save would write the derived price into lead_property_reasons as if the
   * locator had typed it — and it would then be frozen there, surviving a later price
   * correction. Editing always operates on `reasons`; `previewReasons` is display only.
   */
  previewReasons?: string[]
  onSave: (next: string[]) => Promise<boolean>
  /**
   * OPTIONAL washer/dryer control. Both props must be supplied for the dropdown to appear, so
   * every existing call site — Favorites included — renders exactly as it did. Recommended
   * Properties passes them because that is the list a client is sent.
   */
  washerDryer?: WasherDryerStatus | null
  onSaveWasherDryer?: (next: WasherDryerStatus | null) => Promise<boolean>
  /**
   * OPTIONAL average-rent control, on the same terms as the washer/dryer one: both props or
   * neither, so Favorites and every other caller are untouched.
   */
  averageRent?: AverageRentInputs | null
  onSaveAverageRent?: (next: AverageRentInputs) => Promise<boolean>
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<string[]>(reasons)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [wdDraft, setWdDraft] = useState<WasherDryerStatus | null>(washerDryer ?? null)
  const showWasherDryer = typeof onSaveWasherDryer === "function"

  // ── AVERAGE RENT ──────────────────────────────────────────────────────────────────────────
  // Four figures a person confirms, held as TEXT while editing so a half-typed "17" is not read
  // as a $17 rent, and converted once on save.
  const showAverageRent = typeof onSaveAverageRent === "function"
  const txt = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v))
  const [arRent, setArRent] = useState(txt(averageRent?.quotedRent))
  const [arWeeks, setArWeeks] = useState(txt(averageRent?.concessionWeeks))
  const [arMonths, setArMonths] = useState(txt(averageRent?.concessionMonths))
  const [arTerm, setArTerm] = useState(txt(averageRent?.leaseMonths))
  const [arShow, setArShow] = useState(averageRent?.show === true)
  const arDraft: AverageRentInputs = {
    quotedRent: arRent.trim() === "" ? null : Number(arRent),
    concessionWeeks: arWeeks.trim() === "" ? null : Number(arWeeks),
    concessionMonths: arMonths.trim() === "" ? null : Number(arMonths),
    leaseMonths: arTerm.trim() === "" ? null : Number(arTerm),
    show: arShow,
  }
  // The EXACT line the client would see — computed by the same function the client page uses, so
  // the locator is previewing the real thing rather than an approximation of it. Null means the
  // figures do not yet justify a line, which is the preview that matters most.
  const arPreview = averageRentLine({ ...arDraft, show: true })

  function begin() {
    // Seed from the CURRENT saved value every time it opens, so a cancelled edit
    // never leaks into the next one.
    setDraft(reasons.length ? reasons : [""])
    setWdDraft(washerDryer ?? null)
    setArRent(txt(averageRent?.quotedRent)); setArWeeks(txt(averageRent?.concessionWeeks))
    setArMonths(txt(averageRent?.concessionMonths)); setArTerm(txt(averageRent?.leaseMonths))
    setArShow(averageRent?.show === true)
    setError(null)
    setOpen(true)
  }

  async function save() {
    const cleaned = draft.map((r) => r.trim()).filter(Boolean).slice(0, MAX_REASONS)
    setSaving(true)
    setError(null)
    const okSaved = await onSave(cleaned)
    // Two independent writes to two independent columns. The status only goes out when it
    // actually CHANGED, so pressing Save after editing reasons alone never touches it.
    const wdChanged = showWasherDryer && wdDraft !== (washerDryer ?? null)
    const okWd = okSaved && wdChanged ? await onSaveWasherDryer!(wdDraft) : true
    const arChanged = showAverageRent && (
      arDraft.quotedRent !== (averageRent?.quotedRent ?? null) ||
      arDraft.concessionWeeks !== (averageRent?.concessionWeeks ?? null) ||
      arDraft.concessionMonths !== (averageRent?.concessionMonths ?? null) ||
      arDraft.leaseMonths !== (averageRent?.leaseMonths ?? null) ||
      arDraft.show !== (averageRent?.show === true)
    )
    const okAr = okSaved && arChanged ? await onSaveAverageRent!(arDraft) : true
    setSaving(false)
    if (!okSaved || !okWd || !okAr) { setError("Couldn't save. Please try again."); return }
    setOpen(false)
  }

  // Display only. The editor below always works from `reasons`.
  const shown = previewReasons ?? reasons

  if (!open) {
    return (
      // flex-1 + min-w-0 so this half ABSORBS the row's spare width and, more
      // importantly, is allowed to SHRINK. Without min-w-0 a flex item refuses to go
      // below its content width, so a long reason would push against the commission
      // badge instead of ellipsing.
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <button
          type="button"
          onClick={begin}
          // The CONTROL stays muted and fixed-width — it is chrome, not content.
          className="flex-none text-[10.5px] font-medium text-[var(--crm-text-muted)] underline decoration-[var(--crm-border)] underline-offset-2 transition-colors hover:text-[var(--crm-text-primary)]"
        >
          Why I chose this · Edit
        </button>
        {shown.length > 0 && (
          // The saved reasons are CONTENT, so they take the same bright treatment as
          // the Google rating figure rather than the muted tone of the control.
          //
          // `truncate` ellipses the joined display string only. Every reason is still
          // in the array in its original order — nothing is dropped, reordered, or
          // preferentially shortened, and the commute reason is not special-cased.
          // The editor and the canonical row keep the full text.
          <span className="min-w-0 truncate text-[10.5px] text-[var(--crm-text-secondary)]">
            {shown.join(" · ")}
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="w-full">
      <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-[var(--crm-text-muted)]">
        Why I chose this for you
      </p>
      <div className="flex flex-col gap-1.5">
        {draft.map((value, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input
              value={value}
              autoFocus={i === 0}
              // 40 chars, not 60: on the client card a reason renders at 18px on
              // mobile (the max-width:640px block scales it UP from 13.5px), where
              // ~40 characters is the last width that stays on ONE line at 375px.
              // Every approved example fits — the longest, "Within your $1,600–$1,700
              // budget", is 32.
              maxLength={40}
              placeholder="Short fragment — e.g. Washer & dryer included"
              onChange={(e) => setDraft((d) => d.map((v, j) => (j === i ? e.target.value : v)))}
              onKeyDown={(e) => { if (e.key === "Enter") void save() }}
              className="min-w-0 flex-1 rounded-lg border border-[var(--crm-border)] bg-[var(--crm-panel)] px-2 py-1 text-[11.5px] text-[var(--crm-text-primary)] outline-none focus:border-[var(--crm-text-muted)]"
            />
            <button
              type="button"
              aria-label="Remove reason"
              onClick={() => setDraft((d) => d.filter((_, j) => j !== i))}
              className="flex-none px-1 text-[11px] leading-none text-[var(--crm-text-muted)] transition-colors hover:text-red-500"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      {/* WASHER / DRYER — a client-specific confirmation, not a property fact. Deliberately
          NOT prefilled from property_catalog: 224 properties record "Select Units" and 3
          "Specific Floor Plans", so a property-level yes is not a promise about the plan this
          client would lease. Unset renders nothing on the client's card. */}
      {showWasherDryer && (
        <div className="mt-2">
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[var(--crm-text-muted)]">
            Washer &amp; dryer
          </label>
          <select
            value={wdDraft ?? ""}
            onChange={(e) => setWdDraft(asWasherDryerStatus(e.target.value))}
            className="w-full rounded-lg border border-[var(--crm-border)] bg-[var(--crm-panel)] px-2 py-1 text-[11.5px] text-[var(--crm-text-primary)] outline-none focus:border-[var(--crm-text-muted)]"
          >
            {WASHER_DRYER_OPTIONS.map((o) => (
              <option key={o.value || "none"} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      )}
      {/* AVERAGE RENT — four figures the locator CONFIRMS for this client, and the switch that
          lets them see it. Nothing is read from the advertised special: "Up to 10 Weeks Free on
          Select Homes" is a ceiling on an offer that may not apply to this floor plan, move-in
          or term. The preview is the real client-facing line, so an incomplete entry shows the
          locator exactly what it shows a client — nothing. */}
      {showAverageRent && (
        <div className="mt-2 rounded-lg border border-[var(--crm-border)] p-2">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={arShow} onChange={(e) => setArShow(e.target.checked)} />
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--crm-text-muted)]">
              Show average rent (confirmed for this client&rsquo;s move-in)
            </span>
          </label>
          <div className="mt-1.5 grid grid-cols-4 gap-1.5">
            {([["Quoted rent", arRent, setArRent, "1,725"],
               ["Weeks free", arWeeks, setArWeeks, "10"],
               ["Months free", arMonths, setArMonths, "—"],
               ["Lease (mo)", arTerm, setArTerm, "15"]] as const).map(([lbl, val, set, ph]) => (
              <div key={lbl}>
                <span className="block text-[9.5px] font-semibold uppercase tracking-wide text-[var(--crm-text-muted)]">{lbl}</span>
                <input
                  value={val}
                  inputMode="decimal"
                  placeholder={ph}
                  onChange={(e) => set(e.target.value)}
                  className="mt-0.5 w-full rounded-md border border-[var(--crm-border)] bg-[var(--crm-panel)] px-1.5 py-1 text-[11px] tabular-nums text-[var(--crm-text-primary)] outline-none focus:border-[var(--crm-text-muted)]"
                />
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-[10px] text-[var(--crm-text-muted)]">
            {arPreview
              ? <span className="font-semibold text-emerald-600">{arPreview}</span>
              : "Enter the quoted rent, the confirmed concession (weeks or months, not both) and the lease term."}
          </p>
        </div>
      )}
      {error && <p className="mt-1.5 text-[10.5px] font-medium text-red-500">{error}</p>}
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          disabled={draft.length >= MAX_REASONS}
          onClick={() => setDraft((d) => [...d, ""])}
          className="text-[10.5px] font-medium text-[var(--crm-text-secondary)] transition-colors hover:text-[var(--crm-text-primary)] disabled:opacity-40 disabled:hover:text-[var(--crm-text-secondary)]"
        >
          + Add reason
        </button>
        <span className="text-[10px] text-[var(--crm-text-muted)]">
          {draft.filter((d) => d.trim()).length}/{MAX_REASONS}
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-lg px-2 py-1 text-[10.5px] font-medium text-[var(--crm-text-muted)] transition-colors hover:text-[var(--crm-text-primary)]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="rounded-lg bg-[var(--crm-accent)] px-2.5 py-1 text-[10.5px] font-semibold text-white transition-[filter,opacity] hover:brightness-110 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  )
}
