"use client"

import { useEffect, useState } from "react"

/**
 * Compact "has the client actually opened their list?" line for the client panel.
 *
 * Reads the EXISTING view data — view_session_count and last_viewed_at, already served per-lead by
 * GET /api/admin/client-shares?leadId= — so there is no second tracking system and no new endpoint.
 * A deliberately small status row rather than a card: the panel is dense, and this is a one-glance
 * fact, not a section.
 *
 * Counts are summed across the client's lists, and "last viewed" is the most recent across them,
 * because the question an agent is actually asking is "has this person looked at what I sent", not
 * "what happened to list #3".
 */
type ShareRow = { viewSessionCount?: number | null; lastViewedAt?: string | null }

/** "18 min ago" / "3 hr ago" / "2 days ago" — same shorthand register as the rest of the panel. */
function ago(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return "just now"
  const min = Math.floor(ms / 60000)
  if (min < 1) return "just now"
  if (min < 60) return `${min} min ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} hr ago`
  const d = Math.floor(hr / 24)
  return d === 1 ? "yesterday" : `${d} days ago`
}

export default function RecommendationEngagement({ leadId }: { leadId: number | string }) {
  const [rows, setRows] = useState<ShareRow[] | null>(null)

  useEffect(() => {
    let cancelled = false
    // Demo leads have string ids and no real shares — never fetch for them.
    if (typeof leadId === "string" && !/^\d+$/.test(leadId)) { setRows([]); return }
    void (async () => {
      try {
        const res = await fetch(`/api/admin/client-shares?leadId=${encodeURIComponent(String(leadId))}`, {
          headers: { Accept: "application/json" },
        })
        if (!res.ok) { if (!cancelled) setRows([]); return }
        // The per-lead branch answers { shares: [...] }; the workspace-wide branch answers
        // { items: [...] }. Accept both rather than assuming — reading the wrong key silently
        // yields an empty list, which renders a confident and WRONG "Not viewed yet".
        const json = (await res.json()) as { shares?: ShareRow[]; items?: ShareRow[] }
        const list = Array.isArray(json.shares) ? json.shares : Array.isArray(json.items) ? json.items : []
        if (!cancelled) setRows(list)
      } catch {
        if (!cancelled) setRows([]) // a stats line must never surface an error into the panel
      }
    })()
    return () => { cancelled = true }
  }, [leadId])

  if (rows === null) return null // nothing until it resolves — no layout jump, no spinner for one line
  const views = rows.reduce((n, r) => n + (r.viewSessionCount ?? 0), 0)
  const last = rows
    .map((r) => r.lastViewedAt)
    .filter((v): v is string => !!v)
    .sort()
    .pop()

  return (
    <div className="mt-1 text-[11.5px] text-[var(--crm-text-muted)]">
      {views > 0 && last ? (
        <>
          <span className="font-semibold text-[var(--crm-text-secondary)]">Viewed {views}×</span>
          {" · "}
          <span>Last viewed {ago(last)}</span>
        </>
      ) : (
        <span>Not viewed yet</span>
      )}
    </div>
  )
}
