/**
 * REPO-WIDE COMPLETION CONTRACT — every writer that marks a lead_next_actions row
 * complete must write ALL THREE fields.
 *
 * WHY THIS EXISTS. The database has enforced
 *
 *     check ((status = 'completed') = (completed = true))
 *
 * since migration 20260806000000, and it was never dropped. Verified live in
 * production: an update of `{completed: true, completed_at}` against a real open
 * row is REJECTED with 23514. Six writers used exactly that shape — Build List,
 * Send List, Schedule Tour, Guest Card (×2) and the manual-action auto-complete,
 * the highest-traffic actions in the funnel — each paired with console-error-only
 * or no error handling at all, so every one of their completions was silently
 * discarded while the UI advanced. Only 4 of 48 production rows had ever
 * completed, and all four came from the writers that happened to include `status`.
 *
 * The previous guard greped ONE file (followUpWorkflow). That is why six writers
 * drifted for two months. This one scans the whole repository.
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.log(`  ✗ ${name}${detail ? `\n      ${detail}` : ""}`)
  }
}

const ROOTS = ["app", "lib", "components"]
const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "build"])

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

const files = ROOTS.flatMap((r) => walk(r))

console.log("\nACTION COMPLETION CONTRACT\n")
console.log(`Scanning ${files.length} source files under ${ROOTS.join(", ")}\n`)

// ─── 1. No update may set `completed: true` without `status: "completed"` ────
//
// Matched per-update-call: find every `.update({ ... })` whose object mentions
// `completed: true`, then require `status` in that SAME object. Multi-line calls
// are handled by scanning to the balancing brace.
type Violation = { file: string; line: number; snippet: string }
const violations: Violation[] = []
const compliant: Violation[] = []

for (const file of files) {
  const src = readFileSync(file, "utf8")
  if (!src.includes("lead_next_actions")) continue

  for (const m of src.matchAll(/\.update\(\s*\{/g)) {
    const start = m.index!
    // Walk to the matching close brace of the object literal.
    let depth = 0
    let i = src.indexOf("{", start)
    const objStart = i
    for (; i < src.length; i++) {
      if (src[i] === "{") depth++
      else if (src[i] === "}") {
        depth--
        if (depth === 0) break
      }
    }
    const obj = src.slice(objStart, i + 1)
    if (!/completed\s*:\s*true/.test(obj)) continue

    const line = src.slice(0, start).split("\n").length
    const rec = { file, line, snippet: obj.replace(/\s+/g, " ").slice(0, 110) }
    if (/status\s*:\s*["']completed["']/.test(obj)) compliant.push(rec)
    else violations.push(rec)
  }
}

check(
  `no update sets completed:true without status:"completed" (${compliant.length} compliant inline update(s))`,
  violations.length === 0,
  violations.map((v) => `${v.file}:${v.line}  ${v.snippet}`).join("\n      "),
)

// ─── 2. Spread-based completions must come from the canonical helper ─────────
// `.update(completedPatch(...))` / `.update({ ...completedPatch(now), ... })` is
// the preferred form and is exempt from the literal check above; make sure those
// spreads really do reference the helper rather than a hand-rolled object.
{
  const spreadUsers: string[] = []
  for (const file of files) {
    const src = readFileSync(file, "utf8")
    if (!/\.update\(\s*(\{\s*\.\.\.)?completedPatch/.test(src)) continue
    spreadUsers.push(file)
    // actionCompletion.ts DEFINES the helper; every other user must import it.
    if (file.endsWith("lib/leads/actionCompletion.ts")) continue
    check(
      `${file} imports completedPatch it uses`,
      /from ["']@\/lib\/leads\/actionCompletion["']/.test(src),
    )
  }
  check(`${spreadUsers.length} file(s) use completedPatch directly`, spreadUsers.length > 0)
}

// ─── 3. No completion may be skipped because the client lacked the row ──────
//
// The Ka'Leah Davis shape: `if (someRow?.id != null)` wrapping the only DB write,
// with the successor and the timeline event running regardless. Every completion
// path must have a server-side fallback.
console.log("\nServer-resolved completion (the Ka'Leah Davis shape)")
const COMPLETION_WORKFLOWS = [
  "lib/leads/followUpWorkflow.ts",
  "lib/leads/contactFollowUpWorkflow.ts",
  "lib/leads/buildListWorkflow.ts",
  "lib/leads/sendListWorkflow.ts",
  "lib/leads/setupTourWorkflow.ts",
]
for (const f of COMPLETION_WORKFLOWS) {
  const src = readFileSync(f, "utf8")
  check(`${f} resolves the row server-side when the client lacks it`, /resolveOpenActionId\(/.test(src))
  // Scoped to gates that wrap a COMPLETION. setupTourWorkflow legitimately gates
  // its reschedule/cancel DELETE and reopen paths on `…Row?.id != null`; those are
  // a separate (still-open) concern and must not be conflated with completion.
  {
    const gated = [...src.matchAll(/if\s*\(\s*!?\s*\w*[Dd]emo[^)]*&&\s*\w+Row\?\.id\s*!=\s*null\s*\)/g)].filter(
      (m) => /completedPatch|completeAction|completed:\s*true/.test(src.slice(m.index!, m.index! + 400)),
    )
    check(`${f} has no \`Row?.id != null\` gate around its completion`, gated.length === 0)
  }
}

// ─── 4. Completion failures must not be silently swallowed ──────────────────
console.log("\nFailures are not swallowed")
{
  // A bare `void supabase...update(...)` against lead_next_actions has no error
  // channel at all — the shape that lost every guest-card completion.
  const bareVoid: string[] = []
  for (const file of files) {
    const src = readFileSync(file, "utf8")
    // COMPLETION writes only — a `void` update that does not set `completed` is a
    // different (cosmetic) concern and is not what the CHECK rejects.
    for (const m of src.matchAll(/void\s+supabase[\s\S]{0,200}?lead_next_actions[\s\S]{0,300}?\.update\(([\s\S]{0,200}?)\)/g)) {
      if (!/completed/.test(m[1])) continue
      bareVoid.push(`${file}:${src.slice(0, m.index!).split("\n").length}`)
    }
    for (const m of src.matchAll(/lead_next_actions[\s\S]{0,160}?\.update\([\s\S]{0,200}?\)\s*\.then\(\(\)\s*=>\s*\{\}\)/g)) {
      bareVoid.push(`${file}:${src.slice(0, m.index!).split("\n").length} (.then(() => {}))`)
    }
  }
  check("no fire-and-forget completion writes remain", bareVoid.length === 0, bareVoid.join("\n      "))
}

// ─── 5. No synthetic COMPLETED action may be fabricated for a real lead ─────
console.log("\nNo fabricated completions for real leads")
{
  const src = readFileSync("components/crm/DashboardClient.tsx", "utf8")
  // Every `local-*` id that carries `completed: true` must be demo-gated.
  const bad: string[] = []
  for (const m of src.matchAll(/const\s+(\w+)\s*=\s*([^\n]*)\n(?:[^\n]*\n){0,16}?\s*id:\s*`local-[^`]*`/g)) {
    const [, varName, cond] = m
    const block = src.slice(m.index!, m.index! + 900)
    if (!/completed:\s*true/.test(block)) continue
    if (!/isDemoLeadId/.test(cond)) bad.push(`${varName} (condition: ${cond.trim().slice(0, 70)})`)
  }
  check("every fabricated COMPLETED local row is demo-gated", bad.length === 0, bad.join("\n      "))
}

// ─── 6. The constraint this all protects actually exists in a migration ─────
console.log("\nThe DB constraint is declared and never dropped")
{
  const sqlDir = "supabase/migrations"
  const sql = readdirSync(sqlDir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => ({ f, text: readFileSync(join(sqlDir, f), "utf8") }))
  const declaring = sql.filter((x) => /add constraint lead_next_actions_status_completed_chk/.test(x.text))
  const dropping = sql.filter((x) => /drop constraint[^\n]*lead_next_actions_status_completed_chk/.test(x.text))
  check("lead_next_actions_status_completed_chk is declared", declaring.length === 1, declaring.map((d) => d.f).join(", "))
  check("…and never dropped", dropping.length === 0, dropping.map((d) => d.f).join(", "))
  check(
    "…with the (status='completed') = (completed=true) form",
    declaring.some((d) => /\(status\s*=\s*'completed'\)\s*=\s*\(completed\s*=\s*true\)/.test(d.text)),
  )
}

// ─── 7. Cancellation stays non-destructive ──────────────────────────────────
console.log("\nStand-downs cancel rather than delete")
{
  const route = readFileSync("app/api/admin/leads/update-stage/route.ts", "utf8")
  check("the stage route never deletes an action", !/\.delete\(\)/.test(route))
  check("it cancels the contact chase", /CONTACT_CHASE_ACTION_KEYS/.test(route))
  check("it cancels the list ladder", /LIST_LADDER_ACTION_KEYS/.test(route))
}

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
