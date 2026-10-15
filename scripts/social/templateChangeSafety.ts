// THE SMALLEST SAFE TEMPLATE CHANGE — proved on a rolled-back fixture, never on a real draft.
//
// Run: npx tsx scripts/social/templateChangeSafety.ts
//
// ── THE MECHANISM ───────────────────────────────────────────────────────────────────────────
// Write exactly three columns and address nothing else:
//     overlay_template · overlay_headline · overlay_subheadline
// The caption and hashtags are never named, so they are never written. No code changes, no editor
// changes, and no new endpoint: the existing PATCH /posts/[id] already keys every field off
// `"name" in body`, so a body carrying only those three keys cannot touch anything else.
//
// ── WHY THE EDITOR REGENERATES AND THIS DOES NOT ────────────────────────────────────────────
// changeTemplate() rebuilds the caption in LOCAL STATE when the caption is generator-owned, and
// Save Draft then sends that whole state back. That is a property of the editor's UI, not of the
// save path. Bypassing the UI is therefore the smallest fix available — nothing has to change for
// it to be safe.
//
// ── AND WHY PROVENANCE SURVIVES ─────────────────────────────────────────────────────────────
// The worry is that changing the template silently turns the caption into a "manual override".
// It does not. isGeneratedCaption loops over EVERY template and every market/type pair, so a
// caption generated under market_type is still recognised as generator-owned once the template
// says wanted_luxury. captionDirty is computed from that function alone, so it reads exactly what
// it read before. Nothing is marked manual to dodge regeneration.
import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { preparePost, buildTemplateHeadline, buildTemplateDetail, isGeneratedCaption,
  MAX_HASHTAGS, type SourceMeta, type OverlayTemplate } from "@/lib/social/composePost"
import { buildHashtags } from "@/lib/social/hashtags"
import { resolveLoadedCopy } from "@/lib/social/loadedCopy"

const md5 = (s: string) => createHash("md5").update(s).digest("hex")
let pass = 0, fail = 0
const ok = (label: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ✓ ${label}`) } else { fail++; console.log(`  ✗ ${label}${detail ? `\n      ${detail}` : ""}`) }
}

// TWO SCENARIOS, because the interesting difference is the DETAIL line. One has no price, so the
// new template leaves the detail blank rather than inventing one; the other has a price the
// operator entered, so the detail moves and the revision records it.
type Scenario = { label: string; meta: SourceMeta; seed: string; from: OverlayTemplate; to: OverlayTemplate }
const SCENARIOS: Scenario[] = [
  { label: "Dallas penthouse, NO price — detail must stay blank",
    // A valid v4-shaped uuid; an earlier constant contained a non-hex character and the insert failed.
    seed: "00000000-0000-4000-8000-000000000f17",
    from: "market_type", to: "wanted_luxury",
    meta: { market: "Dallas", propertyType: "Penthouse", special: null, socialSpecial: null,
      budgetRange: null, priceLabelMode: "starting_at",
      amenities: "Floor-to-Ceiling Windows\nHigh Ceilings\nRooftop Pool" } },
  { label: "Austin high-rise WITH the operator's own price — detail moves",
    seed: "00000000-0000-4000-8000-000000000f18",
    from: "market_type", to: "what_mo_gets_you",
    meta: { market: "Austin", propertyType: "High-Rise", special: null, socialSpecial: null,
      budgetRange: "3500", priceLabelMode: "starting_at",
      amenities: "Skyline Views\nSky Lounge\nResort-Style Pool" } },
]

function run(sc: Scenario) {
  const { meta: META, seed: SEED, from: FROM, to: TO } = sc
  console.log(`\n${"━".repeat(88)}\nSCENARIO: ${sc.label}\n${"━".repeat(88)}`)
  const pooler = readFileSync("supabase/.temp/pooler-url", "utf8").trim()
  const q = (sql: string) => execFileSync("psql", [pooler, "-At", "-c", sql], { encoding: "utf8" }).trim()

  // The caption exactly as the create route produces it.
  const prepared = preparePost(META, SEED)
  const caption = prepared.caption
  const hashtags = buildHashtags(META.market, MAX_HASHTAGS, META.propertyType)

  console.log(`\n${"=".repeat(88)}\nSAFE TEMPLATE CHANGE — ${FROM} → ${TO}  (rolled-back fixture)\n${"=".repeat(88)}`)
  console.log(`\nfixture caption (${caption.split("\n").length} lines, md5 ${md5(caption)}):`)
  console.log(caption.split("\n").map((l) => "  │ " + l).join("\n"))

  const esc = (s: string) => s.replace(/'/g, "''")
  const owner = q("select owner_user_id from social_content limit 1")

  // ── THE ROUND TRIP, inside a transaction that is always rolled back ──────────────────────
  const sql = `
begin;
insert into social_content (id, owner_user_id, storage_path, kind, property_name, market, property_type, amenities)
values ('${SEED}', '${owner}', 'FIXTURE/template-safety.mov', 'clip', 'FIXTURE Template Safety', 'Dallas', 'Penthouse', '${esc(META.amenities as string)}');
insert into social_posts (id, owner_user_id, source_content_id, status, overlay_template, overlay_headline, overlay_subheadline, caption, hashtags, cover_thumb_offset_ms, render_status)
values ('${SEED}', '${owner}', '${SEED}', 'draft', '${FROM}', '${esc(buildTemplateHeadline(FROM, META))}', '${esc(buildTemplateDetail(FROM, META))}', '${esc(caption)}', array[${hashtags.map((h) => `'${esc(h)}'`).join(",")}]::text[], 600, 'none');

-- THE ONLY WRITE. Three columns named; caption and hashtags are not mentioned at all.
update social_posts set
  overlay_template    = '${TO}',
  overlay_headline    = '${esc(buildTemplateHeadline(TO, META))}',
  overlay_subheadline = '${esc(buildTemplateDetail(TO, META))}'
where id = '${SEED}' and status = 'draft';

-- SAVE AND REOPEN: read the row back out of Postgres after the write.
select json_build_object(
  'template', overlay_template, 'headline', overlay_headline, 'subheadline', overlay_subheadline,
  'caption', caption, 'hashtags', hashtags, 'cover', cover_thumb_offset_ms, 'status', status,
  'render', render_status, 'scheduled', scheduled_at
) from social_posts where id = '${SEED}';
select json_build_object('revisions', count(*), 'fields', coalesce(json_agg(distinct changed_fields), '[]'::json))
  from social_revisions where row_id = '${SEED}';
rollback;`
  writeFileSync("/tmp/tmpl_safety.sql", sql)
  const raw = execFileSync("psql", [pooler, "-v", "ON_ERROR_STOP=1", "-At", "-f", "/tmp/tmpl_safety.sql"], { encoding: "utf8" })
  const out = raw.trim().split("\n").filter((l) => l.startsWith("{"))
  // A psql error must stop the test, not fall through to a JSON.parse of "undefined".
  if (out.length < 2) { console.error(`psql returned no result rows:\n${raw}`); process.exit(1) }
  const row = JSON.parse(out[0]) as Record<string, unknown>
  const rev = JSON.parse(out[1]) as { revisions: number; fields: string[][] }

  console.log(`\n── after the write, read back from Postgres ──`)
  console.log(`  template    ${JSON.stringify(row.template)}`)
  console.log(`  headline    ${JSON.stringify(row.headline)}`)
  console.log(`  subheadline ${JSON.stringify(row.subheadline)}`)
  console.log(`  caption md5 ${md5(String(row.caption))}`)

  console.log(`\n── the caption ──`)
  ok("caption is BYTE-IDENTICAL after the template change",
    String(row.caption) === caption, `md5 ${md5(String(row.caption))} vs ${md5(caption)}`)
  ok("hashtags are byte-identical", JSON.stringify(row.hashtags) === JSON.stringify(hashtags))
  ok("the CTA line is untouched",
    String(row.caption).split("\n").slice(-1)[0] === caption.split("\n").slice(-1)[0])

  console.log(`\n── the visual text DID move ──`)
  ok("template changed", row.template === TO)
  ok(`headline is the new template's: ${JSON.stringify(buildTemplateHeadline(TO, META))}`,
    row.headline === buildTemplateHeadline(TO, META))
  ok("detail line matches the new template", row.subheadline === buildTemplateDetail(TO, META))

  console.log(`\n── reopening the editor (resolveLoadedCopy, as PostEditor runs it) ──`)
  const before = resolveLoadedCopy({
    storedCaption: caption, storedHeadline: buildTemplateHeadline(FROM, META), storedHashtags: hashtags,
    meta: META, seed: SEED, template: FROM,
    generatedHeadline: buildTemplateHeadline(FROM, META), generatedHashtags: hashtags,
  })
  const after = resolveLoadedCopy({
    storedCaption: String(row.caption), storedHeadline: String(row.headline), storedHashtags: row.hashtags as string[],
    meta: META, seed: SEED, template: TO,
    generatedHeadline: buildTemplateHeadline(TO, META), generatedHashtags: hashtags,
  })
  ok("the editor displays the SAME caption it displayed before", after.caption === before.caption)
  ok("…and it is still byte-identical to the stored one", after.caption === caption)
  ok("captionDirty is UNCHANGED — provenance was not flipped",
    after.captionDirty === before.captionDirty, `before ${before.captionDirty} → after ${after.captionDirty}`)
  ok("the caption is still GENERATOR-OWNED, not marked manual",
    after.captionDirty === false && isGeneratedCaption(String(row.caption), META, SEED))
  ok("the headline the editor shows is the new one", after.headline === buildTemplateHeadline(TO, META))
  ok("hashtags unchanged on reopen", JSON.stringify(after.hashtags) === JSON.stringify(hashtags))

  console.log(`\n── nothing else moved ──`)
  ok("still a draft", row.status === "draft")
  ok("cover offset still 600ms", row.cover === 600)
  ok("still unrendered", row.render === "none")
  ok("still unscheduled", row.scheduled === null)
  // The revision lists the fields that ACTUALLY changed, which is not always all three: a template
  // with no price produces an empty detail line, and if the previous one was empty too the column
  // never moves. Asserting all three was my error, and it hid the more interesting fact — that
  // wanted_luxury leaves the detail blank rather than inventing a price.
  const expectedChanged = ["overlay_template", "overlay_headline",
    ...(buildTemplateDetail(TO, META) !== buildTemplateDetail(FROM, META) ? ["overlay_subheadline"] : [])].sort()
  ok(`revision captured exactly the fields that changed (${expectedChanged.join(", ")})`,
    rev.revisions === 1 && JSON.stringify(rev.fields[0].slice().sort()) === JSON.stringify(expectedChanged),
    `got ${rev.revisions} revision(s): ${JSON.stringify(rev.fields)}`)
  ok("caption and hashtags are ABSENT from the revision — they were never written",
    !rev.fields[0].includes("caption") && !rev.fields[0].includes("hashtags"))
  console.log(`\n  (the whole transaction was ROLLED BACK — no fixture row and no revision persists)`)

}

for (const sc of SCENARIOS) run(sc)
console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
