// REFRESH THE PROFILE INFORMATION BUFFER CAN ACTUALLY GIVE US.
//
// Run: node scripts/refresh-buffer-profiles.mjs [--apply]
// Without --apply it prints what it would change and writes nothing.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────────────────────
// Two things were wrong on the Accounts page, and both were data, not layout:
//
//   1. Both TikTok profile photos were broken. social_connections.avatar_url held TikTok's own
//      signed CDN URLs, which carry an x-expires. Theirs expired 2026-11-21 and returned HTTP 403
//      — a permanently broken image, because nothing refreshes them.
//   2. Lisette's TikTok showed the operator's photo. Her avatar_url was NULL and the card fell
//      back to the single "owner photo" the page passes to every TikTok row.
//
// Buffer's avatars are plain S3 objects — no signature, no expiry — so storing one fixes (1) for
// good rather than until the next expiry. Fetching per channel, with that channel's OWN account
// key, fixes (2) at the source: there is no cross-account fallback left to reach for.
//
// ── WHAT BUFFER DOES AND DOES NOT CARRY ─────────────────────────────────────────────────────
// It carries the HANDLE and the AVATAR. It does NOT carry the profile's display name: for all four
// mapped channels Buffer returns the handle in BOTH `name` and `displayName` —
// `locator.beast`, `realestatepro_tx`, `locatorlisette`. So "Jay | Dallas Apt Locator" cannot be
// retrieved from Buffer; it is not there to retrieve. The operator-visible name is
// social_connections.label, which the Accounts page already lets you rename, and the two names the
// operator stated in writing are applied below as explicit overrides rather than guessed.
//
// ── WHY WRITING username IS SAFE NOW ────────────────────────────────────────────────────────
// 20261122000002 deliberately did NOT refresh username, on the grounds that the route reads ids
// and a rename must never re-route a post. That reasoning is unchanged and still holds — which is
// exactly why this is safe: nothing in the publishing route reads username. bufferRoutingFor names
// no display field, sa_get_buffer_destination keys on p_connection_id, and
// scripts/social/bufferPublish.test.ts §14 asserts in 13 places that routing reads ids and never
// names. username is display data, and it was wrong: the TikTok rows held a display name where the
// Instagram rows held a handle, so the two card shapes could not agree.
import { createClient } from "@supabase/supabase-js"
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"

const APPLY = process.argv.includes("--apply")

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

// The names the operator stated, for accounts whose display name Buffer cannot supply. Keyed by
// connection id so a rename cannot land on the wrong row.
const OVERRIDE_BY_PREFIX = {
  "671b758b": "Jay | Dallas Apt Locator", // Dallas Instagram — stated by the operator 23 Nov 2026
  "1b5e4878": "Jay | Dallas Apt Locator", // Dallas TikTok    — stated by the operator 23 Nov 2026
}

const PG = ["-h", "aws-0-us-east-2.pooler.supabase.com", "-p", "5432",
  "-U", "postgres.onwrrajmklxtnabekzcy", "-d", "postgres", "-w", "-At", "-c"]
/** The Buffer key for one account label, straight from psql's stdout into a variable. Never printed. */
const keyFor = (label) => execFileSync("psql", [...PG,
  `select ds.decrypted_secret from public.social_buffer_accounts ba
     join vault.decrypted_secrets ds on ds.id = ba.key_secret_id where ba.label = '${label}';`,
], { stdio: ["ignore", "pipe", "inherit"], encoding: "utf8" }).trim()

const CHANNEL = `query Channel($input: ChannelInput!) {
  channel(input: $input) { id name displayName avatar service isDisconnected isLocked organizationId }
}`

const { data: rows, error } = await db
  .from("social_connections")
  .select("id, provider, username, label, avatar_url, buffer_account_id, buffer_channel_id, agent_user_id")
  .order("provider")
if (error) { console.error("could not read destinations:", error.message); process.exit(1) }

const { data: accounts, error: accErr } = await db
  .from("social_buffer_accounts")
  .select("id, label, organization_id")
if (accErr) { console.error("could not read Buffer accounts:", accErr.message); process.exit(1) }
const accountById = new Map(accounts.map((a) => [a.id, a]))

const keys = {}
let changed = 0
let skipped = 0

for (const row of rows) {
  const prefix = row.id.slice(0, 8)
  const override = OVERRIDE_BY_PREFIX[prefix]
  const routed = !!(row.buffer_account_id && row.buffer_channel_id)
  const updates = {}

  if (routed) {
    const account = accountById.get(row.buffer_account_id)
    if (!account) { console.log(`${prefix}  SKIP — buffer_account_id points at no row`); skipped++; continue }
    if (!keys[account.label]) keys[account.label] = keyFor(account.label)
    const key = keys[account.label]
    if (!key) { console.log(`${prefix}  SKIP — no stored key for Buffer account "${account.label}"`); skipped++; continue }

    const res = await fetch("https://api.buffer.com", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ query: CHANNEL, variables: { input: { id: row.buffer_channel_id } } }),
    })
    const body = await res.json()
    const ch = body?.data?.channel
    if (!ch) {
      console.log(`${prefix}  SKIP — Buffer returned no channel${body?.errors ? ` (${body.errors[0]?.message})` : ""}`)
      skipped++
      continue
    }
    // THE ACCOUNT MUST BE THE ONE WE THINK IT IS. A channel that answers from the wrong
    // organization, or on the wrong service, is not a profile to copy — it is a mapping bug, and
    // overwriting a name and a face from it would hide that bug behind plausible data.
    if (ch.organizationId !== account.organization_id) {
      console.log(`${prefix}  REFUSED — channel is in org ${ch.organizationId}, account "${account.label}" is ${account.organization_id}`)
      skipped++
      continue
    }
    if (String(ch.service).toLowerCase() !== String(row.provider).toLowerCase()) {
      console.log(`${prefix}  REFUSED — row says ${row.provider}, Buffer says ${ch.service}`)
      skipped++
      continue
    }

    if (ch.avatar && ch.avatar !== row.avatar_url) updates.avatar_url = ch.avatar
    if (ch.name && ch.name !== row.username) updates.username = ch.name
    // Keep the display name the row already showed, rather than losing it to the handle. Only
    // fills a BLANK label — a label the operator typed is theirs and is never overwritten here.
    if (!override && !row.label && row.username && row.username !== ch.name) updates.label = row.username
  }

  if (override && row.label !== override) updates.label = override

  if (Object.keys(updates).length === 0) { console.log(`${prefix}  ${row.provider.padEnd(9)} unchanged`); continue }

  console.log(`${prefix}  ${row.provider.padEnd(9)} ${routed ? "buffer" : "direct"}`)
  for (const [k, v] of Object.entries(updates)) {
    const before = k === "avatar_url" ? (row.avatar_url ? row.avatar_url.slice(0, 48) + "…" : "(null)") : JSON.stringify(row[k] ?? null)
    const after = k === "avatar_url" ? String(v).slice(0, 48) + "…" : JSON.stringify(v)
    console.log(`            ${k}: ${before}  ->  ${after}`)
  }
  changed++

  if (APPLY) {
    const { error: upErr } = await db
      .from("social_connections")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", row.id)
    if (upErr) { console.log(`            WRITE FAILED: ${upErr.message}`); process.exitCode = 1 }
    else console.log(`            written`)
  }
}

console.log(`\n${changed} destination(s) ${APPLY ? "updated" : "would change"}, ${skipped} skipped.`)
if (!APPLY) console.log("Nothing was written. Re-run with --apply to write.")
