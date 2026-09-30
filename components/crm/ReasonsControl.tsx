"use client"

import { useState } from "react"
import { MAX_REASONS } from "@bc/companion-shared"

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
  onSave,
}: {
  reasons: string[]
  onSave: (next: string[]) => Promise<boolean>
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<string[]>(reasons)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function begin() {
    // Seed from the CURRENT saved value every time it opens, so a cancelled edit
    // never leaks into the next one.
    setDraft(reasons.length ? reasons : [""])
    setError(null)
    setOpen(true)
  }

  async function save() {
    const cleaned = draft.map((r) => r.trim()).filter(Boolean).slice(0, MAX_REASONS)
    setSaving(true)
    setError(null)
    const okSaved = await onSave(cleaned)
    setSaving(false)
    if (!okSaved) { setError("Couldn't save. Please try again."); return }
    setOpen(false)
  }

  if (!open) {
    return (
      <div className="flex min-w-0 items-center gap-1.5">
        <button
          type="button"
          onClick={begin}
          className="flex-none text-[10.5px] font-medium text-[var(--crm-text-muted)] underline decoration-[var(--crm-border)] underline-offset-2 transition-colors hover:text-[var(--crm-text-primary)]"
        >
          Why I chose this · Edit
        </button>
        {reasons.length > 0 && (
          <span className="min-w-0 truncate text-[10.5px] text-[var(--crm-text-muted)]">
            {reasons.join(" · ")}
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
