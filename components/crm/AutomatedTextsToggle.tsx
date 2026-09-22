"use client"

import { useState } from "react"
import { SectionCard } from "./LeadPanelSections"

/**
 * Per-client Automated Texts On/Off (Client Workspace).
 *
 * Mounted ONLY for an authorized account (the parent gates on server-resolved
 * authorization), so this control is never shown to unauthorized locators. The
 * flip goes through POST /api/leads/[id]/automated-texting — the only normal
 * writer of leads.followup_opt_in (direct client PostgREST writes are revoked).
 * Compact; exposes no timing/sequence/authorization internals.
 */
export default function AutomatedTextsToggle({
  leadId,
  initialEnrolled,
  onEnrolledChange,
}: {
  leadId: string | number | null
  initialEnrolled: boolean
  onEnrolledChange?: (enabled: boolean) => void
}) {
  const [enrolled, setEnrolled] = useState(initialEnrolled)
  const [busy, setBusy] = useState(false)

  if (leadId == null) return null

  async function toggle() {
    const next = !enrolled
    setBusy(true)
    try {
      const res = await fetch(`/api/leads/${leadId}/automated-texting`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      })
      if (res.ok) {
        setEnrolled(next)
        onEnrolledChange?.(next)
      }
    } catch {
      /* keep prior state on failure */
    } finally {
      setBusy(false)
    }
  }

  return (
    <SectionCard title="Automated Texts" defaultOpen storageKey="client-workspace-automated-texts">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-[var(--crm-text-secondary)]">
          {enrolled ? "On — approved follow-ups are automated for this client." : "Off — no automated texts for this client."}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={enrolled}
          disabled={busy}
          onClick={toggle}
          className={`relative inline-flex h-6 w-11 flex-none items-center rounded-full transition-colors disabled:opacity-50 ${enrolled ? "bg-emerald-500" : "bg-[var(--crm-border)]"}`}
        >
          <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${enrolled ? "translate-x-5" : "translate-x-0.5"}`} />
        </button>
      </div>
    </SectionCard>
  )
}
