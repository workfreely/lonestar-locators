/**
 * AVERAGE RENT — the calculation, the drift guard, and the boundaries.
 *
 *   npx tsx scripts/leads/averageRent.test.ts
 *
 * The expensive mistake here is a number that is confidently wrong: a client signs a lease on
 * the strength of an average that assumed a concession they did not qualify for. So most of this
 * suite is about REFUSING — every incomplete, ambiguous or incoherent input must render nothing,
 * and no code path may read the advertised special.
 *
 * Section 3 asks Postgres to compute the same cases and requires identical answers. It applies
 * the migration inside a transaction and rolls it back, so it needs nothing applied first.
 */
import { execFileSync } from "node:child_process"
import { readFileSync, existsSync, writeFileSync, unlinkSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import {
  computeAverageRent, averageRentLine, averageRentSegments, concessionPhrase, bedroomLineRentOverride,
  MONTHS_PER_WEEK, money, type AverageRentInputs,
} from "@/lib/leads/averageRent"
import { pricingReasonText, displayReasons, isPricingReason } from "@/lib/leads/bedroomPricing"

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
const MIG = "supabase/migrations/20261101000000_average_rent.sql"

const ON = (o: Partial<AverageRentInputs>): AverageRentInputs =>
  ({ quotedRent: 1725, concessionWeeks: 10, concessionMonths: null, leaseMonths: 15, show: true, ...o })

console.log("\n=== 1. THE APPROVED EXAMPLE, AND THE CONVENTION ===")
{
  eq("the exact client line",
    averageRentLine(ON({})),
    "Avg. Rent: $1,460/month · 10 wks free · 15-month lease")
  eq("the three segments, for a wrap that falls at a separator",
    averageRentSegments(ON({})),
    ["Avg. Rent: $1,460/month", "10 wks free", "15-month lease"])
  ok("the joined line and the segments are one wording",
    averageRentSegments(ON({}))!.join(" · ") === averageRentLine(ON({})))
  eq("no segments when there is no average", averageRentSegments(ON({ show: false })), null)
  ok("the label is abbreviated, the facts are not",
    averageRentLine(ON({}))!.startsWith("Avg. Rent: ") &&
    averageRentLine(ON({}))!.includes("10 wks free") &&
    averageRentLine(ON({}))!.includes("15-month lease"))
  eq("a 52-week year is the constant", MONTHS_PER_WEEK, 12 / 52)

  // The convention is worth money, so it is asserted, not assumed.
  const a = computeAverageRent(ON({}))!
  const fourWeekMonth = Math.round(((15 - 10 / 4) * 1725) / 15)
  eq("52-week year → $1,460", a.average, 1460)
  eq("the 4-weeks-is-a-month alternative would say $1,438", fourWeekMonth, 1438)
  ok("the two differ by real money across a lease", (a.average - fourWeekMonth) * 15 > 300)

  eq("the quoted rent is carried, never replaced", a.quotedRent, 1725)
  eq("months-free form: 2 months on 12 at $1,600", computeAverageRent(ON({ concessionWeeks: null, concessionMonths: 2, quotedRent: 1600, leaseMonths: 12 }))!.average, 1333)
  eq("one week reads singular", concessionPhrase(computeAverageRent(ON({ concessionWeeks: 1 }))!), "1 wk free")
  eq("one month reads singular", concessionPhrase(computeAverageRent(ON({ concessionWeeks: null, concessionMonths: 1 }))!), "1 month free")
  // Weeks abbreviate, months do not — the approved wording, asserted so neither drifts.
  eq("months stay spelled out", concessionPhrase(computeAverageRent(ON({ concessionWeeks: null, concessionMonths: 2 }))!), "2 months free")
  ok("the unit is never dropped", /\b(wk|wks|month|months) free$/.test(concessionPhrase(computeAverageRent(ON({}))!)))
  eq("a fractional concession keeps its decimals", concessionPhrase(computeAverageRent(ON({ concessionWeeks: 6.5 }))!), "6.5 wks free")
  eq("thousands separated, whole dollars", money(1459.62), "$1,460")
}

console.log("\n=== 2. IT FAILS CLOSED ===")
{
  const refuse = (label: string, o: Partial<AverageRentInputs>) =>
    ok(label, computeAverageRent(ON(o)) === null && averageRentLine(ON(o)) === null)

  refuse("the toggle is off", { show: false })
  refuse("the toggle is absent", { show: null })
  refuse("no quoted rent", { quotedRent: null })
  refuse("a zero quoted rent", { quotedRent: 0 })
  refuse("a negative quoted rent", { quotedRent: -1725 })
  refuse("no lease term", { leaseMonths: null })
  refuse("a zero lease term", { leaseMonths: 0 })
  refuse("a fractional lease term", { leaseMonths: 12.5 })
  refuse("no concession at all", { concessionWeeks: null, concessionMonths: null })
  refuse("a zero concession", { concessionWeeks: 0 })
  refuse("BOTH units at once — ambiguous", { concessionMonths: 2 })
  refuse("the concession exceeds the lease", { concessionWeeks: 10, leaseMonths: 2 })
  refuse("the concession equals the lease", { concessionWeeks: null, concessionMonths: 12, leaseMonths: 12 })
  refuse("a non-numeric rent", { quotedRent: Number.NaN })
  ok("no input at all", computeAverageRent(null) === null && computeAverageRent(undefined) === null)

  // The boundary either side of refusal.
  ok("just inside the lease still computes", computeAverageRent(ON({ concessionWeeks: null, concessionMonths: 11.9, leaseMonths: 12 })) !== null)
  ok("the toggle alone is never enough",
    computeAverageRent({ show: true, quotedRent: 1725 }) === null)
}

console.log("\n=== 3. POSTGRES COMPUTES THE SAME NUMBERS (drift guard) ===")
{
  const urls = ["supabase/.temp/pooler-url",
    "/Users/jaymorris/Desktop/Lone Star Locators Master/lonestar-locators-app/supabase/.temp/pooler-url"]
  const urlPath = urls.find((p) => existsSync(p))
  if (!urlPath) {
    console.log("  … skipped: no pooler-url (pure sections still ran)")
  } else {
    const url = readFileSync(urlPath, "utf8").trim()
    const CASES: Partial<AverageRentInputs>[] = [
      {}, { concessionWeeks: 2 }, { concessionWeeks: 4 }, { concessionWeeks: 6 }, { concessionWeeks: 8 },
      { concessionWeeks: 12 }, { concessionWeeks: 6.5 }, { concessionWeeks: 1 },
      { concessionWeeks: null, concessionMonths: 1 }, { concessionWeeks: null, concessionMonths: 2 },
      { quotedRent: 999, leaseMonths: 6, concessionWeeks: 2 },
      { quotedRent: 3250.5, leaseMonths: 18, concessionWeeks: 10 },
      { quotedRent: 1600, leaseMonths: 12, concessionWeeks: null, concessionMonths: 2 },
      { leaseMonths: 13 }, { leaseMonths: 24, concessionWeeks: 12 },
      // the refusals
      { show: false }, { quotedRent: null }, { leaseMonths: null },
      { concessionWeeks: null, concessionMonths: null }, { concessionMonths: 2 },
      { concessionWeeks: 10, leaseMonths: 2 }, { quotedRent: 0 },
    ]
    const lit = (v: unknown) => (v === null || v === undefined || Number.isNaN(v as number) ? "null" : String(v))
    const selects = CASES.map((c, i) => {
      const o = ON(c)
      return `select ${i} n, (public.lb_compose_average_rent(${lit(o.quotedRent)}, ${lit(o.concessionWeeks)}, ` +
        `${lit(o.concessionMonths)}, ${lit(o.leaseMonths)}, ${o.show ? "true" : "false"}) ->> 'average') a`
    }).join(" union all ")
    try {
      // Via a FILE, not -c: psql's -c does not accept \\i meta-commands, so the migration has to
      // be sourced from a script. Applied and rolled back, so this needs nothing applied first.
      const script = join(tmpdir(), `avgrent_drift_${process.pid}.sql`)
      writeFileSync(script, `begin;\n\\i ${MIG}\n${selects} order by n;\nrollback;\n`)
      let out = ""
      try {
        out = execFileSync("psql", [url, "-At", "-F", "|", "-v", "ON_ERROR_STOP=1", "-f", script],
          { encoding: "utf8", timeout: 180_000 })
      } finally { try { unlinkSync(script) } catch { /* best effort */ } }
      const sql = new Map(out.split("\n").filter((l) => /^\d+\|/.test(l)).map((l) => {
        const [n, a] = l.split("|")
        return [Number(n), a === "" ? null : Number(a)]
      }))
      ok("every case came back from Postgres", sql.size === CASES.length, `${sql.size}/${CASES.length}`)
      let drift = 0
      CASES.forEach((c, i) => {
        const ts = computeAverageRent(ON(c))?.average ?? null
        if (sql.get(i) !== ts) { drift++; console.log(`    ✗ case ${i}: SQL=${sql.get(i)} TS=${ts} ${JSON.stringify(c)}`) }
      })
      ok(`all ${CASES.length} cases agree between SQL and TypeScript`, drift === 0, `${drift} differ`)
    } catch (e) {
      fail++
      console.log(`  ✗ drift guard could not run — ${(e as Error).message.split("\n").slice(0, 3).join(" ")}`)
    }
  }
}

console.log("\n=== 4. /month, AND THE QUOTE SUBSTITUTION ===")
{
  eq("the composed bedroom line states its unit", pricingReasonText(2, 1595), "2BR from $1,595/month")
  ok("it is still recognised as a pricing reason", isPricingReason("2BR from $1,595/month"))
  ok("a hand-typed one without /month still is too", isPricingReason("2 BR from $1400"))

  const pricing = { onebrStartingRent: null, twobrStartingRent: 1595, threebrStartingRent: null }
  eq("without a quote, the catalog figure stands",
    displayReasons(["4 min", "Kitchen island"], pricing, "2", 3),
    ["4 min", "2BR from $1,595/month", "Kitchen island"])
  eq("with a confirmed quote, both numbers describe the same unit",
    displayReasons(["4 min", "Kitchen island"], pricing, "2", 3, 1725),
    ["4 min", "2BR from $1,725/month", "Kitchen island"])
  eq("a zero or negative override is ignored",
    displayReasons(["4 min"], pricing, "2", 3, 0),
    ["4 min", "2BR from $1,595/month"])
  eq("the override is only offered when the average will show",
    bedroomLineRentOverride(ON({ show: false })), null)
  eq("…and is the quoted rent when it will", bedroomLineRentOverride(ON({})), 1725)
  eq("three saved reasons still win — no fourth is forced",
    displayReasons(["a", "b", "c"], pricing, "2", 3, 1725), ["a", "b", "c"])
}

console.log("\n=== 5. NOTHING IS INFERRED FROM THE ADVERTISED SPECIAL ===")
{
  // The CALCULATION path. The client page is excluded here because it legitimately uses
  // normalizeShortSpecial for the separate special BADGE — a claim about the badge is not a
  // claim about the average, and conflating them would make this assertion meaningless.
  const calc = ["lib/leads/averageRent.ts", "lib/leads/bedroomPricing.ts",
    "components/crm/ReasonsControl.tsx"].map(read).join("\n")
  for (const leak of ["current_special", "normalizeShortSpecial", "property_catalog"]) {
    ok(`the calculation path never reads ${leak}`, !calc.includes(leak))
  }
  // And on the client page, the average line is built from the frozen object alone.
  const page = read("app/locator-beast/r/[token]/RecommendationList.tsx")
  ok("the client page derives the average only from the frozen object",
    /averageRentSegments\(\{\s*quotedRent: p\.averageRent/.test(page) &&
    !/averageRentSegments[\s\S]{0,200}currentSpecial/.test(page))
  const mig = raw(MIG)
  // A derivation would have to READ the special inside an expression — a substring, a regexp, a
  // cast. Neighbouring names in an INSERT column list are not that, so match the shape of a read.
  ok("the migration never derives a concession from the special text",
    !/(substring|regexp_\w+|~\*?)[^\n]*current_special/i.test(mig) &&
    !/current_special[^\n]*(substring|regexp_\w+|~\*?\s*')/i.test(mig))
  ok("the quote is read from the PAIR, not the catalog", /pr\.avg_rent_quoted_rent/.test(mig))
  ok("the catalog's starting rents are still what the fallback uses",
    /pc\.onebr_starting_rent, pc\.twobr_starting_rent, pc\.threebr_starting_rent/.test(mig))
  ok("no catalog column is written", !/update\s+public\.property_catalog/i.test(mig))
}

console.log("\n=== 6. THE MIGRATION ===")
{
  const mig = raw(MIG)
  ok("five columns on the pair record", (mig.match(/add column if not exists avg_rent_/g) ?? []).length === 10)
  ok("the display toggle defaults to FALSE", (mig.match(/avg_rent_show\s+boolean not null default false/g) ?? []).length === 2)
  ok("a CHECK refuses both concession units at once",
    /not \(avg_rent_concession_weeks is not null and avg_rent_concession_months is not null\)/.test(mig))
  ok("no backfill", !/update\s+public\.(lead_property_reasons|client_recommendation_share_items)\s+set\s+avg_rent/i.test(mig))
  ok("all five inputs join BOTH sides of the fingerprint",
    (mig.match(/coalesce\(pr\.avg_rent_\w+::text, ''\)/g) ?? []).length >= 4 &&
    (mig.match(/coalesce\(ci\.avg_rent_\w+::text, ''\)/g) ?? []).length >= 4 &&
    /coalesce\(pr\.avg_rent_show::text, 'false'\)/.test(mig) && /coalesce\(ci\.avg_rent_show::text, 'false'\)/.test(mig))
  ok("the resolver hands the client page one object", /'averageRent', public\.lb_compose_average_rent/.test(mig))
  // A defaulted parameter makes an OVERLOAD, and a six-argument call would then be ambiguous.
  ok("the old six-argument composer is dropped, not left beside the new one",
    /drop function if exists public\.lb_compose_recommendation_reasons\(jsonb, text, numeric, numeric, numeric, int\);/.test(mig))
  ok("the new composer is granted the same roles",
    /grant execute on function public\.lb_compose_recommendation_reasons\(jsonb, text, numeric, numeric, numeric, int, numeric\) to authenticated, service_role;/.test(mig))
  ok("the ordering rule from the earlier release is carried through",
    (mig.match(/order by r\.sort_order asc nulls last, r\.created_at asc, r\.id asc/g) ?? []).length === 2)
  ok("the washer/dryer status is carried through", /pr\.washer_dryer_status/.test(mig))
  ok("commission columns appear nowhere", !/send_commission|escort_commission|bonus_flat/.test(mig))
}

console.log("\n=== 7. THE CONTROL, AND WHERE IT LIVES ===")
{
  const rc = read("components/crm/ReasonsControl.tsx")
  ok("the control appears only when a handler is supplied", /const showAverageRent = typeof onSaveAverageRent === "function"/.test(rc))
  ok("it is off by default for a pair with no row", /setArShow\(averageRent\?\.show === true\)/.test(rc))
  ok("the five figures are written only when one CHANGED", /const arChanged = showAverageRent && \(/.test(rc))
  ok("the locator previews the REAL client line", /averageRentLine\(\{ \.\.\.arDraft, show: true \}\)/.test(rc))

  // The collapsed workspace card must still gain nothing.
  const src = raw("components/crm/ReasonsControl.tsx")
  const collapsed = src.slice(src.indexOf("if (!open) {"), src.indexOf("return (", src.indexOf("const shown = previewReasons")))
  ok("the collapsed card row says nothing about average rent", !/averageRent|arShow|Average Rent/.test(collapsed))
  const bm = raw("components/crm/BestMatches.tsx")
  ok("the workspace card renders no average-rent element",
    !bm.includes("lbr-avg") && !bm.includes("averageRentLine") && !/Avg\.?\s*Rent:/i.test(bm))

  const dc = read("components/crm/DashboardClient.tsx")
  const arStart = dc.indexOf("const handleSaveAverageRent")
  const arEnd = dc.indexOf("const handleReorderRecommendations")
  ok("the average-rent handler body was located", arStart > 0 && arEnd > arStart)
  const h = dc.slice(arStart, arEnd)
  ok("the handler writes through the canonical layer", /saveAverageRent\(selectedLeadId, canonicalPropertyKey, next\)/.test(h))
  ok("demo clients never reach the database", /isDemoLeadId\(selectedLeadId\)/.test(h))
  ok("it creates no share and sends nothing", !/lb_prepare_client_share|lb_create_client_share|handleSendRecommendations/.test(h))
  for (const forbidden of ["property_catalog", "lead_favorites", "crm_status", "send_commission"]) {
    ok(`the handler never touches ${forbidden}`, !h.includes(forbidden))
  }
}

console.log("\n=== 8. THE CLIENT PAGE ===")
{
  const list = read("app/locator-beast/r/[token]/RecommendationList.tsx")
  ok("the line is nested inside the PRICE highlight, not added as a fourth",
    /avgParts && isPricingReason\(r\)/.test(list))
  ok("the client page never recalculates — it formats the frozen result",
    /p\.averageRent\s*\?\s*averageRentSegments\(/.test(list))
  ok("each segment is rendered unbreakable, so a wrap falls at a separator",
    /lbr-avg-seg/.test(list) && /\.lbr-avg-seg\{white-space:nowrap\}/.test(raw("app/locator-beast/r/[token]/page.tsx")))
  ok("no average is shown without a frozen object", /const avgParts = p\.averageRent/.test(list))
  ok("the existing pricing disclaimer is still there",
    /Pricing and availability subject to change\./.test(raw("app/locator-beast/r/[token]/RecommendationList.tsx")))
  ok("the washer/dryer pill is still rendered", /washerDryerLabel\(p\.washerDryer\)/.test(list))

  const css = raw("app/locator-beast/r/[token]/page.tsx")
  ok("the line uses the page's own green token", /\.lbr-avg\{[^}]*color:var\(--green\)/.test(css))
  {
    const sz = (re: RegExp) => { const m = re.exec(css); return m ? parseFloat(m[1]) : NaN }
    const avgDesktop = sz(/\.lbr-avg\{[^}]*font-size:([\d.]+)px/)
    const liDesktop = sz(/\.lbr-why li\{[^}]*font-size:([\d.]+)px/)
    const avgMobile = sz(/\.lbr-avg\{font-size:([\d.]+)px/)
    const liMobile = sz(/\.lbr-why li\{font-size:([\d.]+)px\}/)
    ok(`it is smaller than the highlight above it (${avgDesktop} < ${liDesktop})`, avgDesktop < liDesktop)
    ok(`…and on mobile too (${avgMobile} < ${liMobile})`, avgMobile < liMobile)
    // WEIGHT now carries the emphasis, by owner decision: on a real iPhone the average was
    // losing to the larger starting rent above it, and a client who reads only the bigger number
    // overpays in their own head. 700 — deliberately the SAME weight as the W/D pill, which is
    // the emphasis level that was asked for, so the two are pinned together here rather than
    // left to drift apart. Size still subordinates (asserted above): the line is bolder than its
    // neighbours but never bigger, so it reads as the qualifier it is.
    const avgWeight = /\.lbr-avg\{[^}]*font-weight:(\d+)/.exec(css)?.[1]
    const pillWeight = /\.lbr-wd\{[^}]*font-weight:(\d+)/.exec(css)?.[1]
    ok(`it is bold (${avgWeight})`, avgWeight === "700")
    ok(`…at the same weight as the W/D pill (${pillWeight})`, avgWeight === pillWeight)
  }
  ok("it starts its own line beneath the rent", /\.lbr-avg\{[^}]*display:block/.test(css))
  ok("it scales up on mobile like the rest of the card", /@media[\s\S]*\.lbr-avg\{font-size:1[0-9]px/.test(css))
  ok("no new colour literal", !/\.lbr-avg\{[^}]*#[0-9a-f]{3,8}/i.test(css))
}

console.log("\n=== 9. THE PUBLIC BUNDLE NO LONGER CARRIES CRM VOCABULARY ===")
{
  // Stripped of comments: a comment explaining WHY the catalog vocabulary lives elsewhere is
  // not the vocabulary, and the bundler drops it. What must not be here is the code.
  const wd = read("lib/leads/washerDryer.ts")
  ok("the client-facing module holds only the client-facing vocabulary",
    !wd.includes("Specific Floor Plans") && !wd.includes("CATALOG_WD") && !wd.includes("asCatalogWasherDryer"))
  ok("the catalog vocabulary moved to its own module", existsSync(join(process.cwd(), "lib/propertyIntel/washerDryerCatalog.ts")))
  const cat = raw("lib/propertyIntel/washerDryerCatalog.ts")
  ok("…and still offers every stored value", cat.includes("Specific Floor Plans") && cat.includes("Select Units"))
  const list = read("app/locator-beast/r/[token]/RecommendationList.tsx")
  ok("the public page imports only the client-facing helpers",
    !list.includes("washerDryerCatalog") && /from "@\/lib\/leads\/washerDryer"/.test(list))
  ok("the client-facing behaviour is unchanged",
    /washerDryerPillClass\(p\.washerDryer\)/.test(list) && /washerDryerLabel\(p\.washerDryer\)/.test(list))
}

console.log(fail === 0 ? `\nALL PASS ✅ (${pass} passed, ${fail} failed)\n` : `\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
