// READ-ONLY PROBE — does authorized comment polling return a stable commenter ID?
//
// Run:  node probe_ig_comment_identity.mjs
//
// ── WHAT THIS DOES AND DOES NOT DO ──────────────────────────────────────────────────────────
// It performs GET requests only. It never posts, never replies, never messages, never writes to
// the database, and never prints an access token. Nothing it does is visible to any commenter.
//
// ── THE QUESTION IT ANSWERS ─────────────────────────────────────────────────────────────────
// Meta documents `from` { id, username } as a field of the IG Comment NODE, where id is the
// Instagram-scoped ID. Meta does NOT document whether that field is returned on the comments EDGE
// (GET /{media}/comments). Our one-DM-per-person rule needs that id and refuses to send without it,
// so this is the one fact that decides whether the DM half of the feature can run at all.
//
// Four outcomes, and the script is written to tell them apart rather than collapse them into
// "it didn't work":
//
//   A. EDGE RETURNS IT      → the per-person rule works as designed. Best case.
//   B. EDGE DROPS IT        → 200 OK, but no `from` key. Try the node read (stage 2).
//   C. FIELD REJECTED       → 400 "nonexisting field". The field is not available on this edge.
//   D. PERMISSION MISSING   → 400/403 about permissions. EXPECTED before the scope is granted;
//                             this is the run that proves the probe itself works.
//
// Stage 2 exists because B and C are not the end of the story: if the edge omits `from`, a direct
// read of a single comment id may still return it, and that would be enough — we would poll for ids
// and resolve identity one comment at a time.

import { createClient } from "@supabase/supabase-js"
import fs from "node:fs"

const GRAPH = "https://graph.instagram.com/v21.0"

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]),
)
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// ── the connection, and the token we never print ────────────────────────────────────────────
const { data: conns, error: connErr } = await db
  .from("social_connections")
  .select("id, username, status, scopes")
  .eq("provider", "instagram")
  .limit(1)
if (connErr) { console.error("could not read the connection:", connErr.message); process.exit(1) }
const conn = conns?.[0]
if (!conn) { console.error("no Instagram connection found"); process.exit(1) }

console.log(`Account   @${conn.username} (${conn.status})`)
console.log(`Scopes    ${(conn.scopes ?? []).join(", ")}`)
const hasComments = (conn.scopes ?? []).includes("instagram_business_manage_comments")
console.log(`Comment scope present: ${hasComments ? "yes" : "NO — expect outcome D below"}\n`)

const { data: tok, error: tokErr } = await db.rpc("sa_get_instagram_token_by_connection", { p_connection_id: conn.id })
if (tokErr) { console.error("could not read the token:", tokErr.message); process.exit(1) }
const row = Array.isArray(tok) ? tok[0] : tok
const token = row?.token
if (!token) { console.error("no token stored for this connection"); process.exit(1) }

/** GET and classify. Returns { status, body } and NEVER echoes the token. */
async function get(path, params) {
  const u = new URL(`${GRAPH}/${path}`)
  for (const [k, v] of Object.entries(params ?? {})) u.searchParams.set(k, v)
  u.searchParams.set("access_token", token)
  const shown = u.toString().replace(encodeURIComponent(token), "•••").replace(token, "•••")
  const res = await fetch(u)
  const body = await res.json().catch(() => ({}))
  return { status: res.status, body, shown }
}

function classify(status, body) {
  const e = body?.error
  if (status === 200) return "ok"
  const msg = `${e?.message ?? ""} ${e?.error_user_msg ?? ""}`.toLowerCase()
  if (/nonexisting field|unknown field|cannot be read|invalid field/.test(msg)) return "field_rejected"
  if (/permission|scope|not authorized|access token/.test(msg)) return "permission"
  return "other"
}

// ── the media to probe: our own published Reels, newest first ───────────────────────────────
const { data: posts, error: postErr } = await db
  .from("social_posts")
  .select("post_name, external_post_id, external_post_url, published_at")
  .eq("destination", "instagram_reel")
  .eq("status", "published")
  .not("external_post_id", "is", null)
  .order("published_at", { ascending: false })
if (postErr) { console.error("could not read posts:", postErr.message); process.exit(1) }
console.log(`Probing ${posts.length} owned Reels, newest first.\n`)

const FIELDS = "id,text,timestamp,username,from{id,username}"
let verdict = null
let sampleCommentId = null

for (const p of posts) {
  const r = await get(`${p.external_post_id}/comments`, { fields: FIELDS, limit: "5" })
  const kind = classify(r.status, r.body)

  if (kind === "permission") {
    console.log(`D  permission not granted — ${r.body?.error?.message ?? r.status}`)
    console.log(`   This is the expected result before the scope is added. The probe itself works.`)
    verdict = "D"
    break
  }
  if (kind === "field_rejected") {
    console.log(`C  the field was rejected on the comments edge — ${r.body?.error?.message ?? ""}`)
    verdict = "C"
    break
  }
  if (kind === "other") {
    console.log(`?  ${p.post_name}: HTTP ${r.status} — ${r.body?.error?.message ?? JSON.stringify(r.body).slice(0, 160)}`)
    continue
  }

  const comments = r.body?.data ?? []
  if (comments.length === 0) { console.log(`–  ${p.post_name}: no comments`); continue }

  const withFrom = comments.filter((c) => c?.from?.id)
  sampleCommentId ??= comments[0]?.id
  console.log(`•  ${p.post_name}: ${comments.length} comment(s), ${withFrom.length} with from.id`)
  for (const c of comments) {
    // Identity only. Comment text is another person's words and is not printed here.
    console.log(
      `     id=${c.id}  from.id=${c?.from?.id ? "PRESENT" : "absent"}` +
      `  from.username=${c?.from?.username ? "present" : "absent"}` +
      `  username=${c.username ? "present" : "absent"}  ts=${c.timestamp ?? "absent"}`,
    )
  }
  if (withFrom.length > 0) {
    verdict = "A"
    // Is it stable in shape? An IGSID is a long numeric string. We assert nothing about its value.
    const ids = withFrom.map((c) => c.from.id)
    const allNumeric = ids.every((i) => /^[0-9]{5,}$/.test(String(i)))
    console.log(`\n   from.id shape: ${allNumeric ? "numeric IGSID, as documented" : "UNEXPECTED SHAPE — inspect before trusting"}`)
    console.log(`   distinct ids in this sample: ${new Set(ids).size} of ${ids.length}`)
    break
  }
  verdict ??= "B"
}

// ── stage 2: if the edge omitted `from`, try a direct node read ─────────────────────────────
if (verdict === "B" && sampleCommentId) {
  console.log(`\nStage 2 — the edge returned 200 without 'from'. Reading one comment node directly.`)
  const r = await get(sampleCommentId, { fields: "id,timestamp,from{id,username}" })
  const kind = classify(r.status, r.body)
  if (kind === "ok" && r.body?.from?.id) {
    console.log(`   from.id PRESENT on the node read → identity is available, one comment at a time.`)
    verdict = "A-node"
  } else if (kind === "ok") {
    console.log(`   node read returned 200 without 'from' → identity is not available by polling.`)
  } else {
    console.log(`   node read failed (${kind}) — ${r.body?.error?.message ?? r.status}`)
  }
}

const VERDICTS = {
  "A": "The comments edge returns from.id. The one-DM-per-person rule can run as designed.",
  "A-node": "The edge omits from.id but a node read returns it. The rule can run, with one extra read per comment.",
  "B": "200 OK but no from.id anywhere. Polling cannot support the per-person rule — public replies only.",
  "C": "The field is rejected on this edge. Polling cannot support the per-person rule — public replies only.",
  "D": "Scope not granted yet. Re-run after the authorization is updated.",
}
console.log(`\n${"=".repeat(78)}\nVERDICT ${verdict ?? "none — no comments found on any owned Reel"}`)
if (verdict) console.log(VERDICTS[verdict])
console.log(`${"=".repeat(78)}`)
console.log(`\nNothing was sent, replied to, or written. Usernames were never used as identity.`)
