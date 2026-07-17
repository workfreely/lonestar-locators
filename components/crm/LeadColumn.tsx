"use client"

import { useDroppable } from "@dnd-kit/core"
import LeadCard from "./LeadCard"

type Lead = {
  id: number | string
}

type Props = {
  id: string
  title: string
  leads: Lead[]
  selectedLeadId?: string | number | null
  onSelectLead?: (leadId: string | number) => void
}

const STAGE_DOT: Record<string, string> = {
  new:            "bg-amber-400",
  contacted:      "bg-blue-500",
  qualified:      "bg-violet-500",
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
}: Props) {
  const { setNodeRef } = useDroppable({ id })

  const dotClass = STAGE_DOT[id] ?? "bg-gray-400"
  const label = cleanTitle(title)

  return (
    <div
      ref={setNodeRef}
      className="w-[272px] min-w-[272px] flex flex-col rounded-xl
        bg-white/10 backdrop-blur-xl border border-white/20
        shadow-[0_4px_24px_rgba(0,0,0,0.12)]
        h-full overflow-y-auto"
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-3.5 pt-3 pb-2.5 border-b border-white/10">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full flex-none ${dotClass}`} />
          <h3 className="text-sm font-semibold text-white tracking-tight">
            {label}
          </h3>
        </div>
        <span className="text-xs font-semibold text-white/50 tabular-nums">
          {leads.length}
        </span>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-2 p-2.5 pb-4">
        {leads.map((lead: any) => (
          <LeadCard
            key={lead.id}
            lead={lead}
            isSelected={String(selectedLeadId) === String(lead.id)}
            onSelect={onSelectLead}
          />
        ))}

        {leads.length === 0 && (
          <div className="text-xs text-white/30 text-center py-6 select-none">
            No leads
          </div>
        )}
      </div>
    </div>
  )
}
