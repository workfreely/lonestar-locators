// ONE-OFF: create a missing canonical send_list action for ONE lead.
//
//   npx tsx scripts/leads/backfill_send_list.ts --lead-id=<id> [--confirm]
//
// Without --confirm it is a DRY RUN: it resolves the spec, prints it, and writes nothing.
//
// ── IT CHANGES NO WORKFLOW CODE ─────────────────────────────────────────────────────────────
// It calls the EXISTING engine functions, unmodified:
//   getStageWorkflowAction("searching", …)  → the canonical { title, dueAt, actionKey } spec
//   createWorkflowActionIfNeeded(…)         → the canonical insert, with its own dedup
// The deadline is therefore whatever the engine already computes — autoDueInDays(1, …), 9:00 AM
// the next calendar day in the locator's saved zone, clamped to their working window. No new
// scheduling rule is introduced here.
//
// ── WHAT IT WILL NOT DO ─────────────────────────────────────────────────────────────────────
// It never writes crm_status, never touches a completed or canceled row, and never creates a
// second open action: createWorkflowActionIfNeeded returns null when an open row with the same
// action_key already exists, and the DB unique index backs that up. An open build_list means
// Build List is legitimately pending, so this refuses rather than creating Send List early.
import fs from "node:fs"
import path from "node:path"

;(() => {
  const p = path.join(process.cwd(), ".env.local")
  for (const l of fs.readFileSync(p, "utf8").split("\n")) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
  }
})()

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=").slice(1).join("=")
const CONFIRM = process.argv.includes("--confirm")
const LEAD_ID = Number(arg("lead-id") ?? NaN)
if (!Number.isFinite(LEAD_ID)) { console.error("usage: --lead-id=<id> [--confirm]"); process.exit(2) }

async function main() {
  const { createClient } = await import("@supabase/supabase-js")
  const { getStageWorkflowAction, createWorkflowActionIfNeeded } = await import("@/lib/workflowEngine")
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })

  const { data: lead } = await sb.from("leads")
    .select("id, first_name, last_name, crm_status, follow_up_count, move_date, workspace_id, owner_user_id")
    .eq("id", LEAD_ID).maybeSingle()
  if (!lead) { console.error(`lead ${LEAD_ID} not found`); process.exit(1) }
  console.log(`LEAD  ${lead.first_name} ${lead.last_name} (#${lead.id})  stage=${lead.crm_status}`)

  // Only a lead actually IN Searching earns a Send List.
  if (lead.crm_status !== "searching") {
    console.error(`REFUSING: stage is '${lead.crm_status}', not 'searching'.`); process.exit(1)
  }

  const { data: rows } = await sb.from("lead_next_actions")
    .select("id, action_key, title, status, due_at").eq("lead_id", LEAD_ID).order("id")
  console.log("\nEXISTING ACTIONS (none of these are modified)")
  for (const r of rows ?? []) console.log(`  #${r.id} ${String(r.action_key).padEnd(22)} ${String(r.status).padEnd(9)} due=${r.due_at ?? "—"}`)

  const openSend = (rows ?? []).find((r) => r.action_key === "send_list" && r.status === "open")
  if (openSend) { console.log(`\nALREADY PRESENT — open send_list #${openSend.id}, due ${openSend.due_at}. Nothing to do.`); return }
  // Build List legitimately pending → Send List is NOT due yet. This mirrors skipWorkflowAction.
  const openBuild = (rows ?? []).find((r) => r.action_key === "build_list" && r.status === "open")
  if (openBuild) {
    console.error(`\nREFUSING: build_list #${openBuild.id} is still open — Build List owns this stage until "Mark List Built".`)
    process.exit(1)
  }

  // The locator's saved zone + working window, resolved exactly as update-stage does, so the
  // deadline matches what the engine would have produced at transition time.
  const { resolveUserTimeZone } = await import("@/lib/timezone/server")
  const { resolveWorkHoursFromProfile } = await import("@/lib/workflow/autoDueDate")
  const timeZone = await resolveUserTimeZone(sb, lead.owner_user_id, lead.workspace_id)
  const { data: whProfile } = await sb.from("profiles")
    .select("work_hours_start, work_hours_end").eq("id", lead.owner_user_id).maybeSingle()
  const workHours = resolveWorkHoursFromProfile(whProfile)
  console.log(`\nTIMEZONE  ${timeZone}   WORK HOURS ${JSON.stringify(workHours)}`)

  const spec = getStageWorkflowAction("searching", lead, timeZone, workHours)
  if (!spec) { console.error("engine returned no spec for 'searching'"); process.exit(1) }
  console.log("\nSPEC (from the existing engine, unmodified)")
  console.log(`  title     ${spec.title}`)
  console.log(`  actionKey ${spec.actionKey}`)
  console.log(`  dueAt     ${spec.dueAt}`)
  const hours = (new Date(spec.dueAt).getTime() - Date.now()) / 3_600_000
  console.log(`  that is   ${hours.toFixed(1)}h from now`)

  if (!CONFIRM) { console.log("\nDRY RUN — nothing written. Re-run with --confirm."); return }

  const created = await createWorkflowActionIfNeeded(sb, LEAD_ID, spec)
  if (!created) { console.error("\nNOT CREATED — the engine's dedup declined (an open equivalent exists)."); process.exit(1) }
  console.log("\nCREATED")
  console.log(JSON.stringify(created, null, 2))
}

void main()
