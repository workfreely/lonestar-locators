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

export default function LeadColumn({
  id,
  title,
  leads,
  selectedLeadId,
  onSelectLead,
}: Props) {
  const { setNodeRef } = useDroppable({
    id,
  })

  return (
    <div
      ref={setNodeRef}
   className="w-[300px] min-w-[300px] bg-black/30 backdrop-blur-md border border-white/10 p-3 rounded-xl flex flex-col min-h-full self-start"
    >
      {/* HEADER */}
      <h3 className="font-semibold mb-3 text-sm tracking-wide text-white">
        {title}
      </h3>

      {/* CARDS */}
<div className="flex flex-col gap-3">
  <div className="flex flex-col gap-3">
    {leads.map((lead: any) => (
      <LeadCard
        key={lead.id}
        lead={lead}
        isSelected={String(selectedLeadId) === String(lead.id)}
        onSelect={onSelectLead}
      />
    ))}
  </div>
</div>
    </div>
  )
}