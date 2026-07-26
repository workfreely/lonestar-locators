"use client"

import { useDroppable } from "@dnd-kit/core"
import LeadCard from "./LeadCard"
import type { KanbanView } from "./LeadBoard"

type Lead = {
  id: number | string
}

type Props = {
  id: string
  title: string
  leads: Lead[]
  selectedLeadId?: string | number | null
  onSelectLead?: (leadId: string | number) => void
  view?: KanbanView
  emptyMessage?: string
}

// Per-stage accent dot (hex so the .kb-dot halo can derive from currentColor).
const STAGE_DOT: Record<string, string> = {
  new:           "#f5b100",
  contacted:     "#3b82f6",
  searching:     "#8b5cf6",
  list_sent:     "#10b981",
  ready_to_tour: "#f97316",
  done_touring:  "#eab308",
  applied:       "#64748b",
  closed:        "#16a34a",
  archived:      "#94a3b8",
}

// Strip the leading emoji from the title string passed in from LeadBoard —
// the refreshed header uses a colored stage dot instead.
function cleanTitle(raw: string) {
  return raw.replace(/^\p{Emoji}\s*/u, "")
}

export default function LeadColumn({
  id,
  title,
  leads,
  selectedLeadId,
  onSelectLead,
  view = "detailed",
  emptyMessage = "No leads",
}: Props) {
  const { setNodeRef } = useDroppable({ id })

  const dot = STAGE_DOT[id] ?? "#94a3b8"
  const label = cleanTitle(title)

  return (
    <div ref={setNodeRef} className="kb-column">
      <div className="kb-col-head">
        <span className="kb-dot" style={{ background: dot, color: dot }} />
        <h3 className="kb-col-title">{label}</h3>
        <span className="kb-col-count">{leads.length}</span>
      </div>

      <div className="kb-col-body">
        {leads.map((lead: any) => (
          <LeadCard
            key={lead.id}
            lead={lead}
            isSelected={String(selectedLeadId) === String(lead.id)}
            onSelect={onSelectLead}
            view={view}
          />
        ))}

        {leads.length === 0 && <div className="kb-empty">{emptyMessage}</div>}
      </div>
    </div>
  )
}
