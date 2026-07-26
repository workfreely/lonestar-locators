"use client"

import { supabase } from "@/lib/supabase/client"
import { getNextAction } from "@/lib/nextAction"
import { useState, useEffect } from "react"
import { formatPhone } from "@/lib/utils/formatPhone"
import { getSourceStyle } from "@/lib/leads/sourceStyles"
import { inferMarketFromLandingPage } from "@/lib/leads/inferMarketFromLandingPage"
import { ARCHIVE_REASONS } from "@/lib/leads/archiveReasons"
import { rankLeadActions } from "@/lib/nextActions"
import { getNextFollowUpAction, createWorkflowActionIfNeeded } from "@/lib/workflowEngine"
import { emitWorkflowActionCreated } from "@/lib/workflowToast"
import { getActionIcon, formatDueDateTime } from "@/lib/actionDisplay"
import { readFirstContactPreference, onFirstContactPreferenceChanged, type FirstContactPreference } from "@/lib/preferences"
import AiVoiceScriptModal from "./AiVoiceScriptModal"
import ConfirmDialog from "./ConfirmDialog"
import AddNextActionModal from "./AddNextActionModal"
import FavoriteModal, { type FavoriteInput } from "./FavoriteModal"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeName(name: string) {
  if (!name) return ""
  return name
    .trim()
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function formatDate(date: string) {
  if (!date) return "—"
  return new Date(date).toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  })
}

// "Thursday, 7/24/26" — used only for Other Open Actions' due-date column,
// where the weekday name makes it faster to scan several actions at once.
function formatActionDueDate(date: string) {
  return new Date(date).toLocaleDateString("en-US", {
    weekday: "long",
    month: "numeric",
    day: "numeric",
    year: "2-digit",
  })
}

function formatRent(rent: string) {
  if (!rent) return "Not listed"
  const matches = rent.match(/\d[\d,]*/g)
  if (!matches || matches.length === 0) return "Not listed"
  const formatted = matches
    .map((v) => {
      const n = Number(v.replace(/,/g, ""))
      return Number.isNaN(n) ? null : `$${n.toLocaleString()}`
    })
    .filter(Boolean)
  if (formatted.length >= 2) return `${formatted[0]} – ${formatted[1]}`
  return formatted[0] ?? "Not listed"
}

function getFollowUpStatus(date: string) {
  if (!date) return "none"
  const today = new Date()
  const d = new Date(date)
  today.setHours(0, 0, 0, 0)
  d.setHours(0, 0, 0, 0)
  if (d.getTime() < today.getTime()) return "overdue"
  if (d.getTime() === today.getTime()) return "today"
  return "upcoming"
}

function formatStatus(status: string) {
  if (!status) return "New"
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

const STATUS_STYLES: Record<string, string> = {
  new:           "bg-amber-100 text-amber-800 border-amber-300",
  contacted:     "bg-blue-100 text-blue-800 border-blue-300",
  searching:     "bg-violet-100 text-violet-800 border-violet-300",
  list_sent:     "bg-emerald-100 text-emerald-800 border-emerald-300",
  ready_to_tour: "bg-orange-100 text-orange-800 border-orange-300",
  done_touring:  "bg-yellow-100 text-yellow-900 border-yellow-300",
  applied:       "bg-gray-200 text-gray-700 border-gray-300",
  closed:        "bg-green-100 text-green-800 border-green-300",
  archived:      "bg-slate-100 text-slate-700 border-slate-300",
}

// Source badge styles moved to lib/leads/sourceStyles.ts (getSourceStyle) —
// the single canonical source-styling module shared with LeadCard,
// DashboardStats, and the Performance page.

// ─── Sub-components ───────────────────────────────────────────────────────────

function CollapsibleNotes({
  title,
  defaultOpen,
  children,
}: {
  title: string
  defaultOpen: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-[var(--crm-panel)] border border-[var(--crm-border-soft)] rounded-2xl overflow-hidden shadow-[0_1px_2px_rgba(var(--crm-shadow-color),0.04),0_4px_10px_rgba(var(--crm-shadow-color),0.06)]">
      <div
        className="px-4 py-2 border-b border-[var(--crm-border-soft)] bg-[var(--crm-card)] flex items-center gap-2 cursor-pointer select-none"
        onClick={() => setOpen((o) => !o)}
      >
        <svg
          className={`w-3 h-3 text-[var(--crm-text-muted)] transition-transform duration-200 ${open ? "rotate-90" : "rotate-0"}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <p className="text-[10.5px] font-semibold text-[var(--crm-text-secondary)] uppercase tracking-widest">
          {title}
        </p>
      </div>
      {open && (
        <div className="px-4 py-3 space-y-2.5 bg-[var(--crm-panel)]">
          {children}
        </div>
      )}
    </div>
  )
}

function SectionCard({
  title,
  children,
  shaded = false,
  collapsible = false,
  defaultOpen = true,
}: {
  title: string
  children: React.ReactNode
  shaded?: boolean
  collapsible?: boolean
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-[var(--crm-panel)] border border-[var(--crm-border-soft)] rounded-2xl overflow-hidden shadow-[0_1px_2px_rgba(var(--crm-shadow-color),0.04),0_4px_10px_rgba(var(--crm-shadow-color),0.06)]">
      <div
        className={`px-4 py-2 border-b border-[var(--crm-border-soft)] bg-[var(--crm-card)] flex items-center gap-2 ${collapsible ? "cursor-pointer select-none" : ""}`}
        onClick={collapsible ? () => setOpen((o) => !o) : undefined}
      >
        {collapsible && (
          <svg
            className={`w-3 h-3 text-[var(--crm-text-muted)] transition-transform duration-200 ${open ? "rotate-90" : "rotate-0"}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        )}
        <p className="text-[10.5px] font-semibold text-[var(--crm-text-secondary)] uppercase tracking-widest">
          {title}
        </p>
      </div>
      {(!collapsible || open) && <div className={`px-4 py-3 space-y-2.5 ${shaded ? "bg-[var(--crm-card)]/60" : "bg-[var(--crm-panel)]"}`}>
        {children}
      </div>}
    </div>
  )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-[12.5px] text-[var(--crm-text-secondary)] flex-none">{label}</span>
      <span className="text-[12.5px] font-semibold text-[var(--crm-text-primary)] text-right">{value || "—"}</span>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function LeadPanel({
  lead,
  topMatches = [],
  nextActions = [],
  setNextActions,
  favorites = [],
  setFavorites,
  onClose,
  onUpdateLead,
  pendingEditActionId,
  onPendingEditHandled,
}: {
  lead: any
  topMatches?: any[]
  nextActions?: any[]
  setNextActions?: React.Dispatch<React.SetStateAction<any[]>>
  favorites?: any[]
  setFavorites?: React.Dispatch<React.SetStateAction<any[]>>
  onClose: () => void
  onUpdateLead?: (updatedLead: any) => void
  // Set by the Workflow Engine's "✓ Next Action Created" toast's Edit
  // button — when this matches one of this lead's own open actions, the
  // Next Action editor opens for it automatically. Cleared via
  // onPendingEditHandled once handled, whether or not it matched (the
  // toast may point at a different lead than the one currently open).
  pendingEditActionId?: number | null
  onPendingEditHandled?: () => void
}) {
  if (!lead) return null

  const [followUps, setFollowUps] = useState(Number(lead.follow_up_count || 0))
  const [nextActionDate, setNextActionDate] = useState(lead.next_action_date || null)
  const [doneMsg, setDoneMsg] = useState<string | null>(null)
  const [showVoiceScript, setShowVoiceScript] = useState(false)
  const [archiveReason, setArchiveReason] = useState(lead.archive_reason || "")
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showAddAction, setShowAddAction] = useState(false)
  const [editingAction, setEditingAction] = useState<any | null>(null)
  const [showFavoriteModal, setShowFavoriteModal] = useState(false)
  const [editingFavorite, setEditingFavorite] = useState<any | null>(null)
  const [deletingFavoriteId, setDeletingFavoriteId] = useState<number | null>(null)
  const [contactPref, setContactPref] = useState<FirstContactPreference>("text")

  useEffect(() => {
    setFollowUps(Number(lead.follow_up_count || 0))
    setNextActionDate(lead.next_action_date || null)
    setArchiveReason(lead.archive_reason || "")
  }, [lead.id, lead.follow_up_count, lead.next_action_date, lead.archive_reason])

  // Preferred first-contact method — read once on mount and kept in sync
  // if changed from the profile menu while this panel is open. Purely a
  // display/execution choice: it never touches which Workflow Engine
  // action gets created (still always "Contact Lead"), only which
  // button(s) execute it below.
  useEffect(() => {
    setContactPref(readFirstContactPreference())
    return onFirstContactPreferenceChanged(setContactPref)
  }, [])

  // Workflow Engine toast "Edit" — open the editor for the action it
  // named, but only once this lead's own next-actions have actually
  // loaded it (it may belong to whichever lead the toast fired for,
  // which isn't necessarily the one currently open in this panel).
  useEffect(() => {
    if (pendingEditActionId == null) return
    const match = nextActions.find((a) => a.id === pendingEditActionId)
    if (match) {
      setEditingAction(match)
      setShowAddAction(true)
      onPendingEditHandled?.()
    }
  }, [pendingEditActionId, nextActions])

  // ─── Follow-up actions ─────────────────────────────────────────────────

  async function setFollowUpCount(step: number) {
    const nextFollowUpCount = Number(step)

    // Duplicate guard — prevents double-click from scheduling two calendar events.
    // followUps state updates synchronously, so a rapid second click sees the updated value.
    const alreadyAtStep = Number(followUps) >= nextFollowUpCount

    setFollowUps(nextFollowUpCount)

    const now = new Date()
    let nextDate: Date | null = new Date()

    if (nextFollowUpCount === 1) nextDate.setDate(now.getDate() + 1)
    else if (nextFollowUpCount === 2) nextDate.setDate(now.getDate() + 2)
    else if (nextFollowUpCount === 3) nextDate.setDate(now.getDate() + 3)
    else nextDate = null

    setNextActionDate(nextDate ? nextDate.toISOString() : null)

    if (onUpdateLead) {
      onUpdateLead({
        ...lead,
        follow_up_count: nextFollowUpCount,
        next_action_date: nextDate ? nextDate.toISOString() : null,
      })
    }

    const { data, error } = await supabase
      .from("leads")
      .update({
        follow_up_count: nextFollowUpCount,
        next_action_date: nextDate ? nextDate.toISOString() : null,
      })
      .eq("id", lead.id)
      .select("*")

    if (error) console.log("Follow-up update failed:", JSON.stringify(error, null, 2))

    // ── FU chain Calendar reminder ───────────────────────────────────────────
    // Only fires for list_sent leads (the FU chain lives in that stage).
    // Skipped if this step was already recorded (duplicate-click guard).
    // Steps 1, 2, 3 each schedule the NEXT reminder; 4+ ends the chain.
    if (
      lead.crm_status === "list_sent" &&
      !alreadyAtStep &&
      nextFollowUpCount >= 1 &&
      nextFollowUpCount <= 3
    ) {
      fetch("/api/google/followup-event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          completed_step: nextFollowUpCount,
          first_name:     lead.first_name,
          last_name:      lead.last_name,
          phone:          lead.phone,
          city:           lead.city,
          source:         lead.source,
          desired_rent:   lead.desired_rent,
          beds:           lead.beds,
          move_date:      lead.move_date,
        }),
      }).catch((err) => {
        console.error("FU chain Calendar event failed:", err)
      })
    }
  }

  function getFUStyle(step: number) {
    if (Number(followUps) === step)
      return "crm-cta shadow-sm"
    if (Number(followUps) > step)
      return "bg-[var(--crm-inset)] text-[var(--crm-text-muted)] border-[var(--crm-border)]"
    return "bg-[var(--crm-panel)] text-[var(--crm-text-secondary)] border-[var(--crm-border)] hover:bg-[var(--crm-card)] hover:border-[var(--crm-text-muted)]"
  }

  function openSMS(message: string) {
    if (!lead.phone) return
    window.open(`sms:${lead.phone}?&body=${encodeURIComponent(message)}`, "_self")
  }

  // ─── Shared "first contact was made" bookkeeping ───────────────────────
  // Extracted from what used to be all of handleFirstText — the stage
  // advance and first_text_sent_at write represent "this lead was
  // contacted," independent of *how* (text or call). Splitting it out
  // lets handleCallClient below record the exact same signal a text
  // would have, so the 7-day no-response auto-archive cron (which reads
  // first_text_sent_at) keeps working correctly no matter which first-
  // contact method preference the user has selected. The field is still
  // named first_text_sent_at — a legacy name from when only texting
  // existed — but it has always really meant "first contact," and that's
  // preserved exactly as-is here; only the trigger point moved.

  function recordFirstContact() {
    const shouldAdvanceStage = lead.crm_status === "new"
    const contactedAt = new Date().toISOString()

    // Optimistic UI update — merges the (conditional) stage advance with the
    // (unconditional) contact-timestamp write below into one consistent
    // object, so a re-click on an already-Contacted lead can't regress
    // crm_status back to "new" via a stale closure.
    if (onUpdateLead) {
      onUpdateLead({
        ...lead,
        ...(shouldAdvanceStage ? { crm_status: "contacted" } : {}),
        first_text_sent_at: contactedAt,
      })
    }

    // Auto-advance stage: New → Contacted — unchanged: same endpoint, same
    // payload, same guard. Only fires the first time a "new" lead is
    // contacted.
    if (shouldAdvanceStage) {
      // Persist to Supabase + trigger Google Contact sync (non-blocking)
      fetch("/api/admin/leads/update-stage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: lead.id,
          crm_status: "contacted",
          follow_up_count: lead.follow_up_count ?? 0,
          next_action_date: lead.next_action_date ?? null,
        }),
      })
        .then((res) => res.json())
        .then((json) => {
          // Workflow Engine — surfaces whatever automatic action (if any)
          // the New → Contacted transition just created.
          if (json?.workflowAction) {
            setNextActions?.((prev) => [...prev, json.workflowAction])
            emitWorkflowActionCreated(json.workflowAction)
          }
        })
        .catch((err) => {
          console.error("First contact stage update failed:", err)
        })
    }

    // Record the moment this lead was intentionally contacted — fires on
    // every first-contact click, independent of the stage-advance above and
    // of /api/admin/leads/update-stage, so none of that route's other side
    // effects (Google Contact sync, List Sent calendar) run an extra time.
    // This is deliberately the ONLY place first_text_sent_at is written —
    // not a Kanban drag, not a lead edit. Powers the daily 7-day
    // no-response auto-archive (app/api/cron/auto-archive-no-response).
    supabase
      .from("leads")
      .update({ first_text_sent_at: contactedAt })
      .eq("id", lead.id)
      .then(({ error }) => {
        if (error) console.error("[first-contact] Failed to record contact timestamp:", error)
      })
  }

  // ─── Shared First Text handler ─────────────────────────────────────────
  // Called by both the Quick Actions button and handleNextActionClick().

  function handleFirstText() {
    const name = normalizeName(lead.first_name || "")
    const bedsText =
      lead.property_type === "Studio" ? "studio" :
      lead.property_type === "High-Rise" ? "high-rise" :
      lead.beds ? `${String(lead.beds).replace("-", "").trim()} bed` : ""
    const monthText = lead.move_date ? ` in ${new Date(lead.move_date).toLocaleString("en-US", { month: "long" })}` : ""
    openSMS(`Hey ${name} it's Jay! I got your form for a ${bedsText} move${monthText}. Are you trying to stay near a specific address or side of town?`)
    recordFirstContact()
  }

  // ─── Call Client (first-contact preference: "call" or "ask") ──────────
  // Same "this lead was contacted" bookkeeping as handleFirstText — only
  // the actual contact method differs (tel: link instead of an SMS body).
  function handleCallClient() {
    if (!lead.phone) return
    window.open(`tel:${lead.phone}`, "_self")
    recordFirstContact()
  }

  function handleNextActionClick() {
    const fu = lead.follow_up_count || 0
    const action = getNextAction({ ...lead, follow_up_count: followUps })

    if (lead.crm_status === "contacted") {
      if (fu === 0) { setFollowUpCount(1); openSMS(`Hey! Did you see any properties on the list that you'd like to tour?`); return }
      if (fu === 1) { setFollowUpCount(2); openSMS(`Is there one that stands out or would you like me to narrow the list down a bit more?`); return }
      if (fu === 2) { setFollowUpCount(3); openSMS(`I'm calling communities you were interested in to get updated pricing and specials. Are you still looking to move?`); return }
      openSMS(`Hey, I haven't heard back so I'll pause your search for now. Let me know when you're ready!`); return
    }

    if (action === "Contact Lead") {
      handleFirstText()
      return
    }
    if (action === "Build List") { openSMS(`Hey ${name}, I just sent your list over!\n\nCan you ❤️ your top 2–3 favorites?\n\nI'll get tours set up or tweak the list for you`); return }
    if (action === "FU1") { setFollowUpCount(1); openSMS(`Hey! Did you see any properties on the list that you'd like to tour?`); return }
    if (action === "FU2") { setFollowUpCount(2); openSMS(`Is there one that stands out or would you like me to narrow the list down a bit more?`); return }
    if (action === "FU3") { setFollowUpCount(3); openSMS(`I'm calling communities you were interested in to get updated pricing and specials. Are you still looking to move?`); return }
    if (action === "Final FU") { openSMS(`Hey ${name}, I haven't heard back so I'll pause your search for now. No rush, just let me know when you'd like me to pick it back up!`); return }
  }

  // ─── Done-for-now completion ───────────────────────────────────────────

  const DONE_CONFIG: Record<string, { days: number }> = {
    ready_to_tour: { days: 1  },
    done_touring:  { days: 2  },
    applied:       { days: 3  },
    closed:        { days: 14 },
  }

  async function handleDoneForNow(days: number) {
    const newDate = new Date()
    newDate.setDate(newDate.getDate() + days)
    const newDateISO = newDate.toISOString()

    // Optimistic update — disappears from Follow-Ups sidebar immediately
    setNextActionDate(newDateISO)
    if (onUpdateLead) onUpdateLead({ ...lead, next_action_date: newDateISO })

    const { error } = await supabase
      .from("leads")
      .update({ next_action_date: newDateISO })
      .eq("id", lead.id)

    if (error) {
      console.error("[done-for-now] update failed:", error)
    } else {
      setDoneMsg("✓ Follow-up scheduled")
      setTimeout(() => setDoneMsg(null), 3000)
    }
  }

  const doneConfig = DONE_CONFIG[lead.crm_status] ?? null

  // ─── Archive reason (archived leads only) ──────────────────────────────

  async function handleArchiveReasonChange(reason: string) {
    setArchiveReason(reason)
    if (onUpdateLead) onUpdateLead({ ...lead, archive_reason: reason })

    const { error } = await supabase
      .from("leads")
      .update({ archive_reason: reason })
      .eq("id", lead.id)

    if (error) {
      console.error("[archive-reason] update failed:", error)
    }
  }

  // ─── Delete / Restore (soft delete only — never a physical DELETE) ─────

  async function handleDeleteLead() {
    setShowDeleteConfirm(false)

    const { data: { user } } = await supabase.auth.getUser()

    // Archiving pauses the workflow — it does not erase it. next_action_date,
    // the automatic action's own driving field, is deliberately left as-is:
    // rankLeadActions/FollowUpRow/LeadCard all already treat archived leads
    // as inactive regardless of this value, so there's no need to null it
    // out here — and nulling it would mean restoring the lead couldn't
    // resume the workflow without the user manually resetting a due date.
    const updates = {
      crm_status: "archived",
      archive_reason: "deleted_by_user",
      deleted_at: new Date().toISOString(),
      deleted_by: user?.email ?? null,
      pre_delete_status: lead.crm_status,
    }

    setArchiveReason("deleted_by_user")
    if (onUpdateLead) onUpdateLead({ ...lead, ...updates })

    const { error } = await supabase
      .from("leads")
      .update(updates)
      .eq("id", lead.id)

    if (error) {
      console.error("[delete-lead] update failed:", error)
    }
  }

  async function handleRestoreLead() {
    const updates = {
      crm_status: lead.pre_delete_status || "new",
      archive_reason: null,
      deleted_at: null,
      deleted_by: null,
      pre_delete_status: null,
    }

    setArchiveReason("")
    if (onUpdateLead) onUpdateLead({ ...lead, ...updates })

    const { error } = await supabase
      .from("leads")
      .update(updates)
      .eq("id", lead.id)

    if (error) {
      console.error("[restore-lead] update failed:", error)
    }
  }

  // ─── Manual Next Actions (CRM v1.1.0 Phase 1) ──────────────────────────
  // Extends, never replaces, the automatic stage action above — see
  // lib/nextActions.ts for how the two are ranked against each other.

  async function handleCreateAction(input: {
    title: string
    dueAt: string
    priority: "low" | "medium" | "high"
    notes: string
  }): Promise<boolean> {
    const { data, error } = await supabase
      .from("lead_next_actions")
      .insert([{
        lead_id: lead.id,
        title: input.title,
        due_at: input.dueAt,
        priority: input.priority,
        notes: input.notes || null,
      }])
      .select("*")
      .single()

    if (error) {
      console.error("[next-action] create failed:", error)
      return false
    }

    setNextActions?.((prev) => [...prev, data])
    setShowAddAction(false)
    return true
  }

  // Backs the "Edit" button on the Workflow Engine's "✓ Next Action
  // Created" toast — updates the action in place rather than creating a
  // second one.
  async function handleUpdateAction(actionId: number, input: {
    title: string
    dueAt: string
    priority: "low" | "medium" | "high"
    notes: string
  }): Promise<boolean> {
    const { data, error } = await supabase
      .from("lead_next_actions")
      .update({
        title: input.title,
        due_at: input.dueAt,
        priority: input.priority,
        notes: input.notes || null,
      })
      .eq("id", actionId)
      .select("*")
      .single()

    if (error) {
      console.error("[next-action] update failed:", error)
      return false
    }

    setNextActions?.((prev) => prev.map((a) => (a.id === actionId ? data : a)))
    setShowAddAction(false)
    setEditingAction(null)
    return true
  }

  async function handleCompleteAction(actionId: number) {
    const completedAt = new Date().toISOString()
    const completedAction = nextActions.find((a) => a.id === actionId)

    // Optimistic — drop it out of the open list immediately so ranking
    // re-computes without waiting on the network round trip.
    setNextActions?.((prev) => prev.filter((a) => a.id !== actionId))

    const { error } = await supabase
      .from("lead_next_actions")
      .update({ completed: true, completed_at: completedAt })
      .eq("id", actionId)

    if (error) {
      console.error("[next-action] complete failed:", error)
      return
    }

    // Workflow Engine — FU1 -> FU2 -> FU3 -> Final, one step at a time,
    // only after the previous step is actually completed (never the whole
    // sequence at once).
    if (completedAction) {
      const nextSpec = getNextFollowUpAction(completedAction.title)
      if (nextSpec) {
        const created = await createWorkflowActionIfNeeded(supabase, lead.id, nextSpec)
        if (created) {
          setNextActions?.((prev) => [...prev, created])
          emitWorkflowActionCreated(created)
        }
      }
    }
  }


  // ─── Favorites (Phase 1 — manual only) ──────────────────────────────────
  // No automation, no Property Matches integration yet. Just save/edit/
  // delete a client's favorite communities by hand.

  const leadFavorites = favorites.filter((f) => f.lead_id === lead.id)

  async function handleSaveFavorite(entries: FavoriteInput[]): Promise<boolean> {
    if (editingFavorite) {
      // Editing is always exactly one slot — the modal only ever sends a
      // single entry in this branch.
      const input = entries[0]
      const { data, error } = await supabase
        .from("lead_favorites")
        .update({
          property_name: input.propertyName || null,
          property_url: input.propertyUrl || null,
          property_address: input.propertyAddress || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingFavorite.id)
        .select("*")
        .single()

      if (error) {
        console.error("[favorite] update failed:", error)
        return false
      }

      setFavorites?.((prev) => prev.map((f) => (f.id === data.id ? data : f)))
      setShowFavoriteModal(false)
      setEditingFavorite(null)
      return true
    }

    // Add flow — one to three completed slots, saved together.
    const { data, error } = await supabase
      .from("lead_favorites")
      .insert(entries.map((input) => ({
        lead_id: lead.id,
        property_name: input.propertyName || null,
        property_url: input.propertyUrl || null,
        property_address: input.propertyAddress || null,
      })))
      .select("*")

    if (error) {
      console.error("[favorite] create failed:", error)
      return false
    }

    setFavorites?.((prev) => [...prev, ...(data ?? [])])
    setShowFavoriteModal(false)
    return true
  }

  function openEditFavorite(favorite: any) {
    setEditingFavorite(favorite)
    setShowFavoriteModal(true)
  }

  function closeFavoriteModal() {
    setShowFavoriteModal(false)
    setEditingFavorite(null)
  }

  async function handleDeleteFavorite() {
    const id = deletingFavoriteId
    setDeletingFavoriteId(null)
    if (id == null) return

    setFavorites?.((prev) => prev.filter((f) => f.id !== id))

    const { error } = await supabase
      .from("lead_favorites")
      .delete()
      .eq("id", id)

    if (error) {
      console.error("[favorite] delete failed:", error)
    }
  }

  // ─── Derived values ────────────────────────────────────────────────────

  const action = getNextAction({ ...lead, follow_up_count: followUps })
  const statusStyle = STATUS_STYLES[lead.crm_status] ?? "bg-gray-100 text-gray-700 border-gray-300"

  // Rank the automatic stage action (labeled exactly as the existing
  // button above always has) against this lead's open manual actions.
  // Requirement 7: completing/adding a manual action never deletes or
  // replaces the automatic one — this only decides which currently wins.
  const { primary: primaryAction, others: otherActions } = rankLeadActions(
    { ...lead, next_action_date: nextActionDate },
    nextActions,
    action
  )

  // ─── Short-form market inference (display only) ────────────────────────
  const inferredMarket =
    lead.lead_type === "short" && !lead.city
      ? inferMarketFromLandingPage(lead.landing_page)
      : null

  // The single control that resolves whatever's currently shown as the
  // primary Next Action — a manual action's own completion when a manual
  // action won ranking, or the automatic action's stage-based defer
  // otherwise. Only rendered when one of those actually applies.
  const canCompletePrimary = (primaryAction.kind === "manual" && !!primaryAction.manualAction) || !!doneConfig

  function handleCompletePrimary() {
    if (primaryAction.kind === "manual" && primaryAction.manualAction) {
      handleCompleteAction(primaryAction.manualAction.id)
    } else if (doneConfig) {
      handleDoneForNow(doneConfig.days)
    }
  }

  // ─── Message Client (Next Action left-side contextual button) ─────────
  // Only message-based actions get this button — everything else relies
  // solely on the right-side Mark Complete. "Contact Lead" reuses
  // handleFirstText's own rich, beds/move-date-aware template; every
  // other message-based title has a fixed template below. Either way,
  // sending the message also resolves the current primary action, same
  // as clicking it already did before Workflow Engine actions existed.
  // Includes both the new Workflow Engine titles AND the legacy automatic
  // virtual labels that already sent a message when clicked (see
  // handleNextActionClick below) — a lead can sit on one of those for a
  // while before the Workflow Engine's real row takes over (e.g.
  // "Waiting for Response"/"Build List" before the 2-day Follow Up or the
  // immediate Send List action exists), and it shouldn't lose messaging
  // in the meantime.
  const MESSAGE_BASED_TITLES = new Set([
    "Contact Lead", "Follow Up", "Send List", "FU1", "FU2", "FU3", "Final", "Reconnect Client",
    "Waiting for Response", "Build List", "Final FU",
  ])

  const MESSAGE_TEMPLATES: Record<string, (name: string) => string> = {
    "Follow Up": (name) => `Hey ${name}! Just checking in — have you had a chance to look at your options? Let me know if you have any questions!`,
    "Send List": (name) => `Hey ${name}, I just sent your list over!\n\nCan you ❤️ your top 2–3 favorites?\n\nI'll get tours set up or tweak the list for you`,
    "FU1": () => `Hey! Did you see any properties on the list that you'd like to tour?`,
    "FU2": () => `Is there one that stands out or would you like me to narrow the list down a bit more?`,
    "FU3": () => `I'm calling communities you were interested in to get updated pricing and specials. Are you still looking to move?`,
    "Final": (name) => `Hey ${name}, I haven't heard back so I'll pause your search for now. No rush, just let me know when you'd like me to pick it back up!`,
    "Reconnect Client": (name) => `Hey ${name}! Just checking in — your move date is getting closer. Are you still planning to move, and would you like me to start setting up tours?`,
  }

  function handleMessageClient() {
    const title = primaryAction.title

    if (title === "Contact Lead") {
      handleFirstText()
    } else {
      const template = MESSAGE_TEMPLATES[title]
      if (template) openSMS(template(normalizeName(lead.first_name || "")))
    }

    if (primaryAction.kind === "manual" && primaryAction.manualAction) {
      handleCompleteAction(primaryAction.manualAction.id)
    } else if (primaryAction.kind === "automatic" && title !== "Contact Lead") {
      // Preserves existing behavior for stages the Workflow Engine hasn't
      // created a real action for yet (e.g. the FU1/FU2/FU3 reached via
      // the Quick Actions FU buttons rather than entering List Sent).
      handleNextActionClick()
    }
  }

  // ─── Call Client (Next Action left-side button) ────────────────────────
  // Only ever offered for "Contact Lead" — the preferred first-contact
  // method setting is specifically about *first* contact with a new lead,
  // not every message-based follow-up. handleCallClient already records
  // the "contacted" signal itself (recordFirstContact), so this only
  // additionally needs to resolve a real Workflow Engine row if one won
  // ranking.
  function handleCallClientAction() {
    handleCallClient()
    if (primaryAction.kind === "manual" && primaryAction.manualAction) {
      handleCompleteAction(primaryAction.manualAction.id)
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <>
    <div className="w-full h-full flex flex-col bg-[var(--crm-panel)]">

      {/* ── Panel header ── */}
      <div className="flex-none bg-[var(--crm-panel)] border-b border-[var(--crm-border)] px-5 pt-5 pb-4 shadow-[0_1px_4px_rgba(var(--crm-shadow-color),0.08)]">

        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h2 className="text-[22px] font-bold text-[var(--crm-text-primary)] tracking-tight leading-tight truncate">
              {normalizeName(lead.first_name)} {normalizeName(lead.last_name)}
            </h2>
            {lead.phone && (
              <a
                href={`tel:${lead.phone}`}
                className="text-lg font-semibold text-[var(--kb-accent)] mt-0.5 mb-1.5 block hover:underline"
              >
                {formatPhone(lead.phone)}
              </a>
            )}
          </div>

          <div className="flex-none flex items-center gap-1 mt-0.5">
            {lead.archive_reason !== "deleted_by_user" && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--crm-text-muted)] hover:text-red-600 hover:bg-red-50 transition-colors"
                aria-label="Delete lead"
                title="Delete lead"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2 3.5h10M5 3.5V2a1 1 0 011-1h2a1 1 0 011 1v1.5M5.5 6.5v4M8.5 6.5v4M3 3.5l.6 8a1 1 0 001 .9h4.8a1 1 0 001-.9l.6-8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            )}

            <button
              onClick={onClose}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--crm-text-muted)] hover:text-[var(--crm-text-primary)] hover:bg-[var(--crm-card)] transition-colors"
              aria-label="Close"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Status + follow-up indicator */}
        <div className="flex items-center gap-2 flex-wrap mb-4">
          <span className={`text-[11.5px] font-semibold px-2.5 py-1 rounded-full border ${statusStyle}`}>
            {formatStatus(lead.crm_status)}
          </span>

          {nextActionDate && (() => {
            const s = getFollowUpStatus(nextActionDate)
            if (s === "overdue") return <span className="text-[11.5px] font-semibold text-red-500">· Overdue Follow-Up</span>
            if (s === "today")   return <span className="text-[11.5px] font-semibold text-amber-600">· Follow Up Today</span>
            return <span className="text-[11.5px] text-[var(--crm-text-muted)]">· Next: {formatDate(nextActionDate)}</span>
          })()}
        </div>

        {/* Archive Reason — archived leads only */}
        {lead.crm_status === "archived" && (
          <div className="mb-4">
            <label className="text-[10px] font-semibold text-[var(--crm-text-muted)] uppercase tracking-widest mb-1 block">
              Archive Reason
            </label>
            <select
              value={archiveReason}
              onChange={(e) => handleArchiveReasonChange(e.target.value)}
              className="w-full text-[13px] font-medium text-[var(--crm-text-primary)] border border-[var(--crm-border)] rounded-lg px-2.5 py-1.5 bg-[var(--crm-inset)]"
            >
              <option value="">Select reason...</option>
              {ARCHIVE_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>

            {archiveReason === "deleted_by_user" && (
              <div className="mt-2 bg-red-50 border border-red-100 rounded-lg px-3 py-2.5">
                <p className="text-[11.5px] text-red-700">
                  Deleted{lead.deleted_by ? ` by ${lead.deleted_by}` : ""}
                  {lead.deleted_at ? ` on ${formatDate(lead.deleted_at)}` : ""}.
                </p>
                <button
                  onClick={handleRestoreLead}
                  className="mt-2 w-full px-3 py-1.5 rounded-lg bg-[var(--crm-panel)] border border-red-300 text-red-700 text-[12.5px] font-semibold hover:bg-red-100 transition-colors"
                >
                  ↩️ Restore Lead
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Action buttons ── */}
        <p className="text-[10px] font-semibold text-[var(--crm-text-muted)] uppercase tracking-widest mb-2">Quick Actions</p>
        <div className="bg-[var(--crm-card)] border border-[var(--crm-border-soft)] rounded-2xl shadow-[0_1px_2px_rgba(var(--crm-shadow-color),0.04),0_4px_10px_rgba(var(--crm-shadow-color),0.06)] p-3">

          {/* Row 1: primary actions */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleFirstText}
              className="crm-cta text-xs font-semibold px-3 py-2 rounded-lg border"
            >
                Contact Lead
              </button>

              <button
                onClick={() => {
                  const name = normalizeName(lead.first_name || "")
                  const message = `Hey ${name}, I found 3 excellent options for you!\n\n${topMatches.slice(0, 3).map((p, i) => {
                    const url = p.website?.startsWith("http") ? p.website : `https://${p.website || ""}`
                    return `${i + 1}. ${p.name}\n${url}`
                  }).join("\n\n")}\n\nWhich one do you like most?`
                  if (lead.phone) window.open(`sms:${lead.phone}?&body=${encodeURIComponent(message)}`, "_self")
                }}
                className="text-xs font-medium px-3 py-2 rounded-lg border bg-[var(--crm-panel)] text-[var(--crm-text-secondary)] border-[var(--crm-border)] hover:bg-[var(--crm-card)] hover:border-[var(--crm-text-muted)] transition-colors"
              >
                Text Top 3
              </button>

              <button
                onClick={() => {
                  const name = normalizeName(lead.first_name || "")
                  openSMS(`Hey ${name}, I just sent your list over!\n\nCan you ❤️ your top 2–3 favorites?\n\nI'll get tours set up or tweak the list for you`)
                }}
                className="text-xs font-medium px-3 py-2 rounded-lg border bg-[var(--crm-panel)] text-[var(--crm-text-secondary)] border-[var(--crm-border)] hover:bg-[var(--crm-card)] hover:border-[var(--crm-text-muted)] transition-colors"
              >
                List Sent
              </button>

              <button
                onClick={() => setShowVoiceScript(true)}
                className="text-xs font-medium px-3 py-2 rounded-lg border bg-[var(--crm-panel)] text-[var(--crm-text-secondary)] border-[var(--crm-border)] hover:bg-[var(--crm-card)] hover:border-[var(--crm-text-muted)] transition-colors"
              >
                AI Voice Script
              </button>
            </div>

            {/* Row 2: follow-up sequence — mt-3 (was the shared space-y-2
                on the parent, ~8.5px) gives this its own slightly larger
                gap beneath Quick Actions' Row 1, separating the two
                functional groups without feeling disconnected. */}
            <div className="mt-3 flex items-center gap-1.5">
              <span className="text-[10px] font-semibold text-[var(--crm-text-muted)] uppercase tracking-widest mr-1">Follow Up</span>
              {[1, 2, 3].map((step) => (
                <button
                  key={step}
                  onClick={async () => {
                    await setFollowUpCount(step)
                    const msgs: Record<number, string> = {
                      1: `Hey! Did you see any properties on the list that you'd like to tour?`,
                      2: `Is there one that stands out or would you like me to narrow the list down a bit more?`,
                      3: `I'm calling communities you were interested in to get updated pricing and specials. Are you still looking to move?`,
                    }
                    openSMS(msgs[step])
                  }}
                  className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition-colors ${getFUStyle(step)}`}
                >
                  FU{step}
                </button>
              ))}
              <button
                onClick={() => {
                  const name = normalizeName(lead.first_name || "")
                  openSMS(`Hey ${name}, I haven't heard back so I'll pause your search for now. No rush, just let me know when you'd like me to pick it back up!`)
                }}
                className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border bg-[var(--crm-panel)] text-[var(--crm-text-secondary)] border-[var(--crm-border)] hover:bg-[var(--crm-card)] hover:border-[var(--crm-text-muted)] transition-colors"
              >
                Final FU
              </button>
            </div>

          </div>
        </div>

      {/* ── Panel body ── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-7">
        {/* Next Action — same clean two-column layout regardless of
            whether the primary action is automatic or manual. Left shows
            what it is, when it's due, and — only for message-based
            actions — a Message Client button. Right shows how to
            complete it (when there's a way to). This section answers one
            question only: what's next. */}
        <div className="bg-[var(--crm-card)] border border-[var(--crm-border-soft)] rounded-2xl shadow-[0_1px_2px_rgba(var(--crm-shadow-color),0.04),0_4px_10px_rgba(var(--crm-shadow-color),0.06)] px-4 py-3">
          <div className="grid grid-cols-2 gap-3 items-stretch">
            <div className="flex flex-col">
              <p className="text-[10px] font-semibold text-[var(--crm-text-muted)] uppercase tracking-widest mb-1.5">Next Action</p>
              <p className="text-sm font-semibold text-[var(--crm-text-primary)] px-3 py-1.5 rounded-lg border border-[var(--crm-border)] bg-[var(--crm-panel)] w-full truncate">
                {primaryAction.title}
              </p>
              {/* Fixed-height slot regardless of whether this action has a
                  due date — keeps every lead's card the same height instead
                  of growing/shrinking by workflow action (see task: UI
                  Polish Pass point 1). */}
              <p className="text-[11px] text-[var(--crm-text-secondary)] mt-1.5 h-[14px] leading-[14px]">
                {primaryAction.dueAt ? formatDueDateTime(primaryAction.dueAt) : " "}
              </p>
              {/* Reserved slot for the contextual execution button(s) — a
                  real button (Message Client/Call Client) renders at 32px
                  regardless, so this minimum only matters for actions with
                  no button at all (Setup Tour, Check App, etc.). Sized down
                  to 10px (final alignment pass) so "+ Add Next Action"
                  below reads as centered in the remaining card space
                  instead of visibly closer to the card's bottom edge. */}
              <div className="mt-1.5 min-h-[10px] flex items-center gap-1.5">
                {primaryAction.title === "Contact Lead" ? (
                  <>
                    {(contactPref === "text" || contactPref === "ask") && (
                      <button
                        type="button"
                        onClick={handleMessageClient}
                        className="crm-cta-soft text-[11.5px] font-semibold px-3 py-1.5 rounded-lg transition-colors"
                      >
                        {contactPref === "ask" ? "Message" : "Message Client"}
                      </button>
                    )}
                    {(contactPref === "call" || contactPref === "ask") && (
                      <button
                        type="button"
                        onClick={handleCallClientAction}
                        className="crm-cta-soft text-[11.5px] font-semibold px-3 py-1.5 rounded-lg transition-colors"
                      >
                        {contactPref === "ask" ? "Call" : "Call Client"}
                      </button>
                    )}
                  </>
                ) : MESSAGE_BASED_TITLES.has(primaryAction.title) && (
                  <button
                    type="button"
                    onClick={handleMessageClient}
                    className="crm-cta-soft text-[11.5px] font-semibold px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Message Client
                  </button>
                )}
              </div>
            </div>

            {/* Same fixed-height shape as the left column whether or not
                this primary action can be completed — invisible but still
                occupies its layout space so the grid row's height (and
                therefore the whole card) never depends on which action is
                showing. Top-anchored (no justify-end) so Status pairs with
                the title row and Mark Complete pairs with the due-date row
                on the left, instead of both sinking to the card's bottom. */}
            <div className={`flex flex-col items-end${canCompletePrimary ? "" : " invisible"}`}>
              <p className="text-[10px] font-semibold text-[var(--crm-text-muted)] uppercase tracking-widest mb-1 whitespace-nowrap">
                {primaryAction.kind === "automatic" && doneMsg ? "Status: Complete" : "Status: Pending"}
              </p>
              <button
                type="button"
                onClick={canCompletePrimary ? handleCompletePrimary : undefined}
                tabIndex={canCompletePrimary ? 0 : -1}
                className={[
                  // Matches the left column's Setup Tour/title pill exactly
                  // (text-sm, px-3 py-1.5, rounded-lg, font-semibold) so the
                  // two buttons share identical width/height/padding —
                  // w-full stretches both to fill their equal grid-cols-2
                  // column, the only thing that differs is color/border.
                  "w-full text-sm font-semibold px-3 py-1.5 rounded-lg border transition-colors truncate text-center",
                  primaryAction.kind === "automatic" && doneMsg
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                    : "border-[var(--crm-border)] bg-[var(--crm-inset)] text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)] hover:border-[var(--crm-text-muted)]",
                ].join(" ")}
              >
                {primaryAction.kind === "automatic" && doneMsg ? "✓ Completed" : "Mark Complete"}
              </button>
            </div>
          </div>

          {/* Other Open Actions — a plain list, nothing more. Hidden
              entirely when there's nothing else open. */}
          {otherActions.length > 0 && (
            <div className="mt-1 pt-1 border-t border-[var(--crm-border-soft)]">
              <p className="text-[10px] font-semibold text-[var(--crm-text-muted)] uppercase tracking-widest mb-1.5">
                Other Open Actions
              </p>
              <ul className="space-y-1 text-[11.5px] text-[var(--crm-text-secondary)]">
                {otherActions.map((other, i) => (
                  <li
                    key={other.manualAction?.id ?? `automatic-${i}`}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="truncate">• {other.title}</span>
                    {other.dueAt && (
                      <span className="flex-none text-[var(--crm-text-muted)] whitespace-nowrap">
                        {formatActionDueDate(other.dueAt)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Add a manual action */}
          <button
            type="button"
            onClick={() => {
              setEditingAction(null)
              setShowAddAction(true)
            }}
            className="mt-1 w-full text-[11.5px] font-semibold px-3 py-1.5 rounded-lg border border-dashed border-[var(--crm-border)] text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)] hover:border-[var(--crm-text-muted)] transition-colors"
          >
            + Add Next Action
          </button>
        </div>

        {/* Section: Favorite Properties (Phase 1 — manual only) */}
        <SectionCard title="Favorite Properties" collapsible defaultOpen={false}>
          {leadFavorites.length === 0 ? (
            <p className="text-[12.5px] text-[var(--crm-text-muted)]">No favorite properties added.</p>
          ) : (
            <div className="space-y-1.5">
              {leadFavorites.map((fav) => (
                <div
                  key={fav.id}
                  className="flex items-center gap-2 bg-[var(--crm-card)] border border-[var(--crm-border)] rounded-lg px-3 py-2 hover:border-[var(--crm-text-muted)] hover:bg-[var(--crm-inset)] transition-colors"
                >
                  {fav.property_url ? (
                    <a
                      href={fav.property_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-w-0 flex-1"
                    >
                      <p className="text-[12.5px] font-semibold text-[var(--crm-accent)] hover:underline truncate">
                        {fav.property_name || fav.property_url}
                      </p>
                      {fav.property_address && (
                        <p className="text-[11px] text-[var(--crm-text-muted)] truncate">{fav.property_address}</p>
                      )}
                    </a>
                  ) : (
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] font-semibold text-[var(--crm-text-primary)] truncate">
                        {fav.property_name}
                      </p>
                      {fav.property_address && (
                        <p className="text-[11px] text-[var(--crm-text-muted)] truncate">{fav.property_address}</p>
                      )}
                    </div>
                  )}
                  <div className="flex-none flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => openEditFavorite(fav)}
                      className="text-[10.5px] font-semibold text-[var(--crm-text-secondary)] hover:text-[var(--crm-text-primary)]"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingFavoriteId(fav.id)}
                      className="text-[10.5px] font-semibold text-red-500 hover:text-red-700"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowFavoriteModal(true)}
            className="mt-2.5 w-full text-[11.5px] font-semibold px-3 py-1.5 rounded-lg border border-dashed border-[var(--crm-border)] text-[var(--crm-text-secondary)] hover:border-[var(--crm-text-muted)] hover:text-[var(--crm-text-primary)] transition-colors"
          >
            + Add Favorites
          </button>
        </SectionCard>

        {/* Section: Search Criteria */}
        <SectionCard title="Search Criteria" shaded collapsible defaultOpen={false}>
          <Field label={inferredMarket ? "Interest" : "City"} value={inferredMarket || lead.city} />
          <Field label="Budget" value={formatRent(lead.desired_rent)} />
          <Field label="Property Type" value={lead.property_type} />
          <Field label="Beds / Baths" value={lead.beds || lead.baths ? `${lead.beds || "—"} / ${lead.baths || "—"}` : null} />
          <Field label="Move Date" value={formatDate(lead.move_date)} />
          {lead.neighborhoods && <Field label="Desired Areas" value={lead.neighborhoods} />}
          {lead.source && (
            <div className="flex items-start justify-between gap-4">
              <span className="text-[12.5px] text-[var(--crm-text-muted)] flex-none">Source</span>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${getSourceStyle(lead.source).badgeClassName}`}>
                {getSourceStyle(lead.source).label}
              </span>
            </div>
          )}
        </SectionCard>

        {/* Section: Screening */}
        <SectionCard title="Credit Screening" collapsible defaultOpen={false}>
          <Field label="Credit Score" value={lead.credit_score} />
          <Field label="Credit History" value={lead.credit_history} />
          <Field label="Eviction Court" value={lead.eviction_court === "Yes" ? "Yes" : "No"} />
          {lead.eviction_court === "Yes" && (
            <>
              <Field label="Eviction Age" value={lead.eviction_age} />
              <Field label="Eviction Balance" value={lead.eviction_balance} />
            </>
          )}
          <Field
            label="Broken Lease"
            value={String(lead.credit_history || "").toLowerCase().includes("broken") ? "Yes" : "No"}
          />
          {String(lead.credit_history || "").toLowerCase().includes("broken") && (
            <>
              <Field label="Broken Lease Age" value={lead.broken_lease_age} />
              <Field label="Broken Lease Amount" value={lead.broken_lease_amount} />
            </>
          )}
          <Field label="Criminal Background" value={lead.criminal_background || "None"} />
          {lead.criminal_charge && <Field label="Criminal Charge" value={lead.criminal_charge} />}
          {lead.criminal_background === "Felony" && <Field label="Felony Age" value={lead.felony_age} />}
          {lead.criminal_background === "Misdemeanor" && <Field label="Misdemeanor Age" value={lead.misdemeanor_age} />}
        </SectionCard>

        {/* Section: Client Notes */}
        <CollapsibleNotes
          title="Client Notes"
          defaultOpen={!!(lead.notes && lead.notes.trim())}
        >
          <textarea
            value={lead.notes || ""}
            readOnly
            placeholder="No notes submitted."
            className="w-full h-20 text-[12.5px] bg-[var(--crm-card)] border border-[var(--crm-border)] rounded-xl px-3 py-2 resize-none cursor-default text-[var(--crm-text-secondary)] placeholder-[var(--crm-text-muted)] focus:outline-none"
          />
        </CollapsibleNotes>

        {/* Section: Locator Notes */}
        <CollapsibleNotes
          title="Locator Notes"
          defaultOpen={!!(lead.locator_notes && lead.locator_notes.trim())}
        >
          <textarea
            value={lead.locator_notes || ""}
            onChange={async (e) => {
              const newNotes = e.target.value
              if (onUpdateLead) onUpdateLead({ ...lead, locator_notes: newNotes })
              await supabase
                .from("leads")
                .update({ locator_notes: newNotes })
                .eq("id", lead.id)
                .select("*")
            }}
            placeholder="Internal notes about this client..."
            className="w-full h-24 text-[12.5px] bg-[var(--crm-inset)] border border-[var(--crm-border)] rounded-xl px-3 py-2 resize-none text-[var(--crm-text-primary)] placeholder-[var(--crm-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--crm-accent)] focus:border-transparent transition-shadow"
          />
        </CollapsibleNotes>


      </div>
    </div>

    <AiVoiceScriptModal
      open={showVoiceScript}
      onClose={() => setShowVoiceScript(false)}
      lead={lead}
      topMatches={topMatches}
    />

    <ConfirmDialog
      open={showDeleteConfirm}
      title="Delete this lead?"
      message={`Are you sure you want to delete ${normalizeName(lead.first_name)} ${normalizeName(lead.last_name)}? The lead will be archived, not permanently removed — you can restore it later from the Archived column.`}
      confirmLabel="Delete Lead"
      cancelLabel="Cancel"
      danger
      onConfirm={handleDeleteLead}
      onCancel={() => setShowDeleteConfirm(false)}
    />

    <AddNextActionModal
      open={showAddAction}
      onClose={() => {
        setShowAddAction(false)
        setEditingAction(null)
      }}
      onCreate={handleCreateAction}
      onUpdate={handleUpdateAction}
      editing={editingAction}
      crmStatus={lead.crm_status}
    />

    <FavoriteModal
      open={showFavoriteModal}
      editing={editingFavorite}
      onClose={closeFavoriteModal}
      onSave={handleSaveFavorite}
    />

    <ConfirmDialog
      open={deletingFavoriteId !== null}
      title="Delete this favorite?"
      message="This will remove the saved property from this lead's favorites. This can't be undone."
      confirmLabel="Delete"
      cancelLabel="Cancel"
      danger
      onConfirm={handleDeleteFavorite}
      onCancel={() => setDeletingFavoriteId(null)}
    />
    </>
  )
}
