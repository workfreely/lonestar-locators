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

console.log("\n1. THE FREE-SERVICE LINE — exact wording, exact placement:")
ok("the approved sentence appears verbatim",
  page.includes("My service is completely free to you!"))
ok("it appears exactly once", (page.match(/My service is completely free to you!/g) ?? []).length === 1)
ok("it sits INSIDE the list intro block (lbr-recs-head)",
  /lbr-recs-head[^]*?My service is completely free to you![^]*?<\/div>/.test(page))
ok("…directly AFTER the count line",
  page.indexOf("{countLine}") < page.indexOf("My service is completely free to you!"))
ok("…and BEFORE Next Steps",
  page.indexOf("My service is completely free to you!") < page.indexOf("<h2>Next Steps</h2>"))

console.log("\n2. IT IS A FOOTNOTE, NOT A SECTION:")
ok("rendered as a <p>, not a heading or a card",
  /<p className="lbr-free">My service is completely free to you!<\/p>/.test(page))
ok("no new <section> was introduced for it",
  !/<section[^>]*>\s*\{?\/?\*?[^]{0,80}My service is completely free/.test(page))
ok("its base size is SMALLER than the count line beside it", (() => {
  const base = /\.lbr-recs-head p\{[^}]*font-size:(\d+(?:\.\d+)?)px/.exec(page)
  const free = /\.lbr-recs-head p\.lbr-free\{[^}]*font-size:(\d+(?:\.\d+)?)px/.exec(page)
  return !!base && !!free && parseFloat(free[1]) < parseFloat(base[1])
})())
ok("it is defined mobile-first with a desktop bump, like its sibling",
  (page.match(/\.lbr-recs-head p\.lbr-free\{/g) ?? []).length === 2)

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
