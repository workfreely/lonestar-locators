"use client"

import { useState } from "react"
import { rankLeadActions } from "@/lib/nextActions"
import { getActionIcon, formatDueDateTime } from "@/lib/actionDisplay"

/** Returns a short action label based on the lead's CRM status and follow-up count. */
function getActionLabel(crm_status: string, follow_up_count: number | null | undefined): string {
  switch (crm_status) {
    case "new":
      return "TEXT ASAP"
    case "contacted":
      return "Send List"
    case "list_sent": {
      const count = Number(follow_up_count ?? 0)
      if (count === 0) return "Tour Favorites"
      if (count === 1) return "List Feedback"
      if (count === 2) return "Final Check"
      return "Pause Search"
    }
    case "ready_to_tour":
      return "Setup Tour"
    case "done_touring":
      return "Tour Follow-Up"
    case "applied":
      return "Check App"
    case "closed":
      return "Invoice Details"
    default:
      return "Follow Up"
  }
}

type FilterType = "overdue" | "today"

export default function FollowUpRow({
  leads,
  nextActions,
  selectedLeadId,
  onSelectLead,
  onCollapse,
}: {
  leads: any[]
  nextActions: any[]
  selectedLeadId?: string | number | null
  onSelectLead?: (leadId: string | number) => void
  onCollapse?: () => void
}) {
  const [activeFilter, setActiveFilter] = useState<FilterType | null>(null)

  // Rank every lead's automatic action against its open manual actions —
  // same ranking LeadPanel uses. Closed / archived leads stay excluded.
  const ranked = leads
    .filter((lead) => lead.crm_status !== "closed" && lead.crm_status !== "archived")
    .map((lead) => ({
      lead,
      ...rankLeadActions(lead, nextActions, getActionLabel(lead.crm_status, lead.follow_up_count)),
    }))

  const dueLeads = ranked.filter(
    ({ primary }) => primary.urgency === "overdue" || primary.urgency === "today"
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
                <polyline points="15 18 9 12 15 6" />
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
            <p>{activeFilter ? "None in this filter" : "No actions due today."}</p>
          </div>
        )}

        {visibleLeads.map(({ lead, primary }) => {
          const isSelected = selectedLeadId != null && String(selectedLeadId) === String(lead.id)
          const urg = primary.urgency === "overdue" ? "crit" : "warn"
          return (
            <div
              key={lead.id}
              onClick={() => onSelectLead?.(lead.id)}
              className={`ag-card${isSelected ? " ag-card--selected" : ""}`}
            >
              <span className={`ag-strip ag-strip--${urg}`} />
              {/* Who */}
              <p className="ag-name">
                {lead.first_name} {lead.last_name}
              </p>
              {/* What */}
              <p className="ag-action">
                {getActionIcon(primary.title)} {primary.title}
              </p>
              {/* When */}
              <p className={`ag-due ag-due--${urg}`}>{primary.dueAt ? formatDueDateTime(primary.dueAt) : ""}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
