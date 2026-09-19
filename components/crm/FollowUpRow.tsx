"use client"

import { useState } from "react"
import { rankLeadActions } from "@/lib/nextActions"
import { getNextAction } from "@/lib/nextAction"
import { formatWorkflowActionLabel } from "@/lib/leads/workflowActionLabels"
import { resolveGuestCardPrimary } from "@/lib/leads/guestCardAggregate"
import { getActionIcon, formatDueDateTime } from "@/lib/actionDisplay"
import { isOnHold, holdReminderUrgency, formatHoldFollowUp } from "@/lib/leads/holdWorkflow"
import HoldControls from "./HoldControls"
import { formatPersonName } from "@bc/companion-shared"

// The Agenda no longer keeps its own label switch. Its automatic Next Action is
// the CANONICAL stage action (lib/nextAction.getNextAction — same source the
// Kanban badge / Lead Panel / Companion use), and every displayed title (manual
// or automatic) is run through the shared formatWorkflowActionLabel so wording
// stays aligned everywhere and can't drift. Raw titles are still passed to
// rankLeadActions/getActionIcon so ranking, suppression, and the existing emoji
// lookup keep matching on stable identity.

type FilterType = "overdue" | "today"

export default function FollowUpRow({
  leads,
  nextActions,
  favorites = [],
  selectedLeadId,
  activeLeadId,
  onSelectLead,
  onCollapse,
  // Which outer edge the Agenda collapses toward — drives the collapse arrow
  // direction so it always points at the nearest app edge. Mirrors agendaSide.
  collapseToward = "left",
  timeZone,
  onResumeLead,
  onRescheduleHold,
}: {
  leads: any[]
  nextActions: any[]
  /** Genuine Client Favorites — for the canonical Guest Card aggregation. */
  favorites?: any[]
  selectedLeadId?: string | number | null
  /** The active/current client (Companion's active client). The Lead Board card
   *  shows its visible highlight from this same id (kb-card--active-client), so the
   *  Agenda item highlights on it too — keeping both surfaces in sync. Reuses the
   *  existing active-client identity; no Agenda-only selection state. */
  activeLeadId?: string | number | null
  onSelectLead?: (leadId: string | number) => void
  onCollapse?: () => void
  collapseToward?: "left" | "right"
  // Saved locator IANA timezone — Agenda due times render in this zone.
  timeZone?: string | null
  // On Hold reminder actions (Resume / Reschedule) — same canonical handlers the
  // board's Inactive → On Hold card uses.
  onResumeLead?: (leadId: string | number) => void
  onRescheduleHold?: (leadId: string | number, followUpDate: string) => void
}) {
  const [activeFilter, setActiveFilter] = useState<FilterType | null>(null)

  // An Agenda entry is either a NORMAL ranked Next Action or a HOLD reminder. Both
  // carry an urgency + dueAt so they queue and sort together in one list.
  type Entry = {
    lead: any
    kind: "normal" | "hold"
    urgency: "overdue" | "today" | "upcoming" | "none"
    dueAt: string | null
    primary?: ReturnType<typeof rankLeadActions>["primary"]
  }

  // NORMAL — same ranking LeadPanel/board use. Closed, archived AND held leads are
  // excluded (held leads surface via the hold reminder below, not their dormant
  // Next Action; rankLeadActions already returns an inert sentinel for them).
  const normalEntries: Entry[] = leads
    .filter((lead) => !isOnHold(lead) && lead.crm_status !== "closed" && lead.crm_status !== "archived")
    .map((lead) => {
      const { primary } = rankLeadActions(lead, nextActions, getNextAction(lead))
      return { lead, kind: "normal" as const, urgency: primary.urgency, dueAt: primary.dueAt, primary }
    })
    .filter(
      (e) =>
        // "Next Action" is the generic no-real-step sentinel — never surface it.
        e.primary!.title !== "Next Action" && (e.urgency === "overdue" || e.urgency === "today"),
    )

  // HOLD — a held lead surfaces a "Follow Up · Lead On Hold" reminder on its
  // hold_follow_up_at (today/overdue). A reminder only; it never resumes the lead.
  const holdEntries: Entry[] = leads
    .filter((lead) => isOnHold(lead) && lead.crm_status !== "archived")
    .map((lead) => ({
      lead,
      kind: "hold" as const,
      urgency: holdReminderUrgency(lead.hold_follow_up_at),
      dueAt: lead.hold_follow_up_at ?? null,
    }))
    .filter((e) => e.urgency === "overdue" || e.urgency === "today")

  const dueEntries: Entry[] = [...normalEntries, ...holdEntries]

  const filterMatch = (e: Entry): boolean => {
    if (!activeFilter) return true
    return e.urgency === activeFilter
  }

  // Overdue first, then today's; within each bucket, earliest due first.
  const visibleLeads = dueEntries.filter(filterMatch).sort((a, b) => {
    const urgencyRank = (u: string) => (u === "overdue" ? 0 : 1)
    const diff = urgencyRank(a.urgency) - urgencyRank(b.urgency)
    if (diff !== 0) return diff
    const aTime = a.dueAt ? new Date(a.dueAt).getTime() : 0
    const bTime = b.dueAt ? new Date(b.dueAt).getTime() : 0
    return aTime - bTime
  })

  const dueLeads = dueEntries

  function toggleFilter(f: FilterType) {
    setActiveFilter((prev) => (prev === f ? null : f))
  }

  const filterTabs: { key: FilterType; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "overdue", label: "Overdue" },
  ]

  return (
    <div className="ag-root">
      {/* Header — the day's work queue */}
      <div className="ag-head">
        <h2 className="ag-title">Agenda</h2>
        <div className="ag-head-right">
          {dueLeads.length > 0 && <span className="ag-count">{dueLeads.length}</span>}
          {onCollapse && (
            <button onClick={onCollapse} className="ag-collapse" aria-label="Collapse Agenda" title="Collapse Agenda">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points={collapseToward === "right" ? "9 18 15 12 9 6" : "15 18 9 12 15 6"} />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Segmented filter */}
      <div className="ag-filter" role="group" aria-label="Agenda filter">
        {filterTabs.map(({ key, label }) => (
          <button key={key} type="button" aria-pressed={activeFilter === key} onClick={() => toggleFilter(key)}>
            {label}
          </button>
        ))}
      </div>

      <div className="ag-list">
        {visibleLeads.length === 0 && (
          <div className="ag-empty">
            <div className="ag-empty-ic">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 7l3.5 3.5L12 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <p>{activeFilter === "overdue" ? "Nothing overdue." : activeFilter === "today" ? "Nothing due." : "Nothing due today."}</p>
          </div>
        )}

        {visibleLeads.map((entry) => {
          const { lead, kind } = entry
          // Highlight the current client on the SAME identity the Lead Board card
          // uses: the CRM selection (selectedLeadId) OR the active client
          // (activeLeadId). Keeps the Agenda item and the board card in sync.
          const isSelected =
            (selectedLeadId != null && String(selectedLeadId) === String(lead.id)) ||
            (activeLeadId != null && String(activeLeadId) === String(lead.id))
          const urg = entry.urgency === "overdue" ? "crit" : "warn"

          // HOLD reminder — "Follow Up / Lead On Hold" on hold_follow_up_at. A
          // reminder only: it offers Resume / Reschedule but never auto-resumes.
          if (kind === "hold") {
            return (
              <div
                key={lead.id}
                onClick={() => onSelectLead?.(lead.id)}
                className={`ag-card${isSelected ? " ag-card--selected" : ""}`}
              >
                <span className={`ag-strip ag-strip--${urg}`} />
                <p className="ag-name">{formatPersonName(`${lead.first_name ?? ""} ${lead.last_name ?? ""}`)}</p>
                <p className="ag-action">{getActionIcon("Follow Up")} Follow Up</p>
                <p className="ag-action" style={{ opacity: 0.7, marginTop: -2 }}>Lead On Hold</p>
                <p className={`ag-due ag-due--${urg}`}>{formatHoldFollowUp(entry.dueAt)}</p>
                <HoldControls
                  leadId={lead.id}
                  followUpAt={entry.dueAt}
                  onResume={onResumeLead}
                  onReschedule={onRescheduleHold}
                  size="xs"
                />
              </div>
            )
          }

          const primary = entry.primary!
          // Canonical Guest Card Primary Next Action presentation (shared helper):
          // 2+ outstanding genuine-Favorite Guest Cards → "Send Guest Cards · N
          // properties"; 1 → "Send Guest Card · {Property}". Non-guest-card → normal.
          const gcPrimary = primary.manualAction
            ? resolveGuestCardPrimary(lead.id, primary.manualAction, nextActions, favorites)
            : null
          return (
            <div
              key={lead.id}
              onClick={() => onSelectLead?.(lead.id)}
              className={`ag-card${isSelected ? " ag-card--selected" : ""}`}
            >
              <span className={`ag-strip ag-strip--${urg}`} />
              {/* Who */}
              <p className="ag-name">
                {formatPersonName(`${lead.first_name ?? ""} ${lead.last_name ?? ""}`)}
              </p>
              {/* What */}
              <p className="ag-action">
                {getActionIcon(primary.title)} {gcPrimary ? gcPrimary.title : formatWorkflowActionLabel(primary.title)}
              </p>
              {gcPrimary && (
                <p className="ag-action" style={{ opacity: 0.7, marginTop: -2 }}>{gcPrimary.detail}</p>
              )}
              {/* When */}
              <p className={`ag-due ag-due--${urg}`}>{primary.dueAt ? formatDueDateTime(primary.dueAt, { timeZone: timeZone ?? undefined }) : ""}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
