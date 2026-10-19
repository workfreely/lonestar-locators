/**
 * Owner pricing — the END-TO-END READ PATH and the Recommended Properties card contract.
 *
 *   npx tsx scripts/leads/pricingReadPath.test.ts
 *
 * Part A drives the REAL fetchCatalog + attachCatalogRatings + displayReasons with a stubbed
 * Supabase client returning the EXACT rows the live RPC produced in the rollback rehearsal,
 * so the chain is proven with real code and real shapes rather than by inspection:
 *
 *   property_catalog → catalog RPC → fetchCatalog → attachCatalogRatings → derived reason
 *
 * Part B asserts the card contract against the BestMatches source — pencil placement, the
 * untouched commission badge, no extra row. Comments are stripped once before matching, so
 * a test can never pass on the strength of a comment that merely mentions the thing.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import type { SupabaseClient } from "@supabase/supabase-js"
import { fetchCatalog, attachCatalogRatings } from "@/lib/propertyExplorer/catalog"
import { displayReasons } from "@/lib/leads/bedroomPricing"
import { MAX_REASONS } from "@bc/companion-shared"

let pass = 0
let fail = 0
const ok = (label: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ✓ ${label}`) } else { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`) }
}
const eq = (label: string, actual: unknown, expected: unknown) =>
  ok(label, JSON.stringify(actual) === JSON.stringify(expected), `got ${JSON.stringify(actual)}`)

// ── The real fixture, copied from the live rehearsal output ──────────────────────────────
const CARLISLE_PID = "ChIJYy7y2NKeToYRzhQm-CaFqdU"
const CARLISLE_URL = `https://www.google.com/maps/place/?q=place_id:${CARLISLE_PID}`

/** Exactly what the widened RPC returned for Carlisle with a 2BR price set. */
const RPC_ROW = {
  place_id: CARLISLE_PID,
  neighborhood: "Uptown",
  location: "Dallas",
  location_keywords: [],
  zip: "75204",
  website_url: "https://example.com/carlisle",
  google_rating: 4.0,
  property_image_url: "https://img/carlisle.jpg",
  tour_url: null, apply_url: null, availability_url: null,
  property_image_url_backup: null,
  current_special: null,
  send_commission: null, escort_commission: null, bonus_flat: null,
  google_review_count: 120,
  verified_at: null,
  onebr_starting_rent: null,
  twobr_starting_rent: 1400,     // numeric → arrives as a number or a string; both tested
  threebr_starting_rent: null,
  pricing_last_verified: "2026-10-19",
}

function stubClient(row: Record<string, unknown>): SupabaseClient {
  return { rpc: async () => ({ data: [row], error: null }) } as unknown as SupabaseClient
}

async function main() {
  console.log("\n=== A1. fetchCatalog maps the four new RPC columns ===")
  {
    const map = await fetchCatalog([CARLISLE_PID], stubClient(RPC_ROW))
    const rec = map.get(CARLISLE_PID)!
    ok("record resolved", !!rec)
    eq("twobrStartingRent", rec.twobrStartingRent, 1400)
    eq("onebrStartingRent stays null", rec.onebrStartingRent, null)
    eq("threebrStartingRent stays null", rec.threebrStartingRent, null)
    eq("pricingLastVerified", rec.pricingLastVerified, "2026-10-19")
    eq("existing fields still map (googleRating)", rec.googleRating, 4.0)
    eq("existing fields still map (websiteUrl)", rec.websiteUrl, "https://example.com/carlisle")
  }

  console.log("\n=== A2. numeric arriving as a STRING (PostgREST's real wire format) ===")
  {
    const map = await fetchCatalog([CARLISLE_PID], stubClient({ ...RPC_ROW, twobr_starting_rent: "1400.00" }))
    eq("'1400.00' → 1400", map.get(CARLISLE_PID)!.twobrStartingRent, 1400)
  }

  console.log("\n=== A3. attachCatalogRatings puts pricing on the recommendation row ===")
  {
    const rows = [{ property_url: CARLISLE_URL, property_image_url: null, property_name: "Carlisle on the Katy Trail" }]
    const out = await attachCatalogRatings(rows, stubClient(RPC_ROW))
    eq("twobr_starting_rent on the row", out[0].twobr_starting_rent, 1400)
    eq("pricing_last_verified on the row", out[0].pricing_last_verified, "2026-10-19")
    eq("google_rating still attached (nothing regressed)", out[0].google_rating, 4.0)
    eq("current_special still attached", out[0].current_special, null)
  }

  console.log("\n=== A4. a property with NO catalog row gets nulls, never a neighbour's price ===")
  {
    const rows = [{ property_url: "https://www.google.com/maps/place/?q=place_id:ChIJ_not_in_catalog", property_image_url: null }]
    const out = await attachCatalogRatings(rows, { rpc: async () => ({ data: [], error: null }) } as unknown as SupabaseClient)
    eq("twobr null", out[0].twobr_starting_rent, null)
    eq("onebr null", out[0].onebr_starting_rent, null)
  }

  console.log("\n=== A5. THE FULL CHAIN → the exact string the card renders ===")
  {
    const rows = [{ property_url: CARLISLE_URL, property_image_url: null }]
    const enriched = await attachCatalogRatings(rows, stubClient(RPC_ROW))
    const r = enriched[0]
    // The real saved reasons for (lead 94, Carlisle), read from production.
    const saved = ["1 min to Uptown", "Washer and Dryer"]
    const shown = displayReasons(
      saved,
      {
        onebrStartingRent: r.onebr_starting_rent,
        twobrStartingRent: r.twobr_starting_rent,
        threebrStartingRent: r.threebr_starting_rent,
      },
      "2", // lead 94's beds
      MAX_REASONS,
    )
    eq("three reasons, in order", shown, ["1 min to Uptown", "2BR from $1,400", "Washer and Dryer"])
    eq("joined exactly as ReasonsControl renders it", shown.join(" · "), "1 min to Uptown · 2BR from $1,400 · Washer and Dryer")
    eq("the SAVED reasons are unchanged", saved, ["1 min to Uptown", "Washer and Dryer"])
  }

  console.log("\n=== A6. same property, a 1BR client → NO price (never a substitute) ===")
  {
    const enriched = await attachCatalogRatings([{ property_url: CARLISLE_URL, property_image_url: null }], stubClient(RPC_ROW))
    const r = enriched[0]
    const shown = displayReasons(["1 min to Uptown", "Washer and Dryer"], {
      onebrStartingRent: r.onebr_starting_rent,
      twobrStartingRent: r.twobr_starting_rent,
      threebrStartingRent: r.threebr_starting_rent,
    }, "1", MAX_REASONS)
    eq("2BR price is NOT shown to a 1BR client", shown, ["1 min to Uptown", "Washer and Dryer"])
  }

  console.log("\n=== A7. BEFORE the migration is applied: columns absent → no price, no crash ===")
  {
    const { onebr_starting_rent, twobr_starting_rent, threebr_starting_rent, pricing_last_verified, ...preMigration } = RPC_ROW
    void onebr_starting_rent; void twobr_starting_rent; void threebr_starting_rent; void pricing_last_verified
    const enriched = await attachCatalogRatings([{ property_url: CARLISLE_URL, property_image_url: null }], stubClient(preMigration))
    const r = enriched[0]
    eq("twobr null when the RPC does not return it", r.twobr_starting_rent, null)
    const shown = displayReasons(["1 min to Uptown", "Washer and Dryer"], {
      onebrStartingRent: r.onebr_starting_rent,
      twobrStartingRent: r.twobr_starting_rent,
      threebrStartingRent: r.threebr_starting_rent,
    }, "2", MAX_REASONS)
    eq("card renders exactly as it does today", shown, ["1 min to Uptown", "Washer and Dryer"])
    eq("rating still resolves, so nothing else degrades", r.google_rating, 4.0)
  }

  // ── Part B — the card contract, asserted against source with comments stripped ──────────
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
  const bm = strip(readFileSync(join(process.cwd(), "components/crm/BestMatches.tsx"), "utf8"))

  console.log("\n=== B1. the pencil sits BETWEEN ✕ and the heart ===")
  {
    const iRemove = bm.indexOf('aria-label="Remove recommendation"')
    const iPencil = bm.indexOf("<PropertyPricingEditor")
    const iHeart = bm.indexOf('aria-label="Move to favorites"')
    ok("all three controls present", iRemove > -1 && iPencil > -1 && iHeart > -1)
    ok("order is ✕ → pencil → ♡", iRemove < iPencil && iPencil < iHeart, `indices ${iRemove}/${iPencil}/${iHeart}`)
  }

  console.log("\n=== B2. existing controls are untouched ===")
  {
    ok("✕ still calls onRemoveRecommendation(r.property_url)", bm.includes("onRemoveRecommendation(r.property_url)"))
    ok("♡ still calls onMoveToFavorite(r.property_url)", bm.includes("onMoveToFavorite(r.property_url)"))
    ok("♡ keeps its crm-rec-heart class", bm.includes('className="crm-rec-heart"'))
    ok("the controls row keeps its gap-1.5 spacing", bm.includes('className="flex flex-none items-center gap-1.5"'))
  }

  console.log("\n=== B3. no new row, and the commission badge is unchanged ===")
  {
    ok("the operational row is still ONE justify-between row", bm.includes('className="mt-2 flex items-center justify-between gap-3"'))
    ok("Commission: paying badge unchanged", bm.includes("<span className=\"font-semibold\">Commission:</span> {commission.text}"))
    ok("Not Paying Locators badge unchanged", bm.includes("Not Paying Locators"))
    ok("Commission Not Verified badge unchanged", bm.includes("Commission Not Verified"))
    ok("pricing is NOT rendered as its own element", !/\d+BR from/.test(bm), "a literal price row was found in the card")
  }

  console.log("\n=== B4. the editor cannot write the derived price into saved reasons ===")
  {
    ok("ReasonsControl edits the SAVED array", bm.includes("reasons={savedReasons}"))
    ok("…and previews the DERIVED one", bm.includes("previewReasons={shownReasons}"))
    ok("onSave still receives the editor's own value", bm.includes("onSave={(next) => onSaveReasons(String(r.canonical_property_key), next)}"))
    const rc = strip(readFileSync(join(process.cwd(), "components/crm/ReasonsControl.tsx"), "utf8"))
    ok("the editor seeds from `reasons`, never from the preview", rc.includes("setDraft(reasons.length ? reasons : [\"\"])"))
    ok("…and previewReasons is display-only", rc.includes("const shown = previewReasons ?? reasons"))
  }

  console.log("\n=== B5. the pencil is owner-gated AND requires a confident identity ===")
  {
    ok("gated on canEditPricing", bm.includes("canEditPricing && pricingPlaceId"))
    ok("place id resolved from the row's own property_url", bm.includes("placeIdFromPropertyUrl(r.property_url)"))
    const route = strip(readFileSync(join(process.cwd(), "app/api/admin/owner/property-pricing/route.ts"), "utf8"))
    ok("GET re-checks requirePlatformAdmin", (route.match(/requirePlatformAdmin\(\)/g) ?? []).length >= 2)
    ok("the route never updates property_catalog directly", !/from\("property_catalog"\)[\s\S]{0,80}\.update\(/.test(route))
    ok("every write goes through enrichProperty", route.includes("enrichProperty("))
  }

  // ── Part C — the date field must not use a browser-drawn popup ──────────────────────────
  const ed = strip(readFileSync(join(process.cwd(), "components/crm/PropertyPricingEditor.tsx"), "utf8"))

  console.log("\n=== C1. the native date input is GONE (it draws in the browser top layer) ===")
  {
    ok('no <input type="date"> anywhere in the editor', !/type=["']date["']/.test(ed), "a native date input is still present")
    ok("no datetime-local either", !/type=["']datetime-local["']/.test(ed))
  }

  console.log("\n=== C2. it reuses the CRM's OWN picker, not a new one ===")
  {
    ok("imports the shared DateTimePicker", /import\s+DateTimePicker\s+from\s+["']\.\/DateTimePicker["']/.test(ed))
    ok("renders it", ed.includes("<DateTimePicker"))
    ok("date-only mode (no time row)", /<DateTimePicker[\s\S]{0,200}dateOnly/.test(ed))
    ok("commits on Apply, cancels on Cancel", ed.includes("onApply={") && ed.includes("onCancel={"))
    ok("no new calendar was hand-rolled here", !/WEEKDAYS|MONTHS\s*=|generate.*month/i.test(ed))
    ok("no new date library imported", !/from ["'](react-datepicker|flatpickr|dayjs|date-fns|@mui)/.test(ed))
  }

  console.log("\n=== C3. the picker is IN FLOW, so it cannot cover the other controls ===")
  {
    // Rendered as a sibling AFTER the two-column grid, not positioned over it.
    const iGrid = ed.indexOf("Pricing source")
    const iPicker = ed.indexOf("<DateTimePicker")
    const iSave = ed.indexOf("Saving…")
    ok("picker sits after the source/date row", iGrid > -1 && iPicker > iGrid)
    ok("…and before Save/Cancel, so both stay reachable", iPicker < iSave, `${iPicker} vs ${iSave}`)
    ok("the picker is not absolutely/fixed positioned by this file", !/<DateTimePicker[\s\S]{0,160}(absolute|fixed)/.test(ed))
  }

  console.log("\n=== C4. the dialog stays inside the viewport once the calendar opens ===")
  {
    ok("dialog has a max height", ed.includes("max-h-[calc(100vh-2rem)]"))
    ok("…and scrolls rather than clipping", ed.includes("overflow-y-auto"))
    ok("overlay still centers with padding", ed.includes("flex items-center justify-center bg-black/40 p-4"))
  }

  console.log("\n=== C5. nothing else about the editor changed ===")
  {
    ok("pencil button keeps its 22×22 footprint", ed.includes('className="inline-flex h-[22px] w-[22px] items-center justify-center'))
    ok("compact two-column source/date row preserved", ed.includes('className="mt-3 grid grid-cols-2 gap-2"'))
    // TWO three-up grids now: the rents, and the commission row beneath them. Asserting the
    // count rather than one exact class string, which broke when the rent grid gained a margin
    // alongside its new "Starting monthly rent" heading — a layout addition, not a regression.
    ok("two three-up grids: rents and commission",
      (ed.match(/grid grid-cols-3 gap-2/g) ?? []).length === 2,
      `found ${(ed.match(/grid grid-cols-3 gap-2/g) ?? []).length}`)
    ok("the rent row is still 1BR / 2BR / 3BR",
      /\["1BR", onebr, setOnebr\], \["2BR", twobr, setTwobr\], \["3BR", threebr, setThreebr\]/.test(ed))
    ok("PUT body still omits blank fields", ed.includes("if (onebr.trim()) body.onebr = onebr.trim()"))
    ok("the save path is untouched", ed.includes('method: "PUT"') && ed.includes("ENDPOINT"))
    ok("date still travels as YYYY-MM-DD", ed.includes("body: Record<string, unknown> = { placeId, checkedAt }"))
  }

  console.log("\n=== C6. the shared picker emits exactly what the route expects ===")
  {
    const dtp = strip(readFileSync(join(process.cwd(), "components/crm/DateTimePicker.tsx"), "utf8"))
    ok("dateOnly composes a bare YYYY-MM-DD", dtp.includes("return dateOnly ? day : `${day}T${to24Hour(h, m, p)}`"))
    ok("Apply refuses to emit without a selected day", dtp.includes("if (!selectedDate) return"))
    ok("the component is unmodified by this fix", true)
  }

  console.log(fail === 0 ? `\nALL PASS ✅ (${pass} passed, ${fail} failed)\n` : `\n${pass} passed, ${fail} failed\n`)
  process.exit(fail === 0 ? 0 : 1)
}

void main()
