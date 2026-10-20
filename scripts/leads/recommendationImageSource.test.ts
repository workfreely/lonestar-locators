/**
 * THE IMAGE ON A RECOMMENDATION — resolved from the catalog, not copied into the row.
 *
 *   npx tsx scripts/leads/recommendationImageSource.test.ts
 *
 * The bug this pins: The Jade at Frisco kept showing an arcade-room photograph for hours after
 * its catalog image had been replaced with an approved courtyard shot. Nothing was cached. The
 * add path had copied the catalog's image into lead_recommendations.property_image_url at ADD
 * time, and the read path prefers a row's own image over the catalog's — so the row went on
 * asserting a photo the catalog had already retired.
 *
 * Two rules, and the second is the reason the first is narrow:
 *   • a property with a Google place id is OWNED by property_catalog → store no copy
 *   • a property without one was pasted or detected externally → keep its own image, because
 *     nothing else knows what it looks like
 *
 * Favorites are deliberately untouched: the row-first rule in the resolver exists for them.
 */
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { execFileSync } from "node:child_process"
import { placeIdFromPropertyUrl } from "@/lib/propertyExplorer/types"

let pass = 0
let fail = 0
const ok = (label: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ✓ ${label}`) } else { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`) }
}
const eq = (label: string, a: unknown, b: unknown) =>
  ok(label, JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`)
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
const read = (p: string) => strip(readFileSync(join(process.cwd(), p), "utf8"))
const raw = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/** The rule as the add path applies it, stated here so it can be exercised directly. */
const storedImage = (propertyUrl: string | null, incomingImage: string | null): string | null =>
  placeIdFromPropertyUrl(propertyUrl) ? null : incomingImage

const PLACE_URL = "https://www.google.com/maps/place/?q=place_id:ChIJexhrTlkXTIYRXVhpiUlgSo8"
const CATALOG_IMG = "https://resource.rentcafe.com/image/upload/q_auto,f_auto,c_limit,w_2400/s3/2/11269/16220-phoebe-rd-frisco-tx-75035-4-high-res-18.jpg"
const PASTED_IMG = "https://example-apartments.com/photos/hero.jpg"

console.log("\n=== 1. A CATALOG-RESOLVED PROPERTY STORES NO IMAGE ===")
{
  eq("a Google place id → nothing stored", storedImage(PLACE_URL, CATALOG_IMG), null)
  eq("…even when the incoming image is some other URL", storedImage(PLACE_URL, PASTED_IMG), null)
  eq("…and when there is no incoming image at all", storedImage(PLACE_URL, null), null)
  ok("the place id is what decides", placeIdFromPropertyUrl(PLACE_URL) === "ChIJexhrTlkXTIYRXVhpiUlgSo8")
}

console.log("\n=== 2. AN EXTERNAL PROPERTY KEEPS ITS OWN IMAGE ===")
{
  eq("a pasted site URL keeps its image", storedImage("https://example-apartments.com/the-grove", PASTED_IMG), PASTED_IMG)
  eq("no property URL at all keeps its image", storedImage(null, PASTED_IMG), PASTED_IMG)
  eq("an empty URL keeps its image", storedImage("", PASTED_IMG), PASTED_IMG)
  eq("an external property with no image stores none", storedImage("https://example-apartments.com/x", null), null)
  ok("a non-place URL yields no place id", placeIdFromPropertyUrl("https://example-apartments.com/the-grove") === null)
}

console.log("\n=== 3. THE ADD PATH APPLIES IT, AND ONLY TO RECOMMENDATIONS ===")
{
  const dc = read("components/crm/DashboardClient.tsx")
  ok("recRow nulls the image for a place-id property",
    /const recRow = \{[\s\S]{0,200}property_image_url: placeIdFromPropertyUrl\(rowBase\.property_url\) \? null : rowBase\.property_image_url/.test(dc))
  // rowBase is shared with Favorites, so the rule must NOT live there.
  ok("rowBase itself is unchanged — Favorites keep their own image",
    /const rowBase = \{[\s\S]{0,420}property_image_url: \(p\?\.propertyImageUrl \?\? sourceRow\?\.property_image_url\) \?\? null,/.test(dc))
  ok("the Favorites insert still sends rowBase as it stands",
    /from\("lead_favorites"\)\s*\.insert\(\[rowBase\]\)/.test(dc))
  ok("the Recommendations insert sends recRow",
    /from\("lead_recommendations"\)\s*\.upsert\(\[recRow\]/.test(dc))
}

console.log("\n=== 4. THE RESOLVER IS UNTOUCHED ===")
{
  const cat = read("lib/propertyExplorer/catalog.ts")
  ok("row-first precedence still stands, for the external case it exists for",
    /property_image_url: ownImage \?\? rec\?\.imageUrl \?\? null/.test(cat))
  ok("the catalog remains the source for rating and special",
    /google_rating: rec\?\.googleRating \?\? null/.test(cat) && /current_special: rec\?\.currentSpecial \?\? null/.test(cat))
}

console.log("\n=== 5. NOTHING ELSE MOVED ===")
{
  const dc = read("components/crm/DashboardClient.tsx")
  const block = dc.slice(dc.indexOf("const recRow"), dc.indexOf("const applyLocal"))
  for (const forbidden of ["send_commission", "escort_commission", "bonus_flat", "current_special",
    "lead_property_reasons", "crm_status", "property_catalog", "client_recommendation_share"]) {
    ok(`the add path's image rule never touches ${forbidden}`, !block.includes(forbidden))
  }
  ok("the row's other captured fields are unchanged",
    /rent_min: recRentMin, rent_max: recRentMax, special: recSpecial, reasons: recReasons/.test(dc))
}

console.log("\n=== 6. THE LIVE DATA AGREES ===")
{
  const urls = ["supabase/.temp/pooler-url",
    "/Users/jaymorris/Desktop/Lone Star Locators Master/lonestar-locators-app/supabase/.temp/pooler-url"]
  const urlPath = urls.find((p) => existsSync(p))
  if (!urlPath) {
    console.log("  … skipped: no pooler-url (pure sections still ran)")
  } else {
    const url = readFileSync(urlPath, "utf8").trim()
    const q = (sql: string) => execFileSync("psql", [url, "-At", "-c", sql], { encoding: "utf8", timeout: 60_000 }).trim()
    try {
      // The row that started this: its copy is cleared and it resolves to the catalog.
      const jade = q("select coalesce(r.property_image_url,'NULL')||'|'||coalesce(right(pc.property_image_url,22),'-') " +
        "from public.lead_recommendations r left join public.property_catalog pc " +
        "on pc.place_id = nullif(substring(r.canonical_property_key from '^pid:(.*)$'),'') where r.id=112;")
      const [own, cat] = jade.split("|")
      ok("row 112 stores no image copy", own === "NULL", own)
      ok("…and resolves to the replacement photo", cat.includes("high-res-18"), cat)

      // No place-id row anywhere is still pinned to a stale copy.
      const stale = q("select count(*) from public.lead_recommendations r " +
        "join public.property_catalog pc on pc.place_id = nullif(substring(r.canonical_property_key from '^pid:(.*)$'),'') " +
        "where r.property_image_url is not null and pc.property_image_url is not null " +
        "and r.property_image_url <> pc.property_image_url;")
      ok("no recommendation row disagrees with its catalog image", stale === "0", `${stale} still differ`)

      // Historical snapshots are untouched by any of this. NOT asserted as a row count —
      // that grows every time a list is sent, and a count would fail on the next send while
      // proving nothing. What matters is that frozen images survived INDEPENDENTLY of the
      // live rows whose copies were cleared.
      const independent = q("select count(*) from public.client_recommendation_share_items i " +
        "join public.lead_recommendations r on r.id = i.source_recommendation_id " +
        "where i.property_image_url is not null and r.property_image_url is null;")
      ok(`frozen images outlived the cleared row copies (${independent} items)`, Number(independent) >= 9, independent)

      // The Jade's own pre-fix snapshots: still present, still carrying one single image.
      const jadeSnaps = q("select count(*)||'/'||count(distinct property_image_url) " +
        "from public.client_recommendation_share_items " +
        "where source_recommendation_id = 112 and property_image_url is not null;")
      const [kept, distinct] = jadeSnaps.split("/")
      ok(`row 112's sent lists kept their frozen photo (${kept} items)`, Number(kept) >= 9, kept)
      ok("…and all of them froze the same one", distinct === "1", distinct)

      // A snapshot taken AFTER the fix holds no copy, because the row holds none. That is only
      // safe because the resolver coalesces to the catalog — so the client still sees a photo,
      // and sees the CURRENT approved one. This is the hinge the whole change rests on.
      const resolver = q("select pg_get_functiondef(oid) from pg_proc where proname = 'lb_resolve_client_recommendations';")
      ok("the resolver falls back to the catalog image when the snapshot has none",
        /'imageUrl',\s*coalesce\(i\.property_image_url,\s*pc\.property_image_url\)/.test(resolver))
    } catch (e) {
      console.log(`  … skipped: psql unavailable (${(e as Error).message.split("\n")[0]})`)
    }
  }
}

console.log(fail === 0 ? `\nALL PASS ✅ (${pass} passed, ${fail} failed)\n` : `\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
