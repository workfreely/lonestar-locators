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
  { id: "qualified", title: "🟣 Qualified" },
  { id: "list_sent", title: "🟢 List Sent" },
  { id: "ready_to_tour", title: "🟠 Ready to Tour" },
  { id: "done_touring", title: "🟡 Done Touring" },
  { id: "applied", title: "⚫ Applied" },
  { id: "closed", title: "🏁 Closed" },
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
    let nextDate: string | null = null

    if (
      newStage === "contacted" ||
      newStage === "list_sent" ||
      newStage === "ready_to_tour" ||
      newStage === "done_touring"
    ) {
      const d = new Date()
      d.setDate(d.getDate() + 1)
      nextDate = d.toISOString()
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
              next_action_date: nextDate,
            }
          : lead
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
                function getPriority(lead: any) {
                  if (!lead.next_action_date) return 4

                  const today = new Date()
                  const d = new Date(lead.next_action_date)

                  today.setHours(0, 0, 0, 0)
                  d.setHours(0, 0, 0, 0)

                  if (d < today) return 1
                  if (d.getTime() === today.getTime()) return 2
                  return 3
                }

                return getPriority(a) - getPriority(b)
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