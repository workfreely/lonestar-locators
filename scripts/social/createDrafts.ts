// CREATE THE REMAINING DRAFTS — one per eligible source video, mirroring the app's own create route.
//
// Run:  npx tsx scripts/social/createDrafts.ts                 (PREVIEW)
//       npx tsx scripts/social/createDrafts.ts --apply [--batch N]
//
// ── WHY market_type FOR EVERY NEW DRAFT ─────────────────────────────────────────────────────
// The creation manifest proposed a varied starting template per video, and those proposals stand —
// as a REVIEW LIST, beside the 27 pending template changes. They are not applied here. Several of
// them put a price or a concession on screen (special_feature's detail line is "{special} ·
// {feature}"), and a template chosen by a script is a creative decision made without review. T1 is
// the system default, is what every existing draft started on, and asserts nothing beyond the
// market and the unit type.
//
// ── WHAT THE COPY COMES FROM ────────────────────────────────────────────────────────────────
// preparePost, seeded with the source video id, exactly as app/api/.../posts/route.ts does — so a
// draft created here is byte-identical to one created by clicking Edit. Only PUBLIC-SAFE source
// fields reach it; no research value is injected, so nothing can promote an unverified price or
// special that the operator did not already put on the video themselves.
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { readFileSync } from "node:fs"
import { preparePost, priceLabelMode, DEFAULT_OVERLAY_TEMPLATE } from "@/lib/social/composePost"

const APPLY = process.argv.includes("--apply")
const BATCH = Number(process.argv[process.argv.indexOf("--batch") + 1]) || 20

/** Identity gaps that genuinely prevent a draft. A blank price, special or highlight is NOT one. */
function blockers(c: Record<string, unknown>, hasResearch: boolean): string[] {
  const out: string[] = []
  if (!c.market) out.push("no market")
  if (!c.property_type) out.push("no Unit Type")
  if (!c.place_id) out.push("no place_id")
  else if (!hasResearch) out.push("no research record")
  if (!c.storage_path) out.push("no media")
  return out
}

function client(): SupabaseClient {
  const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]))
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL as string, env.SUPABASE_SERVICE_ROLE_KEY as string)
}

async function main() {
  const sb = client()
  const say = (s = "") => console.log(s)
  say(`\n${"=".repeat(84)}\nDRAFT CREATION — ${APPLY ? `APPLY (batches of ${BATCH})` : "PREVIEW"}\n${"=".repeat(84)}`)

  // ── CURRENT LIBRARY STATE, read fresh ─────────────────────────────────────────────────────
  const { data: content } = await sb.from("social_content").select("*")
  const { data: posts } = await sb.from("social_posts").select("id, source_content_id, status")
  const { data: research } = await sb.from("social_property_research").select("place_id")
  const hasPost = new Set((posts ?? []).map((p) => p.source_content_id as string))
  const hasResearch = new Set((research ?? []).map((r) => r.place_id as string))
  say(`\nbefore: ${content!.length} videos · ${posts!.length} posts · ${(posts ?? []).filter((p) => p.status === "draft").length} drafts`)
  say(`        ${hasPost.size} videos already have a post — every one of them is excluded`)

  // ── ELIGIBILITY ───────────────────────────────────────────────────────────────────────────
  const HOLD = /^Elmira Flats$/i   // identity unresolved — explicitly excluded
  const eligible: Record<string, unknown>[] = []
  const skipped: string[] = []
  for (const c of content ?? []) {
    if (hasPost.has(c.id as string)) continue
    if (HOLD.test(String(c.property_name ?? ""))) { skipped.push(`${c.property_name} — on hold, identity unresolved`); continue }
    const b = blockers(c, hasResearch.has(c.place_id as string))
    if (b.length) { skipped.push(`${c.property_name} — ${b.join(", ")}`); continue }
    eligible.push(c)
  }
  say(`\neligible: ${eligible.length}   skipped: ${skipped.length}`)
  for (const s of skipped) say(`  ✗ ${s}`)

  if (!APPLY) {
    const byMarket: Record<string, number> = {}
    for (const c of eligible) byMarket[String(c.market)] = (byMarket[String(c.market)] ?? 0) + 1
    say(`\nwould create, by market: ${Object.entries(byMarket).map(([m, n]) => `${m} ${n}`).join(" · ")}`)
    say(`every one: template ${DEFAULT_OVERLAY_TEMPLATE} · cover offset 600ms · status draft · render none · unscheduled`)
    return
  }

  // ── CREATE, IN BATCHES, VERIFYING AFTER EACH ──────────────────────────────────────────────
  let created = 0, failed = 0
  for (let i = 0; i < eligible.length; i += BATCH) {
    const slice = eligible.slice(i, i + BATCH)
    const rows = slice.map((s) => {
      const prepared = preparePost({
        market: s.market as string | null,
        propertyType: s.property_type as string | null,
        special: s.special as string | null,
        budgetRange: s.budget_range as string | null,
        priceLabelMode: priceLabelMode(s.price_label_mode),
        amenities: s.amenities as string | null,
      }, s.id as string)
      return {
        owner_user_id: s.owner_user_id,          // OWNER-SCOPED: taken from the video, never assumed
        source_content_id: s.id,
        platform: "instagram", post_type: "reel",
        post_name: (s.display_name as string | null) ?? (s.property_name as string | null),
        caption: prepared.caption,
        overlay_headline: prepared.overlayHeadline,
        overlay_subheadline: prepared.overlaySubheadline,
        hashtags: prepared.hashtags,
        overlay_mode: s.overlay_mode === "existing" ? "existing" : "generate",
        overlay_template: DEFAULT_OVERLAY_TEMPLATE,
        audio_choice: "original",
        render_status: "none",
        status: "draft",
        cover_thumb_offset_ms: 600,
        created_via: "edit_initial",
      }
    })
    const { data: ins, error } = await sb.from("social_posts").insert(rows).select("id, source_content_id")
    if (error) { say(`  ✗ batch ${i / BATCH + 1} failed: ${error.message}`); failed += slice.length; continue }
    if ((ins ?? []).length !== slice.length) {
      say(`  ✗ batch ${i / BATCH + 1}: expected ${slice.length} rows, inserted ${(ins ?? []).length}`); failed += slice.length - (ins ?? []).length
    }
    created += (ins ?? []).length

    // VERIFY THIS BATCH before starting the next one.
    const ids = (ins ?? []).map((x) => x.id as string)
    const { data: check } = await sb.from("social_posts")
      .select("id, status, cover_thumb_offset_ms, render_status, scheduled_at, published_at, overlay_template, source_content_id").in("id", ids)
    const bad = (check ?? []).filter((p) => p.status !== "draft" || p.cover_thumb_offset_ms !== 600 ||
      p.render_status !== "none" || p.scheduled_at !== null || p.published_at !== null || p.overlay_template !== DEFAULT_OVERLAY_TEMPLATE)
    const dupes = new Set((check ?? []).map((p) => p.source_content_id as string)).size !== (check ?? []).length
    say(`  batch ${i / BATCH + 1}: inserted ${(ins ?? []).length} · verified ${(check ?? []).length - bad.length}/${(check ?? []).length}${bad.length ? ` · ✗ ${bad.length} wrong` : ""}${dupes ? " · ✗ DUPLICATE SOURCE" : ""}`)
    if (bad.length || dupes) { failed += bad.length; break }
  }

  const { data: after } = await sb.from("social_posts").select("id, status, source_content_id, cover_thumb_offset_ms")
  const drafts = (after ?? []).filter((p) => p.status === "draft")
  say(`\nafter: ${after!.length} posts · ${drafts.length} drafts · ${drafts.filter((p) => p.cover_thumb_offset_ms === 600).length} at 600ms`)
  say(`one post per source: ${new Set((after ?? []).map((p) => p.source_content_id)).size === (after ?? []).length ? "✓" : "✗ a source has two"}`)
  say(`\nCREATED ${created} · FAILED ${failed}`)
  if (failed) process.exitCode = 1
}
void main().catch((e) => { console.error(e); process.exit(1) })
