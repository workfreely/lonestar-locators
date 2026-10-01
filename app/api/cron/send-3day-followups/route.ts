import { NextResponse } from "next/server"

// RETIRED — superseded by the canonical follow-up engine.
//
// This route detected leads with no reply after 72-96 hours and carried a
// `// Later: send SMS here, then mark day3_sent_at` TODO. Filling that in would
// have created a SECOND client-texting sender outside the canonical engine,
// bypassing every protection the engine enforces:
//
//   • account authorization (automated_texting_accounts)
//   • per-lead enrollment (leads.followup_opt_in)  — this route never checked it
//   • lifecycle validity / supersession            — never checked
//   • On Hold (leads.held_at)                      — never checked
//   • locator pause / human handoff                — never checked
//   • quiet hours + the cross-client send pacing   — never checked
//
// It only ever filtered `sms_opt_in`, which is one of six gates. A duplicate
// sender that honours one of them is worse than no sender at all, because the
// protections would look present while being routinely bypassed.
//
// WHAT COVERS THIS CASE NOW. The `new_lead` sequence's pre-list contact chase —
// contact_fu1 / contact_fu2 / contact_fu3 at +2 days each (lib/followup/sequences,
// CONTACT_FU_STEP_DELAY_DAYS) — is the same "client hasn't replied in a few days"
// nudge, enqueued by lib/followup/engine and delivered through Beast Sync with the
// full gate applied and a reply cancelling the rest of the chase.
//
// The Vercel cron entry for this path has been removed, so nothing calls this. It
// is kept as a 410 rather than deleted so the next person looking for "the 3-day
// follow-up" lands on this explanation instead of rebuilding it.
//
// DO NOT ADD SENDING HERE. New automated client messages belong in
// lib/followup/sequences.ts as a step on a sequence, where the gate governs them.
export const runtime = "nodejs"

export async function GET() {
  return NextResponse.json(
    {
      error: "gone",
      message:
        "Retired. The 3-day no-reply nudge is handled by the follow-up engine's contact chase (contact_fu1/2/3).",
      replacement: "/api/cron/followup-tick",
    },
    { status: 410 },
  )
}
