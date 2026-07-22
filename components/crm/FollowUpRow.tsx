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
      return "Request Referral"
    default:
      return "Follow Up"
  }
}

type FilterType = "overdue" | "today"

export default function FollowUpRow({
  leads,
  nextActions,
  onSelectLead,
  onCollapse,
}: {
  leads: any[]
  nextActions: any[]
  onSelectLead?: (leadId: string | number) => void
  onCollapse?: () => void
}) {
  const [activeFilter, setActiveFilter] = useState<FilterType | null>(null)

  // Rank every lead's automatic action against its open manual actions —
  // same ranking LeadPanel uses, so the icon/label shown here for a lead
  // always agrees with what that lead's panel shows as primary. Closed
  // and archived leads stay excluded from the queue entirely — archived
  // leads are out of the active workflow (rankLeadActions itself already
  // returns urgency "none" for them, so this is belt-and-suspenders, not
  // load-bearing); their manual actions still exist in the database, just
  // not surfaced here while archived.
  const ranked = leads
    .filter((lead) => lead.crm_status !== "closed" && lead.crm_status !== "archived")
    .map((lead) => ({
      lead,
      ...rankLeadActions(lead, nextActions, getActionLabel(lead.crm_status, lead.follow_up_count)),
    }))

  // Leads whose primary action is due today or already overdue — direct
  // generalization of the old next_action_date-only check: when a lead has
  // no manual actions, ranking reduces to exactly that same check.
  const dueLeads = ranked.filter(
    ({ primary }) => primary.urgency === "overdue" || primary.urgency === "today"
  )

  // Filter buckets
  const filterMatch = ({ primary }: (typeof ranked)[number]): boolean => {
    if (!activeFilter) return true
    if (activeFilter === "overdue") return primary.urgency === "overdue"
    if (activeFilter === "today")   return primary.urgency === "today"
    return true
  }

  // Sort: overdue first, then today's actions — within each bucket,
  // earliest due time first.
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
    { key: "today",   label: "Today"   },
    { key: "overdue", label: "Overdue" },
  ]

  return (
    <div className="flex flex-col h-full">

      {/* Sidebar header — the user's daily work queue */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <h2 className="text-xs font-semibold text-white/80 uppercase tracking-widest">
          Actions Due
        </h2>
        <div className="flex items-center gap-1.5">
          {dueLeads.length > 0 && (
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold">
              {dueLeads.length}
            </span>
          )}
          {onCollapse && (
            <button
              onClick={onCollapse}
              className="w-5 h-5 flex items-center justify-center rounded text-white/40 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Collapse Actions Due"
              title="Collapse Actions Due"
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Segmented filter control */}
      <div className="px-3 pt-2.5 pb-1">
        <div className="flex rounded-lg overflow-hidden border border-white/10 bg-white/5">
          {filterTabs.map(({ key, label }, i) => (
            <button
              key={key}
              onClick={() => toggleFilter(key)}
              className={[
                "flex-1 py-1 text-[10.5px] font-semibold tracking-wide transition-colors",
                i !== 0 ? "border-l border-white/10" : "",
                activeFilter === key
                  ? "bg-white/20 text-white"
                  : "text-white/40 hover:text-white/65 hover:bg-white/8",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">

        {visibleLeads.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 7l3.5 3.5L12 3" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <p className="text-xs text-white/40 leading-snug">
              {activeFilter ? "None in this filter" : "No actions due today."}
            </p>
          </div>
        )}

        {visibleLeads.map(({ lead, primary }) => (
          <div
            key={lead.id}
            onClick={() => onSelectLead?.(lead.id)}
            className="group relative bg-white/10 backdrop-blur-sm border border-white/10 rounded-2xl px-3 py-2.5
              cursor-pointer transition-all duration-200 ease-out
              shadow-[0_1px_2px_rgba(15,23,42,0.05),0_4px_10px_rgba(15,23,42,0.07),0_10px_24px_rgba(15,23,42,0.10)]
              hover:bg-white/15 hover:border-blue-400/40 hover:-translate-y-0.5
              hover:shadow-[0_4px_12px_rgba(15,23,42,0.10),0_16px_32px_rgba(59,130,246,0.14)]"
          >
            {/* Left accent line indicating urgency */}
            <div className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-red-400" />

            <div className="pl-2">
              {/* Who */}
              <p className="text-sm font-semibold text-white leading-tight truncate">
                {lead.first_name} {lead.last_name}
              </p>

              {/* What */}
              <p className="text-[12px] text-white/80 font-medium mt-1 truncate">
                {getActionIcon(primary.title)} {primary.title}
              </p>

              {/* When */}
              <p className="text-[11px] text-red-300 font-semibold mt-1">
                {primary.dueAt ? formatDueDateTime(primary.dueAt) : ""}
              </p>
            </div>
          </div>
        ))}

      </div>
    </div>
  )
}
