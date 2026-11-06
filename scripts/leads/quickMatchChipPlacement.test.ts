// QUICK MATCH CHIP — WHERE IT SITS.
//
// Run: npx tsx scripts/leads/quickMatchChipPlacement.test.ts   (pure — reads source, no network)
//
// A positioning-only change, so what is tested is position and the ABSENCE of everything else.
// The chip moved out of its own block below the card and into the name row, in the slot and by
// the pattern Favorites already uses for its Top Pick badge. These assertions are deliberately
// structural: they read the real source and would fail if the chip drifted back below the name,
// if its colour or type were restyled on the way, or if the detail it opens were narrowed into
// the name row with it.
import { readFileSync } from "node:fs"
import { execSync } from "node:child_process"

const read = (p: string) => readFileSync(p, "utf8")
let pass = 0, fail = 0
const ok = (what: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ok   ${what}`) }
  else { fail++; console.log(`  FAIL ${what}${detail ? `  — ${detail}` : ""}`) }
}

const card = read("components/crm/BestMatches.tsx")
const badge = read("components/crm/QuickMatchBadge.tsx")
const favorites = read("components/crm/LeadFavorites.tsx")

console.log("\nQUICK MATCH CHIP — placed beside the property name\n")

// ── 1. IT IS IN THE NAME ROW, INSIDE THE NAME GROUP ────────────────────────────────────────
const nameRow = card.slice(card.indexOf("{/* Name row"), card.indexOf("{/* Address row"))
ok("the chip renders inside the name row", /<QuickMatchChip/.test(nameRow))
ok("…after the property name, not before it",
  nameRow.indexOf("{r.property_name}") < nameRow.indexOf("<QuickMatchChip"))
ok("…and before the top-right controls group",
  nameRow.indexOf("<QuickMatchChip") < nameRow.indexOf('className="flex flex-none items-center gap-1.5"'))
ok("the name and the chip share one left-hand group, so the controls stay right",
  /<div className="min-w-0 flex-1 flex flex-wrap items-center gap-1\.5">[\s\S]*?<QuickMatchChip[\s\S]*?<\/div>/.test(nameRow))

// ── 1b. THE NARROW CASE, MEASURED ──────────────────────────────────────────────────────────
// A 390px phone gives this row 192px and the "Quick Match · Verify" chip is 142 of them. With
// the name free to collapse the pair fits by crushing the name to two characters, so the group
// wraps instead: both on one line wherever both fit, and otherwise the chip on its own line
// beneath a name shown in full — which is where production puts it today.
ok("the name group wraps rather than crushing the name", /flex-wrap/.test(nameRow))
ok("…and takes the row's spare width, so wrapping is decided against a real width",
  /<div className="min-w-0 flex-1 flex flex-wrap/.test(nameRow))

// ── 2. THE PATTERN IS THE ONE TOP PICK ALREADY USES ────────────────────────────────────────
// Favorites puts its Top Pick badge in exactly this shape: an inner min-w-0 flex group holding
// the (truncating) name and a flex-none badge, inside the justify-between name row.
const favNameGroup = /<div className="min-w-0 flex items-center gap-1\.5">[\s\S]{0,900}?Top Pick/.test(favorites)
ok("Favorites' Top Pick badge uses the min-w-0 name group this copies", favNameGroup)
ok("…and the Quick Match chip is given the same flex-none treatment",
  /<QuickMatchChip\s+className="flex-none"/.test(nameRow))
ok("the name still truncates, so a long name ellipses instead of pushing the chip out",
  /{r\.property_name}/.test(nameRow) && /min-w-0 truncate text-\[12\.5px\]/.test(nameRow))
ok("the chip never wraps mid-label", /whitespace-nowrap/.test(badge))

// ── 3. TOP PICK IS UNTOUCHED ───────────────────────────────────────────────────────────────
const BASELINE = "70008f6"
const haveBaseline = (() => {
  try { execSync(`git cat-file -e ${BASELINE}^{commit}`, { stdio: "ignore" }); return true } catch { return false }
})()
ok("the production baseline is present, so the diffs below are real", haveBaseline)
const touched = (paths: string) =>
  execSync(`git diff --name-only ${BASELINE} -- ${paths}`, { encoding: "utf8" }).trim()
ok("Favorites — where the Top Pick badge lives — is not changed at all",
  touched("components/crm/LeadFavorites.tsx") === "", touched("components/crm/LeadFavorites.tsx"))
ok("the release modifies exactly the two component files and nothing else",
  touched(".") === "components/crm/BestMatches.tsx\ncomponents/crm/QuickMatchBadge.tsx", touched("."))
ok("…and adds exactly one new file, this test",
  execSync("git status --porcelain --untracked-files=all -- . ':!node_modules' ':!.vercel'", { encoding: "utf8" })
    .split("\n").filter((l) => l.startsWith("??")).map((l) => l.slice(3)).join(" ")
    === "scripts/leads/quickMatchChipPlacement.test.ts")

// ── 4. THE CHIP'S OWN APPEARANCE DID NOT CHANGE ────────────────────────────────────────────
// The exact strings from the approved design, read out of the component rather than described.
ok("light blue, unchanged — border, ground and text",
  badge.includes('cls: "border-[#2b4a7a] bg-[#0f1d2e] text-[#7cb2f5]"'))
ok("the Verify variant keeps its amber too",
  badge.includes('cls: "border-[#d8a34a] bg-[#fdf3e2] text-[#8a5a10]"'))
ok("font, size, padding and radius are the chip's original values",
  /rounded-lg border px-2\.5 py-\[3px\] text-\[11px\] font-medium leading-none/.test(badge))
ok("both labels are unchanged", badge.includes('label: "Quick Match"') && badge.includes('label: "Quick Match · Verify"'))
ok("the disclosure arrow still rides on the chip", /\{open \? "▴" : "▾"\}/.test(badge))

// ── 5. THE DROPDOWN IS UNCHANGED, AND STILL FULL WIDTH BELOW THE CARD'S TOP BLOCK ──────────
ok("the detail is rendered OUTSIDE the name row", !/QuickMatchDetail/.test(nameRow))
ok("…in the block above the operational row, as before",
  card.indexOf("<QuickMatchDetail") < card.indexOf("{/* Operational row"))
ok("…at the full width of the card", /w-full space-y-1\.5 rounded-lg border border-\[var\(--crm-border-soft\)\]/.test(badge))
for (const phrase of [
  "No screening policy on record for this property — everything below is unconfirmed.",
  "Possible conflicts", "Needs verification", "Approval costs", "Why it was drafted",
  "A Quick Match draft, for the agent only. It is never sent to the client and never",
]) ok(`the explanation text is untouched: ${JSON.stringify(phrase.slice(0, 38))}`, badge.includes(phrase))

// ── 6. OPEN/CLOSE BEHAVES AS IT DID: PER ROW, INDEPENDENT ──────────────────────────────────
// The state had to leave the badge, because the chip and its detail are no longer siblings.
// A Set keyed by row id keeps the old behaviour: opening one row does not close another.
ok("open rows are tracked as a set, not a single id", /useState<ReadonlySet<string>>/.test(card))
ok("…toggling a row adds or removes only that row",
  /const next = new Set\(prev\)\s*\n\s*if \(!next\.delete\(id\)\) next\.add\(id\)/.test(card))
ok("the chip is told whether ITS row is open", /open=\{openScreening\.has\(String\(r\.id\)\)\)?\}/.test(card))
ok("the detail renders only for an open row", /\{screening && openScreening\.has\(String\(r\.id\)\) && \(/.test(card))

// ── 7. NOTHING ELSE MOVED ──────────────────────────────────────────────────────────────────
ok("the chip is still rendered by exactly one surface",
  (card.match(/<QuickMatchChip/g) ?? []).length === 1)
ok("a row with no screening record renders no chip at all", /\{screening && \(\s*<QuickMatchChip/.test(card))
ok("the engine, its API route and its persistence are not touched by this change",
  touched("lib/quickMatch app/api") === "", touched("lib/quickMatch app/api"))
ok("no migration, no SQL", touched("supabase") === "", touched("supabase"))
ok("Unleash Beast is untouched",
  touched("lib/propertyExplorer components/crm/explorer") === "",
  touched("lib/propertyExplorer components/crm/explorer"))
ok("the client-facing recommendation page still knows nothing about screening",
  !/QuickMatchChip|QuickMatchDetail|readScreening|screening/.test(read("app/locator-beast/r/[token]/RecommendationList.tsx")))

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed\n`)
process.exit(fail > 0 ? 1 : 0)
