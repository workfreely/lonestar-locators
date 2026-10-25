"use client"

import { useEffect, useRef, useState } from "react"
import { WASHER_DRYER_OPTIONS, WASHER_DRYER_LABEL, type WasherDryerStatus, asWasherDryerStatus } from "@/lib/leads/washerDryer"
import type { WasherDryerDerivation } from "@/lib/propertyIntel/washerDryerResolver"

/**
 * THIS CLIENT'S UNIT — WASHER & DRYER.
 *
 * The per-(client, property) confirmation that drives the green pill on the client's card. It is
 * NOT a property attribute, and the two must never be conflated:
 *
 *   property_catalog.washer_dryer_included        what the BUILDING offers. "Select Units" on 224
 *   property_catalog.washer_dryer_connections     properties, "Specific Floor Plans" on 3.
 *   lead_property_reasons.washer_dryer_status     what a locator CONFIRMED for ONE client's unit.
 *
 * A property-level "Yes" is not a promise about this client's floor plan, so nothing here is ever
 * prefilled or derived from the catalog. A status appears on a client's card only because a
 * person put it there, and `null` — "Not verified" — is the default that renders nothing at all.
 *
 * ── WHY IT LIVES IN TWO PLACES ──────────────────────────────────────────────────────────────
 * A platform admin sees it as a section INSIDE the Property Intelligence editor, below the
 * property-wide fields and visibly separated from them. Every other locator sees the standalone
 * control below, behind the same button position on the card. They are the same field, the same
 * vocabulary and the same save path; what differs is only how much else is on screen.
 *
 * ── WHY THAT IS SAFE ────────────────────────────────────────────────────────────────────────
 * This writes lead_property_reasons through the ordinary client Supabase connection, so RLS is
 * what authorizes it — the same policy that already governs every reason, favorite and average
 * rent a locator saves for their own client. It never touches property_catalog and never calls
 * /api/admin/owner/property-pricing, which stays platform-admin-only behind requirePlatformAdmin.
 * Hiding the other inputs is presentation; the authorization is in the database either way.
 */

/** The select itself, for embedding inside a larger editor. */
export function ClientUnitWasherDryerField({
  value,
  onChange,
  propertyWide,
  derived = null,
  idPrefix = "cuwd",
}: {
  value: WasherDryerStatus | null
  onChange: (next: WasherDryerStatus | null) => void
  /** What the CATALOG says, shown as read-only context. Never a default — see above. Omitted
   *  for a locator who cannot read property-wide data in the first place. */
  propertyWide?: string | null
  /** What Property Intelligence CONCLUSIVELY establishes, if anything. Supplied only where the
   *  catalog is readable; a locator without that access simply gets the picker. */
  derived?: WasherDryerDerivation | null
  idPrefix?: string
}) {
  const id = `${idPrefix}-status`
  const [override, setOverride] = useState(false)

  // ALREADY VERIFIED ⇒ NOTHING TO CHOOSE. When the property data settles it and nobody has
  // recorded anything for this client, the answer is shown rather than asked for. The picker is
  // one click away for the case the locator knows this particular unit is an exception.
  if (!value && derived?.conclusive && derived.status && !override) {
    return (
      <div>
        <span className="text-[10px] font-semibold uppercase tracking-[.05em] text-[var(--crm-text-muted)]">
          This client&apos;s unit · Washer &amp; Dryer
        </span>
        <div className="mt-1 flex items-center justify-between gap-2 rounded-lg border border-[var(--crm-border)] bg-[var(--crm-panel)] px-2 py-1">
          <span className="text-[12px] text-[var(--crm-text-primary)]">{WASHER_DRYER_LABEL[derived.status]}</span>
          <button
            type="button"
            onClick={() => setOverride(true)}
            className="flex-none text-[10.5px] text-[var(--crm-text-muted)] underline transition-colors hover:text-[var(--crm-text-primary)]"
          >
            Change
          </button>
        </div>
        <p className="mt-1.5 text-[10px] leading-snug text-[var(--crm-text-muted)]">
          Verified on the property — {derived.basis.replace(/^Property Intelligence: /, "")}. It is applied when the
          list is sent; change it only if this client&apos;s unit is an exception.
        </p>
      </div>
    )
  }

  // A PERSON'S ANSWER AND THE PROPERTY DATA DISAGREE. Both are shown and neither is touched:
  // one of them is wrong, and which one is not something this control can know.
  const conflict = value && derived?.conclusive && derived.status && derived.status !== value ? derived : null

  return (
    <div>
      <label
        htmlFor={id}
        className="text-[10px] font-semibold uppercase tracking-[.05em] text-[var(--crm-text-muted)]"
      >
        This client&apos;s unit · Washer &amp; Dryer
      </label>
      <select
        id={id}
        value={value ?? ""}
        onChange={(e) => onChange(asWasherDryerStatus(e.target.value))}
        className="mt-1 w-full rounded-lg border border-[var(--crm-border)] bg-[var(--crm-panel)] px-2 py-1 text-[12px] text-[var(--crm-text-primary)] outline-none focus:border-[var(--crm-text-muted)]"
      >
        {WASHER_DRYER_OPTIONS.map((o) => (
          <option key={o.value || "none"} value={o.value}>{o.label}</option>
        ))}
      </select>
      {conflict && (
        <p className="mt-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-1 text-[10px] leading-snug text-amber-600 dark:text-amber-400">
          This client is set to {WASHER_DRYER_LABEL[value as WasherDryerStatus]}, but the property is verified as{" "}
          {WASHER_DRYER_LABEL[conflict.status as WasherDryerStatus]}. Nothing has been changed — the confirmation here
          is what the client sees.
        </p>
      )}
      <p className="mt-1.5 text-[10px] leading-snug text-[var(--crm-text-muted)]">
        {propertyWide
          ? `Confirmed for this client only — it is what their card shows. Property-wide: ${propertyWide}.`
          : "Confirmed for this client only — it is what their card shows."}{" "}
        Not verified shows no badge.
      </p>
    </div>
  )
}

/**
 * The standalone control: a 22×22 button matching the card's existing ✕ and ♡, opening a small
 * panel with nothing in it but the field above. This is what a non-admin locator gets.
 */
export default function ClientUnitWasherDryer({
  canonicalPropertyKey,
  propertyName,
  value,
  onSave,
}: {
  canonicalPropertyKey: string
  propertyName?: string | null
  value: WasherDryerStatus | null
  onSave: (canonicalPropertyKey: string, next: WasherDryerStatus | null) => Promise<boolean>
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<WasherDryerStatus | null>(value)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Re-seed from the saved value on every open, so a cancelled edit cannot leak into the next one.
  useEffect(() => {
    if (!open) return
    setDraft(value)
    setError(null)
  }, [open, value])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [open])

  async function save() {
    // UNCHANGED IS NOT A WRITE. Closing without touching the select must leave the stored value
    // exactly as it was, including its updated_at.
    if (draft === value) { setOpen(false); return }
    setSaving(true)
    setError(null)
    const ok = await onSave(canonicalPropertyKey, draft)
    setSaving(false)
    if (!ok) { setError("Couldn't save. Please try again."); return }
    setOpen(false)
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-label="Confirm washer and dryer for this client"
        title="Washer & Dryer for this client"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-md text-[var(--crm-text-muted)] transition-colors duration-[120ms] hover:text-[var(--crm-text-primary)]"
      >
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <rect x="2.5" y="1.75" width="11" height="12.5" rx="1.75" />
          <circle cx="8" cy="9" r="3.25" />
          <circle cx="5" cy="4.25" r=".6" fill="currentColor" stroke="none" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-1 w-[246px] rounded-xl border border-[var(--crm-border)] bg-[var(--crm-card)] p-2.5 shadow-lg">
          {propertyName && (
            <p className="mb-2 truncate text-[11.5px] font-semibold text-[var(--crm-text-primary)]">{propertyName}</p>
          )}
          <ClientUnitWasherDryerField value={draft} onChange={setDraft} idPrefix={`cuwd-${canonicalPropertyKey}`} />
          {error && <p className="mt-1.5 text-[10.5px] text-red-500">{error}</p>}
          <div className="mt-2 flex justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg px-2 py-1 text-[11.5px] text-[var(--crm-text-muted)] transition-colors hover:text-[var(--crm-text-primary)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-lg bg-[var(--crm-accent)] px-2.5 py-1 text-[11.5px] font-semibold text-white disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
