"use client"

import { supabase } from "@/lib/supabase/client"
import { getNextAction } from "@/lib/nextAction"
import { useState, useEffect } from "react"
import { formatPhone } from "@/lib/utils/formatPhone"
import { getSourceStyle } from "@/lib/leads/sourceStyles"
import { inferMarketFromLandingPage } from "@/lib/leads/inferMarketFromLandingPage"
import { ARCHIVE_REASONS } from "@/lib/leads/archiveReasons"
import AiVoiceScriptModal from "./AiVoiceScriptModal"
import ConfirmDialog from "./ConfirmDialog"

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
  qualified:     "bg-violet-100 text-violet-800 border-violet-300",
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
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.07)]">
      <div
        className="px-4 py-2 border-b border-gray-200 bg-gray-50 flex items-center gap-2 cursor-pointer select-none"
        onClick={() => setOpen((o) => !o)}
      >
        <svg
          className={`w-3 h-3 text-gray-400 transition-transform duration-200 ${open ? "rotate-90" : "rotate-0"}`}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          strokeLinecap="round" strokeLinejoin="round"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        <p className="text-[10.5px] font-semibold text-gray-500 uppercase tracking-widest">
          {title}
        </p>
      </div>
      {open && (
        <div className="px-4 py-3 space-y-2.5 bg-white">
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
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.07)]">
      <div
        className={`px-4 py-2 border-b border-gray-200 bg-gray-50 flex items-center gap-2 ${collapsible ? "cursor-pointer select-none" : ""}`}
        onClick={collapsible ? () => setOpen((o) => !o) : undefined}
      >
        {collapsible && (
          <svg
            className={`w-3 h-3 text-gray-400 transition-transform duration-200 ${open ? "rotate-90" : "rotate-0"}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        )}
        <p className="text-[10.5px] font-semibold text-gray-500 uppercase tracking-widest">
          {title}
        </p>
      </div>
      {(!collapsible || open) && <div className={`px-4 py-3 space-y-2.5 ${shaded ? "bg-gray-50/60" : "bg-white"}`}>
        {children}
      </div>}
    </div>
  )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-[12.5px] text-gray-500 flex-none">{label}</span>
      <span className="text-[12.5px] font-semibold text-gray-900 text-right">{value || "—"}</span>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function LeadPanel({
  lead,
  topMatches = [],
  onClose,
  onUpdateLead,
}: {
  lead: any
  topMatches?: any[]
  onClose: () => void
  onUpdateLead?: (updatedLead: any) => void
}) {
  if (!lead) return null

  const [followUps, setFollowUps] = useState(Number(lead.follow_up_count || 0))
  const [nextActionDate, setNextActionDate] = useState(lead.next_action_date || null)
  const [doneMsg, setDoneMsg] = useState<string | null>(null)
  const [showVoiceScript, setShowVoiceScript] = useState(false)
  const [archiveReason, setArchiveReason] = useState(lead.archive_reason || "")
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  useEffect(() => {
    setFollowUps(Number(lead.follow_up_count || 0))
    setNextActionDate(lead.next_action_date || null)
    setArchiveReason(lead.archive_reason || "")
  }, [lead.id, lead.follow_up_count, lead.next_action_date, lead.archive_reason])

  // ─── Risk ──────────────────────────────────────────────────────────────

  const credit = Number(lead.credit_score || 0)
  const history = String(lead.credit_history || "").toLowerCase()
  const hasBrokenLease = history.includes("broken")
  const hasEviction = history.includes("eviction")
  const hasFelony = lead.criminal_background === "Felony"

  const isHighRisk = credit < 500 || hasEviction || hasFelony
  const isMediumRisk = !isHighRisk && (credit < 620 || hasBrokenLease)

  const riskLabel = isHighRisk ? "High Risk" : isMediumRisk ? "Medium Risk" : "Low Risk"
  const riskClass = isHighRisk
    ? "bg-red-100 text-red-700 border-red-300"
    : isMediumRisk
    ? "bg-amber-100 text-amber-800 border-amber-300"
    : "bg-emerald-100 text-emerald-800 border-emerald-300"

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
      return "bg-blue-600 text-white border-blue-600 shadow-sm"
    if (Number(followUps) > step)
      return "bg-gray-100 text-gray-400 border-gray-200"
    return "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
  }

  function openSMS(message: string) {
    if (!lead.phone) return
    window.open(`sms:${lead.phone}?&body=${encodeURIComponent(message)}`, "_self")
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
    // payload, same guard. Only fires the first time a "new" lead is texted.
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
      }).catch((err) => {
        console.error("First Text stage update failed:", err)
      })
    }

    // Record the moment this lead was intentionally contacted — fires on
    // EVERY First Text click, independent of the stage-advance above and of
    // /api/admin/leads/update-stage, so none of that route's other side
    // effects (Google Contact sync, List Sent calendar) run an extra time.
    // This is deliberately the ONLY place first_text_sent_at is written —
    // not a Kanban drag, not a lead edit. Powers the daily 7-day
    // no-response auto-archive (app/api/cron/auto-archive-no-response).
    supabase
      .from("leads")
      .update({ first_text_sent_at: contactedAt })
      .eq("id", lead.id)
      .then(({ error }) => {
        if (error) console.error("[first-text] Failed to record contact timestamp:", error)
      })
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

    if (action === "First Text") {
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

  const DONE_CONFIG: Record<string, { label: string; days: number }> = {
    ready_to_tour: { label: "✓ Done — Check Tomorrow",       days: 1  },
    done_touring:  { label: "✓ Done — Follow Up in 2 Days",  days: 2  },
    applied:       { label: "✓ Done — Check in 3 Days",      days: 3  },
    closed:        { label: "✓ Done — Remind in 2 Weeks",    days: 14 },
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

    const updates = {
      crm_status: "archived",
      archive_reason: "deleted_by_user",
      deleted_at: new Date().toISOString(),
      deleted_by: user?.email ?? null,
      pre_delete_status: lead.crm_status,
      next_action_date: null,
    }

    setArchiveReason("deleted_by_user")
    setNextActionDate(null)
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

  // ─── Derived values ────────────────────────────────────────────────────

  const action = getNextAction({ ...lead, follow_up_count: followUps })
  const followUpStatus = nextActionDate ? getFollowUpStatus(nextActionDate) : "none"
  const statusStyle = STATUS_STYLES[lead.crm_status] ?? "bg-gray-100 text-gray-700 border-gray-300"

  // ─── Short-form market inference (display only) ────────────────────────
  const inferredMarket =
    lead.lead_type === "short" && !lead.city
      ? inferMarketFromLandingPage(lead.landing_page)
      : null

  const actionBtnClass = [
    "px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap",
    followUpStatus === "overdue" ? "bg-red-600 text-white border-red-600 animate-pulse" :
    followUpStatus === "today"   ? "bg-amber-100 text-amber-800 border-amber-300" :
                                   "bg-white text-gray-700 border-gray-300 hover:bg-gray-50",
  ].join(" ")

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <>
    <div className="w-full h-full flex flex-col bg-white">

      {/* ── Panel header ── */}
      <div className="flex-none bg-white border-b border-gray-200 px-5 pt-5 pb-4 shadow-[0_1px_4px_rgba(0,0,0,0.08)]">

        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h2 className="text-[22px] font-bold text-gray-900 tracking-tight leading-tight truncate">
              {normalizeName(lead.first_name)} {normalizeName(lead.last_name)}
            </h2>
            {lead.phone && (
              <a
                href={`sms:${lead.phone}`}
                className="text-lg text-blue-600 font-semibold mt-0.5 mb-1.5 block hover:underline"
              >
                {formatPhone(lead.phone)}
              </a>
            )}
          </div>

          <div className="flex-none flex items-center gap-1 mt-0.5">
            {lead.archive_reason !== "deleted_by_user" && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
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
              className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
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
            return <span className="text-[11.5px] text-gray-400">· Next: {formatDate(nextActionDate)}</span>
          })()}
        </div>

        {/* Archive Reason — archived leads only */}
        {lead.crm_status === "archived" && (
          <div className="mb-4">
            <label className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1 block">
              Archive Reason
            </label>
            <select
              value={archiveReason}
              onChange={(e) => handleArchiveReasonChange(e.target.value)}
              className="w-full text-[13px] font-medium text-gray-800 border border-gray-300 rounded-lg px-2.5 py-1.5 bg-white"
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
                  className="mt-2 w-full px-3 py-1.5 rounded-lg bg-white border border-red-300 text-red-700 text-[12.5px] font-semibold hover:bg-red-100 transition-colors"
                >
                  ↩️ Restore Lead
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Action buttons ── */}
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Quick Actions</p>
        <div className="bg-gray-50 rounded-xl p-3 space-y-2">

          {/* Row 1: primary actions */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleFirstText}
              className="text-xs font-semibold px-3 py-2 rounded-lg border bg-gray-900 text-white border-gray-900 hover:bg-gray-800 transition-colors"
            >
              First Text
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
              className="text-xs font-medium px-3 py-2 rounded-lg border bg-white text-gray-700 border-gray-300 hover:bg-gray-50 hover:border-gray-400 transition-colors"
            >
              Text Top 3
            </button>

            <button
              onClick={() => {
                const name = normalizeName(lead.first_name || "")
                openSMS(`Hey ${name}, I just sent your list over!\n\nCan you ❤️ your top 2–3 favorites?\n\nI'll get tours set up or tweak the list for you`)
              }}
              className="text-xs font-medium px-3 py-2 rounded-lg border bg-white text-gray-700 border-gray-300 hover:bg-gray-50 hover:border-gray-400 transition-colors"
            >
              Smart List
            </button>

            <button
              onClick={() => setShowVoiceScript(true)}
              className="text-xs font-medium px-3 py-2 rounded-lg border bg-white text-gray-700 border-gray-300 hover:bg-gray-50 hover:border-gray-400 transition-colors"
            >
              AI Voice Script
            </button>
          </div>

          {/* Row 2: follow-up sequence */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10.5px] text-gray-400 font-medium mr-1">FU:</span>
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
              className="text-[11px] font-semibold px-2.5 py-1 rounded-lg border bg-white text-gray-600 border-gray-200 hover:bg-gray-50 transition-colors ml-auto"
            >
              Final FU
            </button>
          </div>

        </div>
      </div>

      {/* ── Panel body ── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">

        {/* Risk + Next Action */}
        <div className="bg-gray-50 rounded-xl px-4 py-3">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2.5">Risk &amp; Next Step</p>
          <div className="flex items-center justify-between gap-2">
            <span className={`text-[11.5px] font-semibold px-2.5 py-1 rounded-full border ${riskClass}`}>
              {riskLabel}
            </span>
            <button
              type="button"
              onClick={handleNextActionClick}
              className={actionBtnClass}
            >
              {action}
              {followUpStatus === "today" && " · Today"}
              {followUpStatus === "overdue" && " · Overdue"}
            </button>
          </div>

          {/* Done-for-now button — only for open-ended stages */}
          {doneConfig && (
            <div className="mt-2.5 pt-2.5 border-t border-gray-200 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => handleDoneForNow(doneConfig.days)}
                className="text-[11.5px] font-semibold px-3 py-1.5 rounded-lg border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
              >
                {doneConfig.label}
              </button>
              {doneMsg && (
                <span className="text-[11px] font-semibold text-emerald-600">
                  {doneMsg}
                </span>
              )}
            </div>
          )}
        </div>

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
              <span className="text-[12.5px] text-gray-400 flex-none">Source</span>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${getSourceStyle(lead.source).badgeClassName}`}>
                {getSourceStyle(lead.source).label}
              </span>
            </div>
          )}
        </SectionCard>

        {/* Section: Screening */}
        <SectionCard title="Screening" collapsible defaultOpen={false}>
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
            className="w-full h-20 text-[12.5px] bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 resize-none cursor-default text-gray-700 placeholder-gray-300 focus:outline-none"
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
            className="w-full h-24 text-[12.5px] bg-white border border-gray-200 rounded-xl px-3 py-2 resize-none text-gray-800 placeholder-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-shadow"
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
    </>
  )
}
