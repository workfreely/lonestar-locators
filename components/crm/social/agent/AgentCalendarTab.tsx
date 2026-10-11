"use client"

import type { AgentVideo } from "./AgentSocialClient"
import { dateKey, timeLabel } from "@/lib/social/calendar"

// CALENDAR — the agent's own upcoming posts.
//
// REUSES lib/social/calendar's date helpers rather than re-deriving them, so an agent and the
// admin read the same instant the same way. It deliberately does NOT reuse CalendarShell: that
// component self-fetches the admin's scope and renders month/week/day views over the whole
// account, which is both more than an agent needs and the wrong data. Sharing the HELPERS is the
// reuse that matters; sharing the shell would mean teaching it two scopes.
//
// Stage 3 shows scheduled items grouped by day. Clicking one opens the SAME property panel the
// library opens — the promise that a property reads identically wherever it is clicked.
export default function AgentCalendarTab({ videos, onOpen }: { videos: AgentVideo[]; onOpen: (id: string) => void }) {
  const scheduled = videos
    .filter((v) => v.scheduledAt)
    .sort((a, b) => (a.scheduledAt! < b.scheduledAt! ? -1 : 1))

  if (scheduled.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--crm-border)] bg-[var(--crm-card)] px-4 py-8 text-center">
        <p className="text-[14px] font-medium">Nothing scheduled</p>
        <p className="mt-1 text-[12.5px] text-[var(--crm-text-muted)]">
          Approved videos will appear here once posting is scheduled for your account.
        </p>
      </div>
    )
  }

  // Group by local day using the shared key, so two posts on one evening read as one day.
  const byDay = new Map<string, AgentVideo[]>()
  for (const v of scheduled) {
    const k = dateKey(new Date(v.scheduledAt!))
    byDay.set(k, [...(byDay.get(k) ?? []), v])
  }

  return (
    <div className="flex flex-col gap-4">
      {[...byDay.entries()].map(([day, items]) => (
        <section key={day}>
          <h3 className="mb-2 text-[11px] uppercase tracking-wide text-[var(--crm-text-muted)]">{day}</h3>
          <div className="flex flex-col gap-2">
            {items.map((v) => (
              <button
                key={v.contentId} type="button" onClick={() => onOpen(v.contentId)}
                className="flex items-center gap-3 rounded-lg border border-[var(--crm-border)] bg-[var(--crm-card)] px-3 py-2.5 text-left hover:bg-[var(--crm-workspace)]"
              >
                <div className="flex h-12 w-9 shrink-0 items-center justify-center rounded bg-black/60 text-[9px] text-[var(--crm-text-muted)]">
                  {v.durationSeconds ? `${Math.round(v.durationSeconds)}s` : "▶"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{v.propertyName ?? "Untitled property"}</p>
                  <p className="truncate text-[11.5px] text-[var(--crm-text-muted)]">
                    {[v.city, v.propertyType].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[12px] tabular-nums">{timeLabel(v.scheduledAt)}</p>
                  <p className="text-[10.5px] text-[var(--crm-text-muted)]">{v.status}</p>
                </div>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
