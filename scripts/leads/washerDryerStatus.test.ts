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
// The migration that WIDENED the pair to three. The original above is history and is asserted
// as it shipped; this one is what the live constraint must agree with.
const MIG_FAC = "supabase/migrations/20261128000000_laundry_facilities_onsite.sql"

console.log("\n=== 1. THE VOCABULARY, DEFINED ONCE ===")
{
  eq("three statuses, no more", [...WASHER_DRYER_STATUSES], ["included", "hookups", "laundry_onsite"])
  eq("the client wording is spelled out, never abbreviated", WASHER_DRYER_LABEL, {
    included: "Washer & Dryer Included",
    hookups: "Washer & Dryer Hookups",
    laundry_onsite: "Laundry Facilities On-Site",
  })
  ok("no label abbreviates to W/D", !Object.values(WASHER_DRYER_LABEL).some((l) => /\bW\/D\b/i.test(l)))
  eq("the dropdown defaults to not verified", WASHER_DRYER_OPTIONS[0], { value: "", label: "Not verified" })
  eq("four options, in the approved order", WASHER_DRYER_OPTIONS.map((o) => o.value),
    ["", "included", "hookups", "laundry_onsite"])
  // The menu and the stored vocabulary are ONE list, not two that happen to match: every status
  // is offered, nothing is offered that cannot be stored, and the clear option is the only extra.
  eq("the menu is exactly the vocabulary plus the clear option",
    WASHER_DRYER_OPTIONS.map((o) => o.value).filter(Boolean), [...WASHER_DRYER_STATUSES])
  ok("every option's label is the one the client reads",
    WASHER_DRYER_OPTIONS.filter((o) => o.value).every(
      (o) => o.label === WASHER_DRYER_LABEL[o.value as keyof typeof WASHER_DRYER_LABEL]))
}

console.log("\n=== 2. EVERY UNCERTAIN INPUT LANDS ON SILENCE ===")
{
  for (const bad of [null, undefined, "", " ", "Included", "INCLUDED", "included ", "yes", "Yes",
    "Select Units", "Specific Floor Plans", "no", true, false, 0, 1, {}, [], "hookup", "washer_dryer"]) {
    ok(`${JSON.stringify(bad)} → not verified`, asWasherDryerStatus(bad) === null)
  }
  for (const bad of ["laundry", "onsite", "Laundry Facilities On-Site", "laundry-onsite", "laundry_onsite "]) {
    ok(`${JSON.stringify(bad)} → not verified`, asWasherDryerStatus(bad) === null)
  }
  eq("only the exact values pass", WASHER_DRYER_STATUSES.map((v) => asWasherDryerStatus(v)), [...WASHER_DRYER_STATUSES])
  ok("no label for an unverified pair", washerDryerLabel(null) === null && washerDryerLabel("Yes") === null)
  ok("no pill class for an unverified pair", washerDryerPillClass(null) === null && washerDryerPillClass("Yes") === null)
}

console.log("\n=== 3. THE PILL ===")
{
  eq("included is green", washerDryerPillClass("included"), "lbr-wd lbr-wd--inc")
  eq("hookups is grey", washerDryerPillClass("hookups"), "lbr-wd lbr-wd--hk")
  eq("an on-site laundry room is grey, in its own class", washerDryerPillClass("laundry_onsite"), "lbr-wd lbr-wd--fac")
  ok("no two statuses share a pill class",
    new Set(WASHER_DRYER_STATUSES.map((v) => washerDryerPillClass(v))).size === WASHER_DRYER_STATUSES.length)
  eq("included label", washerDryerLabel("included"), "Washer & Dryer Included")
  eq("hookups label", washerDryerLabel("hookups"), "Washer & Dryer Hookups")
  eq("laundry label", washerDryerLabel("laundry_onsite"), "Laundry Facilities On-Site")
  ok("every status has a pill class and a label",
    WASHER_DRYER_STATUSES.every((v) => washerDryerPillClass(v) && washerDryerLabel(v)))

  const css = raw("app/locator-beast/r/[token]/page.tsx")
  ok("the green pill uses the page's existing pill tokens",
    /\.lbr-wd--inc\{background:var\(--pill-bg\);color:var\(--pill-tx\)\}/.test(css))
  ok("the grey pill uses the page's existing neutral tokens",
    /\.lbr-wd--hk\{background:var\(--line-soft\);color:var\(--ink\)\}/.test(css))
  ok("the laundry pill uses the same neutral tokens",
    /\.lbr-wd--fac\{background:var\(--line-soft\);color:var\(--ink\)\}/.test(css))
  ok("no new colour literal was introduced for any pill",
    !/\.lbr-wd--(inc|hk|fac)\{[^}]*#[0-9a-f]{3,8}/i.test(css))
  // The stylesheet is the last place a new status can be forgotten: a class with no rule
  // renders an unstyled word where a pill should be.
  ok("every class washerDryerPillClass can return has a rule on the page",
    WASHER_DRYER_STATUSES.every((v) =>
      css.includes(`.${String(washerDryerPillClass(v)).split(" ")[1]}{`)))
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
  const rc = read("components/crm/ReasonsControl.tsx")
  ok("the dropdown appears only when a handler is supplied", /const showWasherDryer = typeof onSaveWasherDryer === "function"/.test(rc))
  ok("so Favorites, which passes neither prop, is unchanged", /washerDryer\?: WasherDryerStatus \| null/.test(rc))
  ok("it is seeded from the saved value each time the editor opens", /setWdDraft\(washerDryer \?\? null\)/.test(rc))
  ok("the status is written only when it actually changed", /wdChanged = showWasherDryer && wdDraft !== \(washerDryer \?\? null\)/.test(rc))
  ok("it reads its options from the shared module", /WASHER_DRYER_OPTIONS\.map/.test(rc))
  ok("the three-reason maximum is untouched", /slice\(0, MAX_REASONS\)/.test(rc))

  const bm = read("components/crm/BestMatches.tsx")
  ok("Recommended Properties supplies both props", /washerDryer=\{washerDryerByKey\?\.get/.test(bm) && /onSaveWasherDryer=\{/.test(bm))

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
    ok("the dropdown lives only in the opened editor",
      /showWasherDryer && \(/.test(src.slice(src.indexOf("const shown = previewReasons"))))

    // The workspace card must not render the client-facing pill, its classes, or its labels.
    const bmRaw = raw("components/crm/BestMatches.tsx")
    for (const leak of ["lbr-wd", "washerDryerLabel", "washerDryerPillClass", "Washer & Dryer Included", "Washer & Dryer Hookups"]) {
      ok(`the workspace card never renders ${leak}`, !bmRaw.includes(leak))
    }
    ok("BestMatches only passes the value through — it renders no new element",
      /washerDryer=\{washerDryerByKey/.test(bmRaw) && !/<[A-Za-z][^>]*lbr-wd/.test(bmRaw))

    // And the pill's CSS is confined to the client page's own stylesheet.
    ok("no CRM stylesheet defines the pill",
      !raw("app/globals.css").includes("lbr-wd"))
  }

  const dc = read("components/crm/DashboardClient.tsx")
  const start = dc.indexOf("const handleSaveWasherDryer")
  // Bounded by the NEXT handler, whichever it is today. handleReorderFavorites was inserted
  // between the two after this suite shipped, and slicing to handleReorderRecommendations
  // swallowed it — so the lead_favorites assertion below was reading another handler's body.
  const end = dc.indexOf("const handleReorderFavorites")
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
  // As it SHIPPED. The pair is history now — the widening migration below is what the live
  // constraint must agree with — but this file must still read as the record of what it did.
  ok("a CHECK pinned the two legal values on both tables",
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

console.log("\n=== 7b. THE WIDENING MIGRATION ===")
{
  const mig = raw(MIG_FAC)
  // Built from the vocabulary, so a fourth status cannot be added to TypeScript and quietly
  // left out of the constraint that decides whether it can be stored at all.
  const list = WASHER_DRYER_STATUSES.map((v) => `'${v}'`).join(",")
  ok("the CHECK admits exactly the shipped vocabulary, on both tables",
    (mig.match(new RegExp(`in \\(${list}\\)`, "g")) ?? []).length === 2, list)
  ok("both constraints are replaced, not left to clash",
    (mig.match(/drop constraint if exists/g) ?? []).length === 2)
  ok("the swap is atomic", /^begin;/m.test(mig) && /^commit;/m.test(mig))
  ok("no row is rewritten", !/\bupdate\s+public\./i.test(mig))
  ok("no column is added or dropped", !/add column|drop column/i.test(mig))
  // The three share functions carry the status through as opaque text. Redefining one here
  // would risk reverting an unrelated change that landed in a later migration.
  for (const fn of ["lb_prepare_client_share", "lb_create_client_share", "lb_resolve_client_recommendations"]) {
    ok(`${fn} is left alone`, !new RegExp(`create or replace function[\\s\\S]{0,80}${fn}`, "i").test(mig))
  }
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

      // THE CONSTRAINT AS THE DATABASE ACTUALLY HOLDS IT. A migration file that says the right
      // thing proves nothing until it has been applied; until then every save of the new status
      // fails at the database with the UI showing a saved value.
      const defs = execFileSync("psql", [url, "-At", "-c",
        "select conrelid::regclass || ' ' || pg_get_constraintdef(oid) from pg_constraint " +
        "where conname in ('lead_property_reasons_wd_status_chk','client_rec_share_items_wd_status_chk') " +
        "order by 1;"], { encoding: "utf8", timeout: 60_000 }).trim().split("\n").filter(Boolean)
      ok("both tables still carry a washer/dryer CHECK", defs.length === 2, String(defs.length))
      for (const d of defs) {
        const table = d.split(" ")[0]
        for (const v of WASHER_DRYER_STATUSES) {
          ok(`${table} accepts '${v}'`, d.includes(`'${v}'::text`), d)
        }
        ok(`${table} accepts nothing beyond the vocabulary`,
          (d.match(/'[a-z_]+'::text/g) ?? []).length === WASHER_DRYER_STATUSES.length, d)
        ok(`${table} still allows NULL for not verified`, /IS NULL/.test(d), d)
      }
    } catch (e) {
      console.log(`  … skipped: psql unavailable (${(e as Error).message.split("\n")[0]})`)
    }
  }
}

console.log(fail === 0 ? `\nALL PASS ✅ (${pass} passed, ${fail} failed)\n` : `\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
