// SHARE PIPELINE CONTRACT — the test that would have caught the gray-placeholder
// regression.
//
// What actually happened: lb_create_client_share was rebuilt from a stale migration
// file and its INSERT column list silently lost place_id, google_rating and
// current_special. Nothing failed. Nothing errored. Every client page minted
// afterwards rendered gray placeholders, and it was found by a human looking at a
// phone.
//
// The regression was invisible to every existing test because the damage was in a
// SQL column list, and the symptom was two joins away: the resolver falls back to
// property_catalog for the image, and that fallback is keyed on the place_id the
// mint had stopped recording.
//
// So this asserts the CONTRACT at both ends:
//   1. the authoritative mint SQL still records the canonical identity + the fields
//      the client page depends on
//   2. the resolver still falls back to property_catalog for every field that has a
//      catalog source
//   3. the client component still renders each of those fields
//
// It is deliberately STATIC — no network, no database, runs in CI — because the
// failure mode is a source rewrite, and a source rewrite is exactly what a static
// contract catches. The live half (does real production data still satisfy this?)
// is scripts/share/smokeClientPage.ts.
//
// Run: npx tsx scripts/share/shareContract.test.ts
import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✓ ${l}${d ? ` — ${d}` : ""}`) }
  else { fail++; console.log(`  ✗ ${l}${d ? ` — ${d}` : ""}`) }
}
const ROOT = process.cwd()
const read = (f: string) => readFileSync(path.join(ROOT, f), "utf8")

/**
 * The AUTHORITATIVE definition of a function = the newest file that defines it,
 * across BOTH supabase/migrations and supabase/manual, ordered by filename.
 *
 * This resolution order is itself part of the contract. Picking "newest file in
 * supabase/migrations" is precisely the mistake that caused the regression —
 * supabase/manual held the newer body and was ignored.
 */
function authoritativeBody(fn: string): { file: string; body: string } {
  const files: string[] = []
  for (const d of ["supabase/migrations", "supabase/manual"]) {
    for (const f of readdirSync(path.join(ROOT, d))) if (f.endsWith(".sql")) files.push(path.join(d, f))
  }
  // Sort by BASENAME so the date prefix orders migrations and manual files together.
  files.sort((a, b) => path.basename(a).localeCompare(path.basename(b)))
  let found: { file: string; body: string } | null = null
  for (const rel of files) {
    const src = read(rel)
    const re = new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${fn}\\s*\\(`, "gi")
    let m: RegExpExecArray | null
    while ((m = re.exec(src))) {
      const after = src.slice(m.index)
      const open = after.indexOf("$$")
      const close = after.indexOf("$$", open + 2)
      if (open < 0 || close < 0) continue
      found = { file: rel, body: after.slice(open + 2, close) }
    }
  }
  if (!found) throw new Error(`no definition of ${fn} found in the repo`)
  return found
}

// ── Representative fixture ─────────────────────────────────────────────────
// Modelled on a real production row (Altitude at Brooks) so the field shapes are
// the ones that actually flow, not invented ones.
const FIXTURE = {
  canonicalPropertyKey: "pid:ChIJt50tPlT3XIYRpEb54VDa9eg",
  placeId: "ChIJt50tPlT3XIYRpEb54VDa9eg",
  catalogImage: "https://medialibrarycfo.entrata.com/18735/MLv3/10/41/2026/07/2/photo.webp",
  catalogWebsite: "https://www.altitudeatbrooks.com/",
  googleRating: 5,
  currentSpecial: "Look & Lease: $500 off",
  reasons: ["20 min to Fort Sam", "In your preferred area"],
}

console.log("FIXTURE — the client-facing fields a share must carry end to end:")
for (const [k, v] of Object.entries(FIXTURE)) console.log(`    ${k} = ${JSON.stringify(v)}`)

console.log("\n1. MINT records the canonical identity and the catalog-backed fields:")
{
  const { file, body } = authoritativeBody("lb_create_client_share")
  console.log(`   authoritative: ${file}`)
  const insert = body.slice(body.indexOf("insert into public.client_recommendation_share_items"))
  const columns = insert.slice(insert.indexOf("("), insert.indexOf("select"))

  // THE assertion the regression needed. place_id is the join key every catalog
  // fallback depends on; without it the image, website and special all go dark.
  ok("the snapshot records place_id", /\bplace_id\b/.test(columns))
  ok("the snapshot records google_rating", /\bgoogle_rating\b/.test(columns))
  ok("the snapshot records current_special", /\bcurrent_special\b/.test(columns))
  ok("the snapshot records the presentation fields",
    ["property_name", "property_address", "property_image_url", "property_website_url", "reasons", "sort_order"]
      .every((c) => new RegExp(`\\b${c}\\b`).test(columns)))

  // place_id must be DERIVED from the canonical key, not copied from a column that
  // does not exist on lead_recommendations.
  ok("place_id is derived from the canonical 'pid:' key",
    /substring\(\s*r\.canonical_property_key\s+from\s+'\^pid:/.test(body))
  ok("the mint joins property_catalog for the catalog-backed fields",
    /left join public\.property_catalog/.test(body))
  ok("reasons come from the canonical client-property table",
    /left join public\.lead_property_reasons/.test(body))

  // The column list and the select list must stay the same length, or every value
  // after the misalignment lands in the wrong column.
  const cols = columns.replace(/--[^\n]*/g, "").replace(/[()]/g, "").split(",").map((s) => s.trim()).filter(Boolean)
  ok("column list is non-trivial (guards against a silently truncated INSERT)",
    cols.length >= 11, `${cols.length} columns`)
}

console.log("\n2. RESOLVER falls back to property_catalog for every catalog-backed field:")
{
  const { file, body } = authoritativeBody("lb_resolve_client_recommendations")
  console.log(`   authoritative: ${file}`)
  ok("it joins property_catalog on the snapshot's place_id",
    /left join public\.property_catalog pc on pc\.place_id = i\.place_id/.test(body))
  ok("imageUrl falls back to the catalog",
    /'imageUrl',\s*coalesce\(i\.property_image_url,\s*pc\.property_image_url\)/.test(body))
  ok("websiteUrl falls back to the catalog",
    /'websiteUrl',\s*coalesce\(i\.property_website_url,\s*pc\.website_url\)/.test(body))
  ok("a backup image is offered", /'backupImageUrl',\s*pc\.property_image_url_backup/.test(body))
  ok("currentSpecial falls back to the catalog, freshness-gated",
    /'currentSpecial',\s*coalesce\([\s\S]{0,200}pc\.verified_at/.test(body))
  ok("reasons are carried through", /'reasons',\s*coalesce\(i\.reasons/.test(body))
  ok("favorited state is carried through so a refresh restores the hearts",
    /'favorited',\s*\(i\.favorited_at is not null\)/.test(body))
  // googleRating is snapshot-only TODAY. Asserted as-is so a future change to add a
  // catalog fallback is a deliberate edit here, not a silent drift.
  ok("googleRating is emitted", /'googleRating',\s*i\.google_rating/.test(body))
}

console.log("\n3. The CLIENT COMPONENT still renders each field:")
{
  const list = read("app/locator-beast/r/[token]/RecommendationList.tsx")
  ok("image, with backup then neutral fallback",
    /src=\{p\.imageUrl\}/.test(list) && /data-backup=\{p\.backupImageUrl/.test(list))
  ok("google rating", /p\.googleRating/.test(list) && /Google Rating/.test(list))
  ok("current special", /normalizeShortSpecial\(p\.currentSpecial\)/.test(list))
  ok("why I chose this for you", /Why I chose this for you/.test(list) && /p\.reasons/.test(list))
  ok("visit property", /View Property/.test(list) && /p\.websiteUrl/.test(list))
  ok("favorite toggle posts to the token-scoped route",
    /fetch\("\/api\/r\/favorite"/.test(list) && /favorited: next/.test(list))
  ok("favorite state seeds from the resolver payload (survives refresh)",
    /properties\.filter\(\(p\) => p\.favorited\)/.test(list))
}

console.log("\n4. The canonical identity is generated, not hand-maintained:")
{
  const files = readdirSync(path.join(ROOT, "supabase/migrations")).filter((f) => f.endsWith(".sql"))
  const gen = files.map((f) => read(path.join("supabase/migrations", f)))
    .find((s) => /canonical_property_key[\s\S]{0,200}generated always as/.test(s))
  ok("lead_recommendations.canonical_property_key is a GENERATED column", !!gen)
  ok("and it is the 'pid:<place id>' shape the mint slices", !!gen && /'pid:'/.test(gen))
}

console.log(`\nShare contract: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
