// UPLOAD LISETTE'S PERSONAL VIDEO AND SET IT AS HER DEBUT.
//
// Run: npx tsx scripts/upload-lisette-debut.ts [--apply]
// Without --apply it prints what it would do and writes nothing.
//
// The operator asked for this to be done for him rather than by him. It therefore reproduces the
// app's own two steps exactly, in order, with the same values the UI would send:
//
//   1. the UPLOAD — the object goes to {owner}/{contentId}/source.mp4 with upsert:false, then a
//      social_content row is inserted with the fields POST /api/admin/social-autopilot/content
//      writes, including buildSocialDisplayName for the name and available_to_agents=true
//   2. the ASSIGNMENT — what PATCH .../content/[id] applies when a video is given to somebody:
//      personal_agent_user_id set, available_to_agents flipped to false, and overlay_mode set to
//      'existing' so no apartment headline, price band or branding is composited onto her video
//   3. the DEBUT — debut_for_agent_user_id set to the same person, which the database's own
//      constraint requires
//
// NOTHING IS PUBLISHED. auto_posting stays paused, her two destinations stay paused, and this
// script writes no post row at all — only the source video and its ownership.
import { createClient } from "@supabase/supabase-js"
import { readFileSync, statSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { buildSocialDisplayName } from "../lib/social/displayName"

const APPLY = process.argv.includes("--apply")

const OWNER = "c567c077-d3f4-4532-8807-a54795f753f5"   // Jay — owns every row, as the app does
const LISETTE = "27d7bde4-00f0-433c-b32b-b243623ad20a" // the agent the video belongs to
const FILE = "/Users/jaymorris/Desktop/Lisette - Southside Living - Upload Ready.mp4"
const PROPERTY = "South Side Living and Maker Spaces | Lofts for rent in San Antonio, TX"
const MARKET = "San Antonio"
const DURATION = 19.99

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
})

async function main() {
  const contentId = randomUUID()
  const batchId = randomUUID()
  const path = `${OWNER}/${contentId}/source.mp4`
  const bytes = readFileSync(FILE)
  const size = statSync(FILE).size
  const displayName = buildSocialDisplayName({
    propertyName: PROPERTY, market: MARKET, dateISO: new Date().toISOString(), seq: 1,
    fallbackFilename: "Lisette - Southside Living - Upload Ready.mp4",
  })

  console.log("WHAT WILL BE CREATED")
  console.log(`  file          ${FILE}`)
  console.log(`  size          ${size} bytes (${(size / 1048576).toFixed(1)} MB)`)
  console.log(`  content id    ${contentId}`)
  console.log(`  storage path  ${path}`)
  console.log(`  display name  ${displayName}`)
  console.log(`  property      ${PROPERTY}`)
  console.log(`  market        ${MARKET}`)
  console.log(`  belongs to    Lisette (${LISETTE.slice(0, 8)})`)
  console.log(`  debut for     Lisette — nothing else publishes on her accounts until this does`)
  console.log(`  overlay_mode  existing  (no headline, price band or branding composited)`)

  // Her destinations must exist and be hers, or the assignment would be refused by the route's own
  // rule and this script should not pretend otherwise.
  const { data: dests } = await db
    .from("social_connections").select("id, provider, username, posting_paused")
    .eq("agent_user_id", LISETTE)
  console.log(`\nHER DESTINATIONS (${(dests ?? []).length}) — the debut must publish on every one`)
  for (const d of dests ?? []) console.log(`  ${d.provider.padEnd(10)} @${d.username}  paused=${d.posting_paused}`)
  if ((dests ?? []).length === 0) { console.error("ABORT: she has no connected destinations, so a debut could never be satisfied."); process.exit(1) }

  // Nothing may already be her debut: the unique index allows one outstanding debut per agent.
  const { data: existingDebut } = await db
    .from("social_content").select("id, display_name").eq("debut_for_agent_user_id", LISETTE)
  if ((existingDebut ?? []).length > 0) {
    console.error(`ABORT: she already has a debut video (${existingDebut![0].id.slice(0, 8)} — ${existingDebut![0].display_name}). Clear it first.`)
    process.exit(1)
  }

  if (!APPLY) { console.log("\nNothing was written. Re-run with --apply."); process.exit(0) }

  // ── 1. THE OBJECT, then the row — the order the app uses ────────────────────────────────────
  const up = await db.storage.from("social-media").upload(path, bytes, { contentType: "video/mp4", upsert: false })
  if (up.error) { console.error(`\nupload failed: ${up.error.message}`); process.exit(1) }
  console.log(`\nuploaded      ${path}`)

  const { error: insErr } = await db.from("social_content").insert({
    id: contentId,
    owner_user_id: OWNER,
    storage_path: path,
    kind: "clip",
    original_filename: "Lisette - Southside Living - Upload Ready.mp4",
    content_type: "video/mp4",
    size_bytes: size,
    duration_s: DURATION,
    upload_batch_id: batchId,
    batch_seq: 1,
    display_name: displayName,
    name_customized: false,
    property_name: PROPERTY,
    market: MARKET,
    price_label_mode: "starting_at",
    overlay_mode: "generate",      // as the upload writes it; the assignment below flips it
    available_to_agents: true,     // likewise — the assignment restricts it
  })
  if (insErr) {
    console.error(`\nrow insert failed: ${insErr.message}`)
    await db.storage.from("social-media").remove([path])
    console.error("the uploaded object was removed, so nothing is left behind")
    process.exit(1)
  }
  console.log(`row created   ${contentId}`)

  // ── 2 & 3. THE ASSIGNMENT AND THE DEBUT, exactly what the PATCH route applies ────────────────
  const { error: assignErr } = await db.from("social_content").update({
    personal_agent_user_id: LISETTE,
    available_to_agents: false,
    overlay_mode: "existing",
    debut_for_agent_user_id: LISETTE,
    updated_at: new Date().toISOString(),
  }).eq("id", contentId)
  if (assignErr) { console.error(`\nassignment failed: ${assignErr.message}`); process.exit(1) }
  console.log("assigned      Personal -> Lisette, debut set, overlay_mode=existing")
}

main().catch((e) => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1) })
