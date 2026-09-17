"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  closestCorners,
} from "@dnd-kit/core"
import LeadColumn from "./LeadColumn"
import LeadCard from "./LeadCard"
import ArchiveLeadDialog from "./ArchiveLeadDialog"
import { supabase } from "@/lib/supabase/client"
import { isDemoLeadId } from "@/lib/demo/demoWorkspace"
import { autoDueInDays } from "@/lib/workflow/autoDueDate"
import { readKanbanDensity, writeKanbanDensity, DEFAULT_KANBAN_DENSITY } from "@/lib/preferences"
import BeastVoiceMic from "./voice/BeastVoiceMic"
import AddPropertyModal from "./AddPropertyModal"

const ALL_COLUMNS = [
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
//
// Name and phone only. Email is deliberately NOT searched: locators look people
// up by who they are or the number they called from. (Unrelated: page.tsx's
// dedupeLeads still keys on email — that is a de-duplication key, not search.)
function normalizeDigits(s: string) {
  return s.replace(/\D/g, "")
}

function matchesSearch(lead: any, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true

  const name = `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.toLowerCase()
  const phone = String(lead.phone ?? "").toLowerCase()

  if (name.includes(q) || phone.includes(q)) return true

  const qDigits = normalizeDigits(q)
  if (qDigits && normalizeDigits(phone).includes(qDigits)) return true

  return false
}

export default function LeadBoard({
  leads,
  setLeads,
  nextActions,
  favorites,
  selectedLeadId,
  activeCompanionLeadId,
  onSelectLead,
  onWorkflowAction,
  onInitiateContact,
  columns = ALL_COLUMNS,
  timeZone,
  focus = false,
  onToggleFocus,
  workspace = "board",
  onWorkspaceChange,
  mapSlot,
  voiceEnabled = false,
  onVoiceSelectClient,
  onVoiceFocus,
  onVoiceAgenda,
  onVoiceAddLead,
  getVoiceSelectedLead,
  getVoiceCurrentProperty,
  onVoiceContactGate,
  onGuestCardGuard,
}: {
  leads: any[]
  setLeads: React.Dispatch<React.SetStateAction<any[]>>
  // Open workflow/manual actions for all leads — passed to the cards so each
  // card's Next Action derives from the SAME canonical ranked state as the Lead
  // Panel / Agenda (e.g. shows "Tour Follow-Up" after a tour is scheduled, not
  // the stage's automatic "Schedule Tour"). Optional: cards fall back to the
  // stage action when omitted (unchanged behavior).
  nextActions?: any[]
  /** Genuine Client Favorites — forwarded to cards for Guest Card aggregation. */
  favorites?: any[]
  selectedLeadId?: string | number | null
  /** The lead the Beast Companion is currently showing. When set and the board
   *  is visible, that lead's card gets a subtle active-client highlight so the
   *  agent can immediately connect the Companion client to its Kanban card.
   *  Purely a context indicator — it changes no stage, order or selection. */
  activeCompanionLeadId?: string | number | null
  onSelectLead?: (id: string | number) => void
  // Called with whatever the Workflow Engine created (if anything) for a
  // drag-triggered stage change — lets the caller mirror it into local
  // next-actions state and surface the "✓ Next Action Created" toast.
  onWorkflowAction?: (action: any) => void
  // A New→Contacted drag hands off here instead of advancing the lead: the
  // caller selects it as the active Companion client and initiates the canonical
  // Contact Lead flow in Companion (call/text chooser → result confirmation).
  onInitiateContact?: (lead: any) => void
  // Optional subset/override of the pipeline columns (defaults to all stages).
  // Used by the public marketing demo to show only New → Contacted; the CRM
  // never passes this, so its behavior is unchanged.
  columns?: { id: string; title: string }[]
  // Saved locator IANA timezone — the drag-set follow-up cache date is computed
  // in it so it matches the server-created action (no zone disagreement).
  timeZone?: string | null
  // ── Focus (optional) ─────────────────────────────────────────────────────
  // Focus is an APP-LEVEL layout mode: the Kanban takes over the Locator Beast
  // tab by hiding the dashboard chrome around it. It is NOT the browser
  // Fullscreen API — Chrome's tabs and address bar are untouched.
  //
  // Focus and the density views are independent axes: density decides how the
  // cards are drawn, Focus decides how much of the workspace the board fills.
  // `view` lives here and `focus` lives in the caller, so switching
  // Detailed/Compact/Overview never leaves Focus, and leaving Focus never
  // changes the selected view.
  //
  // The control only renders when `onToggleFocus` is supplied, so every other
  // consumer of LeadBoard (the public marketing demo) is untouched.
  focus?: boolean
  onToggleFocus?: () => void
  /** "board" | "map" — Beast Property Explorer replaces the board when "map".
   *  Owned by the parent so the Explorer renders in the same workspace slot. */
  workspace?: "board" | "map"
  onWorkspaceChange?: (next: "board" | "map") => void
  /** Rendered INSTEAD of the board grid when workspace === "map". Passed as a slot
   *  so the toolbar — and therefore the Board | Map toggle and Focus — stays put. */
  /** Receives the live search text and the toolbar node that Map-mode controls
   *  ("Search this area") portal into, so they sit inline after the search field
   *  instead of floating in the middle of the map. */
  mapSlot?: (
    query: string,
    hosts: { actions: HTMLElement | null; market: HTMLElement | null; search: HTMLElement | null },
      onMatchCount: (count: number | null) => void,
    /** The query as it was when Enter was pressed — the "find this exact property"
     *  signal. Cleared on any keystroke, so it fires once per submission. */
    submittedName: string,
    /** Sets the toolbar input to the resolved property name after a successful
     *  name search (e.g. "vecina" → "Vecina Apartment Villas"). */
    onResolveName: (name: string) => void,
  ) => React.ReactNode
  // ── Beast Voice (alpha, platform-admin only) ─────────────────────────────
  // Off unless the server said the viewer is a platform admin, so the public
  // marketing demo and every normal account render exactly as before. The mic
  // triggers the EXISTING contact workflow via onInitiateContact — it adds no
  // CRM behavior of its own.
  voiceEnabled?: boolean
  // ── Beast Voice V1 forwards (optional; only wired by the CRM) ──────────────
  // Each is the EXISTING setter/handler, passed straight through to the mic so
  // Voice invokes the same behavior the manual control does. LeadBoard neither
  // interprets nor changes them.
  /** Select/open a lead by object (the mic already holds the resolved lead). */
  onVoiceSelectClient?: (lead: any) => void
  /** Absolute focus set (the mic needs on/off, not a toggle). */
  onVoiceFocus?: (on: boolean) => void
  /** Agenda open/close/expand/collapse/left/right — the existing Agenda setters. */
  onVoiceAgenda?: (op: "open" | "close" | "expand" | "collapse" | "left" | "right") => void
  /** Open the existing Add Lead modal. */
  onVoiceAddLead?: () => void
  /** The currently selected/shown lead, for "this client" commands. */
  getVoiceSelectedLead?: () => any | null
  /** The current Map property (never fabricated), for "this property" commands. */
  getVoiceCurrentProperty?: () =>
    | { propertyUrl?: string; placeId?: string | null; propertyAddress?: string | null; propertyName?: string | null }
    | null
  /** Opens the existing Contact Gate for a New lead WITHOUT selecting it (no
   *  workspace navigation) — the no-select entry the mic prefers over the
   *  drag's onInitiateContact. */
  onVoiceContactGate?: (lead: any) => void
  /** Property-specific Guest Card guard for moves to Applied/Closed. Called with
   *  the target stage and a `proceed` callback; the guard (owned by the parent)
   *  runs the check/modal and calls `proceed()` only when the move may continue.
   *  Both manual drag and Beast Voice funnel through here — one shared policy. */
  onGuestCardGuard?: (leadId: string | number, targetStage: "applied" | "closed", proceed: () => void) => void
}) {
  const [mounted, setMounted] = useState(false)
  const [activeLead, setActiveLead] = useState<any | null>(null)
  const [view, setView] = useState<KanbanView>(DEFAULT_KANBAN_DENSITY)
  const [searchQuery, setSearchQuery] = useState("")
  // Toolbar node that Map-mode controls portal into. State, not a ref, so the
  // explorer re-renders once the node exists after the first paint.
  const [mapActionsHost, setMapActionsHost] = useState<HTMLDivElement | null>(null)
  const [mapMarketHost, setMapMarketHost] = useState<HTMLDivElement | null>(null)
  // The search box element — the property autocomplete picker portals into it
  // (it is position:relative), anchored beneath the input.
  const [searchBoxHost, setSearchBoxHost] = useState<HTMLDivElement | null>(null)
  // The query AS IT WAS when Enter was pressed — the explicit "I meant that"
  // signal. Typing alone never counts, and any keystroke or a click back into the
  // field clears it, so the no-results state cannot linger.
  const [submittedQuery, setSubmittedQuery] = useState("")
  // Reported by Beast Property Explorer. null = not settled.
  const [matchCount, setMatchCount] = useState<number | null>(null)
  // The Add New Property form shell. Opened from the failed-search state; it
  // persists nothing yet, so this is the only state it needs.
  const [addPropertyFor, setAddPropertyFor] = useState<string | null>(null)
  // Swap the CONTENTS of the existing control — never its box.
  const showNoResults =
    workspace === "map" &&
    submittedQuery.trim().length > 0 &&
    submittedQuery === searchQuery &&
    matchCount === 0
  // Beast Voice session state — placeholder text only; search stays typeable.
  const [voiceState, setVoiceState] = useState<"idle" | "listening" | "working">("idle")
  // Lead awaiting archive-reason confirmation (null = dialog closed).
  const [pendingArchiveId, setPendingArchiveId] = useState<string | number | null>(null)

  useEffect(() => {
    setMounted(true)
    // First-time users get Compact (the preference default); returning users
    // get whichever density they last selected.
    setView(readKanbanDensity())
  }, [])

  // Item C — clear the SHARED search when switching between the Lead Board and
  // Map workspaces, so a property query never carries into the lead search (and a
  // lead query never carries into the property search). The two workspaces share
  // this one input; without this reset, Map's query lands in the Board and it
  // reports "No matching leads". Fires only on the Board↔Map transition (a
  // `workspace` prop change on the same mounted instance) — never on client
  // open/close, Focus, or Agenda (those don't change `workspace`). It resets ONLY
  // the shared input state; the lead- and property-search logic is untouched.
  useEffect(() => {
    setSearchQuery("")
    setSubmittedQuery("")
  }, [workspace])

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
    await moveLeadToStage(active.id, over.id as string)
  }

  // The SHARED stage-transition entry both manual drag AND Beast Voice call.
  // Before advancing to Applied/Closed it runs the property-specific Guest Card
  // guard (the ONE canonical policy — never duplicated in Voice); the guard
  // decides whether to proceed. Every other move goes straight through.
  async function moveLeadToStage(leadId: string | number, newStage: string) {
    if (onGuestCardGuard && (newStage === "applied" || newStage === "closed")) {
      onGuestCardGuard(leadId, newStage, () => {
        void applyStageMove(leadId, newStage)
      })
      return
    }
    await applyStageMove(leadId, newStage)
  }

  // The SHARED stage-transition core, extracted verbatim from the drag handler so
  // BOTH manual drag AND Beast Voice invoke the SAME path: the New→Contacted
  // Contact Gate, the archived-restore branch, the per-destination follow-up
  // date/count rules, the optimistic update, the update-stage POST, and the
  // workflow-action toast. Pure extraction — behavior is unchanged.
  async function applyStageMove(leadId: string | number, newStage: string) {
    const draggedLead = leads.find((l) => String(l.id) === String(leadId))
    const oldStage = draggedLead?.crm_status ?? null

    // 📞 CONTACT GATE — a New→Contacted drag must NOT directly advance the lead.
    // Instead, select the dragged lead as the active Beast Companion client and
    // initiate the SAME canonical Contact Lead flow in Companion ("Would you like
    // to call or text [Name]?"). No stage change here: the card stays in New until
    // the locator confirms contact in Companion (which runs recordFirstContact via
    // the existing verb bridge). No second contact UI, no duplicated workflow.
    if (newStage === "contacted" && oldStage === "new" && draggedLead) {
      onInitiateContact?.(draggedLead)
      return
    }

    // ↩️ RESTORE — dragging a card OUT of Archived into any active stage is an
    // intentional restore. Clear the archive-only metadata (the SAME field set the
    // canonical Lead-Panel Restore uses) so CRM/Kanban/Agenda/Lead-Panel/Companion
    // all agree the lead is active again, and reset the now-historical terminal
    // follow_up_count (below) so the destination stage's canonical Next Action is
    // produced — e.g. Contacted's Build List isn't suppressed by a stale count.
    // Completed workflow rows and Last Action history are left fully intact.
    const isRestore = oldStage === "archived" && newStage !== "archived"

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
      // Automatic follow-up: tomorrow at 9:00 AM (not the current clock time),
      // so the dashboard shows a clean morning workload.
      nextDate = autoDueInDays(1, timeZone)
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
    // A restore resets the (historical) terminal follow_up_count to 0 for every
    // destination, so no destination stage's canonical Next Action is blocked by
    // a stale count. History (completed rows / Last Action) is not touched.
    if (isRestore) followUpReset = 0

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
              // Stamp the close date locally so Beast Milestone evaluation (and
              // the dashboard's closed-this-month math) sees it immediately —
              // mirrors what the update-stage route sets once server-side.
              ...(newStage === "closed" && !lead.closed_at
                ? { closed_at: new Date().toISOString() }
                : {}),
              // Restore: clear archive-only metadata locally so the Companion's
              // isArchived (crm_status || deleted_at) flips to active immediately
              // and the archive badge/reason drop — same fields the route clears.
              ...(isRestore
                ? {
                    archive_reason: null,
                    deleted_at: null,
                    deleted_by: null,
                    pre_delete_status: null,
                  }
                : {}),
              _justDropped: true,
            }
          : { ...lead, _justDropped: false }
      )
    )

    // Demo leads are client-side only ("demo-1" ids); the optimistic update
    // above is all they need — never hit the bigint-keyed backend.
    if (isDemoLeadId(String(leadId))) return

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

  // A card's archive icon opens the confirmation dialog — the actual archive
  // only happens once a reason is chosen and confirmed (see confirmArchive).
  function handleArchive(leadId: string | number) {
    setPendingArchiveId(leadId)
  }

  const pendingArchiveLead =
    pendingArchiveId != null
      ? leads.find((l) => String(l.id) === String(pendingArchiveId))
      : null
  const pendingArchiveName = pendingArchiveLead
    ? `${pendingArchiveLead.first_name ?? ""} ${pendingArchiveLead.last_name ?? ""}`.trim()
    : ""

  // Confirmed archive with a chosen reason. Writes directly via Supabase (like
  // the Lead panel's own archive) so the reason + restore metadata are saved:
  // pause the workflow without erasing it — next_action_date and follow_up_count
  // are left untouched so restoring the lead resumes it automatically.
  async function confirmArchive(reason: string) {
    const leadId = pendingArchiveId
    if (leadId == null) return
    setPendingArchiveId(null)

    const target = leads.find((l) => String(l.id) === String(leadId))
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const updates = {
      crm_status: "archived",
      archive_reason: reason,
      deleted_at: new Date().toISOString(),
      deleted_by: user?.email ?? null,
      pre_delete_status: target?.crm_status ?? null,
    }

    setLeads((currentLeads) =>
      currentLeads.map((lead) =>
        String(lead.id) === String(leadId)
          ? { ...lead, ...updates, _justDropped: true }
          : { ...lead, _justDropped: false }
      )
    )

    // Demo leads: optimistic-only, no DB write (string id can't key a bigint).
    if (isDemoLeadId(String(leadId))) return

    const { error } = await supabase.from("leads").update(updates).eq("id", leadId)
    if (error) console.error("[archive-lead] update failed:", error.message)
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
      <div className="kb-workspace" data-workspace={workspace}>
        {/* Kanban toolbar */}
        <div className="kb-toolbar">
          {/* Board | Map leads the toolbar: it chooses WHICH workspace you are in,
              so it reads before the search that operates within it. Density and
              Focus stay on the right. */}
          <div className="kb-toolbar-left">
  {onWorkspaceChange && (
                <div className="kb-density" role="group" aria-label="Workspace">
                  <button type="button" aria-pressed={workspace === "board"} onClick={() => onWorkspaceChange("board")}>
                    Lead Board
                  </button>
                  <button type="button" aria-pressed={workspace === "map"} onClick={() => onWorkspaceChange("map")}>
                    Map
                  </button>
                </div>
              )}
            <div className={`kb-search${voiceEnabled ? " kb-search-voice" : ""}`} ref={setSearchBoxHost}>
            <span className="kb-search-ic">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3-3" />
              </svg>
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setSubmittedQuery("")
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") setSubmittedQuery(searchQuery)
              }}
              placeholder={
                // Transient Voice session states take precedence; otherwise the
                // idle copy follows the surface: inside a client workspace it drops
                // the (irrelevant) lead/property-search language and just invites
                // Voice; on the Board/Map it names the relevant search. Copy only —
                // the input position/size/mic and search/Voice routing are unchanged.
                voiceState === "listening"
                  ? "Listening..."
                  : voiceState === "working"
                    ? "Beast is working..."
                    : selectedLeadId != null
                      ? // Client workspace — no lead/property search language here;
                        // typed Beast commands + the mic still work exactly as before.
                        voiceEnabled
                        ? "Speak to Beast…"
                        : "Search by name or phone..."
                      : workspace === "map"
                        ? // Map mode filters the properties ALREADY loaded on the map —
                          // it never runs a lead search and never calls Places per keystroke.
                          voiceEnabled
                          ? "Search property name or speak to Beast…"
                          : "Search property name..."
                        : voiceEnabled
                          ? // Only where the mic exists. A normal account has no Beast
                            // Voice, so it must not be invited to speak to it.
                            "Search by name, phone or speak to Beast…"
                          : "Search by name or phone..."
              }
            />
            {voiceEnabled && (
              <BeastVoiceMic
                leads={leads}
                onInitiateContact={onInitiateContact}
                onContactGate={onVoiceContactGate}
                onListeningChange={setVoiceState}
                onSelectClient={onVoiceSelectClient}
                onWorkspace={onWorkspaceChange}
                onFocus={onVoiceFocus}
                onAgenda={onVoiceAgenda}
                onAddLead={onVoiceAddLead}
                getSelectedLead={getVoiceSelectedLead}
                getCurrentProperty={getVoiceCurrentProperty}
                onMoveStage={moveLeadToStage}
                onArchiveLead={handleArchive}
              />
            )}
            {/* Failed-search state. An overlay pinned to inset:0 of .kb-search
                rather than a replacement element: the real input stays mounted and
                keeps defining the box, so the control's outer width, height, shape
                and position cannot change. No dropdown, no second row, no portal.
                Clicking it restores the input immediately. */}
            {showNoResults && (
              <div
                className="kb-search-noresults"
                onMouseDown={() => setSubmittedQuery("")}
              >
                <span className="kb-search-noresults-label">No results found</span>
                <button
                  type="button"
                  className="kb-search-noresults-add"
                  // stopPropagation so opening the form does not also trigger the
                  // overlay's "restore the input" handler underneath it.
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => setAddPropertyFor(searchQuery.trim())}
                >
                  + Add New Property
                </button>
              </div>
            )}
            </div>
            {/* Map-only slots sit AFTER the search field, not before it.
                Board | Map and search are the two controls both workspaces
                share, so they hold the same horizontal positions in each; a
                market switcher placed ahead of search would push search
                sideways on every switch between Board and Map. The Map toolbar
                therefore reads Board|Map → search → market → Unleash Beast.
                Board mode renders neither. */}
            {workspace === "map" && (
              <div ref={setMapMarketHost} className="kb-map-market" />
            )}
            {/* Filled by Beast Property Explorer via a portal, so "Unleash
                Beast" reads as a toolbar control rather than floating over the
                middle of the map. */}
            {workspace === "map" && (
              <div ref={setMapActionsHost} className="kb-map-actions" />
            )}
          </div>

          <div className="kb-toolbar-controls">
            {/* Detailed/Compact/Overview are Kanban-layout controls — shown only
                on the Lead Board itself: not in Map, and not while a client
                workspace is open (selectedLeadId set). The user's saved view
                preference is untouched; it returns when they go back to the board. */}
            {workspace !== "map" && selectedLeadId == null && (
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
            )}
            {onToggleFocus && (
              <button
                type="button"
                className="kb-focus"
                onClick={onToggleFocus}
                aria-pressed={focus}
              >
                <span aria-hidden>⛶</span>
                {focus ? "Exit Focus" : "Focus"}
              </button>
            )}
          </div>
        </div>

        {addPropertyFor !== null && (
          <AddPropertyModal
            initialName={addPropertyFor}
            onClose={() => {
              setAddPropertyFor(null)
              // Back to a normal search field once the form closes.
              setSubmittedQuery("")
            }}
          />
        )}

        {workspace === "map" ? (
          /* Beast Property Explorer fills the same flex slot the board occupies, so
             it grows and shrinks with whatever Agenda and Companion leave behind. */
          <div className="kb-board" style={{ display: "block", padding: 0, overflow: "hidden" }}>
            {mapSlot?.(searchQuery, { actions: mapActionsHost, market: mapMarketHost, search: searchBoxHost }, setMatchCount, submittedQuery, setSearchQuery)}
          </div>
        ) : (
        <div className="kb-board" data-density={view}>
          {columns.map((col) => (
            <LeadColumn
              key={col.id}
              id={col.id}
              title={col.title}
              view={view}
              nextActions={nextActions}
              favorites={favorites}
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
              activeCompanionLeadId={activeCompanionLeadId}
              onSelectLead={onSelectLead}
              onArchiveLead={handleArchive}
            />
          ))}
        </div>
        )}
      </div>

      {/* Drag ghost — PORTALED to <body>. DragOverlay renders inline by default,
          which placed it inside the admin's `fixed inset-0` shell + the
          overflow-hidden board wrapper + the scrollable .kb-board — so its
          position:fixed resolved against those, not the viewport, offsetting it
          down/right. Portaling to document.body makes the overlay a direct body
          child, so fixed = viewport-relative and it tracks the cursor exactly
          (how Trello/Linear/Notion mount their drag layer).

          data-density gives it the current view's card sizing; .kb-drag-overlay
          neutralizes hover/selected transforms so it sits under the cursor at
          the source card's exact dimensions (see globals.css). */}
      {createPortal(
        <DragOverlay>
          {activeLead ? (
            <div className="kb-drag-overlay" data-density={view}>
              <LeadCard
                lead={activeLead}
                isSelected={false}
                view={view}
                onSelect={() => {}}
                nextActions={nextActions}
                favorites={favorites}
              />
            </div>
          ) : null}
        </DragOverlay>,
        document.body
      )}

      <ArchiveLeadDialog
        open={pendingArchiveId != null}
        leadName={pendingArchiveName}
        onCancel={() => setPendingArchiveId(null)}
        onConfirm={confirmArchive}
      />

    </DndContext>
  )
}