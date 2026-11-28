// AUDIT (and optionally repair) active leads whose Next Action has no deadline.
//
//   npx tsx scripts/leads/auditWorkflowDeadlines.ts                      # audit every active lead
//   npx tsx scripts/leads/auditWorkflowDeadlines.ts --lead-id=118        # audit one lead
//   npx tsx scripts/leads/auditWorkflowDeadlines.ts --lead-id=118 --confirm
//   npx tsx scripts/leads/auditWorkflowDeadlines.ts --confirm            # repair every starved lead
//
// Without --confirm it is a DRY RUN: it reports and writes nothing.
//
// ── WHAT "STARVED" MEANS, AND WHY IT IS NOT A HEURISTIC ─────────────────────────────────────
// A lead is starved when the action every surface DISPLAYS carries no due date. That is not
// guessed from the rows: this runs the real `rankLeadActions(lead, actions, getNextAction(lead))`
// — the one ranker the Lead Board, the Agenda, the Lead Panel and Beast Companion all share —
// and asks whether its `primary` has a `dueAt`. So the audit agrees with the screen by
// construction, including every suppression rule (archived, on hold, the chase, the ladder,
// the guest-card gate) rather than re-implementing any of them.
//
// A lead whose ranker returns urgency "none" because it is legitimately out of the workflow
// (archived, on hold, a finished follow-up sequence) is NOT starved and is never repaired.
//
// ── IT CHANGES NO WORKFLOW CODE ─────────────────────────────────────────────────────────────
// The repair calls the EXISTING engine functions, unmodified:
//   getStageWorkflowAction(stage, …)  → the canonical { title, dueAt, actionKey } spec
//   createWorkflowActionIfNeeded(…)   → the canonical insert, with its own per-key dedup
// The deadline is therefore whatever the engine computes for that stage. No scheduling rule
// is introduced here, and nothing is written that a live transition would not have written.
//
// ── WHAT IT WILL NOT DO ─────────────────────────────────────────────────────────────────────
// It never writes crm_status, never touches a completed or canceled row, never edits an
// existing open row's due_at, and never creates a second open action for the same action_key
// (the engine's dedup plus the DB unique index both refuse). Completed action history is
// untouched. Supersedes the single-lead scripts/leads/backfill_send_list.ts.
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
const ONE = arg("lead-id") ? Number(arg("lead-id")) : null

async function main() {
  const { createClient } = await import("@supabase/supabase-js")
  const { getStageWorkflowAction, createWorkflowActionIfNeeded } = await import("@/lib/workflowEngine")
  const { rankLeadActions } = await import("@/lib/nextActions")
  const { getNextAction } = await import("@/lib/nextAction")
  const { resolveUserTimeZone } = await import("@/lib/timezone/server")
  const { resolveWorkHoursFromProfile } = await import("@/lib/workflow/autoDueDate")

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })

  let q = sb
    .from("leads")
    .select("*")
    .neq("crm_status", "archived")
    .is("deleted_at", null)
  if (ONE != null) q = sb.from("leads").select("*").eq("id", ONE)
  const { data: leads, error: leadErr } = await q
  if (leadErr) { console.error(leadErr.message); process.exit(1) }
  if (!leads?.length) { console.error("no leads matched"); process.exit(1) }

  // Every row, open or not: the ranker's own suppression gates scan completed/canceled rows.
  const { data: allActions, error: actErr } = await sb
    .from("lead_next_actions")
    .select("*")
    .in("lead_id", leads.map((l) => l.id))
  if (actErr) { console.error(actErr.message); process.exit(1) }

  const byLead = new Map<string, any[]>()
  for (const a of allActions ?? []) {
    const k = String(a.lead_id)
    if (!byLead.has(k)) byLead.set(k, [])
    byLead.get(k)!.push(a)
  }

  const starved: { lead: any; actions: any[] }[] = []
  console.log(`scanned ${leads.length} lead(s)\n`)
  console.log("  id   stage            primary action        due")
  console.log("  ──── ──────────────── ──────────────────── ───────────────────────────────")
  for (const lead of leads.sort((a, b) => Number(a.id) - Number(b.id))) {
    const actions = byLead.get(String(lead.id)) ?? []
    const { primary } = rankLeadActions(lead, actions as any, getNextAction(lead))
    const bad = !primary.dueAt
    const name = `${lead.first_name ?? ""} ${String(lead.last_name ?? "").trim()}`.trim()
    console.log(
      `  ${String(lead.id).padEnd(4)} ${String(lead.crm_status).padEnd(16)} ` +
      `${String(primary.title).slice(0, 20).padEnd(20)} ${primary.dueAt ?? "— NO DEADLINE"}   ${name}`,
    )
    if (bad) starved.push({ lead, actions })
  }

  if (starved.length === 0) { console.log("\nNo lead is missing a workflow deadline.") ; return }

  console.log(`\n${starved.length} lead(s) with NO deadline on the displayed action:`)
  for (const { lead, actions } of starved) {
    const open = actions.filter((a) => a.status === "open" && a.completed !== true)
    console.log(`\n  #${lead.id} ${lead.first_name} ${String(lead.last_name ?? "").trim()} — ${lead.crm_status}`)
    console.log(`     next_action_date: ${lead.next_action_date ?? "null"}`)
    console.log(`     open rows: ${open.map((a) => a.action_key ?? a.title).join(", ") || "none"}`)

    const timeZone = await resolveUserTimeZone(sb, lead.owner_user_id, lead.workspace_id)
    const { data: wh } = await sb
      .from("profiles").select("work_hours_start, work_hours_end").eq("id", lead.owner_user_id).maybeSingle()
    const spec = getStageWorkflowAction(lead.crm_status, lead, timeZone, resolveWorkHoursFromProfile(wh))
    if (!spec) {
      console.log(`     the engine has NO rule for '${lead.crm_status}' — nothing to create, reported only.`)
      continue
    }
    const hrs = (new Date(spec.dueAt).getTime() - Date.now()) / 3_600_000
    console.log(`     would create: ${spec.actionKey} "${spec.title}" due ${spec.dueAt} (${hrs.toFixed(1)}h from now)`)
    if (!CONFIRM) continue

    const created = await createWorkflowActionIfNeeded(sb, lead.id, spec)
    if (!created) console.log(`     NOT CREATED — the engine's dedup declined (an open equivalent exists).`)
    else console.log(`     CREATED #${created.id} due ${created.due_at}`)
  }

  if (!CONFIRM) console.log("\nDRY RUN — nothing written. Re-run with --confirm.")
}

void main()
