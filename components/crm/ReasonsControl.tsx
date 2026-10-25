"use client"

import { useState } from "react"
import { MAX_REASONS } from "@bc/companion-shared"
import { averageRentLine, type AverageRentInputs } from "@/lib/leads/averageRent"
import {
  BEDROOM_OPTIONS, parseReasons, buildReasons, formatBedroomPrice, reasonOverflow,
  rentColumnFor, sanitizeHighlight, isCustomHighlight, MAX_HIGHLIGHT_LEN,
  type BedroomValue, type StructuredReasons,
} from "@/lib/leads/structuredReasons"
import {
  MAX_RECOMMENDATION_AMENITIES, RECOMMENDATION_AMENITY_LABELS,
  resolveRecommendationAmenity, recommendationAmenityKey,
} from "@/lib/leads/recommendationAmenities"
import AmenitySelect, { type AmenityVocabulary } from "@/components/crm/social/AmenitySelect"

/**
 * THE RECOMMENDATION VOCABULARY, handed to Social Beast's own selector.
 *
 * The control is reused wholesale — chips, typeahead, custom fallback, equivalence-aware
 * de-duplication, Enter/Backspace handling — and only the words it searches are swapped. Social
 * Beast keeps its own bank and its 3-feature cap untouched; this one offers the Smart Form
 * must-have labels and caps at two, because a recommendation reason is a highlight, not a
 * feature list.
 */
const RECOMMENDATION_VOCABULARY: AmenityVocabulary = {
  bank: RECOMMENDATION_AMENITY_LABELS,
  resolveEntry: (raw) => resolveRecommendationAmenity(raw, sanitizeHighlight),
  sanitizeCustom: sanitizeHighlight,
  equivalenceKey: recommendationAmenityKey,
}

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
  averageRent,
  onSaveAverageRent,
  startingRents,
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
   * OPTIONAL average-rent control, on the same terms as the washer/dryer one: both props or
   * neither, so Favorites and every other caller are untouched.
   */
  averageRent?: AverageRentInputs | null
  onSaveAverageRent?: (next: AverageRentInputs) => Promise<boolean>
  /**
   * The property's CANONICAL starting rents, straight from Property Intelligence
   * (property_catalog.*_starting_rent). Used to PREFILL the price when a bedroom type is first
   * chosen and nothing is saved yet — never to replace a price already stored on this
   * recommendation, and never written back. Absent ⇒ the field simply starts blank.
   */
  startingRents?: Record<string, number | null> | null
}) {
  const [open, setOpen] = useState(false)
  // ── THE THREE SLOTS ───────────────────────────────────────────────────────────────────────
  // Parsed from the SAVED strings, which stay the storage format. Legacy lines the parser could
  // not claim ride along in `structured.legacy` and are written back untouched.
  const [structured, setStructured] = useState<StructuredReasons>(() => parseReasons(reasons))
  const patch = (next: Partial<StructuredReasons>) => setStructured((s) => ({ ...s, ...next }))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
  /** What this state would save, and what would not fit on the client's card. */
  const overflow = reasonOverflow(structured, MAX_REASONS)
  /** Previously CONFIRMED figures. They keep the block visible even when reason 2 is incomplete,
   *  so saved work is never hidden — let alone cleared — by an unrelated edit. */
  const hasSavedAverageRent =
    averageRent?.quotedRent != null || averageRent?.concessionWeeks != null ||
    averageRent?.concessionMonths != null || averageRent?.leaseMonths != null ||
    averageRent?.show === true

  function begin() {
    // Seed from the CURRENT saved value every time it opens, so a cancelled edit
    // never leaks into the next one.
    setStructured(parseReasons(reasons))
    setArRent(txt(averageRent?.quotedRent)); setArWeeks(txt(averageRent?.concessionWeeks))
    setArMonths(txt(averageRent?.concessionMonths)); setArTerm(txt(averageRent?.leaseMonths))
    setArShow(averageRent?.show === true)
    setError(null)
    setOpen(true)
  }

  async function save() {
    // buildReasons returns the ORIGINAL array verbatim when nothing changed, so opening the
    // editor on a legacy property and pressing Save rewrites nothing.
    //
    // NOT SLICED. Truncating here is what silently deleted a line when a locator added Bedrooms
    // & Price to a property that already had a distance and two amenity lines. Over the limit,
    // the editor shows what would not fit and this never runs.
    const cleaned = buildReasons(structured)
    if (cleaned.length > MAX_REASONS) {
      setError(`A client sees ${MAX_REASONS} reasons. Remove or combine a line before saving.`)
      return
    }
    setSaving(true)
    setError(null)
    const okSaved = await onSave(cleaned)
    const arChanged = showAverageRent && (
      arDraft.quotedRent !== (averageRent?.quotedRent ?? null) ||
      arDraft.concessionWeeks !== (averageRent?.concessionWeeks ?? null) ||
      arDraft.concessionMonths !== (averageRent?.concessionMonths ?? null) ||
      arDraft.leaseMonths !== (averageRent?.leaseMonths ?? null) ||
      arDraft.show !== (averageRent?.show === true)
    )
    const okAr = okSaved && arChanged ? await onSaveAverageRent!(arDraft) : true
    setSaving(false)
    if (!okSaved || !okAr) { setError("Couldn't save. Please try again."); return }
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
      {/* ── 1 · DISTANCE ────────────────────────────────────────────────────────────────
          Automatic, and read-only here. It is generated upstream from commute_minutes and this
          editor must not touch its calculation, wording or position — it is simply shown so the
          locator can see the first line a client will read. */}
      <div className="rounded-lg border border-[var(--crm-border)] p-2">
        <span className="block text-[9.5px] font-semibold uppercase tracking-wide text-[var(--crm-text-muted)]">
          1 · Distance · automatic
        </span>
        <p className="mt-0.5 text-[11.5px] text-[var(--crm-text-primary)]">
          {structured.distance ?? <span className="text-[var(--crm-text-muted)]">No commute generated for this client yet</span>}
        </p>
      </div>

      {/* ── 2 · BEDROOMS & PRICE ───────────────────────────────────────────────────────────
          A dropdown and a number, not a sentence. Choosing a bedroom type PREFILLS the price
          from Property Intelligence when that column holds one — but only into an EMPTY field,
          so a price already saved on this recommendation is never replaced by a newer canonical
          value. Nothing here writes back to property_catalog: this price belongs to one client's
          recommendation. With no price the reason is simply omitted. */}
      <div className="mt-2 rounded-lg border border-[var(--crm-border)] p-2">
        <span className="block text-[9.5px] font-semibold uppercase tracking-wide text-[var(--crm-text-muted)]">
          2 · Bedrooms &amp; price
        </span>
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          <div>
            <span className="block text-[9.5px] text-[var(--crm-text-muted)]">Bedrooms</span>
            <select
              value={structured.bedroom ?? ""}
              onChange={(e) => {
                const nextBed = (e.target.value || null) as BedroomValue | null
                const col = rentColumnFor(nextBed)
                const canonical = col ? startingRents?.[col] : null
                // Prefill ONLY an empty field.
                const nextPrice = structured.price.trim() === "" && typeof canonical === "number" && canonical > 0
                  ? String(canonical)
                  : structured.price
                patch({ bedroom: nextBed, price: nextPrice })
              }}
              className="mt-0.5 w-full rounded-lg border border-[var(--crm-border)] bg-[var(--crm-panel)] px-2 py-1 text-[11.5px] text-[var(--crm-text-primary)] outline-none focus:border-[var(--crm-text-muted)]"
            >
              <option value="">Not specified</option>
              {BEDROOM_OPTIONS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>
          </div>
          <div>
            <span className="block text-[9.5px] text-[var(--crm-text-muted)]">Starting price</span>
            <input
              inputMode="decimal"
              value={structured.price}
              placeholder="1,725"
              onChange={(e) => patch({ price: e.target.value })}
              className="mt-0.5 w-full rounded-lg border border-[var(--crm-border)] bg-[var(--crm-panel)] px-2 py-1 text-[11.5px] text-[var(--crm-text-primary)] outline-none focus:border-[var(--crm-text-muted)]"
            />
          </div>
        </div>
        {/* The exact line a client will read, or nothing — the same preview discipline the
            Average Rent block uses. */}
        <p className="mt-1.5 text-[11px] text-[var(--crm-text-muted)]">
          {formatBedroomPrice(structured.bedroom, structured.price)
            ? <span className="font-semibold text-emerald-500">{formatBedroomPrice(structured.bedroom, structured.price)}</span>
            : "Pick a bedroom type and confirm a price to include this reason."}
        </p>
      </div>

      {/* AVERAGE RENT — four figures the locator CONFIRMS for this client, and the switch that
          lets them see it. Nothing is read from the advertised special: "Up to 10 Weeks Free on
          Select Homes" is a ceiling on an offer that may not apply to this floor plan, move-in
          or term. The preview is the real client-facing line, so an incomplete entry shows the
          locator exactly what it shows a client — nothing. */}
      {/* ── 3 · AMENITIES ──────────────────────────────────────────────────────────────────
          Two highlights, each either a standardized label or a short phrase the locator types.
          The standardized labels reuse the values the Smart Form list and the property attribute
          registry already own, so a pick reads as the same thing they do.

          THE SAME INPUT DOES BOTH, which is what keeps this compact: typing filters the list, and
          when the text matches no label it offers itself as custom wording. There is no second
          control and no mode switch — the alternative was another form inside a form.

          TWO HIGHLIGHTS TOTAL. Picks and typed phrases share one array, so the cap cannot be
          circumvented by mixing them.

          NEITHER KIND IS A VERIFICATION. Choosing "Private Yard" means the locator is telling
          THIS client about it; it writes text on lead_property_reasons and never touches
          property_attributes, never marks anything verified, and never flows into Property
          Intelligence. An amenity appearing here says nothing about whether this property has it.
          A TYPED phrase says even less — it is the locator's own wording, and confirming it is
          true is their job before the recommendation goes out. The chips show which is which.

          Washer & dryer VERIFICATION is deliberately gone from this editor — it was a second
          property data-entry workflow living inside a client-facing one. It stays on the
          Property Intelligence pencil, where it belongs. */}
      <div className="mt-2 rounded-lg border border-[var(--crm-border)] p-2">
        <span className="block text-[9.5px] font-semibold uppercase tracking-wide text-[var(--crm-text-muted)]">
          3 · Amenities · optional, up to {MAX_RECOMMENDATION_AMENITIES} highlights
        </span>
        {/* THE SOCIAL BEAST SELECTOR, with this editor's vocabulary. Identical interaction to
            Features Observed, which is the point — a locator who has used one has used both. */}
        <AmenitySelect
          value={structured.amenities}
          onChange={(next) => patch({ amenities: next })}
          max={MAX_RECOMMENDATION_AMENITIES}
          vocabulary={RECOMMENDATION_VOCABULARY}
          placeholder="Search amenities, or type your own…"
        />
        <p className="mt-1 text-[10px] leading-snug text-[var(--crm-text-muted)]">
          Your own wording is kept exactly as typed and is never a verified property feature.
        </p>
      </div>

      {/* PREVIOUSLY SAVED REASONS. Lines the parser could not confidently claim — a typo, a
          hand-written phrase — are shown and EDITABLE, not frozen. They are deliberately kept
          out of the structured controls above: forcing "W/D inlcuded" into the amenity dropdown
          means guessing which amenity a misspelling meant, which is the one thing this design
          refuses to do. Editing one here is the locator saying what it should be, in their own
          words; leaving it alone preserves it exactly. */}
      {structured.legacy.length > 0 && (
        <div className="mt-2 rounded-lg border border-[var(--crm-border)] p-2">
          <span className="block text-[9.5px] font-semibold uppercase tracking-wide text-[var(--crm-text-muted)]">
            Previously saved reasons
          </span>
          {structured.legacy.map((line, i) => (
            <div key={i} className="mt-1.5 flex items-center gap-1.5">
              <input
                value={line}
                onChange={(e) => patch({ legacy: structured.legacy.map((l, j) => (j === i ? e.target.value : l)) })}
                className="min-w-0 flex-1 rounded-lg border border-[var(--crm-border)] bg-[var(--crm-panel)] px-2 py-1 text-[11.5px] text-[var(--crm-text-primary)] outline-none focus:border-[var(--crm-text-muted)]"
              />
              <button
                type="button"
                aria-label={`Remove ${line}`}
                onClick={() => patch({ legacy: structured.legacy.filter((_, j) => j !== i) })}
                className="flex-none px-1 text-[11px] leading-none text-[var(--crm-text-muted)] transition-colors hover:text-red-500"
              >
                ✕
              </button>
            </div>
          ))}
          <p className="mt-1.5 text-[10px] text-[var(--crm-text-muted)]">
            Kept exactly as saved unless you change them. New recommendations use the three sections above.
          </p>
        </div>
      )}

      {/* OVER THE LIMIT. A client's card shows three reasons, and this used to be enforced by
          slicing on save — so a fourth line was not hidden, it was deleted. The locator is shown
          precisely which lines would not fit and Save is blocked until they decide. */}
      {overflow.dropped.length > 0 && (
        <div className="mt-2 rounded-lg border border-amber-500/50 bg-amber-500/10 p-2">
          <p className="text-[10.5px] font-semibold text-amber-400">
            {overflow.lines.length} reasons — a client sees {MAX_REASONS}.
          </p>
          <p className="mt-1 text-[10.5px] text-[var(--crm-text-secondary)]">
            These would not be sent: {overflow.dropped.map((d) => `“${d}”`).join(", ")}. Remove or
            combine a line to continue — nothing is deleted for you.
          </p>
        </div>
      )}

      {/* Revealed once a bedroom and price are supplied — EXCEPT when figures are already
          saved, which must stay reachable however incomplete reason 2 happens to be. Nothing is
          enabled automatically and no logic below changed. */}
      {showAverageRent && (Boolean(formatBedroomPrice(structured.bedroom, structured.price)) || hasSavedAverageRent) && (
        <div className="mt-2 rounded-lg border border-[var(--crm-border)] p-2">
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={arShow} onChange={(e) => setArShow(e.target.checked)} />
            {/* Short, but the parenthetical stays: it is the whole safeguard. "Up to 10 Weeks
                Free on Select Homes" is a ceiling on an offer that may not apply to this floor
                plan, move-in or term, and the figures below are only as good as the call that
                confirmed them. */}
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--crm-text-muted)]">
              Show Avg. rent (must verify terms)
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
      {/* "+ Add reason" is gone with the free-text rows it fed: the three slots ARE the reasons
          now, and a fourth blank line had nowhere to go. Save and Cancel are unchanged. */}
      <div className="mt-2 flex items-center gap-2">
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
            disabled={saving || overflow.dropped.length > 0}
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
