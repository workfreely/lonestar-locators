"use client"

import { useState } from "react"
import { useDroppable } from "@dnd-kit/core"
import LeadCard from "./LeadCard"
import type { KanbanView } from "./LeadBoard"

// The board's final column: INACTIVE, with two tabs — On Hold | Archived. On Hold
// is selected by default; only the selected tab's cards render (so a large Archived
// set never dominates the board unless explicitly opened). Each tab shows its OWN
// count — there is no combined "Inactive" count.
//
// The droppable id is "archived" (NOT "inactive"), so dragging an active card onto
// this column still archives it exactly as before, and the existing drag-out =
// restore path off an archived card is untouched. Held cards are non-draggable
// (no drag-to-resume in v1) and expose Resume / Reschedule inline instead.
type Props = {
  heldLeads: any[]
  archivedLeads: any[]
  nextActions?: any[]
  favorites?: any[]
  selectedLeadId?: string | number | null
  activeCompanionLeadId?: string | number | null
  onSelectLead?: (leadId: string | number) => void
  onArchiveLead?: (leadId: string | number) => void
  onResumeLead?: (leadId: string | number) => void
  onRescheduleHold?: (leadId: string | number, followUpDate: string) => void
  view?: KanbanView
  searching?: boolean
}

export default function InactiveColumn({
  heldLeads,
  archivedLeads,
  nextActions,
  favorites,
  selectedLeadId,
  activeCompanionLeadId,
  onSelectLead,
  onArchiveLead,
  onResumeLead,
  onRescheduleHold,
  view = "detailed",
  searching = false,
}: Props) {
  const { setNodeRef } = useDroppable({ id: "archived" })
  const [tab, setTab] = useState<"hold" | "archived">("hold")

  const rows = tab === "hold" ? heldLeads : archivedLeads
  const emptyMessage = searching
    ? "No matching leads found."
    : tab === "hold"
      ? "No leads on hold"
      : "No archived leads"

  return (
    <div ref={setNodeRef} className="kb-column">
      <div className="kb-col-head">
        <span className="kb-dot" style={{ background: "#94a3b8", color: "#94a3b8" }} />
        <h3 className="kb-col-title">Inactive</h3>
      </div>

      {/* Per-tab counts — no combined Inactive count. */}
      <div className="kb-subtabs" role="group" aria-label="Inactive leads">
        <button type="button" aria-pressed={tab === "hold"} onClick={() => setTab("hold")}>
          On Hold <span className="kb-subtab-count">{heldLeads.length}</span>
        </button>
        <button type="button" aria-pressed={tab === "archived"} onClick={() => setTab("archived")}>
          Archived <span className="kb-subtab-count">{archivedLeads.length}</span>
        </button>
      </div>

      <div className="kb-col-body">
        {rows.map((lead: any) => (
          <LeadCard
            key={lead.id}
            lead={lead}
            nextActions={nextActions}
            favorites={favorites}
            isSelected={String(selectedLeadId) === String(lead.id)}
            isActiveClient={activeCompanionLeadId != null && String(activeCompanionLeadId) === String(lead.id)}
            onSelect={onSelectLead}
            onArchive={onArchiveLead}
            // Held cards don't drag (no drag-to-resume in v1); archived cards keep
            // the existing drag-out = restore behavior.
            draggable={tab === "archived"}
            onResumeHold={tab === "hold" ? onResumeLead : undefined}
            onRescheduleHold={tab === "hold" ? onRescheduleHold : undefined}
            view={view}
          />
        ))}

        {rows.length === 0 && <div className="kb-empty">{emptyMessage}</div>}
      </div>
    </div>
  )
}
