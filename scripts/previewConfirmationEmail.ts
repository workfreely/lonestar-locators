// RENDER THE REAL CONFIRMATION EMAIL TO A FILE, for visual review.
//
// Run: `npx tsx scripts/previewConfirmationEmail.ts`
//
// Uses the PRODUCTION renderer (leadConfirmationEmail) with the agent's real signature identity
// and a clearly-labelled SAMPLE renter. It writes an HTML file and nothing else:
//
//   • no email is sent            • no lead is created
//   • no text is queued           • nothing is written to the CRM
//
// The only database access is a READ of the agent's own profile, so the preview shows the real
// photo, brokerage and IABS link rather than placeholders.

import fs from "node:fs"
import { createClient } from "@supabase/supabase-js"
import { resolveAgentIdentityForOwner } from "@/lib/notifications/agentSignature"
import { leadConfirmationEmail } from "@/lib/notifications/templates"

const OUT = process.env.PREVIEW_OUT ?? "/tmp/email-preview/email.html"
const OWNER = process.env.PREVIEW_OWNER_ID ?? "c567c077-d3f4-4532-8807-a54795f753f5"

// SAMPLE RENTER — invented, labelled as such, never persisted.
const SAMPLE_LEAD = {
  first_name: "Sample",
  last_name: "Renter",
  city: "San Antonio",
  move_date: "2026-11-15",
  desired_rent: "$1,800 - $2,200",
  beds: "2",
  baths: "2",
  property_type: "High-Rise",
  neighborhoods: "Downtown San Antonio, Alamo Heights",
  submarkets: "Northeast",
  notes: "Sample note for preview only — I need to be near Randolph AFB.",
  income: null,
  credit_score: "750",
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error("Supabase env not loaded")
  const db = createClient(url, key, { auth: { persistSession: false } })

  const signature = await resolveAgentIdentityForOwner(db, OWNER)
  const built = leadConfirmationEmail({
    locatorName: signature?.name ?? "Your Locator",
    signature,
    lead: SAMPLE_LEAD as never,
  })

  fs.mkdirSync(OUT.slice(0, OUT.lastIndexOf("/")), { recursive: true })
  fs.writeFileSync(OUT, built.html)

  const abs = (built.html.match(/src="https?:\/\/[^"]+"/g) ?? []).length
  const rel = (built.html.match(/src="\/[^"]+"/g) ?? []).length
  console.log(`subject            : ${built.subject}`)
  console.log(`bytes              : ${built.html.length}`)
  console.log(`agent              : ${signature?.name ?? "(none)"} | ${signature?.brokerage ?? "(no brokerage)"}`)
  console.log(`agent photo        : ${signature?.photoUrl ? "real profile photo" : "initials fallback"}`)
  console.log(`absolute image srcs: ${abs}`)
  console.log(`relative image srcs: ${rel}${rel ? "  ← would not load outside the app" : ""}`)
  console.log(`written            : ${OUT}`)
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
