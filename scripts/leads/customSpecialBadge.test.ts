/**
 * CUSTOM SPECIALS ON THE BADGE — the Property Editor's "Custom" option, end to end.
 *
 *   npx tsx scripts/leads/customSpecialBadge.test.ts
 *
 * THE DEFECT. An agent chose Custom in the Map Explorer's Property Editor and typed
 * "Reduced Rent + $199 1st Month's Rent!" for The Helix. The editor saved it correctly —
 * property_catalog.current_special holds it verbatim, with today's checked-at date — and the
 * Recommended Properties card showed no special at all. The card reads the catalog live, so
 * nothing was stale; normalizeShortSpecial simply returned null, because the text matches none
 * of the four shapes the external site publishes, and resolvePromoBadges hides the badge when
 * the filter returns null.
 *
 * So the assertions below are about the SEAM: the editor's round trip, the resolver's new
 * verbatim fallback, and the things that must NOT have changed — every standard special, every
 * "no offer" form, and the long master text the extractors already read.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  resolvePromoBadges, normalizeShortSpecial, truncateBadgeLabel, VERBATIM_BADGE_MAX,
} from "@bc/companion-shared"
import { specialToSelection, selectionToSpecial } from "@/lib/propertyIntel/moveInSpecials"

let pass = 0
let fail = 0
const ok = (label: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ✓ ${label}`) } else { fail++; console.log(`  ✗ ${label}${detail ? `\n      ${detail}` : ""}`) }
}
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
const read = (p: string) => strip(readFileSync(join(process.cwd(), p), "utf8"))

/** The exact text production holds for The Helix (ChIJo-hxHbdhXIYR4HDuK11vVxw). */
const HELIX = "Reduced Rent + $199 1st Month's Rent!"

// ── 1. THE EDITOR'S ROUND TRIP WAS NEVER THE PROBLEM ──────────────────────────────────────────
console.log("the Property Editor stores the custom text verbatim:")
{
  const sel = specialToSelection(HELIX)
  ok("reading it back selects Custom", sel.choice === "custom", JSON.stringify(sel))
  ok("…with the whole sentence in the details field, not a label", sel.details === HELIX)
  ok("…and saving it unchanged writes exactly what was there",
    selectionToSpecial(sel.choice, sel.details, sel.original) === HELIX)
  // null is the "send nothing" signal, not an erase: the route omits the field, so the stored
  // special survives a locator who cleared the box without typing a replacement.
  ok("…while a blank Custom sends nothing rather than erasing the special",
    selectionToSpecial("custom", "", HELIX) === null)
  ok("…and a never-researched property still writes nothing",
    selectionToSpecial("", "", null) === null)
}

// ── 2. THE FIX ────────────────────────────────────────────────────────────────────────────────
console.log("\nthe badge now carries the agent's own words:")
{
  ok("the custom text produces a badge at all", normalizeShortSpecial(HELIX) !== null)
  ok("…and it is the text VERBATIM, not a generic \"Custom\"", normalizeShortSpecial(HELIX) === HELIX)
  const badges = resolvePromoBadges({ currentSpecial: HELIX, giftCardStatus: null, giftCardAmount: null })
  ok("…the card resolves exactly one badge", badges.length === 1, JSON.stringify(badges))
  ok("…coloured as a concession, which is the existing green pill", badges[0].kind === "special")
  ok("…carrying the agent's sentence", badges[0].text === HELIX)
  ok("…and the word \"Custom\" appears nowhere in it", !/custom/i.test(badges[0].text))
}
console.log("\nwhitespace is tidied, wording is not:")
{
  ok("newlines and runs of spaces collapse", normalizeShortSpecial("Reduced  Rent\n+ $199") === "Reduced Rent + $199")
  ok("…but no word is dropped, reordered or restated",
    normalizeShortSpecial("Ask about our reduced rent offer") === "Ask about our reduced rent offer")
}

// ── 3. WHAT MUST NOT HAVE CHANGED ─────────────────────────────────────────────────────────────
// Every one of these already rendered before the fix, and must render identically after it.
console.log("\nevery standard special is untouched:")
{
  const SAME: [string, string][] = [
    ["Up to 6 Weeks Free", "Up to 6 Weeks Free"],
    ["Up to 8 Weeks Free", "Up to 8 Weeks Free"],
    ["Up to 10 Weeks Free", "Up to 10 Weeks Free"],
    ["Up to 1 Month Free", "Up to 1 Month Free"],
    ["Up to 2 Months Free on Select Homes", "Up to 2 Months Free"],
    ["100% off rent for 2 month(s) on a 12 mo lease Other Concessions: 8 WEEKS FREE.", "2 Months Free"],
    ["$1,000 off", "$1,000 Off"],
    ["$200 Gift Card", "$200 Gift Card"],
    ["$1,500 credit", "$1,500 Credit"],
  ]
  for (const [stored, badge] of SAME) {
    ok(`${JSON.stringify(stored.slice(0, 34))} → ${JSON.stringify(badge)}`,
      normalizeShortSpecial(stored) === badge, JSON.stringify(normalizeShortSpecial(stored)))
  }
}
console.log("\n\"no offer\" still renders nothing at all:")
{
  for (const t of ["", "   ", "None", "none", "N/A", "n/a", "--", "—", "No Special", "No Specials",
                   "No ongoing concessions", "Unknown", "unknown"]) {
    ok(`${JSON.stringify(t)} → no badge`, normalizeShortSpecial(t) === null, JSON.stringify(normalizeShortSpecial(t)))
  }
  ok("…and the card renders no badge row for them",
    resolvePromoBadges({ currentSpecial: "No Special", giftCardStatus: null, giftCardAmount: null }).length === 0)
}
console.log("\na long unparsed text is still hidden, exactly as before:")
{
  const long = "We are currently running a promotion on selected floor plans, please call the leasing office for details and availability"
  ok(`${long.length} characters is past the bound`, long.length > VERBATIM_BADGE_MAX)
  ok("…so it produces no badge rather than a fragment", normalizeShortSpecial(long) === null)
  const atBound = "a".repeat(VERBATIM_BADGE_MAX)
  ok("…while the bound itself is inclusive", normalizeShortSpecial(atBound) === atBound)
  ok("…and one character past it is not", normalizeShortSpecial("a".repeat(VERBATIM_BADGE_MAX + 1)) === null)
  ok("the bound sits above every agent-typed value and below the master text (37 < bound < 78)",
    VERBATIM_BADGE_MAX > 37 && VERBATIM_BADGE_MAX < 78)
}

// ── 4. THE BANNER ITSELF IS UNCHANGED ─────────────────────────────────────────────────────────
console.log("\nthe banner's design, colour and placement are untouched:")
{
  const PB = read("components/crm/PromoBadges.tsx")
  ok("the concession pill is still the same green", /special: "border-\[#8fcaa6\] bg-\[#e4f4ea\] text-\[#16633a\]"/.test(PB))
  ok("…and the gift card still the same blue", /gift_card: "border-\[#8fb6ea\] bg-\[#e8f0fe\] text-\[#1c3f75\]"/.test(PB))
  ok("…still one row, never two", /flex-nowrap/.test(PB))
  ok("…still truncating rather than wrapping", /className="truncate"/.test(PB) && /min-w-0 shrink/.test(PB))
  ok("…and the truncation is MEASURED by the browser, not a character count",
    !/maxChars \?\? \d+/.test(PB))
  ok("…and the full text is still on the pill's title, so nothing is lost to truncation",
    /title=\{b\.text\}/.test(PB))
  ok("no new badge kind was introduced", (PB.match(/kind === "special"|kind: "special"/g) || []).length > 0 &&
    !/kind === "custom"|kind: "custom"/.test(PB))
  // Truncation can only ever shorten, including for a verbatim custom label.
  const cut = truncateBadgeLabel(HELIX, 28)
  ok("a long custom label truncates with an ellipsis instead of overflowing", cut.length <= 28 && cut.endsWith("…"))
  ok("…keeping the leading words, so the offer is never strengthened", HELIX.startsWith(cut.replace(/…$/, "").trimEnd()))
}

// ── 5. NO CLIENT-SPECIFIC INFORMATION IS INVOLVED ─────────────────────────────────────────────
// lead_recommendations has its OWN `special` column, written once when a row is added from
// external-site data. The banner has never read it: the card reads current_special live from
// property_catalog through attachCatalogRatings. So there is no per-client override for this
// change to overwrite — which is why the fix is a display change and touches no lead row.
console.log("\nthe card reads the catalog live, not a per-client snapshot:")
{
  const CAT = read("lib/propertyExplorer/catalog.ts")
  ok("attachCatalogRatings overwrites the row's special from property_catalog",
    /current_special: rec\?\.currentSpecial \?\? null/.test(CAT))
  const BM = read("components/crm/BestMatches.tsx")
  ok("…and the card passes THAT to the resolver", /currentSpecial: r\.current_special/.test(BM))
  ok("…never the row's own `special` column", !/currentSpecial: r\.special/.test(BM))
}
console.log("\nthe same resolver feeds every surface, so they cannot disagree:")
{
  for (const [file, path] of [
    ["Recommended Properties", "components/crm/BestMatches.tsx"],
    ["Favorite Properties", "components/crm/LeadFavorites.tsx"],
    ["the client-facing /r page", "app/locator-beast/r/[token]/RecommendationList.tsx"],
  ] as const) {
    ok(`${file} resolves through resolvePromoBadges`, /resolvePromoBadges\(/.test(read(path)))
  }
}

// ── 6. ONE LINE, MEASURED BY THE BROWSER, ON BOTH SURFACES ───────────────────────────────────
// The banner must never wrap, must show everything that fits, and must truncate with an
// ellipsis when it does not — decided by the real width, not a character count. Neither surface
// can be measured from source, so what is asserted here is the CSS contract that makes the
// browser do the measuring; the pixel results are in the report beside this change.
console.log("\nthe CRM row fits by measurement, not by counting:")
{
  const PB = read("components/crm/PromoBadges.tsx")
  ok("the row cannot wrap", /flex flex-nowrap/.test(PB))
  ok("each pill may shrink, and may shrink below its content", /min-w-0 shrink/.test(PB))
  ok("the label truncates with an ellipsis at whatever width it gets", /className="truncate"/.test(PB))
  ok("the icon never shrinks, so a squeezed pill is still recognisable", /flex-none/.test(PB))
  ok("no default character cap remains", !/maxChars \?\? \d+/.test(PB))
  for (const [surface, path] of [
    ["Recommended Properties", "components/crm/BestMatches.tsx"],
    ["Favorite Properties", "components/crm/LeadFavorites.tsx"],
  ] as const) {
    const src = read(path)
    // shrink-0 is what lets the badge actually REACH the 62% the class already allowed. Without
    // it the badge shrank alongside the address and never got near its own ceiling — at 430px
    // it took 115px of a 295px row, where 62% is 183px.
    ok(`${surface} lets the badge claim its existing 62% allowance`,
      /className="min-w-0 max-w-\[62%\] shrink-0"/.test(src))
  }
}
console.log("\nthe client-facing /r card does the same, in its own stylesheet:")
{
  const LIST = read("app/locator-beast/r/[token]/RecommendationList.tsx")
  const CSS = readFileSync(join(process.cwd(), "app/locator-beast/r/[token]/page.tsx"), "utf8")
  ok("no character cap is applied to the label", !/truncateBadgeLabel/.test(LIST) && !/const cap =/.test(LIST))
  ok("…the full text goes to the DOM", /<span className="lbr-pill-label">\{b\.text\}<\/span>/.test(LIST))
  ok("…and the full text is still the pill's title", /title=\{b\.text\}/.test(LIST))
  ok("the promo row cannot wrap", /\.lbr-promo\{[^}]*flex-wrap:nowrap/.test(CSS))
  ok("…it is bounded to the card, so a long offer cannot widen it",
    /\.lbr-promo\{[^}]*left:12px;right:12px/.test(CSS))
  ok("…its pills may shrink", /\.lbr-pill\{[^}]*min-width:0/.test(CSS))
  ok("…and the label truncates with an ellipsis",
    /\.lbr-pill-label\{overflow:hidden;text-overflow:ellipsis;white-space:nowrap\}/.test(CSS))
}
console.log("\ntruncation is display-only — the stored text is never shortened:")
{
  const ROUTE = read("app/api/admin/owner/property-pricing/route.ts")
  ok("the save route writes the trimmed text and nothing else", /add\("current_special", s\)/.test(ROUTE))
  ok("…no badge helper is imported anywhere near the write path", !/normalizeShortSpecial|truncateBadgeLabel/.test(ROUTE))
  ok("the resolver returns the stored text unchanged", normalizeShortSpecial(HELIX) === HELIX)
}

console.log(`\nCustom special badge: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
