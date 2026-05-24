import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from "@supabase/supabase-js"

// --------------------------------------------------
// Helpers
// --------------------------------------------------
function formatDate(dateStr?: string | null) {
  if (!dateStr) return "—"
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "2-digit",
  })
}

function moveWindow(dateStr?: string | null) {
  if (!dateStr) return ""
  const today = new Date()
  const moveDate = new Date(dateStr)
  if (isNaN(moveDate.getTime())) return ""

  const diffDays = Math.ceil(
    (moveDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  )

  if (diffDays <= 30) return "0–30 days"
  if (diffDays <= 60) return "30–60 days"
  if (diffDays <= 90) return "60–90 days"
  return "90+ days"
}

// ✅ NEW: city → header image mapper
function getCityHeaderImage(city?: string | null) {
  if (!city) return null
  const c = city.toLowerCase()

  if (c.includes("san antonio"))
    return "https://res.cloudinary.com/dxtiguwzm/image/upload/v1747937030/lone-star-locators-san-antonio-texas-free-apartment-locating_trgkaj.jpg"

  if (c.includes("austin"))
    return "https://res.cloudinary.com/dxtiguwzm/image/upload/v1747937030/lone-star-locators-austin-texas-free-apartment-locating_ew5tvq.jpg"

  if (c.includes("dallas"))
    return "https://res.cloudinary.com/dxtiguwzm/image/upload/v1747937029/lone-star-locators-dallas-texas-free-apartment-locating_cdr8z9.jpg"

  if (c.includes("houston"))
    return "https://res.cloudinary.com/dxtiguwzm/image/upload/v1747937029/lone-star-locators-houston-texas-free-apartment-locating_j63kfq.jpg"

  return null
}

const pill = (label: string, value?: string | number | null) => {
  if (!value) return ""
  return `
    <span style="
      display:inline-block;
      background:#e8f2ff;
      color:#0b3a75;
      padding:6px 10px;
      border-radius:6px;
      font-size:13px;
      margin:4px 6px 4px 0;
      white-space:nowrap;
    ">
      <strong>${label}:</strong> ${value}
    </span>
  `
}

const row = (label: string, value?: string | number | null) => {
  if (!value || String(value).trim() === "") return ""
  return `
    <tr>
      <td style="padding:6px 0;color:#555;width:40%;vertical-align:top;">
        <strong>${label}:</strong>
      </td>
      <td style="padding:6px 0;color:#000;">
        ${value}
      </td>
    </tr>
  `
}

const section = (title: string, rows: string) => {
  if (!rows.trim()) return ""
  return `
    <h3 style="margin:24px 0 8px;font-size:16px;color:#111;">${title}</h3>
    <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
      ${rows}
    </table>
  `
}

// --------------------------------------------------
// Function
// --------------------------------------------------
serve(async (req) => {
  try {
    const { lead_id } = await req.json()
    if (!lead_id) return new Response("Missing lead_id", { status: 400 })

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    const { data: lead } = await supabase
      .from("leads")
      .select("*")
      .eq("id", lead_id)
      .single()

    if (!lead) return new Response("Lead not found", { status: 404 })

    const firstName = String(lead.first_name ?? "").trim()
    const lastName = String(lead.last_name ?? "").trim()
    const fullName = `${firstName} ${lastName}`.trim() || "New Lead"

    const window = moveWindow(lead.move_date)
    const strongCredit = lead.credit_score && Number(lead.credit_score) >= 680
    const hasIncome = !!lead.income

    const newHomeCandidate =
      strongCredit && hasIncome && window !== "90+ days"

    // ✅ NEW: resolve header image
    const headerImage = getCityHeaderImage(lead.city)

    // --------------------------------------------------
    // Email HTML
    // --------------------------------------------------
    const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f4f6f8;">
<table width="100%" cellpadding="0" cellspacing="0">
<tr>
<td align="center" style="padding:24px 12px;">
<table width="600" cellpadding="0" cellspacing="0"
  style="background:#ffffff;border-radius:10px;overflow:hidden;
         font-family:Arial,Helvetica,sans-serif;color:#111;text-align:left;">

<tr>
<td style="padding:0;">
${
  headerImage
    ? `
   <img
  src="${headerImage}"
  width="600"
  height="60"
  style="
    display:block;
    width:100%;
    height:60px;
    object-fit:cover;
  "
/>

    `
    : `
    <div style="background:#1f8f4a;height:80px;"></div>
    `
}
</td>
</tr>


<tr>
<td style="padding:24px;">

<h2 style="margin-top:0;">
  New Renter Lead: ${fullName}${lead.city ? ` (${lead.city})` : ""}
</h2>

<!-- AI Lead Summary -->
<div style="background:#f1f7ff;border-radius:8px;padding:16px;margin-bottom:24px;">
 <div style="font-size:18px;font-weight:700;color:#0b3a75;margin-bottom:10px;">
  AI Lead Summary
 </div>

  <p style="margin:0 0 10px;font-size:14px;line-height:1.5;">
    This lead is planning a move ${
      window ? `within ${window}` : "in the future"
    } and is looking for ${
      lead.property_type ?? "housing"
    } in ${lead.city ?? "the area"}.
    ${
      strongCredit
        ? "Credit appears strong"
        : "Credit may require additional review"
    }${
      hasIncome
        ? ", and income was provided."
        : ", though income was not listed."
    }
    ${
      newHomeCandidate
        ? " This lead may be a potential candidate for new home or builder programs."
        : ""
    }
  </p>

  ${pill("Move", lead.move_date ? `${formatDate(lead.move_date)} (${window})` : null)}
  ${pill("Beds / Baths", lead.beds && lead.baths ? `${lead.beds} / ${lead.baths}` : null)}
  ${pill("Rent", lead.desired_rent)}
  ${pill("Credit", lead.credit_history ? `${lead.credit_history}${lead.credit_score ? ` (${lead.credit_score})` : ""}` : null)}
${pill("City", lead.city)}
${pill("Source", lead.source)}
  ${newHomeCandidate ? pill("AI Recommendation", "New Home Candidate") : ""}
</div>

${section(
  "Client",
  row("First Name", lead.first_name) +
  row("Last Name", lead.last_name) +
  row("Phone", lead.phone) +
  row("Email", lead.email)
)}

${section(
  "Move Preferences",
  row("Move Date", lead.move_date ? `${formatDate(lead.move_date)} (${window})` : null) +
  row("City", lead.city) +
  row("Neighborhoods", lead.neighborhoods) +
  row("Submarkets", lead.submarkets)
)}

${section(
  "Housing Preferences",
  row("Property Type", lead.property_type) +
  row("Desired Rent", lead.desired_rent) +
  row("Beds", lead.beds) +
  row("Baths", lead.baths) +
  row("Income", lead.income)
)}

${section(
  "Screening",
  row("Credit History", lead.credit_history) +
  row("Credit Score", lead.credit_score)
)}

${section(
  "Lead Source",
  row("Lead Source", lead.source)
)}

${
  lead.notes
    ? `<h3 style="margin:24px 0 8px;">Notes</h3>
       <p style="margin:0;font-size:14px;">${lead.notes}</p>`
    : ""
}

<div style="margin-top:28px;">
<a href="https://supabase.com/dashboard/project/ukkxisleiprdpptaaxcs/editor/row?table=leads&id=${lead.id}"
   style="display:inline-block;background:#1f8f4a;color:#ffffff;
          padding:12px 18px;border-radius:6px;
          font-size:14px;text-decoration:none;">
View Lead in Supabase
</a>
</div>

</td>
</tr>

<tr>
<td style="background:#f1f3f5;padding:14px 24px;font-size:12px;color:#777;">
Lead ID: ${lead.id} • Type: ${lead.lead_type} •
Submitted: ${new Date(lead.created_at).toLocaleString()}
</td>
</tr>

</table>
</td>
</tr>
</table>
</body>
</html>
`

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Jay@LoneStarLocators <onboarding@resend.dev>",
        to: ["workingfreely@gmail.com"],
        subject: `New Renter Lead: ${fullName}`,
        html,
      }),
    })

    return new Response("OK")
  } catch (err) {
    console.error(err)
    return new Response("Internal error", { status: 500 })
  }
})
