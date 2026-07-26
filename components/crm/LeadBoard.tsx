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
import { readKanbanDensity, writeKanbanDensity, DEFAULT_KANBAN_DENSITY } from "@/lib/preferences"

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

// detailed = current default (unchanged). compact = the existing Compact
// View, unchanged. overview = bird's-eye scanning mode — fewer rows, same
// label/value alignment convention as the other two.
export type KanbanView = "detailed" | "compact" | "overview"

const VIEW_MODES: KanbanView[] = ["detailed", "compact", "overview"]
const VIEW_LABELS: Record<KanbanView, string> = {
  detailed: "Detailed",
  compact: "Compact",
  overview: "Overview",
}

// Client-side only — filters the leads already loaded into memory, never
// hits the database. Digits-only fallback on top of the plain substring
// check so a phone search still matches regardless of how the query or
// the stored number happen to be formatted/punctuated.
function normalizeDigits(s: string) {
  return s.replace(/\D/g, "")
}

function matchesSearch(lead: any, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true

  const name = `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.toLowerCase()
  const email = String(lead.email ?? "").toLowerCase()
  const phone = String(lead.phone ?? "").toLowerCase()

  if (name.includes(q) || email.includes(q) || phone.includes(q)) return true

  const qDigits = normalizeDigits(q)
  if (qDigits && normalizeDigits(phone).includes(qDigits)) return true

  return false
}

export default function LeadBoard({
  leads,
  setLeads,
  selectedLeadId,
  onSelectLead,
  onWorkflowAction,
}: {
  leads: any[]
  setLeads: React.Dispatch<React.SetStateAction<any[]>>
  selectedLeadId?: string | number | null
  onSelectLead?: (id: string | number) => void
  // Called with whatever the Workflow Engine created (if anything) for a
  // drag-triggered stage change — lets the caller mirror it into local
  // next-actions state and surface the "✓ Next Action Created" toast.
  onWorkflowAction?: (action: any) => void
}) {
  const [mounted, setMounted] = useState(false)
  const [activeLead, setActiveLead] = useState<any | null>(null)
  const [view, setView] = useState<KanbanView>(DEFAULT_KANBAN_DENSITY)
  const [searchQuery, setSearchQuery] = useState("")

  useEffect(() => {
    setMounted(true)
    // First-time users get Compact (the preference default); returning users
    // get whichever density they last selected.
    setView(readKanbanDensity())
  }, [])

  function selectView(mode: KanbanView) {
    setView(mode)
    writeKanbanDensity(mode)
  }

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
    const res = await fetch("/api/admin/leads/update-stage", {
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

    // Workflow Engine — the route creates an automatic Next Action (if the
    // new stage has a rule and none already exists) and returns it here.
    const json = await res.json().catch(() => null)
    if (json?.workflowAction) onWorkflowAction?.(json.workflowAction)
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
      <div className="kb-workspace">
        {/* Kanban toolbar */}
        <div className="kb-toolbar">
          <div className="kb-search">
            <span className="kb-search-ic">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3-3" />
              </svg>
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, phone, or email..."
            />
          </div>

          <div className="kb-toolbar-controls">
            <div className="kb-density">
              {VIEW_MODES.map((mode) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={view === mode}
                  onClick={() => selectView(mode)}
                >
                  {VIEW_LABELS[mode]}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="kb-board" data-density={view}>
          {columns.map((col) => (
            <LeadColumn
              key={col.id}
              id={col.id}
              title={col.title}
              view={view}
              emptyMessage={searchQuery.trim() ? "No matching leads found." : "No leads"}
              leads={leads
                .filter((lead) => lead.crm_status === col.id && matchesSearch(lead, searchQuery))
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
      </div>

      {/* 🔥 THIS FIXES THE DRAG OVERLAY ISSUE */}
      <DragOverlay>
        {activeLead ? (
          <div className="opacity-90 scale-105">
            <LeadCard
              lead={activeLead}
              isSelected={false}
              view={view}
              onSelect={() => {}}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}