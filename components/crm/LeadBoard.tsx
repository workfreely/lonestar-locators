"use client"

import { useEffect, useState } from "react"
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  closestCorners,
} from "@dnd-kit/core"
import LeadColumn from "./LeadColumn"
import LeadCard from "./LeadCard"

const columns = [
  { id: "new", title: "🟡 New" },
  { id: "contacted", title: "🔵 Contacted" },
  { id: "searching", title: "🟣 Searching" },
  { id: "list_sent", title: "🟢 List Sent" },
  { id: "ready_to_tour", title: "🟠 Ready to Tour" },
  { id: "done_touring", title: "🟡 Done Touring" },
  { id: "applied", title: "⚫ Applied" },
  { id: "closed", title: "🏁 Closed" },
  { id: "archived", title: "⚪ Archived" },
]

export default function LeadBoard({
  leads,
  setLeads,
  selectedLeadId,
  onSelectLead,
}: {
  leads: any[]
  setLeads: React.Dispatch<React.SetStateAction<any[]>>
  selectedLeadId?: string | number | null
  onSelectLead?: (id: string | number) => void
}) {
  const [mounted, setMounted] = useState(false)
  const [activeLead, setActiveLead] = useState<any | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  // =====================================================
  // 🔥 DRAG HANDLER
  // =====================================================
  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over) return

    const leadId = active.id
    const newStage = over.id as string

    // ⏰ FOLLOW-UP TIMING
    // undefined = leave next_action_date untouched (not sent to the
    // backend at all, so the existing column value is preserved).
    let nextDate: string | null | undefined = null

    if (
      newStage === "contacted" ||
      newStage === "list_sent" ||
      newStage === "ready_to_tour" ||
      newStage === "done_touring"
    ) {
      const d = new Date()
      d.setDate(d.getDate() + 1)
      nextDate = d.toISOString()
    } else if (newStage === "archived") {
      // Archiving pauses the workflow, it doesn't erase it — preserve
      // whatever due date the lead already had so restoring it resumes
      // the workflow automatically, without the date needing to be reset.
      nextDate = undefined
    }

    // 🔄 RESET FOLLOW-UP COUNT
    let followUpReset: number | undefined = undefined

    if (newStage === "new") followUpReset = 0
    if (newStage === "list_sent") followUpReset = 0

    // =====================================================
    // ✅ UPDATE STATE
    // =====================================================
    setLeads((currentLeads) =>
      currentLeads.map((lead) =>
        String(lead.id) === String(leadId)
          ? {
              ...lead,
              crm_status: newStage,
              follow_up_count:
                followUpReset !== undefined
                  ? followUpReset
                  : lead.follow_up_count,
              ...(nextDate !== undefined ? { next_action_date: nextDate } : {}),
              _justDropped: true,
            }
          : { ...lead, _justDropped: false }
      )
    )

    // =====================================================
    // ✅ SAVE TO BACKEND
    // =====================================================
    await fetch("/api/admin/leads/update-stage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        leadId,
        crm_status: newStage,
        follow_up_count:
          followUpReset !== undefined ? followUpReset : undefined,
        next_action_date: nextDate,
      }),
    })
  }

  return (
    <DndContext
      collisionDetection={closestCorners}
      onDragStart={({ active }) => {
        const found = leads.find(
          (l) => String(l.id) === String(active.id)
        )
        setActiveLead(found || null)
      }}
      onDragEnd={(event) => {
        handleDragEnd(event)
        setActiveLead(null)
      }}
    >
      <div className="flex gap-4 overflow-x-auto overflow-y-visible h-full min-w-0 px-6 py-4">
        {columns.map((col) => (
          <LeadColumn
            key={col.id}
            id={col.id}
            title={col.title}
            leads={leads
              .filter((lead) => lead.crm_status === col.id)
              .sort((a, b) => {
                // _justDropped / _isNew always pins to top regardless of column
                const aTop = a._justDropped || a._isNew ? 1 : 0
                const bTop = b._justDropped || b._isNew ? 1 : 0
                if (aTop !== bTop) return bTop - aTop

                if (col.id === "new") {
                  // Newest submitted lead first — fresh inbound always visible at top
                  const aT = a.created_at ? new Date(a.created_at).getTime() : 0
                  const bT = b.created_at ? new Date(b.created_at).getTime() : 0
                  return bT - aT
                }

                if (col.id === "closed") {
                  // Most recently closed / updated first
                  const aT = a.updated_at
                    ? new Date(a.updated_at).getTime()
                    : a.created_at ? new Date(a.created_at).getTime() : 0
                  const bT = b.updated_at
                    ? new Date(b.updated_at).getTime()
                    : b.created_at ? new Date(b.created_at).getTime() : 0
                  return bT - aT
                }

                // contacted · list_sent · ready_to_tour · done_touring · applied
                // Soonest move date first — leads with no date sink to bottom
                const aD = a.move_date ? new Date(a.move_date).getTime() : Infinity
                const bD = b.move_date ? new Date(b.move_date).getTime() : Infinity
                return aD - bD
              })}
            selectedLeadId={selectedLeadId}
            onSelectLead={onSelectLead}
          />
        ))}
      </div>

      {/* 🔥 THIS FIXES THE DRAG OVERLAY ISSUE */}
      <DragOverlay>
        {activeLead ? (
          <div className="opacity-90 scale-105">
            <LeadCard
              lead={activeLead}
              isSelected={false}
              onSelect={() => {}}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}