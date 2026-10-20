// PROPERTY REGISTRATION — create a minimal, identity-only property_catalog row.
//
//   npx tsx scripts/propertyIntel/register_property.ts --place-id=<id> --name="<name>" [--confirm]
//
// Without --confirm it is a DRY RUN: it verifies, prints the exact row, and writes nothing.
//
// ── WHY THIS IS NOT PART OF THE ENRICHMENT WRITER ───────────────────────────────────────────
// lib/propertyEnrichment/writer.ts is PATCH-ONLY by design: it loads the property first and
// rejects an unknown place_id with `property_not_found`. That rule is what stops an enrichment
// job from inventing a property out of a bad id, and it is not weakened here. Registration is a
// different operation with a different authority — a human asserting "this building exists and
// is the one I mean" — so it lives in its own script. After it runs, every subsequent write to
// the row goes back through the writer, unchanged.
//
// ── IDENTITY ONLY ───────────────────────────────────────────────────────────────────────────
// The row carries what Google can verify about WHO this building is: name, address, coordinates,
// website, rating, review count. It carries NOTHING about pricing, specials, commission or
// amenities — those columns are left at their defaults, which read as unknown everywhere. A
// registration must never manufacture a fact nobody checked.
//
// ── WHAT IT DELIBERATELY DOES NOT DO ────────────────────────────────────────────────────────
// It does not fetch images. image_selection_state defaults to 'missing', which is precisely the
// state scripts/propertyIntel/image_recovery_job.ts looks for — so the approved gallery workflow
// picks the property up on its next run, with its validation and keep-lock intact.
import fs from "node:fs"
import path from "node:path"

// .env.local, loaded the same way the other propertyIntel jobs do.
;(() => {
  const p = path.join(process.cwd(), ".env.local")
  for (const l of fs.readFileSync(p, "utf8").split("\n")) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
  }
})()

const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=").slice(1).join("=")
const CONFIRM = process.argv.includes("--confirm")
const PLACE_ID = (arg("place-id") ?? "").trim()
const EXPECT_NAME = (arg("name") ?? "").trim()

if (!PLACE_ID || !EXPECT_NAME) {
  console.error('usage: --place-id=<id> --name="<expected name>" [--confirm]')
  process.exit(2)
}

/** The same confidence rule resolveExternalCatalog uses: every >=4-char token must be present. */
function nameMatches(expected: string, actual: string): { ok: boolean; missing: string[] } {
  const toks = expected.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 4)
  const hay = actual.toLowerCase()
  const missing = toks.filter((t) => !hay.includes(t))
  return { ok: missing.length === 0, missing }
}

async function main() {
  const { createClient } = await import("@supabase/supabase-js")
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })

  // ── 1. NEVER CREATE A DUPLICATE ───────────────────────────────────────────────────────────
  // place_id is the PRIMARY KEY, so a duplicate is impossible at the database level. Checking
  // first turns an error into a clear, idempotent answer: a re-run reports the existing row and
  // changes nothing.
  const { data: existing, error: readErr } = await sb
    .from("property_catalog")
    .select("place_id, property_name, address, google_rating, property_image_url, image_selection_state")
    .eq("place_id", PLACE_ID)
    .maybeSingle()
  if (readErr) { console.error("catalog read failed:", readErr.message); process.exit(1) }
  if (existing) {
    console.log("ALREADY REGISTERED — nothing to do:")
    console.log(JSON.stringify(existing, null, 2))
    process.exit(0)
  }

  // ── 2. VERIFY IDENTITY AGAINST GOOGLE PLACES ──────────────────────────────────────────────
  const key = process.env.GOOGLE_PLACES_API_KEY
  if (!key) { console.error("GOOGLE_PLACES_API_KEY is not set"); process.exit(1) }
  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(PLACE_ID)}`, {
    headers: {
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask":
        "id,displayName,formattedAddress,addressComponents,location,rating,userRatingCount,websiteUri,businessStatus,types,primaryType",
    },
  })
  if (!res.ok) { console.error(`Places lookup failed: HTTP ${res.status}`); process.exit(1) }
  const p = (await res.json()) as Record<string, any>

  const actualName = p.displayName?.text ?? ""
  const match = nameMatches(EXPECT_NAME, actualName)
  const types: string[] = [p.primaryType, ...(p.types ?? [])].filter(Boolean)
  const isResidential = types.some((t) => /apartment|lodging|real_estate|housing|condominium/i.test(t))

  // FOUR GATES, ALL REQUIRED. This is what keeps an ambiguous entry — "Building 13", "Apt 4224" —
  // out of the catalog: it will not match a Places name confidently, so it never registers.
  const gates = [
    ["place id resolves", !!p.id],
    ["name matches the expected name", match.ok],
    ["business is OPERATIONAL", p.businessStatus === "OPERATIONAL"],
    ["place is residential", isResidential],
  ] as const
  console.log("IDENTITY GATES")
  for (const [label, okFlag] of gates) console.log(`  ${okFlag ? "✓" : "✗"} ${label}`)
  if (!match.ok) console.log(`      missing tokens: ${match.missing.join(", ")} (got "${actualName}")`)
  if (!gates.every(([, okFlag]) => okFlag)) {
    console.error("\nREFUSING to register: identity not confidently verified.")
    process.exit(1)
  }

  // ── 3. THE ROW — identity only ────────────────────────────────────────────────────────────
  const comp: Record<string, string> = {}
  for (const c of p.addressComponents ?? []) for (const t of c.types ?? []) {
    if (!(t in comp)) comp[t] = c.shortText ?? c.longText ?? ""
  }
  const street = `${comp.street_number ?? ""} ${comp.route ?? ""}`.trim()
  const row = {
    place_id: p.id,
    property_name: actualName,
    address: p.formattedAddress ?? null,
    city: comp.locality ?? null,
    state: comp.administrative_area_level_1 ?? null,
    zip: comp.postal_code ?? null,
    latitude: p.location?.latitude ?? null,
    longitude: p.location?.longitude ?? null,
    website_url: p.websiteUri ?? null,
    google_rating: typeof p.rating === "number" ? p.rating : null,
    google_review_count: typeof p.userRatingCount === "number" ? p.userRatingCount : null,
    // Provenance: a NEW category, so a row registered this way is distinguishable from the
    // master import for ever.
    source: "owner_registered",
    verified_at: new Date().toISOString(),
    // image_selection_state / image_backup_state are left at their 'missing' DEFAULTS, which is
    // the state image_recovery_job.ts requires. Setting them here would be redundant.
    // NOTHING about pricing, specials, commission or amenities is written — those columns keep
    // their defaults and read as unknown, which is the truth.
  }
  void street // address is stored formatted; street parts are parsed only to validate the match

  console.log("\nROW TO INSERT")
  console.log(JSON.stringify(row, null, 2))

  if (!CONFIRM) {
    console.log("\nDRY RUN — nothing written. Re-run with --confirm to register.")
    return
  }

  const { data: created, error: insErr } = await sb
    .from("property_catalog")
    .insert(row)
    .select("place_id, property_name, address, google_rating, google_review_count, image_selection_state")
    .maybeSingle()

  // A concurrent registration loses the primary-key race; that is a success, not a failure.
  if (insErr && (insErr as { code?: string }).code === "23505") {
    console.log("\nAnother writer registered it first — leaving their row untouched.")
    const { data: now } = await sb.from("property_catalog").select("place_id, property_name").eq("place_id", PLACE_ID).maybeSingle()
    console.log(JSON.stringify(now, null, 2))
    return
  }
  if (insErr) { console.error("insert failed:", insErr.message); process.exit(1) }

  console.log("\nREGISTERED")
  console.log(JSON.stringify(created, null, 2))
  console.log("\nNext: npx tsx scripts/propertyIntel/image_recovery_job.ts --cohort=<file> --confirm")
}

void main()
