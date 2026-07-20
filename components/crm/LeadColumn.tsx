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

const STAGE_DOT: Record<string, string> = {
  new:            "bg-amber-400",
  contacted:      "bg-blue-500",
  searching:      "bg-violet-500",
  list_sent:      "bg-emerald-500",
  ready_to_tour:  "bg-orange-400",
  done_touring:   "bg-yellow-500",
  applied:        "bg-gray-500",
  closed:         "bg-green-600",
  archived:       "bg-slate-400",
}

// Strip the leading emoji from the title string passed in from LeadBoard
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

  const dotClass = STAGE_DOT[id] ?? "bg-gray-400"
  const label = cleanTitle(title)

  // Overview is a genuinely denser tier than Compact — narrower column,
  // tighter header, tighter card gap — since its purpose is fitting as
  // much of the pipeline on screen as possible, not just a smaller card.
  const isCompact = view === "compact"
  const isOverview = view === "overview"

  const columnWidthClass = isOverview
    ? "w-[160px] min-w-[160px]"
    : isCompact
    ? "w-[220px] min-w-[220px]"
    : "w-[272px] min-w-[272px]"

  return (
    <div
      ref={setNodeRef}
      className={[
        "flex flex-col rounded-xl bg-white/10 backdrop-blur-xl border border-white/20",
        "shadow-[0_4px_24px_rgba(0,0,0,0.12)] h-full overflow-y-auto",
        columnWidthClass,
      ].join(" ")}
    >
      {/* Column header */}
      <div className={isOverview ? "flex items-center justify-between px-2.5 pt-2 pb-1.5 border-b border-white/10" : "flex items-center justify-between px-3.5 pt-3 pb-2.5 border-b border-white/10"}>
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-2 h-2 rounded-full flex-none ${dotClass}`} />
          <h3 className="text-sm font-semibold text-white tracking-tight truncate">
            {label}
          </h3>
        </div>
        <span className="text-xs font-semibold text-white/50 tabular-nums flex-none">
          {leads.length}
        </span>
      </div>

      {/* Cards */}
      <div className={[
        "flex flex-col",
        isCompact ? "gap-1 p-1.5 pb-3" : isOverview ? "gap-1 p-1.5 pb-2" : "gap-2 p-2.5 pb-4",
      ].join(" ")}>
        {leads.map((lead: any) => (
          <LeadCard
            key={lead.id}
            lead={lead}
            isSelected={String(selectedLeadId) === String(lead.id)}
            onSelect={onSelectLead}
            view={view}
          />
        ))}

        {leads.length === 0 && (
          <div className="text-xs text-white/30 text-center py-6 select-none">
            {emptyMessage}
          </div>
        )}
      </div>
    </div>
  )
}
