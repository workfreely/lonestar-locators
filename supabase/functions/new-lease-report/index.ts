import { serve } from "https://deno.land/std@0.224.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req) => {
  try {
    const { lease_id } = await req.json()
    if (!lease_id)
      return new Response("Missing lease_id", { status: 400 })

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    )

    const { data: lease } = await supabase
      .from("reported_leases")
      .select("*")
      .eq("id", lease_id)
      .single()

    if (!lease)
      return new Response("Lease not found", { status: 404 })

    const fullName =
      `${lease.first_name ?? ""} ${lease.last_name ?? ""}`.trim()

    const html = `
      <h2>New Lease Report</h2>
      <p><strong>Name:</strong> ${fullName}</p>
      <p><strong>Email:</strong> ${lease.email}</p>
      <p><strong>Phone:</strong> ${lease.phone}</p>
      <p><strong>City:</strong> ${lease.city}</p>
      <p><strong>Property:</strong> ${lease.property_name}</p>
      <p><strong>Unit:</strong> ${lease.unit_number}</p>
      <p><strong>Base Rent:</strong> $${lease.base_rent}</p>
      <p><strong>Lease Term:</strong> ${lease.lease_term}</p>
      <p><strong>Move In:</strong> ${lease.move_in_date}</p>
      <p><strong>Incentive:</strong> ${lease.incentive_selected}</p>
      <p><strong>Listed Jay Morris:</strong> ${
        lease.listed_jay_morris ? "Yes" : "No"
      }</p>
      <p><strong>Notes:</strong> ${lease.notes ?? "None"}</p>
      <br/>
      <a href="https://supabase.com/dashboard/project/ukkxisleiprdpptaaxcs/editor/row?table=reported_leases&id=${lease.id}">
        View Lease in Supabase
      </a>
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
        subject: `New Lease Report: ${fullName}`,
        html,
      }),
    })

    return new Response("OK")
  } catch (err) {
    console.error(err)
    return new Response("Internal error", { status: 500 })
  }
})