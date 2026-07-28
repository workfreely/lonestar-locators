"use client"

import { supabase } from "@/lib/supabase/client"
import { getNextAction } from "@/lib/nextAction"
import { useState, useEffect, useRef } from "react"
import { formatPhone } from "@/lib/utils/formatPhone"
import GuestCardModal from "./GuestCardModal"
import type { GuestCardAgent } from "@/lib/leads/guestCard"
import { isGuestCardTitle } from "@/lib/leads/guestCardWorkflow"
import { recordTimelineEvent } from "@/lib/leads/timeline"
import LeadSourceBadge from "./LeadSourceBadge"
import { inferMarketFromLandingPage } from "@/lib/leads/inferMarketFromLandingPage"
import { ARCHIVE_REASONS } from "@/lib/leads/archiveReasons"
import { rankLeadActions } from "@/lib/nextActions"
import { getNextFollowUpAction, createWorkflowActionIfNeeded } from "@/lib/workflowEngine"
import { emitWorkflowActionCreated } from "@/lib/workflowToast"
import { getActionIcon, formatDueDateTime } from "@/lib/actionDisplay"
import AiVoiceScriptModal from "./AiVoiceScriptModal"
import ConfirmDialog from "./ConfirmDialog"
import AddNextActionModal from "./AddNextActionModal"
import { SectionCard } from "./LeadPanelSections"

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

// Desired Areas display. When the client selected an entire market, the
// neighborhoods carry an "All of {city}" entry — collapse that to just the
// market name so the panel doesn't list every neighborhood. Specific
// selections render as-is.
function formatDesiredAreas(neighborhoods: unknown, city: string | null | undefined): string | null {
  const raw = (neighborhoods ?? "").toString().trim()
  if (!raw) return null
  if (/all of/i.test(raw)) return (city ?? "").trim() || raw.replace(/^all of\s*/i, "").trim()
  return raw
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
  applied:       "bg-gray-100 text-gray-800 border-gray-300",
  closed:        "bg-green-100 text-green-800 border-green-300",
  archived:      "bg-slate-100 text-slate-700 border-slate-300",
}

// Source badge styles moved to lib/leads/sourceStyles.ts (getSourceStyle) —
// the single canonical source-styling module shared with LeadCard,
// DashboardStats, and the Performance page.

// ─── Sub-components ───────────────────────────────────────────────────────────

// SectionCard + CollapsibleNotes moved to ./LeadPanelSections (shared with the
// right-panel Favorite Properties + Notes components).

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
  agent,
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
  agent?: GuestCardAgent
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
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false)
  const [showAddAction, setShowAddAction] = useState(false)
  const [editingAction, setEditingAction] = useState<any | null>(null)
  // Auto-completion of the current action: armed when the user opens the
  // action's template/workflow, then stamped Completed when they return to the
  // app (i.e. after actually sending the message / making the call).
  const [completedAtTs, setCompletedAtTs] = useState<string | null>(null)
  const armedActionRef = useRef(false)
  const [showGuestCard, setShowGuestCard] = useState(false)
  // The specific property + action the open Guest Card modal is emailing about
  // (each Favorite Property has its own guest card).
  const [guestCardProperty, setGuestCardProperty] = useState<any | null>(null)
  const [activeGuestCardActionId, setActiveGuestCardActionId] = useState<number | null>(null)

  // The locator's Preferred Name (first token) for outbound message templates
  // — e.g. "Hey Sarah it's Jay!". Falls back to "Jay" for the single-operator
  // default when no profile name is set yet.
  const locatorFirstName = ((agent?.name || "").trim().split(/\s+/)[0]) || "Jay"

  const leadFavorites = favorites.filter((f) => f.lead_id === lead.id)

  useEffect(() => {
    setFollowUps(Number(lead.follow_up_count || 0))
    setNextActionDate(lead.next_action_date || null)
    setArchiveReason(lead.archive_reason || "")
  }, [lead.id, lead.follow_up_count, lead.next_action_date, lead.archive_reason])


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

    // Append this follow-up to the immutable lead timeline — one row per
    // genuine advance (the duplicate guard keeps a re-click from logging twice).
    // `follow_up_count` on `leads` stays the workflow cache; this is history.
    if (!alreadyAtStep) {
      recordTimelineEvent({ leadId: lead.id, type: "follow_up", method: "text", sequence: nextFollowUpCount })
    }

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

  function recordFirstContact(method: "call" | "text") {
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

    // Append the first-contact event to the immutable lead timeline — done
    // LAST and best-effort, after every workflow-critical write above, so a
    // timeline failure can never affect the New → Contacted workflow. History
    // only; `leads` remains the source of truth for live state. Fires once, on
    // the genuine New → Contacted transition, regardless of which button ran it.
    if (shouldAdvanceStage) {
      recordTimelineEvent({ leadId: lead.id, type: "first_contact", method, sequence: 0, occurredAt: contactedAt })
    }
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
    openSMS(`Hey ${name} it's ${locatorFirstName}! I got your form for a ${bedsText} move${monthText}. Are you trying to stay near a specific address or side of town?`)
    recordFirstContact("text")
  }

  // ─── Call Client (first-contact preference: "call" or "ask") ──────────
  // Same "this lead was contacted" bookkeeping as handleFirstText — only
  // the actual contact method differs (tel: link instead of an SMS body).
  function handleCallClient() {
    if (!lead.phone) return
    window.open(`tel:${lead.phone}`, "_self")
    recordFirstContact("call")
  }

  // ─── Header Call / Text Client buttons ────────────────────────────────
  // These live under the phone number and are available at every stage as
  // generic communication shortcuts. But on a NEW lead, a call or a text IS
  // first contact — so they run the exact same automation as Contact Lead
  // (complete Contact Lead, stamp the contact time, advance New → Contacted,
  // generate the next action). No confirmation. On leads already past New
  // they stay pure comms and never rewrite the first-contact timestamp.
  function handleHeaderCall() {
    if (!lead.phone) return
    window.open(`tel:${lead.phone}`, "_self")
    if (lead.crm_status === "new") recordFirstContact("call")
  }

  function handleHeaderText() {
    if (!lead.phone) return
    window.open(`sms:${lead.phone}`, "_self")
    if (lead.crm_status === "new") recordFirstContact("text")
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

  // Archive (never a permanent delete) — moves the lead out of the active CRM
  // while preserving everything (notes, workflow/comms history, analytics) and
  // recording pre_delete_status so it can be restored at any time. Uses the
  // existing soft-delete columns (deleted_at/deleted_by/pre_delete_status) as
  // archive metadata.
  async function handleArchiveLead() {
    setShowArchiveConfirm(false)

    const { data: { user } } = await supabase.auth.getUser()

    // Archiving pauses the workflow — it does not erase it. next_action_date,
    // the automatic action's own driving field, is deliberately left as-is:
    // rankLeadActions/FollowUpRow/LeadCard all already treat archived leads
    // as inactive regardless of this value, so there's no need to null it
    // out here — and nulling it would mean restoring the lead couldn't
    // resume the workflow without the user manually resetting a due date.
    const updates = {
      crm_status: "archived",
      archive_reason: "archived_by_user",
      deleted_at: new Date().toISOString(),
      deleted_by: user?.email ?? null,
      pre_delete_status: lead.crm_status,
    }

    setArchiveReason("archived_by_user")
    if (onUpdateLead) onUpdateLead({ ...lead, ...updates })

    const { error } = await supabase
      .from("leads")
      .update(updates)
      .eq("id", lead.id)

    if (error) {
      console.error("[archive-lead] update failed:", error)
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


  // Favorite Properties + Client/Locator Notes moved to the right workspace
  // panel (LeadFavorites.tsx / LeadNotes.tsx) for V1.

  // ─── Derived values ────────────────────────────────────────────────────

  const action = getNextAction({ ...lead, follow_up_count: followUps })
  const statusStyle = STATUS_STYLES[lead.crm_status] ?? "bg-gray-100 text-gray-700 border-gray-300"

  // Rank the automatic stage action (labeled exactly as the existing
  // button above always has) against this lead's open manual actions.
  // Requirement 7: completing/adding a manual action never deletes or
  // replaces the automatic one — this only decides which currently wins.
  const { primary: primaryAction } = rankLeadActions(
    { ...lead, next_action_date: nextActionDate },
    nextActions,
    action
  )

  // The Next Action card answers two questions in order: "what did I just do?"
  // (Last Action) and "what should I do next?" (Next Action).
  //
  // Just contacted = the New → Contacted first-contact window (before any
  // follow-up). Its completion timestamp is the PERSISTED first_text_sent_at,
  // so the completed state survives a close/reopen and a refresh.
  const justContacted =
    lead.crm_status === "contacted" &&
    (Number(lead.follow_up_count) || 0) === 0 &&
    !!lead.first_text_sent_at

  // Last Action — the most recently completed action + when. First contact uses
  // the persisted first_text_sent_at; a message action completed in place (its
  // own button, via the return-to-focus stamp) uses completedAtTs.
  const lastAction: { title: string; completedAt: string } | null =
    justContacted && lead.first_text_sent_at
      ? { title: "Contact Lead", completedAt: lead.first_text_sent_at }
      : completedAtTs
      ? { title: primaryAction.title, completedAt: completedAtTs }
      : null

  // Next Action — the next OPEN, actionable task. Null when the primary was just
  // completed in place (completedAtTs) or is the passive "Waiting for Response"
  // state, which is a workflow status, never surfaced as an action here. Tied to
  // `primaryAction` so the button's openAction() always targets the right task.
  const nextOpenAction =
    completedAtTs || primaryAction.title === "Waiting for Response" ? null : primaryAction

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

  // Open (NOT complete) the current action so the user can actually perform it.
  // Message-based actions open the prefilled SMS template so the user can
  // review/edit before sending; a manual action with no template opens its
  // details in the editor. Opening never marks the action complete or advances
  // the workflow — that's the Complete button's job.
  function openAction() {
    const title = primaryAction.title
    const name = normalizeName(lead.first_name || "")

    // Email Guest Card opens its own workflow (PDF + email preview) for THIS
    // action's specific property, not a text template — and it's completed
    // from inside the modal, so it must never arm the return-to-focus
    // auto-complete.
    if (isGuestCardTitle(title)) {
      const ma = primaryAction.manualAction
      const prop =
        (ma?.property_id != null ? leadFavorites.find((f) => f.id === ma.property_id) : null) ??
        (ma?.property_name ? { property_name: ma.property_name } : null) ??
        leadFavorites[0] ??
        null
      setGuestCardProperty(prop)
      setActiveGuestCardActionId(ma?.id ?? null)
      setShowGuestCard(true)
      return
    }

    // Contact Lead IS first contact — clicking it must ADVANCE the workflow
    // (New → Contacted + generate the next action), not merely open the message
    // and wait for a return-to-focus "complete" (which only stamps a visual
    // Completed for automatic actions and never persists anything). handleFirstText
    // opens the same first-contact SMS AND runs recordFirstContact(). Do NOT arm
    // the auto-complete here: recordFirstContact advances the stage, which retires
    // the Contact Lead action on its own.
    if (title === "Contact Lead") {
      handleFirstText()
      return
    }

    const template = MESSAGE_TEMPLATES[title]
    if (template) {
      openSMS(template(name))
      armedActionRef.current = true
      return
    }

    // Non-message action (Setup Tour, Check App, custom manual action) — open
    // its details so the user can review/edit what needs doing.
    if (primaryAction.kind === "manual" && primaryAction.manualAction) {
      setEditingAction(primaryAction.manualAction)
      setShowAddAction(true)
    }
  }

  // The Guest Card email for one property was launched — mark THAT action
  // complete. Only once every property's guest card is done do we open the
  // next step, Setup Tour (the lead stays in List Sent until a tour is
  // actually scheduled). If more properties are added later, each spawns its
  // own guest card that ranks ahead of Setup Tour.
  async function handleGuestCardSent() {
    const id = activeGuestCardActionId
    if (id != null) {
      await supabase
        .from("lead_next_actions")
        .update({ completed: true, completed_at: new Date().toISOString() })
        .eq("id", id)
    }
    // Any OTHER guest cards still pending for this lead?
    const remainingGuestCards = nextActions.filter(
      (a) => a.lead_id === lead.id && !a.completed && a.id !== id && isGuestCardTitle(a.title)
    )
    let created: any = null
    if (remainingGuestCards.length === 0) {
      created = await createWorkflowActionIfNeeded(supabase, lead.id, {
        title: "Setup Tour",
        dueAt: new Date().toISOString(),
      })
    }
    setNextActions?.((prev) => {
      let next = id != null ? prev.filter((a) => a.id !== id) : prev
      if (created) next = [...next, created]
      return next
    })
    setActiveGuestCardActionId(null)
  }

  // Reset the per-action completion display when switching leads.
  useEffect(() => {
    setCompletedAtTs(null)
    armedActionRef.current = false
    setShowGuestCard(false)
    setGuestCardProperty(null)
    setActiveGuestCardActionId(null)
  }, [lead.id])

  // Auto-complete: opening an action's template arms it; the next time the app
  // regains focus (the user came back from sending the text / making the call)
  // we stamp the action Completed. Opening alone never marks it complete.
  useEffect(() => {
    function onReturn() {
      if (document.visibilityState !== "visible") return
      if (!armedActionRef.current || completedAtTs) return
      armedActionRef.current = false
      const ts = new Date().toISOString()
      setCompletedAtTs(ts)
      // Persist for a real manual-action row (demo rows simply match nothing).
      if (primaryAction.kind === "manual" && primaryAction.manualAction) {
        supabase
          .from("lead_next_actions")
          .update({ completed: true, completed_at: ts })
          .eq("id", primaryAction.manualAction.id)
          .then(() => {})
      }
    }
    document.addEventListener("visibilitychange", onReturn)
    window.addEventListener("focus", onReturn)
    return () => {
      document.removeEventListener("visibilitychange", onReturn)
      window.removeEventListener("focus", onReturn)
    }
  }, [completedAtTs, primaryAction])

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <>
    <div className="w-full h-full flex flex-col bg-[var(--crm-panel)]">

      {/* ── Panel header ── */}
      <div className="flex-none bg-[var(--crm-panel)] border-b border-[var(--crm-border)] px-5 pt-4 pb-3 shadow-[0_1px_4px_rgba(var(--crm-shadow-color),0.08)]">

        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="min-w-0 flex-1">
            {/* Name + status together — status stays in the header, next to
                the client, separate from the communication + workflow below. */}
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="min-w-0 text-[22px] font-bold text-[var(--crm-text-primary)] tracking-tight leading-tight truncate">
                {normalizeName(lead.first_name)} {normalizeName(lead.last_name)}
              </h2>
              <span className={`flex-none text-[11px] font-semibold px-2.5 py-1 rounded-full border ${statusStyle}`}>
                {formatStatus(lead.crm_status)}
              </span>
            </div>
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
            {lead.crm_status !== "archived" && (
              <button
                onClick={() => setShowArchiveConfirm(true)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--crm-text-muted)] hover:text-[var(--crm-text-primary)] hover:bg-[var(--crm-card)] transition-colors"
                aria-label="Archive Lead"
                title="Archive Lead"
              >
                {/* Archive box/tray icon */}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2.5" y="3.5" width="19" height="5" rx="1.2" />
                  <path d="M4.5 8.5V19a1.5 1.5 0 001.5 1.5h12a1.5 1.5 0 001.5-1.5V8.5" />
                  <path d="M10 12.5h4" />
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

        {/* Communication actions — always available beneath the phone number,
            independent of the workflow. The two most common actions, one tap
            away, so a locator never hunts for how to reach a client. */}
        {lead.phone && (
          <div className="grid grid-cols-2 gap-2 mb-3">
            <button
              type="button"
              onClick={handleHeaderCall}
              className="crm-cta-soft inline-flex items-center justify-center gap-1.5 text-[13px] font-semibold px-3 py-2 rounded-lg transition-colors"
            >
              <span aria-hidden>📞</span> Call Client
            </button>
            <button
              type="button"
              onClick={handleHeaderText}
              className="crm-cta-soft inline-flex items-center justify-center gap-1.5 text-[13px] font-semibold px-3 py-2 rounded-lg transition-colors"
            >
              <span aria-hidden>💬</span> Text Client
            </button>
          </div>
        )}

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

            {(archiveReason === "archived_by_user" || archiveReason === "deleted_by_user") && (
              <div className="mt-2 bg-[var(--crm-inset)] border border-[var(--crm-border)] rounded-lg px-3 py-2.5">
                <p className="text-[11.5px] text-[var(--crm-text-secondary)]">
                  Archived{lead.deleted_by ? ` by ${lead.deleted_by}` : ""}
                  {lead.deleted_at ? ` on ${formatDate(lead.deleted_at)}` : ""}.
                </p>
                <button
                  onClick={handleRestoreLead}
                  className="mt-2 w-full px-3 py-1.5 rounded-lg bg-[var(--crm-panel)] border border-[var(--crm-border)] text-[var(--crm-text-primary)] text-[12.5px] font-semibold hover:bg-[var(--crm-card)] transition-colors"
                >
                  ↩️ Restore Lead
                </button>
              </div>
            )}
          </div>
        )}

        </div>

      {/* ── Panel body ── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-7">
        {/* Next Action card — answers two questions in order: "what did I just
            do?" (Last Action) then "what should I do next?" (Next Action). */}
        <div className="bg-[var(--crm-card)] border border-[var(--crm-border-soft)] rounded-2xl shadow-[0_1px_2px_rgba(var(--crm-shadow-color),0.04),0_4px_10px_rgba(var(--crm-shadow-color),0.06)] px-4 py-3.5">
          {/* LAST ACTION — what was just completed + when. The timestamp comes
              from persisted state, so it survives a close/reopen and a refresh. */}
          {lastAction && (
            <div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--crm-text-secondary)]">Last Action</span>
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--crm-text-secondary)]">Status</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="max-w-[62%] truncate rounded-lg border border-[var(--crm-border)] bg-[var(--crm-inset)] px-4 py-2 text-sm font-semibold text-[var(--crm-text-secondary)]">
                  {lastAction.title}
                </span>
                <span className="flex-none text-right text-sm font-semibold text-emerald-600">Completed</span>
              </div>
              <div className="mt-2.5 truncate text-[12.5px] text-[var(--crm-text-muted)]">
                Completed:{" "}
                <span className="font-medium text-emerald-600">{formatDueDateTime(lastAction.completedAt)}</span>
              </div>
            </div>
          )}

          {/* Divider between the two sections when both are present */}
          {lastAction && nextOpenAction && <div className="my-3.5 border-t border-[var(--crm-border-soft)]" />}

          {/* NEXT ACTION — the next OPEN, actionable task. "Waiting for Response"
              is a workflow state, not an action, so it never appears here. */}
          {nextOpenAction && (
            <div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--crm-text-secondary)]">Next Action</span>
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--crm-text-secondary)]">Status</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={openAction}
                  title="Open this action"
                  className="crm-cta max-w-[62%] truncate rounded-lg px-4 py-2 text-sm font-semibold"
                >
                  {nextOpenAction.title}
                </button>
                <span className="flex-none text-right text-sm font-semibold">
                  {(() => {
                    let s: string
                    if (nextOpenAction.dueAt && getFollowUpStatus(nextOpenAction.dueAt) === "overdue") s = "Overdue"
                    else {
                      const t = nextOpenAction.title
                      if (t === "Build List" || t === "Send List") s = "In Progress"
                      else if (t === "Setup Tour") s = "Scheduled"
                      else if (t === "Check App") s = "Waiting on Client"
                      else s = "Pending"
                    }
                    const c = s === "Overdue" ? "text-red-500" : "text-[var(--crm-text-primary)]"
                    return <span className={c}>{s}</span>
                  })()}
                </span>
              </div>

              {/* Which property this guest card is for (each Favorite Property
                  gets its own Email Guest Card action). */}
              {isGuestCardTitle(nextOpenAction.title) && nextOpenAction.manualAction?.property_name && (
                <div className="mt-1.5 truncate text-[12.5px] font-semibold text-[var(--crm-text-primary)]">
                  {nextOpenAction.manualAction.property_name}
                </div>
              )}

              <div className="mt-2.5 truncate text-[12.5px] text-[var(--crm-text-muted)]">
                Due:{" "}
                <span className="font-medium text-[var(--crm-text-secondary)]">
                  {nextOpenAction.dueAt ? formatDueDateTime(nextOpenAction.dueAt) : "—"}
                </span>
              </div>
            </div>
          )}

          {/* Genuinely nothing open (no completion + no next task) */}
          {!lastAction && !nextOpenAction && (
            <p className="text-[12.5px] text-[var(--crm-text-muted)]">No open action — add the next step below.</p>
          )}

          {/* Add a manual action */}
          <button
            type="button"
            onClick={() => {
              setEditingAction(null)
              setShowAddAction(true)
            }}
            className="mt-6 w-full text-[12px] font-semibold px-3 py-2 rounded-lg border-2 border-dashed border-[var(--crm-border)] text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)] hover:border-[var(--crm-accent)] hover:text-[var(--crm-text-primary)] transition-colors"
          >
            + Add Task
          </button>
        </div>

        {/* Section: Search Criteria */}
        <SectionCard title="Search Criteria" shaded collapsible defaultOpen={true} storageKey="search-criteria">
          <Field label={inferredMarket ? "Interest" : "City"} value={inferredMarket || lead.city} />
          <Field label="Budget" value={formatRent(lead.desired_rent)} />
          <Field label="Property Type" value={lead.property_type} />
          <Field label="Beds / Baths" value={lead.beds || lead.baths ? `${lead.beds || "—"} / ${lead.baths || "—"}` : null} />
          <Field label="Move Date" value={formatDate(lead.move_date)} />
          {(() => {
            const areas = formatDesiredAreas(lead.neighborhoods, lead.city)
            return areas ? <Field label="Desired Areas" value={areas} /> : null
          })()}
          {lead.source && (
            <div className="flex items-start justify-between gap-4">
              <span className="text-[12.5px] text-[var(--crm-text-muted)] flex-none">Source</span>
              <LeadSourceBadge source={lead.source} className="text-[11px] px-2 py-0.5" />
            </div>
          )}
        </SectionCard>

        {/* Section: Screening — only what's useful. Credit Score / History /
            Criminal Background always show (the last reassures the locator it
            was checked); Broken Lease and Eviction rows appear only when the
            lead actually has one, with the age folded in. No "No" rows. */}
        <SectionCard title="Credit Screening" collapsible defaultOpen={true} storageKey="credit-screening">
          <Field label="Credit Score" value={lead.credit_score} />
          <Field label="Credit History" value={lead.credit_history} />
          {String(lead.credit_history || "").toLowerCase().includes("broken") && (
            <Field label="Broken Lease" value={lead.broken_lease_age ? `${lead.broken_lease_age} ago` : "Yes"} />
          )}
          {lead.credit_history === "Eviction" && (
            <Field label="Eviction" value={lead.eviction_age ? `${lead.eviction_age} ago` : "Yes"} />
          )}
          {(() => {
            const cb = lead.criminal_background
            let value = "None"
            if (cb && cb !== "None") {
              const age = cb === "Felony" ? lead.felony_age : cb === "Misdemeanor" ? lead.misdemeanor_age : null
              value = age ? `${cb} (${age})` : cb
            }
            return <Field label="Criminal Background" value={value} />
          })()}
        </SectionCard>

        {/* Section: Quick Actions — secondary tools, collapsed by default and
            moved beneath the primary workflow (Next Action / Search / Credit). */}
        <SectionCard title="Quick Actions" collapsible defaultOpen={false} storageKey="quick-actions">
          <div>
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

            {/* Row 2: follow-up sequence */}
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
        </SectionCard>

      </div>
    </div>

    <AiVoiceScriptModal
      open={showVoiceScript}
      onClose={() => setShowVoiceScript(false)}
      lead={lead}
      topMatches={topMatches}
      locatorName={locatorFirstName}
    />

    <ConfirmDialog
      open={showArchiveConfirm}
      title="Archive this lead?"
      message="This lead will be removed from your active CRM but can be restored at any time from Archived Leads."
      confirmLabel="Archive Lead"
      cancelLabel="Cancel"
      onConfirm={handleArchiveLead}
      onCancel={() => setShowArchiveConfirm(false)}
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

    <GuestCardModal
      open={showGuestCard}
      onClose={() => setShowGuestCard(false)}
      lead={lead}
      property={guestCardProperty}
      agent={agent ?? {}}
      onSent={handleGuestCardSent}
    />

    </>
  )
}
