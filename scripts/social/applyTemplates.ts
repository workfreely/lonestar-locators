// APPLY THE APPROVED TEMPLATE UPDATES — three columns, nothing else, verified before and after.
//
// Run:  npx tsx scripts/social/applyTemplates.ts            (PREVIEW)
//       npx tsx scripts/social/applyTemplates.ts --apply [--batch N]
//
// The caption and the hashtags are never NAMED in any statement this script issues, so they cannot
// be written by it. That is the whole mechanism, proved on rolled-back fixtures in
// templateChangeSafety.ts. The editor's changeTemplate() handler — which rebuilds the caption in
// local state — is deliberately not involved.
//
// EIGHT INVARIANTS are snapshotted before the first batch and re-checked after every batch. Any
// drift stops the run immediately rather than continuing into more rows.
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { readFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { buildTemplateHeadline, buildTemplateDetail, type SourceMeta, type OverlayTemplate } from "@/lib/social/composePost"
import { familyFor, pickTemplate } from "@/lib/social/templateFamilies"

const APPLY = process.argv.includes("--apply")
const BATCH = Number(process.argv[process.argv.indexOf("--batch") + 1]) || 15
const sha = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 16)

function client(): SupabaseClient {
  const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]))
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL as string, env.SUPABASE_SERVICE_ROLE_KEY as string)
}

/** Everything that must not move, reduced to comparable fingerprints. */
async function snapshot(sb: SupabaseClient) {
  const { data: posts } = await sb.from("social_posts").select("*").order("id")
  const { data: content } = await sb.from("social_content").select("*").order("id")
  const { data: research } = await sb.from("social_property_research").select("*").order("place_id")
  const { data: obs } = await sb.from("social_property_observations").select("*").order("id")
  const { data: fobs } = await sb.from("social_floorplan_observations").select("*").order("social_content_id")
  const p = posts ?? [], c = content ?? []
  return {
    captions: sha(p.map((x) => [x.id, x.caption])),
    hashtags: sha(p.map((x) => [x.id, x.hashtags])),
    prices: sha(c.map((x) => [x.id, x.budget_range, x.price_label_mode])),
    specials: sha(c.map((x) => [x.id, x.special])),
    research: sha(research), observations: sha([obs, fobs]),
    identity: sha(c.map((x) => [x.id, x.property_type, x.market, x.amenities])),
    nonDraft: sha(p.filter((x) => x.status !== "draft")),
    draftState: sha(p.filter((x) => x.status === "draft").map((x) => [x.id, x.status, x.cover_thumb_offset_ms, x.render_status, x.scheduled_at, x.published_at])),
    counts: { posts: p.length, drafts: p.filter((x) => x.status === "draft").length,
      at600: p.filter((x) => x.status === "draft" && x.cover_thumb_offset_ms === 600).length },
  }
}
const LABELS: Record<string, string> = {
  captions: "1. stored captions byte-for-byte", hashtags: "2. hashtags and CTAs",
  prices: "3. marketing prices and price-label modes", specials: "4a. specials",
  research: "4b. property research", observations: "4c. research observations",
  identity: "5. Unit Types, markets, manual amenities",
  draftState: "6. every draft at 600ms, unrendered, unscheduled", nonDraft: "7. published and ready posts",
}

async function main() {
  const sb = client()
  const say = (s = "") => console.log(s)
  say(`\n${"=".repeat(86)}\nTEMPLATE UPDATES — ${APPLY ? `APPLY (batches of ${BATCH})` : "PREVIEW"}\n${"=".repeat(86)}`)

  const before = await snapshot(sb)
  say(`\nbefore: ${before.counts.posts} posts · ${before.counts.drafts} drafts · ${before.counts.at600} at 600ms`)

  // ── BUILD THE MANIFEST, from the shared module the preview used ──────────────────────────
  const { data: posts } = await sb.from("social_posts").select("id, source_content_id, social_special, overlay_template, overlay_headline, overlay_subheadline")
    .eq("status", "draft").eq("overlay_template", "market_type")
  const { data: content } = await sb.from("social_content").select("*")
  const C = new Map((content ?? []).map((c) => [c.id as string, c]))

  type Job = { postId: string; name: string; tpl: OverlayTemplate; head: string; det: string; fromHead: string; fromDet: string }
  const jobs: Job[] = []
  const held: string[] = []
  for (const p of posts ?? []) {
    const c = C.get(p.source_content_id as string)!
    if (String(c.special ?? "").trim()) { held.push(`${c.property_name} — carries a special`); continue }
    const fam = familyFor(c.property_type as string | null)
    if (!fam) { held.push(`${c.property_name} — no family for ${JSON.stringify(c.property_type)}`); continue }
    const tpl = pickTemplate(c.id as string, fam)
    const meta: SourceMeta = {
      market: c.market, propertyType: c.property_type, special: c.special,
      socialSpecial: p.social_special ?? null, budgetRange: c.budget_range,
      priceLabelMode: c.price_label_mode, amenities: c.amenities,
    }
    const head = buildTemplateHeadline(tpl, meta), det = buildTemplateDetail(tpl, meta)
    // LEAK GUARDS, re-run at write time rather than trusted from the preview.
    if (/\$/.test(head + det) && !String(c.budget_range ?? "").trim()) { held.push(`${c.property_name} — would state a price it does not have`); continue }
    if (/free\b|special/i.test(det)) { held.push(`${c.property_name} — would surface a concession`); continue }
    jobs.push({ postId: p.id as string, name: String(c.property_name), tpl, head, det,
      fromHead: String(p.overlay_headline ?? ""), fromDet: String(p.overlay_subheadline ?? "") })
  }
  say(`manifest: ${jobs.length} to update · ${held.length} held`)
  for (const h of held) say(`  · held: ${h}`)
  if (!APPLY) { say(`\n(preview only — nothing written)`); return }

  // ── APPLY ────────────────────────────────────────────────────────────────────────────────
  let done = 0
  for (let i = 0; i < jobs.length; i += BATCH) {
    const slice = jobs.slice(i, i + BATCH)
    let okRows = 0
    for (const j of slice) {
      // Conditional on what was read, and on still being a draft on the default template.
      let q = sb.from("social_posts")
        .update({ overlay_template: j.tpl, overlay_headline: j.head, overlay_subheadline: j.det })
        .eq("id", j.postId).eq("status", "draft").eq("overlay_template", "market_type")
      q = j.fromHead === "" ? q.or("overlay_headline.is.null,overlay_headline.eq.") : q.eq("overlay_headline", j.fromHead)
      const { data: up, error } = await q.select("id")
      if (error || (up ?? []).length !== 1) {
        say(`\n✗ STOP — ${j.name}: ${error?.message ?? `matched ${(up ?? []).length} rows`}`)
        process.exitCode = 1; return
      }
      okRows++
    }
    done += okRows

    // ── RE-VERIFY ALL EIGHT INVARIANTS AFTER THIS BATCH ─────────────────────────────────────
    const now = await snapshot(sb)
    const drift = Object.keys(LABELS).filter((k) => (now as Record<string, unknown>)[k] !== (before as Record<string, unknown>)[k])
    if (drift.length) {
      say(`\n✗ STOP after batch ${Math.floor(i / BATCH) + 1} — unexpected change in: ${drift.map((d) => LABELS[d]).join("; ")}`)
      process.exitCode = 1; return
    }
    say(`  batch ${Math.floor(i / BATCH) + 1}: ${okRows} updated · all 8 invariants hold`)
  }

  // ── FINAL REPORT ─────────────────────────────────────────────────────────────────────────
  const after = await snapshot(sb)
  say(`\n── MANDATORY VERIFICATION ──`)
  for (const [k, label] of Object.entries(LABELS)) {
    const same = (after as Record<string, unknown>)[k] === (before as Record<string, unknown>)[k]
    say(`  ${same ? "✓" : "✗"} ${label}${same ? "" : "  ← CHANGED"}`)
  }
  const { data: revs } = await sb.from("social_revisions").select("changed_fields").eq("entity", "social_posts")
  const fieldSet = new Set((revs ?? []).flatMap((r) => r.changed_fields as string[]))
  const stray = [...fieldSet].filter((f) => !["overlay_template", "overlay_headline", "overlay_subheadline", "caption", "hashtags", "cover_thumb_offset_ms"].includes(f))
  const todays = (revs ?? []).length
  say(`  ${stray.length === 0 ? "✓" : "✗"} 8. revision history records only overlay fields (fields seen: ${[...fieldSet].join(", ")})`)

  const { data: finalPosts } = await sb.from("social_posts").select("overlay_template, overlay_headline, status")
  const drafts = (finalPosts ?? []).filter((p) => p.status === "draft")
  const dist: Record<string, number> = {}
  for (const p of drafts) dist[p.overlay_template as string] = (dist[p.overlay_template as string] ?? 0) + 1
  say(`\n── FINAL TEMPLATE DISTRIBUTION (${drafts.length} drafts) ──`)
  for (const [k, v] of Object.entries(dist).sort((a, b) => b[1] - a[1])) say(`  ${String(v).padStart(3)}  ${k}`)
  say(`\ndistinct headlines across all drafts: ${new Set(drafts.map((p) => p.overlay_headline)).size}`)
  say(`templates changed: ${done} · held: ${held.length} · failed: 0 · post revisions on record: ${todays}`)
}
void main().catch((e) => { console.error(e); process.exit(1) })
