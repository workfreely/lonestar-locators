// VERIFY THE BUFFER CHANNEL MAPPING BEFORE ANYTHING IS ARMED. Read-only; publishes nothing.
//
// ── WHY THIS SCRIPT EXISTS ──────────────────────────────────────────────────────────────────
// An inverted channel mapping is the one failure in the Buffer route that nothing downstream can
// catch. Buffer accepts the post, the network accepts it, the row records `published`, and the
// video is simply on the wrong brand's account. And it cannot be checked from our database: a
// TikTok open_id is scoped to the application that issued it, so our stored external_account_id
// and Buffer's serviceId for the same account are different strings by design.
//
// What CAN be done is to ask Buffer what handle sits behind each channel id we mapped, and print
// it beside the destination we mapped it to — then a person reads the two columns and confirms.
// That is all this does.
//
// ── WHAT IT DOES NOT DO ─────────────────────────────────────────────────────────────────────
// It creates no post, claims no row, writes nothing, and changes no setting. It performs two reads
// per mapped destination: sa_get_buffer_destination (service role) and Buffer's `channel` query.
// The API key it resolves is held in memory for the length of one HTTPS request and never printed.
//
//   node scripts/verify-buffer-mapping.mjs
//
// PREREQUISITES: 20261122000000_buffer_publish_route.sql applied, a key stored, and a mapping
// applied. With no mapping it prints "no Buffer-routed destinations" and exits 0 — which is also
// the correct answer before the mapping migration has been run.
import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "node:fs"

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const { data: conns, error } = await db
  .from("social_connections")
  .select("id, provider, username, posting_paused, market_restriction, buffer_channel_id, agent_user_id")
  .not("buffer_channel_id", "is", null)
  .order("provider")
if (error) {
  // The most likely cause by far, so it is named rather than left as a PostgREST code.
  console.error(`could not read connections: ${error.message}`)
  console.error("if this says buffer_channel_id does not exist, apply 20261122000000_buffer_publish_route.sql first")
  process.exit(1)
}
if (!conns.length) {
  console.log("no Buffer-routed destinations — nothing is mapped yet")
  process.exit(0)
}

const CHANNEL_QUERY = `query Channel($input: ChannelInput!) {
  channel(input: $input) { id name service isDisconnected isLocked }
}`

let problems = 0
const seen = new Map()

console.log("destination".padEnd(34), "provider".padEnd(10), "buffer channel".padEnd(26), "HANDLE AT BUFFER")
for (const c of conns) {
  const { data: rows, error: rpcErr } = await db.rpc("sa_get_buffer_destination", { p_connection_id: c.id })
  const d = Array.isArray(rows) ? rows[0] : rows
  if (rpcErr || !d?.api_key) {
    console.log(`${(c.username ?? c.id).slice(0, 33).padEnd(34)} ${String(c.provider).padEnd(10)} ${String(c.buffer_channel_id).padEnd(26)} UNRESOLVED — ${rpcErr?.message ?? "no stored API key"}`)
    problems++
    continue
  }

  let handle = null
  let note = ""
  try {
    const res = await fetch("https://api.buffer.com", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${d.api_key}` },
      body: JSON.stringify({ query: CHANNEL_QUERY, variables: { input: { id: d.buffer_channel_id } } }),
    })
    const body = await res.json()
    const ch = body?.data?.channel
    if (!ch) note = `BUFFER HAS NO SUCH CHANNEL${body?.errors ? ` — ${body.errors[0]?.message}` : ""}`
    else {
      handle = ch.name
      if (ch.isDisconnected) note = "DISCONNECTED IN BUFFER"
      else if (ch.isLocked) note = "LOCKED IN BUFFER"
      else if (ch.service && c.provider && ch.service.toLowerCase() !== String(c.provider).toLowerCase()) {
        // A provider mismatch is the only thing this script judges, because it is categorical
        // rather than a matter of which account: an Instagram row mapped to a TikTok channel is
        // wrong no matter whose accounts they are.
        note = `SERVICE MISMATCH — row says ${c.provider}, Buffer says ${ch.service}`
      }
    }
  } catch (e) {
    note = `could not reach Buffer — ${e instanceof Error ? e.message : String(e)}`
  }
  if (note) problems++

  const prior = seen.get(d.buffer_channel_id)
  if (prior) { console.log(`\n  ⚠ ${d.buffer_channel_id} is mapped to BOTH ${prior} and ${c.username ?? c.id}\n`); problems++ }
  seen.set(d.buffer_channel_id, c.username ?? c.id)

  console.log(
    `${(c.username ?? c.id).slice(0, 33).padEnd(34)} ${String(c.provider).padEnd(10)} ${String(d.buffer_channel_id).padEnd(26)} ${handle ? `@${handle}` : "—"}  ${note}`,
    `\n${" ".repeat(34)} buffer account "${d.buffer_account_label}"  paused=${c.posting_paused}  markets=${c.market_restriction ?? "unrestricted"}`,
  )
}

console.log(`\nREAD THE LAST COLUMN AGAINST THE FIRST. The row label is the display name as it was at`)
console.log(`connect time and may be stale; the handle is what Buffer will actually post to. If a pair`)
console.log(`does not match the account you intend, fix the mapping before arming anything.`)
process.exit(problems ? 1 : 0)
