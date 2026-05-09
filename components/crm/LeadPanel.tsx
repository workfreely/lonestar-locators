"use client"

import { supabase } from "@/lib/supabase/client"
import { getNextAction } from "@/lib/nextAction"
import { useState, useEffect } from "react"


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

  console.log("LeadPanel mounted")

const [followUps, setFollowUps] = useState(
  Number(lead.follow_up_count || 0)
)

const [nextActionDate, setNextActionDate] =
  useState(
    lead.next_action_date || null
  )

useEffect(() => {
  setFollowUps(
    Number(lead.follow_up_count || 0)
  )

  setNextActionDate(
    lead.next_action_date || null
  )

}, [
  lead.id,
  lead.follow_up_count,
  lead.next_action_date,
])

// ======================
// 🎨 MODERN BUTTON SYSTEM
// ======================

const buttonBase =
  "text-xs px-3 py-2 rounded-2xl border transition-all duration-200 shadow-sm hover:shadow-md hover:scale-[1.02]"

const blueButton =
  `${buttonBase} bg-blue-50 text-blue-700 border-blue-100 hover:bg-blue-100`

const greenButton =
  `${buttonBase} bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100`

const purpleButton =
  `${buttonBase} bg-purple-50 text-purple-700 border-purple-100 hover:bg-purple-100`

const orangeButton =
  `${buttonBase} bg-orange-50 text-orange-700 border-orange-100 hover:bg-orange-100`

const grayButton =
  `${buttonBase} bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200`

const redButton =
  `${buttonBase} bg-red-50 text-red-700 border-red-100 hover:bg-red-100`


  function formatMonth(date: string) {
  if (!date) return ""
  return new Date(date).toLocaleString("en-US", {
    month: "long",
  })
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
  if (!rent) return "Rent not listed"

  const matches = rent.match(/\d[\d,]*/g)
  if (!matches || matches.length === 0) return "Rent not listed"

  const formatted = matches.map((value) => {
    const number = Number(value.replace(/,/g, ""))
    if (Number.isNaN(number)) return null
    return `$${number.toLocaleString()}`
  })

  const valid = formatted.filter(Boolean)

  if (valid.length >= 2) return `${valid[0]} - ${valid[1]}`
  return valid[0]
}

// ✅ NORMALIZE NAME
function normalizeName(name: string) {
  if (!name) return ""

  return name
    .trim()
    .toLowerCase()
    .split(" ")
    .filter(Boolean)
    .map(
      (part) =>
        part.charAt(0).toUpperCase() + part.slice(1)
    )
    .join(" ")
}

// ✅ ADD IT RIGHT HERE
function getUrgency(moveDate: string) {
  if (!moveDate) return "low"

  const today = new Date()
  const move = new Date(moveDate)

  const diff = Math.ceil(
    (move.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  )

  if (diff <= 14) return "high"
  if (diff <= 30) return "medium"
  return "low"
}

// ✅ ADD THIS RIGHT BELOW
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


function getStatusStyles(status: string) {
  switch (status) {
    case "new":
      return "bg-yellow-100 text-yellow-800"

    case "contacted":
      return "bg-blue-100 text-blue-800"

    case "qualified":
      return "bg-purple-100 text-purple-800"

    case "list_sent":
      return "bg-green-100 text-green-800"

    case "ready_to_tour":
  return "bg-yellow-100 text-yellow-800"

    case "done_touring":
      return "bg-yellow-100 text-yellow-800"

    case "applied":
      return "bg-gray-200 text-gray-800"

    case "closed":
      return "bg-emerald-100 text-emerald-800"

    default:
      return "bg-gray-100 text-gray-700"
  }
}

function formatStatus(status: string) {
  if (!status) return "New"
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
}


async function setFollowUpCount(step: number) {
  const nextFollowUpCount = Number(step)

  setFollowUps(nextFollowUpCount)

  const now = new Date()
  let nextDate: Date | null = new Date()

  if (nextFollowUpCount === 1) {
    nextDate.setDate(now.getDate() + 1)
  } else if (nextFollowUpCount === 2) {
    nextDate.setDate(now.getDate() + 2)
  } else if (nextFollowUpCount === 3) {
    nextDate.setDate(now.getDate() + 3)
  } else {
    nextDate = null
  }

  // ✅ UPDATE LIVE STATE
  setNextActionDate(
    nextDate
      ? nextDate.toISOString()
      : null
  )

  // ✅ ADD THIS BLOCK RIGHT HERE
if (onUpdateLead) {
  onUpdateLead({
    ...lead,
    follow_up_count: nextFollowUpCount,
    next_action_date: nextDate
      ? nextDate.toISOString()
      : null,
  })
}

  const { data, error } = await supabase
    .from("leads")
    .update({
      follow_up_count: nextFollowUpCount,
      next_action_date: nextDate
        ? nextDate.toISOString()
        : null,
    })
    .eq("id", lead.id)
    .select("*")

  console.log("UPDATED DATA:", data)

  if (error) {
    console.log(
      "Follow-up update failed:",
      JSON.stringify(error, null, 2)
    )
    return
  }
}

function getFUStyle(step: number) {
  // ACTIVE
 if (Number(followUps) === step) {
    return `
      bg-blue-600
      text-white
      border border-blue-600
      shadow-md
    `
  }

  // COMPLETED
  if (Number(followUps) > step) {
    return `
      bg-gray-200
      text-gray-500
      border border-gray-300
    `
  }

  // INACTIVE
  return `
    bg-gray-50
    text-gray-700
    border border-gray-200
    hover:bg-gray-100
  `
}

  function openSMS(message: string) {
    if (!lead.phone) return
    const encoded = encodeURIComponent(message)
    window.open(`sms:${lead.phone}?&body=${encoded}`, "_self")
  }


  function handleNextActionClick(lead: any) {
  const fu = lead.follow_up_count || 0

  // =====================================================
  // 🔵 CONTACTED STAGE → FOLLOW-UP SEQUENCE (FU1 → FINAL)
  // =====================================================
  if (lead.crm_status === "contacted") {

    // FU1
    if (fu === 0) {
      setFollowUpCount(1)
      openSMS(`Hey! Did you see any properties on the list that you’d like to tour?`)
      return
    }

    // FU2
    if (fu === 1) {
      setFollowUpCount(2)
      openSMS(`Is there one that stands out or would you like me to narrow the list down a bit more?`)
      return
    }

    // FU3
    if (fu === 2) {
      setFollowUpCount(3)
      openSMS(`I’m calling communities you were interested in to get updated pricing and specials. Are you still looking to move?`)
      return
    }

    // FINAL FU
    openSMS(`Hey, I haven’t heard back so I’ll pause your search for now. Let me know when you're ready!`)
    return
  }


  const action = getNextAction(lead)
  const name = normalizeName(lead.first_name || "")

  // =====================================================
  // 🟡 NEW LEAD → FIRST TEXT
  // =====================================================
  if (action === "First Text") {
    const bedsText = lead.beds
      ? `${String(lead.beds).replace("-", "").trim()} bed`
      : ""

    const monthText = lead.move_date
      ? ` in ${new Date(lead.move_date).toLocaleString("en-US", {
          month: "long",
        })}`
      : ""

    openSMS(
      `Hey ${name} it’s Jay! I just got your form for a ${bedsText} move${monthText}. Anything you want me to prioritize before I put your list together?`
    )
    return
  }

  // =====================================================
  // 🟣 QUALIFIED → SMART LIST
  // =====================================================
  if (action === "Build List") {
    openSMS(`Hey ${name}, I just sent your list over!

Can you ❤️ your top 2–3 favorites?

I’ll get tours set up or tweak the list for you`)
    return
  }

  // =====================================================
  // 🟢 LIST SENT → FOLLOW-UP SEQUENCE
  // =====================================================
  if (action === "FU1") {
    setFollowUpCount(1)
    openSMS(`Hey! Did you see any properties on the list that you’d like to tour?`)
    return
  }

  if (action === "FU2") {
    setFollowUpCount(2)
    openSMS(`Is there one that stands out or would you like me to narrow the list down a bit more?`)
    return
  }

  if (action === "FU3") {
    setFollowUpCount(3)
    openSMS(`I’m calling communities you were interested in to get updated pricing and specials. Are you still looking to move?`)
    return
  }

  if (action === "Final FU") {
    openSMS(`Hey ${name}, I haven’t heard back so I’ll pause your search for now. No rush, just let me know when you’d like me to pick it back up!`)
    return
  }

  console.log("Unhandled action:", action)
}


  return (
<div className="w-full h-full bg-[#f8fafc] flex flex-col">

      {/* HEADER */}
      <div className="p-6 border-b border-gray-200 bg-white shadow-sm">
        <div className="flex justify-between items-start">
          <div>
            <div className="text-[30px] leading-none font-black tracking-tight text-gray-900">
             {normalizeName(lead.first_name)}{" "}
{normalizeName(lead.last_name)}
            </div>

            {lead.phone && (
              <a
                href={`sms:${lead.phone}`}
                className="text-blue-600 text-base font-medium mt-1 block"
              >
                📱 {lead.phone}
              </a>
            )}
          </div>
          

          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700"
          >
            ✕
          </button>
        </div>

        {/* STATUS */}
      <div className="flex items-center gap-2 mt-4 flex-wrap">
  <span
    className={`px-2 py-1 rounded text-xs font-medium ${getStatusStyles(
      lead.crm_status
    )}`}
  >
    {formatStatus(lead.crm_status)}
  </span>

  {lead.next_action_date && (() => {
    const status = getFollowUpStatus(lead.next_action_date)

    if (status === "overdue") {
      return (
        <span className="text-red-600 text-xs font-medium">
          • Overdue Follow Up
        </span>
      )
    }

    if (status === "today") {
      return (
        <span className="text-yellow-600 text-xs font-medium">
          • Follow Up Today
        </span>
      )
    }

    return (
      <span className="text-xs text-gray-500">
        • Next: {formatDate(lead.next_action_date)}
      </span>
    )
  })()}
</div>

        {/* ACTION BUTTONS */}
        <div className="mt-4 space-y-2">

          {/* ROW 1 */}
       <div className="grid grid-cols-2 gap-2">
          <button
  onClick={() => {
    const name = normalizeName(lead.first_name || "")

    const bedsText = lead.beds
  ? `${String(lead.beds).replace("-", "").trim()} bed`
  : ""

    const monthText = lead.move_date
      ? ` in ${new Date(lead.move_date).toLocaleString("en-US", {
          month: "long",
        })}`
      : ""

  openSMS(`Hey ${name} it’s Jay! I just got your form for a ${bedsText} move${monthText}. Anything you want me to prioritize before I put your list together?`)
  }}
className="text-xs bg-blue-50 text-blue-700 border border-blue-100 rounded-xl px-3 py-2 hover:bg-blue-100 transition"
>
  📱 First Text
</button>

           <button
  onClick={() => {
    if (!lead.phone) return

    const name = normalizeName(lead.first_name || "") // 👈 ADD THIS

    const message = `Hey ${name}, I found 3 excellent options for you!

${topMatches
  .slice(0, 3)
  .map((p, i) => {
    const url = p.website?.startsWith("http")
      ? p.website
      : `https://${p.website || ""}`

    return `${i + 1}. ${p.name}
${url}`
  })
  .join("\n\n")}

Which one do you like most?`

    const encoded = encodeURIComponent(message)
    window.open(`sms:${lead.phone}?&body=${encoded}`, "_self")
  }}
 className={`${greenButton} flex-1`}
>
  📲 Text Top 3
</button>

{/* SMART LIST */}
<button
  onClick={() => {
    if (!lead.phone) return

    const name = normalizeName(lead.first_name || "")

   const message = `Hey ${name}, I just sent your list over!

Can you ❤️ your top 2–3 favorites?

I’ll get tours set up or tweak the list for you`
    const encoded = encodeURIComponent(message)
    window.open(`sms:${lead.phone}?&body=${encoded}`, "_self")
  }}
className={`${purpleButton} flex-1`}
>
  📋 Smart List
</button>

{/* CALL */}
<button
  onClick={() => {
    if (!lead.phone) return
    window.location.href = `tel:${lead.phone}`
  }}
className={`${orangeButton} flex-1`}
>
  📞 Call / Voicemail
</button>
          </div>


          {/* FOLLOW UPS */}
          <div className="flex gap-1">
            <button
              onClick={async () => {
                console.log("🔥 FU1 CLICKED") // 👈 ADD THIS
                await setFollowUpCount(1)
                openSMS(`Hey! Did you see any properties on the list that you’d like to tour?`)
              }}
              className={`text-[11px] px-2 py-[3px] rounded whitespace-nowrap ${getFUStyle(1)}`}
            >
              FU1
            </button>

            <button
              onClick={async () => {
                await setFollowUpCount(2)
                openSMS(`Is there one that stands out or would you like me to narrow the list down a bit more?`)
              }}
              className={`text-[11px] px-2 py-[3px] rounded whitespace-nowrap ${getFUStyle(2)}`}
            >
              FU2
            </button>

            <button
              onClick={async () => {
                await setFollowUpCount(3)
                openSMS(`I’m calling communities you were interested in to get updated pricing and specials. Are you still looking to move?`)
              }}
              className={`text-[11px] px-2 py-[3px] rounded whitespace-nowrap ${getFUStyle(3)}`}
            >
              FU3
            </button>

            <button
  onClick={() => {
    if (!lead.phone) return

    const name = normalizeName(lead.first_name || "")

    const message = `Hey ${name}, I haven’t heard back so I’ll pause your search for now. No rush, just let me know when you’d like me to pick it back up!`

    const encoded = encodeURIComponent(message)
    window.open(`sms:${lead.phone}?&body=${encoded}`, "_self")
  }}
  
className={grayButton}
>
  Final FU
</button>
          </div>
        </div>
      </div>

      {/* BODY */}
    <div className="p-6 space-y-6 overflow-y-auto">

       {/* INFO (MATCHES CARD) */}
<div className="bg-white border border-gray-200 rounded-2xl px-5 py-4 text-[15px] shadow-sm">

  <div>
    <span className="text-gray-500">City:</span>{" "}
    <span className="font-medium text-gray-900">
      {lead.city || "—"}
    </span>
  </div>

  <div className="mt-2">
    <span className="text-gray-500">Budget:</span>{" "}
    <span className="font-medium text-gray-900">
      {formatRent(lead.desired_rent)}
    </span>
  </div>

  <div className="mt-2">
    <span className="text-gray-500">Move Date:</span>{" "}
    <span className="font-medium text-gray-900">
      {formatDate(lead.move_date)}
    </span>
  </div>

  <div className="mt-2">
    <span className="text-gray-500">Credit Score:</span>{" "}
    <span className="font-medium text-gray-900">
      {lead.credit_score || "—"}
    </span>
  </div>

</div>

       {/* RISK + NEXT ACTION */}
<div className="flex items-center justify-between gap-3 flex-wrap">

{/* LEFT: RISK */}
<div className="flex items-center gap-2 flex-wrap">

  <span className="text-xs text-gray-500 font-medium">
    Credit:
  </span>

  {(() => {
    const credit = Number(lead.credit_score || 0)

    const history = String(
      lead.credit_history || ""
    ).toLowerCase()

    const hasBrokenLease =
      history.includes("broken")

    const hasEviction =
      history.includes("eviction")

    const hasFelony =
      lead.criminal_background === "Felony"

    // 🚨 HIGH RISK
    if (
      credit < 500 ||
      hasEviction ||
      hasFelony
    ) {
      return (
        <span className="bg-red-100 text-red-700 px-2 py-[4px] rounded-xl text-xs font-medium">
          🚨 High Risk
        </span>
      )
    }

    // ⚠️ MEDIUM RISK
    if (
      credit < 620 ||
      hasBrokenLease
    ) {
      return (
        <span className="bg-yellow-100 text-yellow-700 px-2 py-[4px] rounded-xl text-xs font-medium">
          ⚠️ Medium Risk
        </span>
      )
    }

    // ✅ LOW RISK
    return (
      <span className="bg-green-100 text-green-700 px-2 py-[4px] rounded-xl text-xs font-medium">
        ✅ Low Risk
      </span>
    )
  })()}
</div>

{/* RIGHT: NEXT ACTION */}
<div className="flex items-center gap-2">
  <span className="text-xs text-gray-500 font-medium">
  Next Action:
</span>

  {(() => {
   const action = getNextAction({
  ...lead,
  follow_up_count: followUps, // ✅ LIVE STATE
})
  const status = nextActionDate
  ? getFollowUpStatus(nextActionDate)
  : "none"

  const base =
  "px-2 py-[4px] rounded-xl whitespace-nowrap cursor-pointer transition-all duration-200 text-xs font-medium"

    if (status === "overdue") {
      return (
        <button
          type="button"
          onClick={() => handleNextActionClick(lead)}
          className={`${base} bg-red-50 text-red-600 next-action-pulse`}
        >
          🔥 {action} • Overdue
        </button>
      )
    }

    if (status === "today") {
      return (
        <button
          type="button"
          onClick={() => handleNextActionClick(lead)}
          className={`${base} bg-yellow-100 text-yellow-700`}
        >
          🔥 {action} • Today
        </button>
      )
    }

    return (
      <button
        type="button"
        onClick={() => handleNextActionClick(lead)}
        className={`${base} bg-blue-100 text-blue-700`}
      >
        🔥 {action}
      </button>
    )
  })()}
</div>

</div>

        {/* NOTES */}
        <div>
          <div className="text-xs text-gray-400 mb-1 uppercase">
            Notes
          </div>
          <textarea
            defaultValue={lead.notes || ""}
          className="w-full h-24 border border-gray-200 rounded-xl p-3 text-sm bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* AREAS */}
        <div>
          <div className="text-xs text-gray-400 mb-1 uppercase">
            Desired Areas
          </div>
          <div className="text-sm">
            {lead.neighborhoods || "—"}
          </div>
        </div>

        {/* LOCATOR NOTES */}
<div>
  <div className="text-xs text-gray-400 mb-1 uppercase">
    Locator Notes
  </div>

  <textarea
    value={lead.locator_notes || ""}
    onChange={async (e) => {
      const newNotes = e.target.value

      // update UI instantly
      if (onUpdateLead) {
        onUpdateLead({
          ...lead,
          locator_notes: newNotes,
        })
      }

      // save to database
      await supabase
        .from("leads")
        .update({ locator_notes: newNotes })
        .eq("id", lead.id)
        .select("*")
        
    }}
    placeholder="Internal notes about this client..."
    className="w-full h-20 border rounded-2xl p-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
  />
</div>

      </div>
    </div>
  )
}