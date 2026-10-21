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
ok('the title line is now "Your Locator"', /const genericTitle = "Your Locator"/.test(page))
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
ok("the clearance is scoped to the bar's presence",
  /\.lbr-shell:has\(\.lbr-sticky\)\{padding-bottom:calc\(118px \+ env\(safe-area-inset-bottom\)\)\}/.test(page))
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
