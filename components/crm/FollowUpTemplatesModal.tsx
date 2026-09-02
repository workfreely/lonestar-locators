"use client"

import { useEffect, useRef, useState } from "react"
import {
  DEFAULT_FOLLOW_UP_TEMPLATES,
  TEMPLATE_CHAR_LIMITS,
  AGENT_TEMPLATE_VARIABLES,
  sanitizeFollowUpOverrides,
  type FollowUpTemplateKey,
  type FollowUpOverrides,
} from "@bc/companion-shared"
import { saveFollowUpTemplateOverrides } from "@/lib/followUpTemplates"

// Fixed heading + helper note per editable template. Order matches the workflow
// reading order but is display-only — this editor never exposes timing, sequence,
// stages, Next Actions, or automation.
const FIELDS: { key: FollowUpTemplateKey; name: string; note?: string }[] = [
  { key: "intro", name: "Intro Text", note: "The first text sent to a new lead." },
  { key: "text_top_3", name: "Text Top 3", note: "Keep {property_list} — your Top 3 properties and links are inserted there automatically." },
  { key: "follow_up_1", name: "1st Follow-Up" },
  { key: "follow_up_2", name: "2nd Follow-Up" },
  { key: "follow_up_3", name: "3rd Follow-Up" },
  { key: "final_follow_up", name: "Final Follow-Up" },
]

// Uses the SAME slideover shell as Add Lead / Edit Client (LeadFormModal): same
// overlay, 700px right panel, sticky header title/subtitle, scroll behavior, and
// the lower-right Cancel / Save Changes footer. Only the body fields differ.
export default function FollowUpTemplatesModal({
  open,
  onClose,
  initialOverrides = {},
  onSaved,
}: {
  open: boolean
  onClose: () => void
  /** Current workspace overrides (already sanitized upstream). */
  initialOverrides?: FollowUpOverrides
  /** Called with the new sanitized overrides after a successful save. */
  onSaved?: (overrides: FollowUpOverrides) => void
}) {
  // Editable text per template: the saved override if present, else the default.
  const [values, setValues] = useState<Record<FollowUpTemplateKey, string>>(() => seed(initialOverrides))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const refs = useRef<Partial<Record<FollowUpTemplateKey, HTMLTextAreaElement | null>>>({})

  // Re-seed whenever the editor opens (picks up the latest saved overrides).
  useEffect(() => {
    if (open) { setValues(seed(initialOverrides)); setError(null) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Let global surfaces (Ask Beast AI) step aside while this slideover is up —
  // the SAME event the lead modal uses, so the behavior is identical.
  useEffect(() => {
    if (typeof window === "undefined") return
    window.dispatchEvent(new CustomEvent("lb:lead-modal", { detail: { open } }))
    return () => {
      window.dispatchEvent(new CustomEvent("lb:lead-modal", { detail: { open: false } }))
    }
  }, [open])

  if (!open) return null

  const overFor = (k: FollowUpTemplateKey) => values[k].length > TEMPLATE_CHAR_LIMITS[k]
  // Protect Text Top 3's property list: a customized Text Top 3 must keep the
  // {property_list} token, or the properties/links would drop from the message.
  const missingList = values.text_top_3.trim() !== "" && !values.text_top_3.includes("{property_list}")
  const anyOver = FIELDS.some((f) => overFor(f.key))
  const canSave = !saving && !anyOver && !missingList

  function insertToken(key: FollowUpTemplateKey, token: string) {
    const el = refs.current[key]
    const insert = `{${token}}` // bare token only — no surrounding spaces
    setValues((prev) => {
      const cur = prev[key]
      const start = el?.selectionStart ?? cur.length
      const end = el?.selectionEnd ?? cur.length
      const next = cur.slice(0, start) + insert + cur.slice(end)
      // Restore focus + caret just after the inserted token.
      requestAnimationFrame(() => {
        const node = refs.current[key]
        if (node) { node.focus(); const pos = start + insert.length; node.setSelectionRange(pos, pos) }
      })
      return { ...prev, [key]: next }
    })
  }

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    setError(null)
    try {
      await saveFollowUpTemplateOverrides(values)
      onSaved?.(sanitizeFollowUpOverrides(values).overrides)
      onClose()
    } catch (e) {
      console.error(e)
      setError("Could not save changes. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[10001] bg-black/40 backdrop-blur-sm flex justify-end">
      {/* PANEL */}
      <div className="w-full max-w-[700px] h-full bg-[var(--crm-panel)] shadow-2xl overflow-y-auto">
        {/* HEADER */}
        <div className="sticky top-0 bg-[var(--crm-panel)] border-b border-[var(--crm-border)] px-6 py-5 z-20 flex items-center justify-between">
          <div>
            <div className="text-2xl font-black tracking-tight text-[var(--crm-text-primary)]">Edit Follow-up Templates</div>
            <div className="text-sm text-[var(--crm-text-secondary)] mt-1">Customize the messages used in your follow-up workflow.</div>
          </div>
          <button onClick={onClose} className="text-[var(--crm-text-muted)] hover:text-[var(--crm-text-primary)] text-xl" aria-label="Close">✕</button>
        </div>

        {/* BODY */}
        <div className="p-6 space-y-6">
          {FIELDS.map((f) => {
            const val = values[f.key]
            const limit = TEMPLATE_CHAR_LIMITS[f.key]
            const over = val.length > limit
            const near = !over && val.length >= Math.floor(limit * 0.9)
            const isDefault = val === DEFAULT_FOLLOW_UP_TEMPLATES[f.key]
            return (
              <div key={f.key}>
                <div className="flex items-baseline justify-between mb-1.5">
                  <label className="text-sm font-semibold text-[var(--crm-text-primary)]">{f.name}</label>
                  <button
                    type="button"
                    onClick={() => setValues((p) => ({ ...p, [f.key]: DEFAULT_FOLLOW_UP_TEMPLATES[f.key] }))}
                    disabled={isDefault}
                    className="text-xs font-medium text-[var(--crm-text-muted)] hover:text-[var(--crm-text-primary)] disabled:opacity-40 disabled:cursor-default"
                  >
                    Reset to Default
                  </button>
                </div>

                {f.note && <p className="text-xs text-[var(--crm-text-muted)] mb-2">{f.note}</p>}

                <textarea
                  ref={(el) => { refs.current[f.key] = el }}
                  value={val}
                  onChange={(e) => setValues((p) => ({ ...p, [f.key]: e.target.value }))}
                  rows={f.key === "text_top_3" || f.key === "intro" || f.key === "final_follow_up" ? 4 : 3}
                  className="w-full border border-[var(--crm-border)] rounded-lg px-3 py-2 text-sm text-[var(--crm-text-primary)] bg-[var(--crm-inset)] placeholder-[var(--crm-text-muted)] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />

                {/* Variable buttons — insert a bare token at the cursor. */}
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-[var(--crm-text-muted)] mr-0.5">Insert:</span>
                  {AGENT_TEMPLATE_VARIABLES.map((v) => (
                    <button
                      key={v.token}
                      type="button"
                      onClick={() => insertToken(f.key, v.token)}
                      className="rounded-full border border-[var(--crm-border)] bg-[var(--crm-inset)] px-2.5 py-1 text-[11px] font-medium text-[var(--crm-text-secondary)] hover:text-[var(--crm-text-primary)] hover:border-[var(--crm-text-muted)] transition-colors"
                      title={`Insert {${v.token}}`}
                    >
                      {v.label}
                    </button>
                  ))}
                  <span
                    className={`ml-auto text-[11px] font-medium tabular-nums ${
                      over ? "text-red-500" : near ? "text-amber-500" : "text-[var(--crm-text-muted)]"
                    }`}
                  >
                    {val.length} / {limit}
                  </span>
                </div>

                {f.key === "text_top_3" && missingList && (
                  <p className="mt-1 text-[11px] font-medium text-red-500">Add {"{property_list}"} back so your Top 3 properties are included.</p>
                )}
                {over && (
                  <p className="mt-1 text-[11px] font-medium text-red-500">Over the {limit}-character limit — shorten to save.</p>
                )}
              </div>
            )
          })}
        </div>

        {/* FOOTER — lower-right Cancel / Save Changes, same as the lead modal. */}
        <div className="border-t border-[var(--crm-border)] px-6 pt-5 pb-6 flex flex-col items-end gap-2">
          {error && <p className="text-[12px] font-medium text-red-500 self-start">{error}</p>}
          <div className="flex justify-end gap-3">
            <button onClick={onClose} className="px-5 py-3 rounded-2xl border border-[var(--crm-border)] text-sm font-medium text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)]">
              Cancel
            </button>
            <button onClick={handleSave} disabled={!canSave} className="crm-cta px-5 py-3 rounded-2xl text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed">
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Seed the editable text per template: saved override if present, else default.
function seed(overrides: FollowUpOverrides): Record<FollowUpTemplateKey, string> {
  const clean = sanitizeFollowUpOverrides(overrides).overrides
  const out = {} as Record<FollowUpTemplateKey, string>
  for (const key of Object.keys(DEFAULT_FOLLOW_UP_TEMPLATES) as FollowUpTemplateKey[]) {
    out[key] = clean[key] ?? DEFAULT_FOLLOW_UP_TEMPLATES[key]
  }
  return out
}
