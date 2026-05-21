"use client"

function isDue(date: string | null) {
  if (!date) return false

  const today = new Date()
  const followUp = new Date(date)

  // normalize times
  today.setHours(0, 0, 0, 0)
  followUp.setHours(0, 0, 0, 0)

  return followUp.getTime() <= today.getTime()
}


function formatDate(date: string) {
  if (!date) return ""
  return new Date(date).toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  })
}

function formatRent(rent: string) {
  if (!rent) return ""

  const matches = rent.match(/\d[\d,]*/g)
  if (!matches) return ""

  const nums = matches.map((v) => Number(v.replace(/,/g, "")))
  const valid = nums.filter((n) => !Number.isNaN(n))

  if (valid.length >= 2) {
    return `$${valid[0].toLocaleString()} - $${valid[1].toLocaleString()}`
  }

  if (valid.length === 1) {
    return `$${valid[0].toLocaleString()}`
  }

  return ""
}

export default function FollowUpRow({
  leads,
  onSelectLead,
}: {
  leads: any[]
  onSelectLead?: (leadId: string | number) => void
}) {
  const dueLeads = leads.filter(
  (lead) =>
    isDue(lead.next_action_date) &&
    lead.crm_status !== "closed"
)

  return (
   <div className="w-[220px] min-w-[220px] bg-[#f5f7fa] border-r border-gray-200 p-3">
      
      {/* HEADER */}
   <h2 className="text-red-500 font-bold mb-4 text-sm tracking-wide px-1">
        🔴 Needs Follow-Up
      </h2>

     <div className="flex flex-col gap-3">
        {dueLeads.length === 0 && (
          <p className="text-sm text-gray-400">
            You're all caught up
          </p>
        )}

        {dueLeads.map((lead) => (
          <div
            key={lead.id}
            onClick={() => onSelectLead?.(lead.id)}
           className="
bg-white
border border-gray-100
p-3
rounded-2xl
shadow-[0_6px_20px_rgba(0,0,0,0.05)]
cursor-pointer
hover:shadow-[0_10px_28px_rgba(0,0,0,0.08)]
hover:-translate-y-[1px]
hover:border-blue-100
transition-all duration-200
"
          >
            {/* NAME */}
            <p className="font-semibold text-sm text-gray-900">
              {lead.first_name} {lead.last_name}
            </p>

            {/* CITY + BUDGET (inline for cleaner look) */}
            <p className="text-xs text-gray-500 mt-0.5">
              {lead.city}
              {lead.desired_rent && (
                <> • {formatRent(lead.desired_rent)}</>
              )}
            </p>

            {/* MOVE DATE */}
            {lead.move_date && (
              <p className="text-[11px] font-semibold text-gray-700 mt-1">
                Move Date: {formatDate(lead.move_date)}
              </p>
            )}

            {/* STATUS */}
            <p className="text-[11px] text-red-500 mt-1">
              🔥 Follow-Up Needed
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}