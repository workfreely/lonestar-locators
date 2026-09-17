"use client"

import { useState } from "react"
import { rankLeadActions } from "@/lib/nextActions"
import { getNextAction } from "@/lib/nextAction"
import { formatWorkflowActionLabel } from "@/lib/leads/workflowActionLabels"
import { resolveGuestCardPrimary } from "@/lib/leads/guestCardAggregate"
import { getActionIcon, formatDueDateTime } from "@/lib/actionDisplay"
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
}) {
  const [activeFilter, setActiveFilter] = useState<FilterType | null>(null)

  // Rank every lead's automatic action against its open manual actions —
  // same ranking LeadPanel uses. Closed / archived leads stay excluded.
  const ranked = leads
    .filter((lead) => lead.crm_status !== "closed" && lead.crm_status !== "archived")
    .map((lead) => ({
      lead,
      ...rankLeadActions(lead, nextActions, getNextAction(lead)),
    }))

  const dueLeads = ranked.filter(
    ({ primary }) =>
      // "Next Action" is the generic no-real-step sentinel (e.g. a List Sent
      // client whose Final Follow-Up is done) — never surface it in the Agenda.
      primary.title !== "Next Action" &&
      (primary.urgency === "overdue" || primary.urgency === "today")
  )

  const filterMatch = ({ primary }: (typeof ranked)[number]): boolean => {
    if (!activeFilter) return true
    if (activeFilter === "overdue") return primary.urgency === "overdue"
    if (activeFilter === "today") return primary.urgency === "today"
    return true
  }

  // Overdue first, then today's; within each bucket, earliest due first.
  const visibleLeads = dueLeads.filter(filterMatch).sort((a, b) => {
    const urgencyRank = (u: string) => (u === "overdue" ? 0 : 1)
    const diff = urgencyRank(a.primary.urgency) - urgencyRank(b.primary.urgency)
    if (diff !== 0) return diff
    const aTime = a.primary.dueAt ? new Date(a.primary.dueAt).getTime() : 0
    const bTime = b.primary.dueAt ? new Date(b.primary.dueAt).getTime() : 0
    return aTime - bTime
  })

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

        {visibleLeads.map(({ lead, primary }) => {
          // Highlight the current client on the SAME identity the Lead Board card
          // uses: the CRM selection (selectedLeadId) OR the active client
          // (activeLeadId). Keeps the Agenda item and the board card in sync.
          const isSelected =
            (selectedLeadId != null && String(selectedLeadId) === String(lead.id)) ||
            (activeLeadId != null && String(activeLeadId) === String(lead.id))
          const urg = primary.urgency === "overdue" ? "crit" : "warn"
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
