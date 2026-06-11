"use client"

import { supabase } from "@/lib/supabase/client"
import { getNextAction } from "@/lib/nextAction"
import { useState, useEffect } from "react"

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
  new:           "bg-amber-50 text-amber-700 border-amber-200",
  contacted:     "bg-blue-50 text-blue-700 border-blue-200",
  qualified:     "bg-violet-50 text-violet-700 border-violet-200",
  list_sent:     "bg-emerald-50 text-emerald-700 border-emerald-200",
  ready_to_tour: "bg-orange-50 text-orange-700 border-orange-200",
  done_touring:  "bg-yellow-50 text-yellow-700 border-yellow-200",
  applied:       "bg-gray-100 text-gray-700 border-gray-300",
  closed:        "bg-green-50 text-green-700 border-green-200",
}

const SOURCE_STYLES: Record<string, string> = {
  tiktok:    "bg-amber-50 text-amber-700 border-amber-200",
  instagram: "bg-purple-50 text-purple-700 border-purple-200",
  facebook:  "bg-blue-50 text-blue-700 border-blue-200",
  youtube:   "bg-red-50 text-red-700 border-red-200",
  website:   "bg-emerald-50 text-emerald-700 border-emerald-200",
  referral:  "bg-orange-50 text-orange-700 border-orange-200",
  direct:    "bg-emerald-50 text-emerald-700 border-emerald-200",
  manual:    "bg-gray-50 text-gray-600 border-gray-200",
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
      <div className="px-4 py-2 border-b border-gray-100 bg-gray-50/70">
        <p className="text-[10.5px] font-semibold text-gray-400 uppercase tracking-widest">
          {title}
        </p>
      </div>
      <div className="px-4 py-3 space-y-2.5">
        {children}
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-[12.5px] text-gray-400 flex-none">{label}</span>
      <span className="text-[12.5px] font-medium text-gray-900 text-right">{value || "—"}</span>
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

  useEffect(() => {
    setFollowUps(Number(lead.follow_up_count || 0))
    setNextActionDate(lead.next_action_date || null)
  }, [lead.id, lead.follow_up_count, lead.next_action_date])

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
    ? "bg-red-50 text-red-600 border-red-200"
    : isMediumRisk
    ? "bg-amber-50 text-amber-700 border-amber-200"
    : "bg-emerald-50 text-emerald-700 border-emerald-200"

  // ─── Follow-up actions ─────────────────────────────────────────────────

  async function setFollowUpCount(step: number) {
    const nextFollowUpCount = Number(step)
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

  function handleNextActionClick() {
    const fu = lead.follow_up_count || 0
    const action = getNextAction({ ...lead, follow_up_count: followUps })
    const name = normalizeName(lead.first_name || "")

    if (lead.crm_status === "contacted") {
      if (fu === 0) { setFollowUpCount(1); openSMS(`Hey! Did you see any properties on the list that you'd like to tour?`); return }
      if (fu === 1) { setFollowUpCount(2); openSMS(`Is there one that stands out or would you like me to narrow the list down a bit more?`); return }
      if (fu === 2) { setFollowUpCount(3); openSMS(`I'm calling communities you were interested in to get updated pricing and specials. Are you still looking to move?`); return }
      openSMS(`Hey, I haven't heard back so I'll pause your search for now. Let me know when you're ready!`); return
    }

    if (action === "First Text") {
      const bedsText = lead.beds ? `${String(lead.beds).replace("-", "").trim()} bed` : ""
      const monthText = lead.move_date ? ` in ${new Date(lead.move_date).toLocaleString("en-US", { month: "long" })}` : ""
      openSMS(`Hey ${name} it's Jay! I just got your form for a ${bedsText} move${monthText}. Are you trying to stay near a specific address or side of town?`)
      return
    }
    if (action === "Build List") { openSMS(`Hey ${name}, I just sent your list over!\n\nCan you ❤️ your top 2–3 favorites?\n\nI'll get tours set up or tweak the list for you`); return }
    if (action === "FU1") { setFollowUpCount(1); openSMS(`Hey! Did you see any properties on the list that you'd like to tour?`); return }
    if (action === "FU2") { setFollowUpCount(2); openSMS(`Is there one that stands out or would you like me to narrow the list down a bit more?`); return }
    if (action === "FU3") { setFollowUpCount(3); openSMS(`I'm calling communities you were interested in to get updated pricing and specials. Are you still looking to move?`); return }
    if (action === "Final FU") { openSMS(`Hey ${name}, I haven't heard back so I'll pause your search for now. No rush, just let me know when you'd like me to pick it back up!`); return }
  }

  // ─── Derived values ────────────────────────────────────────────────────

  const action = getNextAction({ ...lead, follow_up_count: followUps })
  const followUpStatus = nextActionDate ? getFollowUpStatus(nextActionDate) : "none"
  const statusStyle = STATUS_STYLES[lead.crm_status] ?? "bg-gray-100 text-gray-700 border-gray-300"

  const actionBtnClass = [
    "px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors cursor-pointer whitespace-nowrap",
    followUpStatus === "overdue" ? "bg-red-50 text-red-600 border-red-200 animate-pulse" :
    followUpStatus === "today"   ? "bg-amber-50 text-amber-700 border-amber-200" :
                                   "bg-blue-50 text-blue-600 border-blue-200",
  ].join(" ")

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div className="w-full h-full flex flex-col bg-[#f7f8fa]">

      {/* ── Panel header ── */}
      <div className="flex-none bg-white border-b border-gray-200 px-5 pt-5 pb-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">

        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <h2 className="text-[22px] font-bold text-gray-900 tracking-tight leading-tight truncate">
              {normalizeName(lead.first_name)} {normalizeName(lead.last_name)}
            </h2>
            {lead.phone && (
              <a
                href={`sms:${lead.phone}`}
                className="text-[14px] text-blue-600 font-medium mt-0.5 block hover:underline"
              >
                {lead.phone}
              </a>
            )}
          </div>

          <button
            onClick={onClose}
            className="flex-none w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors mt-0.5"
            aria-label="Close"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </button>
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

        {/* ── Action buttons ── */}
        <div className="bg-gray-50 border border-gray-200 rounded-2xl p-3 space-y-2">

          {/* Row 1: primary actions */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                const name = normalizeName(lead.first_name || "")
                const bedsText = lead.beds ? `${String(lead.beds).replace("-", "").trim()} bed` : ""
                const monthText = lead.move_date ? ` in ${new Date(lead.move_date).toLocaleString("en-US", { month: "long" })}` : ""
                openSMS(`Hey ${name} it's Jay! I just got your form for a ${bedsText} move${monthText}. Are you trying to stay near a specific address or side of town?`)
              }}
              className="text-xs font-medium px-3 py-2 rounded-xl border bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-100 transition-colors"
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
              className="text-xs font-medium px-3 py-2 rounded-xl border bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100 transition-colors"
            >
              Text Top 3
            </button>

            <button
              onClick={() => {
                const name = normalizeName(lead.first_name || "")
                openSMS(`Hey ${name}, I just sent your list over!\n\nCan you ❤️ your top 2–3 favorites?\n\nI'll get tours set up or tweak the list for you`)
              }}
              className="text-xs font-medium px-3 py-2 rounded-xl border bg-violet-50 text-violet-700 border-violet-100 hover:bg-violet-100 transition-colors"
            >
              Smart List
            </button>

            <button
              onClick={() => { if (lead.phone) window.location.href = `tel:${lead.phone}` }}
              className="text-xs font-medium px-3 py-2 rounded-xl border bg-orange-50 text-orange-700 border-orange-100 hover:bg-orange-100 transition-colors"
            >
              Call / Voicemail
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
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">

        {/* Risk + Next Action bar */}
        <div className="flex items-center justify-between gap-2 bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
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

        {/* Section: Search Criteria */}
        <SectionCard title="Search Criteria">
          <Field label="City" value={lead.city} />
          <Field label="Budget" value={formatRent(lead.desired_rent)} />
          <Field label="Property Type" value={lead.property_type} />
          <Field label="Beds / Baths" value={lead.beds || lead.baths ? `${lead.beds || "—"} / ${lead.baths || "—"}` : null} />
          <Field label="Move Date" value={formatDate(lead.move_date)} />
          {lead.neighborhoods && <Field label="Desired Areas" value={lead.neighborhoods} />}
          {lead.source && (
            <div className="flex items-start justify-between gap-4">
              <span className="text-[12.5px] text-gray-400 flex-none">Source</span>
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${SOURCE_STYLES[lead.source] ?? "bg-gray-50 text-gray-600 border-gray-200"}`}>
                {lead.source === "direct" ? "Website" : lead.source.charAt(0).toUpperCase() + lead.source.slice(1)}
              </span>
            </div>
          )}
        </SectionCard>

        {/* Section: Screening */}
        <SectionCard title="Screening">
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
        <SectionCard title="Client Notes">
          <textarea
            value={lead.notes || ""}
            readOnly
            placeholder="No notes submitted."
            className="w-full h-20 text-[12.5px] bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 resize-none cursor-default text-gray-700 placeholder-gray-300 focus:outline-none"
          />
        </SectionCard>

        {/* Section: Locator Notes */}
        <SectionCard title="Locator Notes">
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
        </SectionCard>

      </div>
    </div>
  )
}
