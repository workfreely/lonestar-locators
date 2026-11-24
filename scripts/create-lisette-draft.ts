// CREATE THE DRAFT POST FOR LISETTE'S DEBUT VIDEO.
//
// Run: npx tsx scripts/create-lisette-draft.ts [--apply]
// Without --apply it prints what it would create and writes nothing.
//
// The operator wants to pick the template, edit the on-screen text, the caption and the CTA, and
// preview the render before anything is scheduled. All of that happens in the Post Editor, which
// needs a draft row to open. This creates exactly the row POST /api/admin/social-autopilot/posts
// creates — same fields, same defaults, and the same preparePost() call for the starting copy, so
// what opens in the editor is what he would have got by clicking Edit.
//
// IT DOES NOT RENDER, SCHEDULE, APPROVE OR PUBLISH. status stays 'draft', render_status 'none',
// scheduled_at and connection_id stay NULL, and nothing is approved. The post is a place for him
// to work, nothing more.
//
// ── WHY overlay_mode MATTERS HERE ───────────────────────────────────────────────────────────
// The row inherits the source's overlay_mode, which for her video is 'existing'. In the renderer
// that means: draw NO overlay, and keep the original audio. With no voice clips attached the
// render copies her audio stream rather than re-mixing it, so her voiceover, music and ducking
// come through untouched. The only audio the render touches is the final master pass, measured on
// her actual file: -14.1 LUFS in, -13.7 out — a 0.4 dB nudge, true peak unchanged at -2.0 dBTP.
//
// If he picks a template instead, overlay_mode becomes 'generate' and text is burned in. That
// re-encodes the VIDEO, and the audio path is unchanged — still copied, still only the master
// pass. So choosing a template costs her nothing in audio terms beyond that 0.4 dB.
import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "node:fs"
import { preparePost, priceLabelMode } from "../lib/social/composePost"
import { defaultPostType } from "../lib/social/postTypes"

const APPLY = process.argv.includes("--apply")
const CONTENT = "33daf0d4-087e-4e89-afaa-8e54d59c5c30"
const OWNER = "c567c077-d3f4-4532-8807-a54795f753f5"

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
})

async function main() {
  const { data: src, error: srcErr } = await db
    .from("social_content")
    .select("id, display_name, market, property_type, special, budget_range, price_label_mode, amenities, overlay_mode, details, personal_agent_user_id, debut_for_agent_user_id")
    .eq("id", CONTENT)
    .maybeSingle()
  if (srcErr || !src) { console.error(`source not found: ${srcErr?.message ?? CONTENT}`); process.exit(1) }

  // The ownership must still be intact — the operator asked for it to stay, and a draft built from
  // a source that lost its assignment would schedule onto the wrong accounts.
  if (src.personal_agent_user_id !== "27d7bde4-00f0-433c-b32b-b243623ad20a") {
    console.error("ABORT: this source is no longer assigned to Lisette."); process.exit(1)
  }
  if (src.debut_for_agent_user_id !== "27d7bde4-00f0-433c-b32b-b243623ad20a") {
    console.error("ABORT: this source is no longer her debut."); process.exit(1)
  }

  // One initial draft per source while unpublished — social_posts_one_initial_draft_uidx. If one
  // exists, that IS his editor row and a second would be refused anyway.
  const { data: existing } = await db
    .from("social_posts").select("id, status, created_via")
    .eq("source_content_id", CONTENT).is("published_at", null)
  if ((existing ?? []).length > 0) {
    console.log(`a draft already exists for this source: ${existing!.map((p) => `${p.id.slice(0, 8)} (${p.status}, ${p.created_via})`).join(", ")}`)
    console.log("nothing to do — open that one in the editor.")
    process.exit(0)
  }

  const prepared = preparePost({
    market: src.market as string | null,
    propertyType: src.property_type as string | null,
    special: src.special as string | null,
    budgetRange: src.budget_range as string | null,
    priceLabelMode: priceLabelMode(src.price_label_mode),
    amenities: src.amenities as string | null,
  }, CONTENT)

  const stored = src.details && typeof src.details === "object" && !Array.isArray(src.details)
    ? ((src.details as Record<string, unknown>).preparedPost as Record<string, unknown> | undefined) : undefined
  const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)
  const storedTags = Array.isArray(stored?.hashtags) ? (stored!.hashtags as unknown[]).filter((t): t is string => typeof t === "string" && t.trim()) : []

  const row = {
    owner_user_id: OWNER,
    source_content_id: CONTENT,
    platform: "instagram",
    post_type: defaultPostType("instagram"),
    post_name: src.display_name as string | null,
    caption: s(stored?.caption) ?? prepared.caption,
    overlay_headline: s(stored?.overlayHeadline) ?? prepared.overlayHeadline,
    overlay_subheadline: s(stored?.overlaySubheadline) ?? prepared.overlaySubheadline,
    hashtags: storedTags.length ? storedTags : prepared.hashtags,
    overlay_mode: src.overlay_mode === "existing" ? "existing" : "generate",
    audio_choice: "original",
    render_status: "none",
    status: "draft",
    created_via: "edit_initial",
  }

  console.log("THE DRAFT TO BE CREATED (status draft, nothing rendered, scheduled or approved)")
  console.log(`  source        ${CONTENT.slice(0, 8)}  ${src.display_name}`)
  console.log(`  platform      ${row.platform} / ${row.post_type}  (destination defaults to instagram_reel)`)
  console.log(`  overlay_mode  ${row.overlay_mode}   ${row.overlay_mode === "existing" ? "— no overlay drawn, her audio kept" : "— template text burned in"}`)
  console.log(`  post_name     ${row.post_name}`)
  console.log(`  headline      ${row.overlay_headline ?? "(none)"}`)
  console.log(`  subheadline   ${row.overlay_subheadline ?? "(none)"}`)
  console.log(`  hashtags      ${(row.hashtags ?? []).join(" ") || "(none)"}`)
  console.log(`  caption:\n${String(row.caption ?? "(none)").split("\n").map((l) => `    ${l}`).join("\n")}`)

  if (!APPLY) { console.log("\nNothing was written. Re-run with --apply."); return }

  const { data: made, error } = await db.from("social_posts").insert(row).select("id, status, render_status, scheduled_at, connection_id, approved_at").single()
  if (error) { console.error(`\ncreate failed: ${error.message}`); process.exit(1) }
  console.log(`\ncreated  ${made!.id}`)
  console.log(`  status=${made!.status}  render_status=${made!.render_status}  scheduled_at=${made!.scheduled_at ?? "NULL"}  connection_id=${made!.connection_id ?? "NULL"}  approved_at=${made!.approved_at ?? "NULL"}`)
}

main().catch((e) => { console.error(e instanceof Error ? e.message : String(e)); process.exit(1) })
