/**
 * ONE WASHER/DRYER DROPDOWN OVER TWO COLUMNS — and the card badge it feeds.
 *
 *   npx tsx scripts/leads/washerDryerSingleSelect.test.ts
 *
 * Collapsing two stored columns into one menu is a lossy projection, and the whole risk is that
 * the projection writes itself back. So what is proved here is mostly refusal: that an untouched
 * menu sends nothing, that the 42 live rows no option can state are shown as themselves instead
 * of being snapped to the nearest option, and that the badge on the internal card can only ever
 * say what the client's card would say.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  WASHER_DRYER_SELECT_OPTIONS, toSingleSelect, fromSingleSelect, washerDryerSelectLabel,
  describeStoredPair, changeConsequences, type WasherDryerSelectValue,
} from "@/lib/propertyIntel/washerDryerSingleSelect"
import { resolveWithOverride } from "@/lib/propertyIntel/washerDryerResolver"
import { WASHER_DRYER_LABEL } from "@/lib/leads/washerDryer"

let pass = 0
let fail = 0
const ok = (l: string, c: boolean, d = "") => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}${d ? ` — ${d}` : ""}`) } }
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
const read = (p: string) => strip(readFileSync(join(process.cwd(), p), "utf8"))
const raw = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

// ── 1. THE MENU ───────────────────────────────────────────────────────────────────────────────
console.log("the menu, in the approved order:")
{
  const labels = WASHER_DRYER_SELECT_OPTIONS.map((o) => o.label)
  ok("six options", labels.length === 6)
  ok("exactly the approved order", JSON.stringify(labels) === JSON.stringify([
    "Washer & Dryer Included", "Washer & Dryer Hookups", "Select Units",
    "Specific Floor Plans", "None", "Not Verified",
  ]))
  ok("Not Verified is last", WASHER_DRYER_SELECT_OPTIONS[5].value === "")
  ok("…and is the value an unknown row shows", toSingleSelect(null, null).value === "")
  ok("the two confirmed labels match the client-facing ones exactly",
    labels[0] === WASHER_DRYER_LABEL.included && labels[1] === WASHER_DRYER_LABEL.hookups)
}

// ── 2. EVERY LIVE COMBINATION ─────────────────────────────────────────────────────────────────
// Each shape below was counted against all 4,204 catalog rows before this was written.
console.log("\nevery combination that exists in the catalog today:")
const LIVE: [string | null, string | null, number, WasherDryerSelectValue | "AMBIGUOUS"][] = [
  [null, null, 2724, ""],
  ["Yes", null, 942, "included"],
  [null, "Yes", 225, "hookups"],
  ["Select Units", null, 156, "select_units"],
  ["Select Units", "Yes", 48, "select_units"],
  [null, "Select Units", 37, "AMBIGUOUS"],
  ["Yes", "Yes", 25, "included"],
  ["Select Units", "Select Units", 20, "select_units"],
  ["No", null, 9, "none"],
  [null, "No", 4, "AMBIGUOUS"],
  ["Specific Floor Plans", "Yes", 3, "specific_floor_plans"],
  ["Yes", "Select Units", 3, "included"],
  ["Yes", "No", 3, "included"],
  ["No", "Yes", 3, "hookups"],
  ["Specific Floor Plans", null, 1, "specific_floor_plans"],
  ["No", "Select Units", 1, "AMBIGUOUS"],
]
ok("the audit covers all 4,204 rows", LIVE.reduce((t, r) => t + r[2], 0) === 4204)
for (const [inc, conn, n, expect] of LIVE) {
  const st = toSingleSelect(inc, conn)
  const got = st.ambiguous ? "AMBIGUOUS" : st.value
  ok(`${String(inc ?? "—").padEnd(21)}/ ${String(conn ?? "—").padEnd(13)} (${String(n).padStart(4)}) → ${got || "Not Verified"}`, got === expect)
}

console.log("\nthe 42 rows no option can state are shown as THEMSELVES:")
for (const [inc, conn] of [[null, "Select Units"], [null, "No"], ["No", "Select Units"]] as const) {
  const st = toSingleSelect(inc, conn)
  ok(`${inc ?? "—"} / ${conn} is flagged ambiguous`, st.ambiguous)
  ok("…and both stored values survive on the state", st.stored.included === (inc ?? null) && st.stored.connections === conn)
  const text = describeStoredPair(st.stored)
  ok("…and are spelled out for the person", text.includes(conn) && text.startsWith("Mixed"))
}

console.log("\nthe 327 lossy rows keep the hidden fact in the column and SAY SO:")
for (const [inc, conn] of [["Yes", "Yes"], ["Yes", "No"], ["Select Units", "Yes"], ["Specific Floor Plans", "Yes"]] as const) {
  const st = toSingleSelect(inc, conn)
  ok(`${inc} / ${conn} notes the hidden connections value`, !!st.lossy && st.lossy.includes(conn))
}
ok("— / Yes names the unanswered half",
  (toSingleSelect(null, "Yes").lossy ?? "").includes("Included has never been answered"))

// ── 3. WHAT A CHOICE WRITES ───────────────────────────────────────────────────────────────────
console.log("\nwhat each option writes — and what it leaves alone:")
{
  ok("Included writes only included=Yes", JSON.stringify(fromSingleSelect("included")) === JSON.stringify({ included: "Yes" }))
  ok("Hookups writes BOTH halves", JSON.stringify(fromSingleSelect("hookups")) === JSON.stringify({ included: "No", connections: "Yes" }))
  ok("Select Units writes only included", JSON.stringify(fromSingleSelect("select_units")) === JSON.stringify({ included: "Select Units" }))
  ok("Specific Floor Plans writes only included", JSON.stringify(fromSingleSelect("specific_floor_plans")) === JSON.stringify({ included: "Specific Floor Plans" }))
  ok("None records a verified absence on both", JSON.stringify(fromSingleSelect("none")) === JSON.stringify({ included: "No", connections: "No" }))
  ok("Not Verified writes NOTHING", JSON.stringify(fromSingleSelect("")) === "{}")
  ok("…so it can never clear a stored value", Object.keys(fromSingleSelect("")).length === 0)
}

console.log("\nchoosing an option and reopening shows the same option (round trip):")
for (const v of ["included", "hookups", "select_units", "specific_floor_plans", "none"] as const) {
  const w = fromSingleSelect(v)
  const back = toSingleSelect(w.included ?? null, w.connections ?? null)
  ok(`${washerDryerSelectLabel(v)} round-trips`, back.value === v && !back.ambiguous)
}

// ── 4. NOTHING IS WRITTEN UNTIL THE MENU IS TOUCHED ───────────────────────────────────────────
console.log("\nan untouched menu writes nothing, in BOTH editors:")
for (const file of ["components/crm/PropertyPricingEditor.tsx", "components/crm/MapPropertyEditor.tsx"]) {
  const src = read(file)
  const name = file.split("/").pop()
  ok(`${name} gates the write on wdTouched`, /if \(wdTouched\) \{/.test(src))
  ok(`${name} sets it only from the control's onChange`, (src.match(/setWdTouched\(true\)/g) ?? []).length === 1)
  ok(`${name} resets it on load`, /setWdTouched\(false\)/.test(src))
  ok(`${name} no longer holds the two old select states`, !/setWdIncluded\(|setWdConnections\(/.test(src))
  ok(`${name} renders one washer\/dryer select`, (src.match(/value=\{wdSelect\}/g) ?? []).length === 1)
  ok(`${name} shows the raw pair when ambiguous`, /wdState\.ambiguous && <option/.test(src))
}
ok("the pencil still sends the two columns under their own names",
  /body\.washerDryerIncluded = w\.included/.test(read("components/crm/PropertyPricingEditor.tsx")) &&
  /body\.washerDryerConnections = w\.connections/.test(read("components/crm/PropertyPricingEditor.tsx")))
ok("the Map editor likewise", /out\.washerDryerIncluded = w\.included/.test(read("components/crm/MapPropertyEditor.tsx")))

console.log("\nthe database mapping did not move:")
{
  const route = read("app/api/admin/owner/property-pricing/route.ts")
  ok("washerDryerIncluded still writes washer_dryer_included",
    /asCatalogWasherDryerIncluded\(body\.washerDryerIncluded\)[\s\S]{0,160}add\("washer_dryer_included", v\)/.test(route))
  ok("washerDryerConnections still writes washer_dryer_connections",
    /asCatalogWasherDryerConnections\(body\.washerDryerConnections\)[\s\S]{0,160}add\("washer_dryer_connections", v\)/.test(route))
  ok("the route is still platform-admin only",
    /export async function PUT[\s\S]{0,200}?requirePlatformAdmin\(\)/.test(route))
  const CAT = read("lib/propertyIntel/washerDryerCatalog.ts")
  ok("the stored vocabulary is unchanged", /value: "Specific Floor Plans"/.test(CAT) && /value: "Select Units"/.test(CAT))
}

// ── 5. THE CARD BADGE ─────────────────────────────────────────────────────────────────────────
console.log("\nthe internal badge says only what the client's card would say:")
{
  ok("Included shows", resolveWithOverride(null, "Yes", null).status === "included")
  ok("Hookups shows", resolveWithOverride(null, "No", "Yes").status === "hookups")
  for (const [inc, conn, why] of [
    ["Select Units", "Yes", "select units"],
    ["Specific Floor Plans", null, "specific floor plans"],
    [null, "Yes", "connections only"],
    [null, "Select Units", "an ambiguous pair"],
    [null, null, "nothing stored"],
    ["No", null, "a verified absence"],
  ] as const) {
    ok(`${why} shows NO badge`, resolveWithOverride(null, inc, conn).status === null)
  }
  ok("a per-client confirmation outranks the catalog",
    resolveWithOverride("hookups", "Yes", null).status === "hookups")
  ok("…and a confirmation shows where the catalog is silent",
    resolveWithOverride("included", null, null).status === "included")
}

console.log("\nthe badge renders nothing it cannot stand behind:")
{
  const BADGE = read("components/crm/WasherDryerBadge.tsx")
  ok("null renders nothing at all", /if \(!status\) return null/.test(BADGE))
  ok("it uses the client-facing labels", /WASHER_DRYER_LABEL\[status\]/.test(BADGE))
  ok("…and invents none of its own", !/Select Units|Specific Floor Plans|Not Verified|Unverified/.test(BADGE))
  ok("it is not a control", !/onClick|<button|<select|onChange/.test(BADGE))
}

console.log("\nit resolves the same way the client's badge does:")
{
  const CARD = read("components/crm/BestMatches.tsx")
  ok("through resolveWithOverride, not a second rule", /resolveWithOverride\(/.test(CARD) && !/deriveWasherDryer\(/.test(CARD))
  ok("…with the per-client confirmation first", /resolveWithOverride\(\s*clientWasherDryer,/.test(CARD))
  ok("…and the catalog pair second", /washer_dryer_included[\s\S]{0,200}?washer_dryer_connections/.test(CARD))
  ok("the card writes nothing when it derives", !/saveWasherDryer|onSaveWasherDryer\(/.test(CARD.split("washerDryerShown")[1] ?? ""))
}

console.log("\nthe two columns reach the card without a migration:")
{
  const ATT = read("lib/propertyIntel/attachWasherDryer.ts")
  ok("a narrow batched read of exactly two columns",
    /select\("place_id, washer_dryer_included, washer_dryer_connections"\)/.test(ATT))
  ok("…read-only", !/\.(upsert|update|insert|delete)\(/.test(ATT))
  ok("…failing to nulls rather than throwing", /catch \{[\s\S]{0,80}?return rows\.map\(blank\)/.test(ATT))
  const PAGE = read("app/admin/leads/page.tsx")
  ok("wired into the existing recommendations read", /return attachWasherDryer\(withCatalog\)/.test(PAGE))
  ok("…beside the existing catalog join, not replacing it", /attachCatalogRatings\(data \|\| \[\], supabase\)/.test(PAGE))
}

// ── 6. THE BOTTOM ROW FITS ────────────────────────────────────────────────────────────────────
console.log("\nthe bottom row cannot overlap or overflow a narrow card:")
{
  const CARD = raw("components/crm/BestMatches.tsx")
  // justify-END plus mr-auto, measured at 240-480px. With space-between a row holding only the
  // commission badge puts its single child at the START, so every property without a confirmed
  // washer/dryer would show its commission on the LEFT; a wrapped row did the same.
  ok("one row, both badges, commission pinned right",
    /flex w-full flex-wrap items-center justify-end gap-x-2 gap-y-1/.test(CARD))
  ok("…and the left badge is pushed, not spaced", /<WasherDryerBadge status=\{washerDryerShown\} className="mr-auto" \/>/.test(CARD))
  // The row itself must not use space-between, whatever else on the card does.
  ok("…so a commission-only row stays right", (() => {
    const i = CARD.indexOf('flex w-full flex-wrap items-center justify-end')
    return i > 0 && !CARD.slice(i - 120, i).includes("justify-between")
  })())
  ok("…washer\/dryer left, commission right",
    CARD.indexOf("<WasherDryerBadge") < CARD.indexOf("<CommissionBadge status={commission}"))
  ok("it WRAPS rather than overflowing", /flex-wrap/.test(CARD))
  ok("…with a row gap for when it does", /gap-y-1/.test(CARD))
  const BADGE = read("components/crm/WasherDryerBadge.tsx")
  ok("the W/D badge never wraps mid-label", /whitespace-nowrap/.test(BADGE))
  ok("…and cannot be squeezed", /flex-none/.test(BADGE))
  ok("…nor exceed the card", /max-w-full/.test(BADGE))
  const COMM = read("components/crm/CommissionBadge.tsx")
  ok("the commission badge is unchanged", /border-\[#1e5235\] bg-\[#0f2a1d\] text-\[#4ade80\]/.test(COMM))
}

// ── 7. THE THREE REASONS, READABLE WITHOUT EDITING ────────────────────────────────────────────
console.log("\nthe collapsed card keeps ONE inline row of reasons:")
{
  const CTRL = read("components/crm/ReasonsControl.tsx")
  ok("joined by the · separator", /\{shown\.join\(" · "\)\}/.test(CTRL))
  ok("…in one element, not one per reason", !/\{shown\.map\(/.test(CTRL))
  ok("…none dropped", !/shown\.slice\(/.test(CTRL))
  ok("…and the stored order is kept", !/shown\.sort|\[\.\.\.shown\]\.reverse/.test(CTRL))
  ok("no boxed sections and no block elements between reasons",
    !/<div[^>]*>\s*\{line\}|rounded-lg border[\s\S]{0,120}\{shown/.test(CTRL))
  ok("the type size is unchanged", /text-\[10\.5px\] leading-\[1\.35\]">[\s\S]{0,900}shown\.join/.test(CTRL))
  ok("it is inline text that wraps, not a flex row that stacks",
    /<div className="min-w-0 flex-1 text-\[10\.5px\] leading-\[1\.35\]">/.test(CTRL) &&
    !/truncate[\s\S]{0,200}shown\.join/.test(CTRL))
}

// ── 8. THE CLIENT-FACING PAGE ─────────────────────────────────────────────────────────────────
console.log("\nthe client-facing page is untouched:")
{
  const LIST = raw("app/locator-beast/r/[token]/RecommendationList.tsx")
  ok("the badge still reads the frozen snapshot field", /washerDryerLabel\(p\.washerDryer\)/.test(LIST))
  ok("…and knows nothing about the single-select", !/SingleSelect|wdSelect|WasherDryerBadge/.test(LIST))
  const PAGE = raw("app/locator-beast/r/[token]/page.tsx")
  ok("the pill CSS is unchanged", /\.lbr-wd\{display:inline-flex;align-self:flex-start/.test(PAGE))
  ok("…both variants", /\.lbr-wd--inc\{background:var\(--pill-bg\)/.test(PAGE) && /\.lbr-wd--hk\{/.test(PAGE))
  ok("…and the mobile override", /\.lbr-wd\{font-size:15px;padding:5px 13px;margin-top:12px\}/.test(PAGE))
  ok("the internal badge never ships to the client page",
    !/propertyIntel\/washerDryerSingleSelect|WasherDryerBadge/.test(LIST + PAGE))
}

// ── 9. THE 327 LOSSY AND 42 AMBIGUOUS ROWS, OPTION BY OPTION ──────────────────────────────────
// The real risk of one menu over two columns is a choice quietly overwriting the column the menu
// cannot show. Every live shape is crossed with every option, and the rule checked is the same
// one each time: a write either FILLS an unanswered column or is REPORTED as a replacement.
const CHOICES: WasherDryerSelectValue[] = ["included", "hookups", "select_units", "specific_floor_plans", "none", ""]
console.log("\nevery live shape × every option — no silent replacement:")
{
  let silent = 0, reported = 0, fills = 0, noops = 0
  const leaks: string[] = []
  for (const [inc, conn] of LIVE.map((r) => [r[0], r[1]] as const)) {
    const stored = toSingleSelect(inc, conn).stored
    for (const choice of CHOICES) {
      const w = fromSingleSelect(choice)
      const said = changeConsequences(stored, choice)
      for (const [col, nextVal, storedVal] of [
        ["Included", w.included, stored.included],
        ["Connections", w.connections, stored.connections],
      ] as const) {
        if (!nextVal) { noops++; continue }               // the option does not assert it
        if (!storedVal) { fills++; continue }             // filling a blank discards nothing
        if (nextVal === storedVal) { noops++; continue }  // already correct
        // A real replacement. It MUST appear in the warning.
        if (said.some((c) => c.column === col && c.from === storedVal && c.to === nextVal)) reported++
        else { silent++; leaks.push(`${inc ?? "—"}/${conn ?? "—"} + ${choice || "Not Verified"} → ${col}`) }
      }
    }
  }
  ok(`no replacement goes unreported (${reported} reported, ${fills} fills, ${noops} no-ops)`, silent === 0, leaks.join(", "))
  ok("…and the warning never invents one", (() => {
    for (const [inc, conn] of LIVE.map((r) => [r[0], r[1]] as const)) {
      const stored = toSingleSelect(inc, conn).stored
      for (const choice of CHOICES) {
        const w = fromSingleSelect(choice)
        for (const c of changeConsequences(stored, choice)) {
          const nextVal = c.column === "Included" ? w.included : w.connections
          const storedVal = c.column === "Included" ? stored.included : stored.connections
          if (!nextVal || !storedVal || nextVal === storedVal) return false
        }
      }
    }
    return true
  })())
  ok("Not Verified can never replace anything", LIVE.every(([i, c]) => changeConsequences(toSingleSelect(i, c).stored, "").length === 0))
}

console.log("\nthe worst cases, spelled out:");
{
  const c1 = changeConsequences(toSingleSelect("Yes", "Yes").stored, "none")
  ok("Yes / Yes → None replaces BOTH, and says both", c1.length === 2 &&
    c1[0].from === "Yes" && c1[0].to === "No" && c1[1].from === "Yes" && c1[1].to === "No")
  const c2 = changeConsequences(toSingleSelect("Select Units", "Yes").stored, "hookups")
  ok("Select Units / Yes → Hookups replaces the scope answer", c2.length === 1 &&
    c2[0].column === "Included" && c2[0].from === "Select Units" && c2[0].to === "No")
  const c3 = changeConsequences(toSingleSelect(null, "Yes").stored, "hookups")
  ok("— / Yes → Hookups FILLS the blank and replaces nothing", c3.length === 0)
  const c4 = changeConsequences(toSingleSelect(null, "Select Units").stored, "included")
  ok("an ambiguous row choosing Included replaces nothing it had", c4.length === 0)
  // Hookups asserts BOTH halves, and this row has a stored answer for both — so it replaces two.
  const c5 = changeConsequences(toSingleSelect("Yes", "No").stored, "hookups")
  ok("Yes / No → Hookups replaces both answers, and names each", c5.length === 2 &&
    c5[0].column === "Included" && c5[0].from === "Yes" && c5[0].to === "No" &&
    c5[1].column === "Connections" && c5[1].from === "No" && c5[1].to === "Yes")
}

console.log("\n…and both editors show it before saving:")
for (const file of ["components/crm/PropertyPricingEditor.tsx", "components/crm/MapPropertyEditor.tsx"]) {
  const src = read(file)
  const name = file.split("/").pop()
  ok(`${name} computes the consequences`, /changeConsequences\(wdState\.stored, wdSelect\)/.test(src))
  ok(`${name} renders them verbatim`, /Saving replaces/.test(src) && /\{c\.from\}/.test(src) && /\{c\.to\}/.test(src))
  ok(`${name} only once the menu is touched`, /wdTouched \?? ?&?&? ?changeConsequences|wdTouched \? changeConsequences/.test(src))
  ok(`${name} does NOT block the save`, !/disabled=\{[^}]*wdReplaces|return.*wdReplaces\.length/.test(src))
}

// ── 10. THE APPROVED BADGE ────────────────────────────────────────────────────────────────────
console.log("\nthe badge matches the approved card:")
{
  const BADGE = read("components/crm/WasherDryerBadge.tsx")
  ok("Included takes the green treatment", /border-\[#1e5235\] bg-\[#0f2a1d\] text-\[#4ade80\]/.test(BADGE))
  ok("…the same family as the commission badge",
    /border-\[#1e5235\] bg-\[#0f2a1d\] text-\[#4ade80\]/.test(read("components/crm/CommissionBadge.tsx")))
  ok("Hookups reads neutral, as the client pill already does", /crm-text-secondary/.test(BADGE))
  ok("no icon — the approved card has text only", !/<svg/.test(BADGE))
}

console.log(`\nWasher/dryer single select: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
