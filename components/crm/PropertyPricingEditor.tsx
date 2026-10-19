"use client"

import { useEffect, useState } from "react"

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
  onebr: number | null
  twobr: number | null
  threebr: number | null
  currentSpecial: string | null
  pricingSource: string | null
  checkedAt: string | null
}

const ENDPOINT = "/api/admin/owner/property-pricing"

function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
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
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const [onebr, setOnebr] = useState("")
  const [twobr, setTwobr] = useState("")
  const [threebr, setThreebr] = useState("")
  const [special, setSpecial] = useState("")
  const [source, setSource] = useState("")
  const [checkedAt, setCheckedAt] = useState(todayIso())

  // Load the CURRENT stored values every time it opens, so a cancelled edit never leaks
  // into the next one and two cards for the same property can never disagree.
  useEffect(() => {
    if (!open) return
    let alive = true
    setLoading(true)
    setError(null)
    setNote(null)
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
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false) }
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

      if (!body.onebr && !body.twobr && !body.threebr && !body.currentSpecial) {
        setError("Enter at least one price or a current special.")
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
          <div className="w-full max-w-[380px] rounded-xl border border-[var(--crm-border)] bg-[var(--crm-panel)] p-4 shadow-xl">
            <div className="mb-3">
              <p className="text-[13px] font-semibold text-[var(--crm-text-primary)]">Property pricing</p>
              <p className="mt-[2px] truncate text-[11px] text-[var(--crm-text-muted)]">{propertyName ?? "This property"}</p>
            </div>

            {loading ? (
              <p className="py-6 text-center text-[12px] text-[var(--crm-text-muted)]">Loading…</p>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2">
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
                    <input type="date" value={checkedAt} onChange={(e) => setCheckedAt(e.target.value)} className={`${field} mt-1 tabular-nums`} />
                  </div>
                </div>
                <p className="mt-1.5 text-[10px] text-[var(--crm-text-muted)]">
                  With a source, the price is recorded as verified; without one it is recorded as unverified. Either way it saves.
                </p>

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
