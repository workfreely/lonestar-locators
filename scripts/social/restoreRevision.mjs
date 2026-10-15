#!/usr/bin/env node
// CONTROLLED RESTORE — preview by default, apply only when asked, and never on a moving target.
//
// ── WHY A SCRIPT AND NOT A BUTTON ───────────────────────────────────────────────────────────
// A restore overwrites current work with older work. That is the same class of action as the bug
// this history exists to catch, so it is deliberately deliberate: no editor button, no one-click
// revert, an exact revision id required, and a diff shown before anything is written.
//
// ── USAGE ───────────────────────────────────────────────────────────────────────────────────
//   node scripts/social/restoreRevision.mjs --list --entity social_posts --row <uuid>
//   node scripts/social/restoreRevision.mjs --revision 42                 # PREVIEW. Writes nothing.
//   node scripts/social/restoreRevision.mjs --revision 42 --fields caption
//   node scripts/social/restoreRevision.mjs --revision 42 --apply --confirm-token <token>
//
// ── THE SAFEGUARDS ──────────────────────────────────────────────────────────────────────────
//   PREVIEW IS THE DEFAULT        --apply is the only path that writes. Nothing else can.
//   EXACT REVISION ID             No "latest", no date ranges, no fuzzy matching.
//   DIFF FIRST                    The preview prints current vs restored, field by field.
//   STALENESS CHECK               The preview emits a token bound to the row's CURRENT values. If
//                                 anything changed in between, the token no longer matches and the
//                                 apply refuses. This is what makes a concurrent edit safe.
//   ONLY THE NAMED FIELDS         --fields restricts it further; by default only the fields the
//                                 revision actually recorded are touched. Never the whole row.
//   NOTHING IS REGENERATED        It writes stored values straight back. It does not call the
//                                 caption, hashtag or overlay generators, and cannot.
//   THE RESTORE IS ITSELF HISTORY The write fires the capture trigger, so the pre-restore state
//                                 becomes a new revision and the restore can be undone the same way.

import { createClient } from "@supabase/supabase-js"
import crypto from "node:crypto"
import fs from "node:fs"

const env = {}
for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "")
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// The column each entity is addressed by. social_floorplan_observations has no `id`.
const PK = {
  social_posts: "id",
  social_content: "id",
  social_property_research: "id",
  social_property_observations: "id",
  social_floorplan_observations: "social_content_id",
}

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? (process.argv[i + 1]?.startsWith("--") ? true : process.argv[i + 1]) : fallback
}
const has = (name) => process.argv.includes(`--${name}`)

/** A token bound to the row's CURRENT values. Any change between preview and apply changes it. */
const stateToken = (row, fields) =>
  crypto.createHash("sha256")
    .update(JSON.stringify(fields.map((f) => [f, row[f] ?? null])))
    .digest("hex").slice(0, 16)

const show = (v) => {
  if (v === null || v === undefined) return "(null)"
  const s = typeof v === "string" ? v : JSON.stringify(v, null, 1)
  return s.length > 900 ? `${s.slice(0, 900)}\n   …[${s.length - 900} more characters]` : s
}

async function list() {
  const entity = arg("entity"), row = arg("row")
  if (!entity || !row) { console.error("--list needs --entity and --row"); process.exit(2) }
  const { data, error } = await sb.from("social_revisions")
    .select("id, op, changed_at, changed_by, changed_by_role, changed_fields")
    .eq("entity", entity).eq("row_id", row).order("id", { ascending: false }).limit(50)
  if (error) { console.error(error.message); process.exit(1) }
  if (!data.length) { console.log("No revisions recorded for that row."); return }
  console.log(`\n${data.length} revision(s) for ${entity} ${row}, newest first:\n`)
  for (const r of data) {
    const who = r.changed_by ? `user ${r.changed_by.slice(0, 8)}` : `service role (${r.changed_by_role})`
    console.log(`  #${String(r.id).padEnd(6)} ${r.changed_at}  ${r.op.padEnd(6)} ${who}`)
    console.log(`          fields: ${r.changed_fields.join(", ")}`)
  }
  console.log(`\nPreview one with:  node scripts/social/restoreRevision.mjs --revision <id>\n`)
}

async function main() {
  if (has("list")) return list()

  const revisionId = arg("revision")
  if (!revisionId) {
    console.error("An exact --revision <id> is required. Find one with --list --entity <t> --row <id>.")
    process.exit(2)
  }

  const { data: rev, error: revErr } = await sb.from("social_revisions")
    .select("*").eq("id", revisionId).maybeSingle()
  if (revErr) { console.error(revErr.message); process.exit(1) }
  if (!rev) { console.error(`No revision #${revisionId}.`); process.exit(1) }

  const pk = PK[rev.entity]
  if (!pk) { console.error(`Unknown entity ${rev.entity}.`); process.exit(1) }

  // Which fields. Default: exactly what this revision recorded — never the whole row.
  const requested = arg("fields")
  const fields = typeof requested === "string"
    ? requested.split(",").map((s) => s.trim()).filter(Boolean)
    : rev.changed_fields
  const unknown = fields.filter((f) => !(f in rev.previous))
  if (unknown.length) {
    console.error(`Revision #${revisionId} holds no previous value for: ${unknown.join(", ")}`)
    console.error(`It recorded: ${rev.changed_fields.join(", ")}`)
    process.exit(2)
  }

  const { data: live, error: liveErr } = await sb.from(rev.entity)
    .select("*").eq(pk, rev.row_id).maybeSingle()
  if (liveErr) { console.error(liveErr.message); process.exit(1) }
  if (!live) {
    console.error(`The ${rev.entity} row ${rev.row_id} no longer exists.`)
    if (rev.op === "delete") console.error(`This revision is a DELETE; re-creating a deleted row is not something this script does.`)
    process.exit(1)
  }

  const token = stateToken(live, fields)

  console.log(`\n── revision #${rev.id} ──────────────────────────────────────────────`)
  console.log(`  entity      ${rev.entity}`)
  console.log(`  identity    ${JSON.stringify(rev.entity_key)}`)
  console.log(`  recorded    ${rev.changed_at}  (${rev.op})`)
  console.log(`  by          ${rev.changed_by ? `user ${rev.changed_by}` : `service role (${rev.changed_by_role})`}`)
  console.log(`  restoring   ${fields.join(", ")}`)

  let differs = 0
  for (const f of fields) {
    const now = live[f] ?? null
    const was = rev.previous[f] ?? null
    const same = JSON.stringify(now) === JSON.stringify(was)
    if (!same) differs++
    console.log(`\n  ── ${f} ${same ? "(already identical — nothing to do)" : ""}`)
    console.log(`  CURRENT:\n   ${show(now).replace(/\n/g, "\n   ")}`)
    if (!same) console.log(`  WOULD BECOME:\n   ${show(was).replace(/\n/g, "\n   ")}`)
  }

  if (!has("apply")) {
    console.log(`\n── PREVIEW ONLY. Nothing was written. ──────────────────────────`)
    if (!differs) { console.log(`  Every field already matches this revision. A restore would change nothing.\n`); return }
    console.log(`  ${differs} field(s) would change.\n`)
    console.log(`  To apply, re-run with the token below. It is bound to the values shown above,`)
    console.log(`  so if anything changes in the meantime the apply will refuse.\n`)
    console.log(`  node scripts/social/restoreRevision.mjs --revision ${rev.id}${typeof requested === "string" ? ` --fields ${fields.join(",")}` : ""} --apply --confirm-token ${token}\n`)
    return
  }

  // ── APPLY ────────────────────────────────────────────────────────────────────────────────
  const supplied = arg("confirm-token")
  if (!supplied) {
    console.error(`\n--apply requires --confirm-token. Run the preview first.\n`)
    process.exit(2)
  }
  if (supplied !== token) {
    console.error(`\nREFUSING: the row changed since the preview.`)
    console.error(`  token from preview : ${supplied}`)
    console.error(`  token now          : ${token}`)
    console.error(`\nRe-run the preview to see the current values before deciding.\n`)
    process.exit(1)
  }
  if (!differs) { console.log(`\nNothing to do — every field already matches.\n`); return }

  const patch = Object.fromEntries(fields.map((f) => [f, rev.previous[f] ?? null]))
  const { error: upErr } = await sb.from(rev.entity).update(patch).eq(pk, rev.row_id)
  if (upErr) { console.error(`\nRestore failed: ${upErr.message}\n`); process.exit(1) }

  const { data: after } = await sb.from("social_revisions")
    .select("id").eq("entity", rev.entity).eq("row_id", rev.row_id)
    .order("id", { ascending: false }).limit(1).maybeSingle()
  console.log(`\n✓ Restored ${fields.join(", ")} on ${rev.entity} ${rev.row_id}.`)
  console.log(`  The pre-restore state was itself recorded as revision #${after?.id ?? "?"},`)
  console.log(`  so this restore can be undone the same way.\n`)
}

main().catch((e) => { console.error(e); process.exit(1) })
