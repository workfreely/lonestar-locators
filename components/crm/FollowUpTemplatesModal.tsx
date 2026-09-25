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

// The Follow-Up Agent's canonical client-facing messages, grouped by lifecycle.
// Content only — this editor never exposes timing, sequences, the grace period,
// branching thresholds, reactivation timing, send authorization, pacing, stop/
// supersede rules, internal keys, or classifier prompts. Defaults come from the
// single canonical source (DEFAULT_FOLLOW_UP_TEMPLATES) — never re-typed here.
//
// Legacy keys (intro, text_top_3, follow_up_3, final_follow_up) are intentionally
// NOT shown: they are superseded by the canonical templates below, but remain
// stored + honored by the current manual Companion flow. Any existing override on
// them is PRESERVED (seeded and re-saved untouched), never dropped.
type Field = { key: FollowUpTemplateKey; name: string; note?: string }
const GROUPS: { label: string; fields: Field[] }[] = [
  {
    label: "New Lead",
    fields: [
      {
        key: "new_lead_text1",
        name: "Initial Text 1",
        note: 'Keep {search_tail} — the client’s search context (“ for a 1 bedroom move in October.”) is composed there automatically, and left out gracefully when unknown (“…I got your form!”).',
      },
      { key: "new_lead_text2", name: "Initial Text 2" },
      { key: "contact_follow_up_1", name: "New-Lead Follow-Up 1" },
      { key: "contact_follow_up_2", name: "New-Lead Follow-Up 2" },
      { key: "contact_follow_up_3", name: "New-Lead Final Follow-Up" },
    ],
  },
  {
    label: "List Sent",
    fields: [
      { key: "follow_up_1", name: "Follow-Up 1" },
      { key: "follow_up_2", name: "Follow-Up 2" },
      { key: "list_fu3_favorites", name: "Follow-Up 3 — Favorites" },
      { key: "list_fu3_no_favorites", name: "Follow-Up 3 — No Favorites" },
      { key: "list_final", name: "Final Follow-Up" },
    ],
  },
  {
    label: "Favorites & Tours",
    fields: [
      { key: "ds_needs_availability", name: "Favorites / availability needed" },
      { key: "ds_availability_submitted", name: "Favorites + availability submitted" },
      { key: "ds_tour_now_or_wait", name: "Future Move — Tour Now or Wait" },
      { key: "future_move_wait_ack", name: "Future Move — Wait acknowledgment" },
      { key: "future_move_reactivate", name: "Future Move — 90-day reactivation" },
      {
        key: "post_tour",
        name: "Post-Tour Follow-Up (one tour)",
        note: "Sent 2 hours after the end of the client's last confirmed tour that day. Multiple same-day tours count as one session and use the plural version below.",
      },
      { key: "post_tour_multi", name: "Post-Tour Follow-Up (multiple tours)" },
    ],
  },
  {
    label: "Application",
    fields: [{ key: "application_status", name: "Application Status Follow-Up" }],
  },
  {
    label: "Resume Search",
    fields: [
      {
        key: "resume_search",
        name: "Resume Search",
        note: "Sent when a client taps “Resume Your Search” on a paused list. This is an event-triggered message, separate from the New Lead sequence.",
      },
    ],
  },
]
const ALL_FIELDS: Field[] = GROUPS.flatMap((g) => g.fields)
const TALL_KEYS = new Set<FollowUpTemplateKey>([
  "new_lead_text1",
  "list_fu3_favorites",
  "list_fu3_no_favorites",
  "list_final",
  "ds_needs_availability",
  "ds_availability_submitted",
  "ds_tour_now_or_wait",
  "future_move_wait_ack",
  "future_move_reactivate",
  "resume_search",
])

export default function FollowUpTemplatesModal({
  open,
  onClose,
  initialOverrides = {},
  onSaved,
}: {
  open: boolean
  onClose: () => void
  initialOverrides?: FollowUpOverrides
  onSaved?: (overrides: FollowUpOverrides) => void
}) {
  const [values, setValues] = useState<Record<FollowUpTemplateKey, string>>(() => seed(initialOverrides))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const refs = useRef<Partial<Record<FollowUpTemplateKey, HTMLTextAreaElement | null>>>({})

  useEffect(() => {
    if (open) { setValues(seed(initialOverrides)); setError(null) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (typeof window === "undefined") return
    window.dispatchEvent(new CustomEvent("lb:lead-modal", { detail: { open } }))
    return () => {
      window.dispatchEvent(new CustomEvent("lb:lead-modal", { detail: { open: false } }))
    }
  }, [open])

  if (!open) return null

  const overFor = (k: FollowUpTemplateKey) => values[k].length > TEMPLATE_CHAR_LIMITS[k]
  const anyOver = ALL_FIELDS.some((f) => overFor(f.key))
  // Soft warning only (never blocks): Text 1 without {search_tail} loses the
  // gracefully-composed search clause + ending punctuation.
  const missingSearchTail = values.new_lead_text1.trim() !== "" && !values.new_lead_text1.includes("{search_tail}")
  const canSave = !saving && !anyOver

  function insertToken(key: FollowUpTemplateKey, token: string) {
    const el = refs.current[key]
    const insert = `{${token}}`
    setValues((prev) => {
      const cur = prev[key]
      const start = el?.selectionStart ?? cur.length
      const end = el?.selectionEnd ?? cur.length
      const next = cur.slice(0, start) + insert + cur.slice(end)
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
      // Send the FULL value map (all keys, incl. unshown legacy ones seeded from
      // existing overrides). The sanitizer drops any key equal to its default, so
      // stored overrides = exactly the customized ones — nothing is lost.
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
      <div className="w-full max-w-[700px] h-full bg-[var(--crm-panel)] shadow-2xl overflow-y-auto">
        {/* HEADER — title reuses the Guest Card modal heading typography exactly. */}
        <div className="sticky top-0 bg-[var(--crm-panel)] border-b border-[var(--crm-border)] px-6 py-5 z-20 flex items-center justify-between">
          <div>
            <h3 className="text-[18px] font-bold text-[var(--crm-text-primary)]">Edit Follow-up Templates</h3>
            <div className="text-sm text-[var(--crm-text-secondary)] mt-1">Customize the messages used in your follow-up workflow.</div>
          </div>
          <button onClick={onClose} className="text-[var(--crm-text-muted)] hover:text-[var(--crm-text-primary)] text-xl" aria-label="Close">✕</button>
        </div>

        {/* BODY — grouped by lifecycle. */}
        <div className="p-6 space-y-8">
          {GROUPS.map((group) => (
            <section key={group.label} className="space-y-6">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--crm-text-muted)] border-b border-[var(--crm-border)] pb-1.5">
                {group.label}
              </div>
              {group.fields.map((f) => {
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
                      rows={TALL_KEYS.has(f.key) ? 4 : 3}
                      className="w-full border border-[var(--crm-border)] rounded-lg px-3 py-2 text-sm text-[var(--crm-text-primary)] bg-[var(--crm-inset)] placeholder-[var(--crm-text-muted)] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                    />

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

                    {f.key === "new_lead_text1" && missingSearchTail && (
                      <p className="mt-1 text-[11px] font-medium text-amber-500">Tip: keep {"{search_tail}"} so the search context and ending punctuation are added automatically.</p>
                    )}
                    {over && (
                      <p className="mt-1 text-[11px] font-medium text-red-500">Over the {limit}-character limit — shorten to save.</p>
                    )}
                  </div>
                )
              })}
            </section>
          ))}
        </div>

        {/* FOOTER */}
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

// Seed the editable text for EVERY canonical key: saved override if present, else
// default. Includes unshown legacy keys so their overrides ride through save
// untouched (the RPC does a full replace; the sanitizer keeps only non-defaults).
function seed(overrides: FollowUpOverrides): Record<FollowUpTemplateKey, string> {
  const clean = sanitizeFollowUpOverrides(overrides).overrides
  const out = {} as Record<FollowUpTemplateKey, string>
  for (const key of Object.keys(DEFAULT_FOLLOW_UP_TEMPLATES) as FollowUpTemplateKey[]) {
    out[key] = clean[key] ?? DEFAULT_FOLLOW_UP_TEMPLATES[key]
  }
  return out
}
