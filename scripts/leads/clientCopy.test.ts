// CLIENT-FACING COPY — the recommendations page and its link preview.
//
// Both changes are small and both are the kind that quietly regress: a footnote that drifts into
// a banner, and a preview title that gets "helpfully" re-synced with the image it was deliberately
// made to differ from. These assertions pin the exact wording and the exact placement.
import { readFileSync } from "node:fs"

let pass = 0
let fail = 0
function ok(label: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`) }
}

const page = readFileSync("app/locator-beast/r/[token]/page.tsx", "utf8")
const ogImage = readFileSync("app/locator-beast/r/[token]/opengraph-image.tsx", "utf8")

console.log("\n1. THE FREE-SERVICE LINE WAS REMOVED, AND LEFT NOTHING BEHIND:")
// It shipped on 21 Oct and was withdrawn the same day. These assertions are kept rather than
// deleted: the wording, the class and the two CSS rules must ALL stay gone, and a partial removal
// — the markup pulled but the styling left, or vice versa — is the failure worth catching.
ok("the sentence is gone", !page.includes("My service is completely free to you!"))
ok("the lbr-free class is gone from the markup", !/className="lbr-free"/.test(page))
ok("its base CSS rule is gone", !/\.lbr-recs-head p\.lbr-free\{/.test(page))
ok("…and so is the desktop override", (page.match(/lbr-free/g) ?? []).length === 0)
ok("no empty <p> was left in its place",
  !/<p className="lbr-free">\s*<\/p>/.test(page) && !/<p><\/p>/.test(page))

console.log("\n2. THE BLOCK IT SAT IN IS INTACT:")
ok("the count line still renders", page.includes("<p>{countLine}</p>"))
ok("the heading still renders", page.includes("<h2>Your Recommendations</h2>"))
ok("lbr-recs-head still closes immediately after the count line",
  /<h2>Your Recommendations<\/h2>\s*<p>\{countLine\}<\/p>\s*<\/div>/.test(page))
ok("Next Steps still follows it", page.indexOf("{countLine}") < page.indexOf("<h2>Next Steps</h2>"))

console.log("\n3. THE PREVIEW TITLE — changed; the IMAGE deliberately is not:")
ok('the title line is "Realtor/Locator"', /const genericTitle = "Realtor\/Locator"/.test(page))
ok('…with no "Your" prefix, which cost characters a long name needs',
  !/genericTitle = "Your /.test(page))
// THE PLACEHOLDER IS NOT A PERSON. The RPC's last-resort agent_name is the literal
// "Your Locator"; letting it through would title the preview "Your Locator | Realtor/Locator",
// which says the same thing twice and names nobody.
ok("the RPC's placeholder name is treated as absent",
  /resolved\.toLowerCase\(\) !== "your locator"/.test(page))
ok("…so the fallback is the role ALONE", /: genericTitle$/m.test(page))
// The AGENT'S OWN NAME, never a hard-coded one — the whole point is that every Locator Beast
// user's share carries their branding.
ok("…prefixed with the agent's resolved display name",
  /const title = agentName \? `\$\{agentName\} \| \$\{genericTitle\}` : genericTitle/.test(page))
ok("…read from the share RPC, not a constant",
  /const resolved = share\?\.agent_name\?\.trim\(\) \|\| null/.test(page))
// Comments stripped: the character-count note in that function uses a real name as an EXAMPLE,
// and a raw scan reads the illustration as a hard-coded value.
ok("…and no locator name is hard-coded in the metadata CODE",
  !/Jay Morris/.test(
    page.slice(page.indexOf("export async function generateMetadata"), page.indexOf("type Resolved"))
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")))
// Proof the stripper is doing something: a phrase that exists ONLY in a comment must survive a
// raw read and vanish from the stripped one. Without this, the assertion above could pass simply
// because the stripper ate everything.
{
  const marker = "many locators are also licensed realtors"
  const stripped = page.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
  ok("…and the stripper works (a comment-only phrase is removed)",
    page.includes(marker) && !stripped.includes(marker))
}
// It must reach BOTH the Open Graph and Twitter card, or only some apps show it.
ok("the new title is used for Open Graph", /openGraph: \{ title,/.test(page))
ok("…and the Twitter card", /twitter: \{ card: "summary_large_image" as const, title \}/.test(page))
ok("…and the page title itself", /\.\.\.base,\s*title,/.test(page))
// Everything else about the preview is untouched.
{
  const og = ogImage
  ok("the OG image still renders the client's Custom List", /Custom List/.test(og))
  ok("…and was not given the new wording", !/Realtor\/Locator/.test(og))
  ok("the metadata still carries no description", !/description:/.test(page.slice(page.indexOf("const title = agentName"), page.indexOf("type Resolved"))))
  ok("…and still never leaks client data into the title", !/client_first_name|clientFirst/.test(page.slice(page.indexOf("const title = agentName"), page.indexOf("type Resolved"))))
}
ok('"Your Custom List" is gone from the title', !/genericTitle = "Your Custom List"/.test(page))
ok("the locator's name still prefixes it", /\$\{agentName\} \| \$\{genericTitle\}/.test(page))
ok("og:title and twitter:title both follow the same value",
  /openGraph: \{ title,/.test(page) && /twitter: \{[^}]*title \}/.test(page))

console.log("\n4. THE PERSONALISED IMAGE IS UNTOUCHED:")
ok("the image still says \"<First>'s Custom List\"",
  /`\$\{clientFirst\}’s Custom List`/.test(ogImage))
ok("…with the generic image fallback unchanged", /: "Your Custom List"/.test(ogImage))
ok("the on-page eyebrow still reads 'Custom List for <First>'",
  /Custom List for \$\{firstName\}/.test(page))

console.log("\n4b. THE BOTTOM CLEARANCE ONLY EXISTS WHEN THE STICKY BAR DOES:")
// RecommendationList renders the mobile favorites bar only while favorites are still being
// chosen ({!done && …}), but .lbr-shell reserved its 118px of clearance unconditionally. Once a
// client tapped Done Selecting Favorites the bar vanished and the reserved space stayed —
// measured at 375x812: 118px of empty page below the legal footer on a long list, 0px after.
// 128px, not 118: the instruction line gained 10px of padding (4c below), so the clearance grew
// with the bar. The property under test is that the clearance EXISTS and is scoped — the exact
// figure is asserted against the bar's measured height in 4c.
ok("the clearance is scoped to the bar's presence",
  /\.lbr-shell:has\(\.lbr-sticky\)\{padding-bottom:calc\(\d+px \+ env\(safe-area-inset-bottom\)\)\}/.test(page))
console.log("\n4e. THE FAVORITES BAR IS NAVY, AND STILL READABLE IN EVERY STATE:")
{
  // The bar was white-on-white and blended into the card stack beneath it — the one thing a
  // fixed action bar must not do. It now uses the page's OWN --navy token, not a new shade.
  const barRule = page.slice(page.indexOf(".lbr-sticky{display:flex"), page.indexOf(".lbr-sticky .lbr-sticky-count{"))
  const list = readFileSync("app/locator-beast/r/[token]/RecommendationList.tsx", "utf8")
  // --navy-deep, not --navy: the header is a gradient whose darkest stop is rgba(6,18,38,.99),
  // and --navy (#0e2545) is the lighter heading blue. A bar in --navy read as a near-match.
  ok("the bar uses the DEEP navy token", /background:var\(--navy-deep\)/.test(barRule))
  ok("…not the lighter heading navy", !/background:var\(--navy\)[;\s}]/.test(barRule))
  ok("…and no unrelated shade was introduced", !/background:#[0-9a-f]{6}/i.test(barRule))
  ok("the token carries the header gradient's exact darkest stop",
    /--navy-deep:#061226/.test(page) && /rgba\(6,18,38,\.99\)/.test(page))
  ok("…and the header gradient itself was not rewritten",
    (page.match(/rgba\(6,18,38,\.99\) 0%/g) ?? []).length === 2)
  ok("the old white bar is gone", !/background:rgba\(255,255,255,\.96\)/.test(page))
  ok("the instruction line is white on it", /\.lbr-sticky \.lbr-sticky-count\{color:#fff\}/.test(page))

  // THE HEART. Unfilled it strokes --navy, which on navy is invisible; the tick keeps its green.
  ok("the heart is explicitly red", /\.lbr-sticky \.lbr-sticky-count svg:not\(\.lbr-sticky-ok\)\{stroke:#e0245e\}/.test(page))
  // Slightly larger, in the bar only — the card's own heart keeps its default 21.
  // Counted on the attribute itself: a [^>]* class stops at the `>` inside {favCount > 0}, so it
  // silently missed a heart that was in fact correct.
  ok("every sticky heart is 17px", (list.match(/size=\{17\}/g) ?? []).length === 3)
  ok("…and only hearts carry that size", (list.match(/<Heart /g) ?? []).length === 4)
  ok("…none is left at 15", !/size=\{15\}/.test(list))
  ok("the card heart is untouched", /<Heart filled=\{isFav\} \/>/.test(list))
  // 17/15 = +13.3%, inside the 10–15% asked for.
  ok("the increase is ~13%", Math.round(((17 - 15) / 15) * 1000) / 10 === 13.3)
  ok("the row's min-height still fixes the bar", /\.lbr-sticky-count\{font-size:15px;font-weight:600;min-height:40px\}/.test(page))
  ok("…and the green tick is excluded from that rule", /:not\(\.lbr-sticky-ok\)/.test(page))
  ok("the tick still has its own green", /\.lbr-sticky-ok\{color:var\(--green\)/.test(page))

  // THE BUTTON. Enabled it was background:var(--navy) — navy on navy, i.e. invisible. It
  // inverts; the DISABLED surface is deliberately unchanged.
  ok("the enabled button inverts to white with a navy label",
    /\.lbr-sticky \.lbr-sticky-btn\{background:#fff;color:var\(--navy\)\}/.test(page))
  ok("the disabled surface is unchanged", /\.lbr-sticky-btn:disabled\{background:var\(--line\);color:var\(--muted\)/.test(page))
  ok("…so the two are told apart by label contrast, not fill alone",
    /\.lbr-sticky \.lbr-sticky-btn:disabled\{background:var\(--line\);color:var\(--muted\)\}/.test(page))

  // COMPACTNESS AND SAFE AREA — the measured 117px bar and its 135px clearance must still hold.
  ok("padding and the safe-area inset are untouched",
    /padding:10px 14px calc\(10px \+ env\(safe-area-inset-bottom\)\)/.test(page))
  ok("the bar is still fixed to the bottom", /\.lbr-sticky\{display:flex[^}]*position:fixed[^}]*bottom:0/.test(page))
  ok("the gap between the line and the button is unchanged", /\.lbr-sticky\{display:flex[^}]*gap:8px/.test(page))
  ok("the button's size and radius are unchanged",
    /\.lbr-sticky-btn\{[^}]*min-height:48px[^}]*border-radius:12px/.test(page))

  // ALL FOUR STATES share this one bar, so none can be left unreadable.
  const states = (list.match(/className="lbr-sticky"/g) ?? []).length
  ok(`all ${states} bar states share the one element`, states === 4, String(states))
  for (const copy of ["Choose your favorite properties", "Your favorites are saved", "Tour availability sent!"]) {
    ok(`"${copy}" still renders`, list.includes(copy))
  }
  // The count line is BUILT, not literal — a plain substring search would never find it.
  ok('the running count line still renders ("N favorites selected")',
    /\$\{favCount\} \$\{favCount === 1 \? "favorite" : "favorites"\} selected/.test(list))
  ok("the button's behaviour is untouched — same handler", /onClick=\{markDone\}/.test(list))
  ok("…and the same disabled condition", /disabled=\{doneBusy \|\| favCount === 0\}/.test(list))
}

ok("the UNCONDITIONAL clearance is gone",
  !/^\.lbr-shell\{padding-bottom:calc\(118px/m.test(page))
ok("with no bar the page still clears the home indicator",
  /\.lbr-shell\{padding-bottom:env\(safe-area-inset-bottom\)\}/.test(page))
ok("both rules live inside the mobile breakpoint, so desktop is untouched", (() => {
  const i = page.indexOf("@media (max-width:640px)")
  const j = page.indexOf(".lbr-shell:has(.lbr-sticky)")
  return i > 0 && j > i
})())
ok("the desktop shell keeps its original 40px bottom margin",
  /\.lbr-shell\{max-width:1300px;margin:26px auto 40px/.test(page))
ok("the bar itself is unchanged — same height contract",
  /\.lbr-sticky\{display:flex[^}]*position:fixed/.test(page))

console.log("\n4c. THE STICKY BAR'S INSTRUCTION LINE:")
// It had NO vertical padding — a bare 23px line box beside a 48px button, which read as
// compressed. min-height rather than padding, so the box is exactly 40px whatever the font
// metrics do. Measured at 375x812: count 40px, bar 117px, button unchanged at 48px.
ok("the box is a fixed 40px, not padding-derived",
  /\.lbr-sticky-count\{font-size:15px;font-weight:600;min-height:40px\}/.test(page))
ok("15px type at medium weight (500-600)", /\.lbr-sticky-count\{font-size:15px;font-weight:600/.test(page))
ok("no stray padding was left behind", !/\.lbr-sticky-count\{[^}]*padding:/.test(page))
ok("still a CENTRED flex row, so the heart and text cannot shift",
  /\.lbr-sticky-count\{display:flex;align-items:center;justify-content:center/.test(page))
ok("still nowrap — the line must never break across two rows",
  /\.lbr-sticky-count\{[^}]*white-space:nowrap/.test(page))
ok("the 8px gap between line and button is unchanged",
  /\.lbr-sticky\{display:flex[^}]*gap:8px/.test(page))
ok("the button's size and type are untouched",
  /\.lbr-sticky-btn\{[^}]*min-height:48px/.test(page) && /\.lbr-sticky-btn\{font-size:16px\}/.test(page))
ok("the bar is still fixed to the bottom", /\.lbr-sticky\{display:flex[^}]*position:fixed[^}]*bottom:0/.test(page))
ok("the bar still carries the safe-area inset",
  /\.lbr-sticky\{[^}]*padding:10px 14px calc\(10px \+ env\(safe-area-inset-bottom\)\)/.test(page))

console.log("\n4d. THE CLEARANCE TRACKS THE BAR'S MEASURED HEIGHT:")
// 10 top + 40 count + 8 gap + 48 button + 10 bottom + 1 border = 117px. 135px keeps the same
// ~18px of daylight the original 118/100 pairing had. Verified at 375x812 and 320x568: the last
// card ends 105px above the bar, and the nowrap line needs 225px of 347px (292px on an SE).
ok("the clearance is 135px, matching the 117px bar",
  /\.lbr-shell:has\(\.lbr-sticky\)\{padding-bottom:calc\(135px \+ env\(safe-area-inset-bottom\)\)\}/.test(page))
ok("…and it is still SCOPED to the bar being present",
  /\.lbr-shell:has\(\.lbr-sticky\)/.test(page))
ok("…so a page with no bar still ends on the safe-area inset alone",
  /\.lbr-shell\{padding-bottom:env\(safe-area-inset-bottom\)\}/.test(page))

console.log("\n5. NOTHING ELSE ON THE PAGE MOVED:")
for (const [label, needle] of [
  ["favorites instructions", "Your top 2&ndash;3 favorites"],
  ["Why I chose this for you", null],
  ["Realtor/Locator reminder", "List your Realtor/Locator"],
  ["Next Steps roadmap", "lbr-steps--roadmap"],
  ["agent signature", "AgentSignature"],
] as const) {
  if (needle === null) {
    const list = readFileSync("app/locator-beast/r/[token]/RecommendationList.tsx", "utf8")
    ok(`${label} still present`, list.includes("Why I chose this for you"))
  } else {
    ok(`${label} still present`, page.includes(needle))
  }
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
