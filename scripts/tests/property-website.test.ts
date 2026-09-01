/**
 * Property website URL — the "Visit Website" path on Explorer cards. No network:
 *   npx tsx scripts/tests/property-website.test.ts
 *
 * The only website source is the curated property_catalog.website_url, attached
 * by enrichProperties. Covers: a verified URL flows onto the property, a null URL
 * leaves it null, an uncatalogued property is unchanged, and a source-level check
 * that the card renders the link with target="_blank" only when a URL exists and
 * fires no request on hover or click.
 */
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { enrichProperties, type CatalogRecord } from "@/lib/propertyExplorer/catalog"
import type { ExplorerProperty } from "@/lib/propertyExplorer/types"

let pass = 0,
  fail = 0
function ok(cond: boolean, name: string) {
  if (cond) pass++
  else {
    fail++
    console.error("✗", name)
  }
}
const eq = (a: unknown, b: unknown, name: string) => ok(a === b, `${name} (got ${JSON.stringify(a)})`)

const prop = (placeId: string): ExplorerProperty => ({
  placeId,
  propertyId: placeId,
  propertyName: "Example",
  propertyAddress: null,
  propertyUrl: `https://maps.google/${placeId}`,
  lat: 0,
  lng: 0,
  source: "google_places",
  marketSlug: null,
  searchCenter: null,
})
const rec = (websiteUrl: string | null): CatalogRecord => ({
  neighborhood: null,
  location: null,
  locationKeywords: [],
  zip: null,
  websiteUrl,
})

// ── enrichProperties wires the verified website URL onto the property ─────────
{
  const catalog = new Map([["A", rec("https://us1604.com/")]])
  const [p] = enrichProperties([prop("A")], catalog)
  eq(p.websiteUrl, "https://us1604.com/", "verified website_url flows onto the property")
}

// ── A catalogued row with no website leaves websiteUrl null (button hidden) ────
{
  const catalog = new Map([["A", rec(null)]])
  const [p] = enrichProperties([prop("A")], catalog)
  eq(p.websiteUrl, null, "null website_url → websiteUrl null (no Visit Website)")
}

// ── An uncatalogued property is returned unchanged (no fabricated URL) ─────────
{
  const catalog = new Map([["OTHER", rec("https://example.com/")]])
  const [p] = enrichProperties([prop("A")], catalog)
  eq(p.websiteUrl, undefined, "no catalog row → websiteUrl absent, never invented")
}

// ── Card renders the link correctly and fires no request on hover/click ───────
{
  const here = dirname(fileURLToPath(import.meta.url))
  const src = readFileSync(
    resolve(here, "../../components/crm/explorer/BeastPropertyExplorer.tsx"),
    "utf8",
  )
  ok(/card\.websiteUrl &&/.test(src), "Visit Website is guarded by card.websiteUrl (omitted when absent)")
  ok(/href=\{card\.websiteUrl\}/.test(src), "link href is the property's own websiteUrl")
  ok(/target="_blank"/.test(src), "link opens in a new tab (target=_blank)")
  ok(/rel="noopener noreferrer"/.test(src), "link carries rel=noopener noreferrer")
  // The hover/click handlers set local state only — no fetch, no Places call.
  ok(/mouseenter", \(\) => setHovered\(p\)\)/.test(src), "hover only sets local state (no request)")
  ok(!/onMouseEnter[\s\S]*fetch\(/.test(src), "no fetch introduced on hover")
  const cardBlock = src.slice(src.indexOf("{card && ("))
  ok(!/fetch\(/.test(cardBlock) && !/searchNearby\(/.test(cardBlock), "card render issues no fetch / Places call")
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
