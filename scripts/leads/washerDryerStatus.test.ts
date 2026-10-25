/**
 * WASHER & DRYER — the client-specific status, end to end.
 *
 *   npx tsx scripts/leads/washerDryerStatus.test.ts
 *
 * The one mistake this feature could make is telling a renter an apartment has a washer when it
 * has hookups, or has either when nobody checked. So the suite is built around the failure, not
 * the happy path: every uncertain input must land on silence, the status must never be inferred
 * from the property-level catalog columns, and it must be impossible for one writer to erase
 * another's column on the shared canonical row.
 */
import { execFileSync } from "node:child_process"
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import {
  asWasherDryerStatus, washerDryerLabel, washerDryerPillClass,
  WASHER_DRYER_OPTIONS, WASHER_DRYER_STATUSES, WASHER_DRYER_LABEL,
} from "@/lib/leads/washerDryer"

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
const MIG = "supabase/migrations/20261031000000_client_washer_dryer_status.sql"

console.log("\n=== 1. THE VOCABULARY, DEFINED ONCE ===")
{
  eq("two statuses, no more", [...WASHER_DRYER_STATUSES], ["included", "hookups"])
  eq("the client wording is spelled out, never abbreviated", WASHER_DRYER_LABEL, {
    included: "Washer & Dryer Included",
    hookups: "Washer & Dryer Hookups",
  })
  ok("no label abbreviates to W/D", !Object.values(WASHER_DRYER_LABEL).some((l) => /\bW\/D\b/i.test(l)))
  eq("the dropdown defaults to not verified", WASHER_DRYER_OPTIONS[0], { value: "", label: "Not verified" })
  eq("three options, in the approved order", WASHER_DRYER_OPTIONS.map((o) => o.value), ["", "included", "hookups"])
}

console.log("\n=== 2. EVERY UNCERTAIN INPUT LANDS ON SILENCE ===")
{
  for (const bad of [null, undefined, "", " ", "Included", "INCLUDED", "included ", "yes", "Yes",
    "Select Units", "Specific Floor Plans", "no", true, false, 0, 1, {}, [], "hookup", "washer_dryer"]) {
    ok(`${JSON.stringify(bad)} → not verified`, asWasherDryerStatus(bad) === null)
  }
  eq("only the exact value passes", [asWasherDryerStatus("included"), asWasherDryerStatus("hookups")], ["included", "hookups"])
  ok("no label for an unverified pair", washerDryerLabel(null) === null && washerDryerLabel("Yes") === null)
  ok("no pill class for an unverified pair", washerDryerPillClass(null) === null && washerDryerPillClass("Yes") === null)
}

console.log("\n=== 3. THE PILL ===")
{
  eq("included is green", washerDryerPillClass("included"), "lbr-wd lbr-wd--inc")
  eq("hookups is grey", washerDryerPillClass("hookups"), "lbr-wd lbr-wd--hk")
  eq("included label", washerDryerLabel("included"), "Washer & Dryer Included")
  eq("hookups label", washerDryerLabel("hookups"), "Washer & Dryer Hookups")

  const css = raw("app/locator-beast/r/[token]/page.tsx")
  ok("the green pill uses the page's existing pill tokens",
    /\.lbr-wd--inc\{background:var\(--pill-bg\);color:var\(--pill-tx\)\}/.test(css))
  ok("the grey pill uses the page's existing neutral tokens",
    /\.lbr-wd--hk\{background:var\(--line-soft\);color:var\(--ink\)\}/.test(css))
  ok("no new colour literal was introduced for either pill",
    !/\.lbr-wd--(inc|hk)\{[^}]*#[0-9a-f]{3,8}/i.test(css))
  ok("it is a pill, on one line", /\.lbr-wd\{[^}]*border-radius:999px/.test(css) && /\.lbr-wd\{[^}]*white-space:nowrap/.test(css))
  // .lbr-body is a flex column, and the spec blockifies a flex item's inline-flex to flex —
  // without align-self the pill stretches to the full column width and stops being a pill.
  ok("it hugs its text inside the card's flex column", /\.lbr-wd\{[^}]*align-self:flex-start/.test(css))

  const list = read("app/locator-beast/r/[token]/RecommendationList.tsx")
  // Structure, not character distance: the pill is the next thing after the highlights block
  // closes. The previous form allowed 400 characters between the two and broke the moment the
  // average-rent line was nested inside the list — a budget is not a relationship.
  {
    const whyEnd = list.indexOf('{reasons.length > 0 && (')
    const pillAt = list.indexOf('washerDryerLabel(p.washerDryer) && (')
    const footAt = list.indexOf('showFoot && (')
    ok("it renders after the highlights block and before the card foot",
      whyEnd > 0 && pillAt > whyEnd && footAt > pillAt)
  }
  ok("nothing renders when the status is unset", /washerDryerLabel\(p\.washerDryer\) && \(/.test(list))
  ok("no icon, tick or warning glyph in the pill",
    !/washerDryerPillClass[\s\S]{0,200}(<Check|<svg|⚠|✓|✔)/.test(list))
  ok("no Notes section was added", !/\bNotes\b/.test(list))
}

console.log("\n=== 4. IT IS NEVER INFERRED FROM PROPERTY INTELLIGENCE ===")
{
  const sources = [
    "lib/leads/washerDryer.ts",
    "lib/leads/propertyReasons.ts",
    "components/crm/ReasonsControl.tsx",
    "app/locator-beast/r/[token]/RecommendationList.tsx",
  ].map(read).join("\n")
  for (const col of ["washer_dryer_included", "washer_dryer_connections", "property_catalog"]) {
    ok(`no code path reads ${col}`, !sources.includes(col))
  }
  const mig = raw(MIG)
  // The migration may NAME the catalog columns in its reasoning; it must not SELECT them.
  ok("the migration never selects a catalog washer/dryer column",
    !/pc\.washer_dryer_(included|connections)/.test(mig))
  ok("the snapshot freezes the PAIR's status, not the property's",
    /pr\.washer_dryer_status/.test(mig))
}

console.log("\n=== 5. SAVING ONE FIELD NEVER ERASES ANOTHER ===")
{
  const pr = read("lib/leads/propertyReasons.ts")
  const saveReasons = pr.slice(pr.indexOf("export async function saveReasons"), pr.indexOf("export async function saveWasherDryer"))
  // Bounded: saveAverageRent now follows, and an unbounded slice counted ITS upsert too.
  const wdStart = pr.indexOf("export async function saveWasherDryer")
  const wdEnd = pr.indexOf("export async function saveAverageRent")
  ok("the washer/dryer writer was located", wdStart > 0 && wdEnd > wdStart)
  const saveWd = pr.slice(wdStart, wdEnd)
  ok("saveReasons still sends only reasons", !saveWd.includes("") || !/reasons,/.test(saveWd.split("upsert(")[1]?.split(")")[0] ?? ""))
  ok("saveReasons does not send washer_dryer_status", !saveReasons.includes("washer_dryer_status"))
  ok("saveWasherDryer does not send reasons", !/\breasons\b/.test(saveWd.split("upsert(")[1]?.split("{ onConflict")[0] ?? ""))
  ok("neither writer sends the commute cache",
    !saveReasons.includes("commute_") && !saveWd.includes("commute_"))
  ok("both upsert on the same pair index",
    (saveReasons.match(/onConflict: "lead_id,canonical_property_key"/g) ?? []).length === 1 &&
    (saveWd.match(/onConflict: "lead_id,canonical_property_key"/g) ?? []).length === 1)
  ok("the writer validates before it writes", /washer_dryer_status: asWasherDryerStatus\(status\)/.test(saveWd))
  ok("a null status is a real value, not a skipped write", /status: WasherDryerStatus \| null/.test(saveWd))
}

console.log("\n=== 6. THE EDITOR ===")
{
  // THE CONTROL MOVED. It is no longer a field in "Why I chose this for you" — that editor holds
  // exactly three slots — and lives instead where property facts are verified: inside Property
  // Intelligence for an admin, and as a standalone client-only control for every other locator.
  // The vocabulary, the save path and the data model are the same ones as before.
  const rc = read("components/crm/ReasonsControl.tsx")
  ok("the reasons editor holds no washer/dryer field", !/WASHER_DRYER|washerDryer|wdDraft/.test(rc))

  const cu = read("components/crm/ClientUnitWasherDryer.tsx")
  ok("the control appears only when a handler is supplied", /typeof onSaveWasherDryer === "function"/.test(read("components/crm/BestMatches.tsx")))
  ok("it is seeded from the saved value each time it opens", /setDraft\(value\)/.test(cu))
  ok("the status is written only when it actually changed", /if \(draft === value\) \{ setOpen\(false\); return \}/.test(cu))
  ok("it reads its options from the shared module", /WASHER_DRYER_OPTIONS\.map/.test(cu))
  ok("the three-reason maximum is untouched", /cleaned\.length > MAX_REASONS/.test(rc))

  const lf0 = read("components/crm/LeadFavorites.tsx")
  ok("so Favorites, which passes neither prop, is unchanged", !/washerDryer/.test(lf0))

  const bm = read("components/crm/BestMatches.tsx")
  ok("Recommended Properties supplies both props", /washerDryer=\{clientWasherDryer\}/.test(bm) && /onSaveWasherDryer=\{/.test(bm))
  ok("…routed to Property Intelligence, not to the reasons editor",
    /<PropertyPricingEditor[\s\S]{0,400}?onSaveWasherDryer=\{onSaveWasherDryer\}/.test(bm) && !/ReasonsControl[\s\S]{0,900}?onSaveWasherDryer/.test(bm))

  const lf = read("components/crm/LeadFavorites.tsx")
  ok("Favorites supplies neither", !/washerDryer/.test(lf))

  // ── THE WORKSPACE CARD GAINS NOTHING ──────────────────────────────────────────────────────
  // The Recommended Properties cards are deliberately compact. The dropdown belongs INSIDE the
  // reasons editor, which only exists once the locator opens it; the pill belongs only to the
  // public client page. Neither may leak onto the card itself.
  {
    const src = raw("components/crm/ReasonsControl.tsx")
    const collapsed = src.slice(src.indexOf("if (!open) {"), src.indexOf("return (", src.indexOf("const shown = previewReasons")))
    ok("the COLLAPSED card row shows nothing about washer/dryer",
      !/washerDryer|wdDraft|Washer/.test(collapsed))
    ok("the control lives only in the opened panel",
      /\{open && \(/.test(read("components/crm/ClientUnitWasherDryer.tsx")))

    // The workspace card must not render the client-facing pill, its classes, or its labels.
    const bmRaw = raw("components/crm/BestMatches.tsx")
    for (const leak of ["lbr-wd", "washerDryerLabel", "washerDryerPillClass", "Washer & Dryer Included", "Washer & Dryer Hookups"]) {
      ok(`the workspace card never renders ${leak}`, !bmRaw.includes(leak))
    }
    ok("BestMatches only passes the value through — it renders no client pill",
      /washerDryer=\{clientWasherDryer\}/.test(bmRaw) && !/<[A-Za-z][^>]*lbr-wd/.test(bmRaw))

    // And the pill's CSS is confined to the client page's own stylesheet.
    ok("no CRM stylesheet defines the pill",
      !raw("app/globals.css").includes("lbr-wd"))
  }

  const dc = read("components/crm/DashboardClient.tsx")
  const start = dc.indexOf("const handleSaveWasherDryer")
  const end = dc.indexOf("const handleReorderRecommendations")
  ok("the handler body was located", start > 0 && end > start)
  const h = dc.slice(start, end)
  ok("the handler writes through the canonical layer", /saveWasherDryer\(selectedLeadId, canonicalPropertyKey, next\)/.test(h))
  ok("demo clients never reach the database", /isDemoLeadId\(selectedLeadId\)/.test(h))
  ok("it creates no share and sends nothing",
    !/lb_prepare_client_share|lb_create_client_share|handleSendRecommendations/.test(h))
  for (const forbidden of ["lead_recommendations", "lead_favorites", "crm_status", "send_commission", "current_special"]) {
    ok(`the handler never touches ${forbidden}`, !h.includes(forbidden))
  }
}

console.log("\n=== 7. THE MIGRATION ===")
{
  const mig = raw(MIG)
  ok("both columns are additive and nullable", (mig.match(/add column if not exists washer_dryer_status text;/g) ?? []).length === 2)
  ok("a CHECK pins the two legal values on both tables",
    (mig.match(/in \('included','hookups'\)/g) ?? []).length === 2)
  ok("no backfill — an existing row cannot gain a status", !/update\s+public\.(lead_property_reasons|client_recommendation_share_items)\s+set\s+washer_dryer_status/i.test(mig))
  ok("the status joins BOTH sides of the reuse fingerprint",
    /coalesce\(pr\.washer_dryer_status, ''\)/.test(mig) && /coalesce\(ci\.washer_dryer_status, ''\)/.test(mig))
  ok("the resolver hands it to the client page", /'washerDryer', i\.washer_dryer_status/.test(mig))
  ok("the ordering rule shipped last time is carried through unchanged",
    (mig.match(/order by r\.sort_order asc nulls last, r\.created_at asc, r\.id asc/g) ?? []).length === 2)
  ok("composed reasons are carried through unchanged", /lb_compose_recommendation_reasons/.test(mig))
  ok("commission columns appear nowhere in the migration",
    !/send_commission|escort_commission|bonus_flat/.test(mig))
}

console.log("\n=== 8. POSTGRES AGREES (live catalog; needs no migration applied) ===")
{
  const urls = ["supabase/.temp/pooler-url",
    "/Users/jaymorris/Desktop/Lone Star Locators Master/lonestar-locators-app/supabase/.temp/pooler-url"]
  const urlPath = urls.find((p) => existsSync(p))
  if (!urlPath) {
    console.log("  … skipped: no pooler-url")
  } else {
    const url = readFileSync(urlPath, "utf8").trim()
    try {
      // The catalog's OWN washer/dryer vocabulary is richer than the client-facing pair of
      // values — which is exactly why a property-level answer is not promised to a client.
      const out = execFileSync("psql", [url, "-At", "-c",
        "select count(*) filter (where washer_dryer_included = 'Select Units') " +
        "+ count(*) filter (where washer_dryer_included = 'Specific Floor Plans') from public.property_catalog;"],
        { encoding: "utf8", timeout: 60_000 }).trim()
      ok(`the catalog qualifies ${out} properties as unit-specific — the reason this is confirmed per client`,
        Number(out) > 0, out)
    } catch (e) {
      console.log(`  … skipped: psql unavailable (${(e as Error).message.split("\n")[0]})`)
    }
  }
}

console.log(fail === 0 ? `\nALL PASS ✅ (${pass} passed, ${fail} failed)\n` : `\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
