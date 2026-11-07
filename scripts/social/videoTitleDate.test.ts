/**
 * SOCIAL BEAST — a video title spells its date the way the Content Library card does.
 *
 * Stored titles carry an ISO date: "The Drakestone Apartments Unit 1905 - Dallas - 2026-10-29 - 01".
 * The Content Library preview card has rendered "Oct 29, 2026" for a while (formatSocialDisplayName),
 * but two surfaces still showed the raw ISO string:
 *
 *   components/crm/social/QueueClient.tsx          the Queue list — postName / display_name, verbatim
 *   components/crm/social/SocialAutopilotClient.tsx the "Edit which post?" chooser — p.name
 *
 * THE SEQUENCE IS THE REASON THERE ARE TWO EXPORTS. formatSocialDisplayName does the date rewrite AND
 * drops the trailing ` - NN`, because the library card shows property · market on its own line. The
 * Queue shows the whole stored title, sequence included, so it needs the date rewrite WITHOUT that
 * drop — which is why formatSocialDisplayDate was split out of it rather than copied. One month
 * table, one leap rule, one place where a date becomes words.
 *
 * NOTHING IS STORED DIFFERENTLY. buildSocialDisplayName still writes YYYY-MM-DD, the database keeps
 * it, and search still matches it. The Post Editor's Video Title field is deliberately NOT given
 * this formatter — it is an input saved back to the column, and a month name written into it would
 * be saved on the next edit. It shows MM-DD-YYYY instead, through the round-tripping
 * formatSocialEditableDate / parseSocialEditableDate pair, proved in
 * scripts/social/videoEditorTitleDate.test.ts.
 *
 * Run: npx tsx scripts/social/videoTitleDate.test.ts
 */
import { readFileSync } from "node:fs"
import { formatSocialDisplayDate, formatSocialDisplayName, buildSocialDisplayName } from "@/lib/social/displayName"

let pass = 0
let fail = 0
const ok = (l: string, c: boolean, d = "") => {
  if (c) {
    pass++
    console.log(`  ✓ ${l}`)
  } else {
    fail++
    console.log(`  ✗ ${l}${d ? `\n      ${d}` : ""}`)
  }
}
const eq = (l: string, got: string, want: string) => ok(l, got === want, `got ${JSON.stringify(got)} want ${JSON.stringify(want)}`)

const read = (p: string) => readFileSync(p, "utf8")
/** Comments quote the old ISO form, so source assertions run against code. */
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n")

console.log("\nSOCIAL BEAST — VIDEO TITLE DATES\n")

// ── 1. The requested change, exactly as asked ─────────────────────────────────────────────────
console.log("the title reads as asked")
eq(
  "the example, start to finish",
  formatSocialDisplayDate("The Drakestone Apartments - Dallas - 2026-11-01 - 01"),
  "The Drakestone Apartments - Dallas - Nov 1, 2026 - 01",
)
ok("abbreviated month, not spelled out", !/November/.test(formatSocialDisplayDate("X - 2026-11-01 - 01")))
ok("no ordinal day", !/1st|2nd|3rd|th,/.test(formatSocialDisplayDate("X - 2026-11-01 - 01")))
ok("four-digit year", /\b2026\b/.test(formatSocialDisplayDate("X - 2026-11-01 - 01")))
eq("the day loses a leading zero", formatSocialDisplayDate("X - 2026-11-01 - 01"), "X - Nov 1, 2026 - 01")
eq("a two-digit day keeps its value", formatSocialDisplayDate("X - 2026-11-20 - 01"), "X - Nov 20, 2026 - 01")

console.log("\nevery month abbreviates the same way")
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
MONTHS.forEach((abbr, i) => {
  const mm = String(i + 1).padStart(2, "0")
  eq(`${mm} → ${abbr}`, formatSocialDisplayDate(`A - 2026-${mm}-15 - 03`), `A - ${abbr} 15, 2026 - 03`)
})

// ── 2. Requirement 5: nothing else in the title moves ─────────────────────────────────────────
console.log("\nthe rest of the title is returned exactly as stored")
eq(
  "the sequence survives — this is the whole reason for the second export",
  formatSocialDisplayDate("Ambrose - Dallas - 2026-10-29 - 01"),
  "Ambrose - Dallas - Oct 29, 2026 - 01",
)
ok("…and formatSocialDisplayName would have dropped it", !/- 01$/.test(formatSocialDisplayName("Ambrose - Dallas - 2026-10-29 - 01")))
eq(
  "a unit number is untouched",
  formatSocialDisplayDate("The Drakestone Apartments Unit 1905 - Dallas - 2026-10-29 - 01"),
  "The Drakestone Apartments Unit 1905 - Dallas - Oct 29, 2026 - 01",
)
eq(
  "digits in a property name are untouched",
  formatSocialDisplayDate("Knox 1200 - Dallas - 2026-09-09 - 17"),
  "Knox 1200 - Dallas - Sep 9, 2026 - 17",
)
eq("a two-word city is untouched", formatSocialDisplayDate("A - San Antonio - 2026-09-11 - 07"), "A - San Antonio - Sep 11, 2026 - 07")
eq("a hyphenated property name is untouched", formatSocialDisplayDate("Twenty-Four Twenty - DFW - 2026-03-05 - 02"), "Twenty-Four Twenty - DFW - Mar 5, 2026 - 02")
eq("a name with no date passes through", formatSocialDisplayDate("my hero clip FINAL v3"), "my hero clip FINAL v3")
eq("a name with no date but a sequence keeps both", formatSocialDisplayDate("Selene - Dallas - 01"), "Selene - Dallas - 01")
eq("empty in, empty out", formatSocialDisplayDate(""), "")
eq("null in, empty out", formatSocialDisplayDate(null), "")
eq("undefined in, empty out", formatSocialDisplayDate(undefined), "")

// ── 3. Requirement 6: no timezone day-shift ───────────────────────────────────────────────────
console.log("\nthe day cannot shift")
{
  // The trap, demonstrated: an ISO date parsed as a Date is UTC midnight, which is the PREVIOUS
  // day anywhere behind UTC — Central included.
  const trap = new Intl.DateTimeFormat("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "America/Chicago",
  }).format(new Date("2026-11-01"))
  eq("a Date-based formatter really does render the day before, in Central", trap, "Oct 31, 2026")
  eq("…while ours renders the day the title actually says", formatSocialDisplayDate("A - 2026-11-01 - 01"), "A - Nov 1, 2026 - 01")

  const impl = strip(read("lib/social/displayName.ts"))
  const fn = impl.slice(impl.indexOf("export function formatSocialDisplayDate"), impl.indexOf("export function formatSocialDisplayName"))
  ok("the formatter constructs no Date", !/new Date\(/.test(fn), fn.slice(0, 200))
  ok("…and calls no locale date method", !/toLocaleDateString|Intl\.DateTimeFormat/.test(fn))
  ok("the month name comes from a fixed table", /MONTHS_SHORT\[month - 1\]/.test(fn))
}

console.log("\nimpossible dates are shown raw rather than invented")
eq("Feb 31", formatSocialDisplayDate("A - 2026-02-31 - 01"), "A - 2026-02-31 - 01")
eq("month 13", formatSocialDisplayDate("A - 2026-13-01 - 01"), "A - 2026-13-01 - 01")
eq("day 00", formatSocialDisplayDate("A - 2026-10-00 - 01"), "A - 2026-10-00 - 01")
eq("Feb 29 in a non-leap year", formatSocialDisplayDate("A - 2026-02-29 - 01"), "A - 2026-02-29 - 01")
eq("1900 is not a leap year (the %4 trap)", formatSocialDisplayDate("A - 1900-02-29 - 01"), "A - 1900-02-29 - 01")
eq("2000 is (the %400 rule)", formatSocialDisplayDate("A - 2000-02-29 - 01"), "A - Feb 29, 2000 - 01")

// ── 4. One date rule, shared ───────────────────────────────────────────────────────────────────
console.log("\none rule, two exports")
{
  const impl = strip(read("lib/social/displayName.ts"))
  ok("formatSocialDisplayDate is exported", /export function formatSocialDisplayDate/.test(impl))
  ok(
    "formatSocialDisplayName DELEGATES to it rather than repeating the rewrite",
    /export function formatSocialDisplayName[\s\S]{0,160}?formatSocialDisplayDate\(name\)/.test(impl),
  )
  ok("…and there is only ONE month table in the module", (impl.match(/MONTHS_SHORT = \[/g) ?? []).length === 1)
  // Precise to the ISO→WORDS rewrite, which is what must not be copied: it is the \b-scanning
  // global one. formatSocialEditableDate/parseSocialEditableDate carry their own ^…$ anchored
  // regexes on purpose — a different rule, reordering digits for a WRITABLE field.
  ok("…and only ONE date-to-words regex", (impl.match(/\\b\(\\d\{4\}\)-\(\\d\{2\}\)-\(\\d\{2\}\)\\b/g) ?? []).length === 1)
  ok("…and only ONE place turns a date into words", (impl.match(/MONTHS_SHORT\[/g) ?? []).length === 1)
  for (const n of ["Selene - Dallas - 2026-10-02 - 01", "Knox 1200 - Dallas - 2026-09-09 - 17", "no date here"]) {
    ok(
      `the pair agree on the date for ${JSON.stringify(n)}`,
      formatSocialDisplayName(n) === formatSocialDisplayDate(n).replace(/\s-\s\d{1,2}$/, ""),
    )
  }
}

// ── 5. Requirement 3: the surfaces that show a title use it ───────────────────────────────────
console.log("\nthe surfaces")
{
  const queue = strip(read("components/crm/social/QueueClient.tsx"))
  ok("the Queue imports the date formatter", /import \{ formatSocialDisplayDate \} from "@\/lib\/social\/displayName"/.test(queue))
  ok("…and renders the title through it", /formatSocialDisplayDate\(p\.postName \|\| p\.source\?\.displayName \|\| ""\)/.test(queue))
  ok("…with the Untitled fallback intact", /\|\| "Untitled post"/.test(queue))
  ok("…and never renders the raw postName any more", !/\{p\.postName \|\| p\.source\?\.displayName \|\| "Untitled post"\}/.test(queue))

  const lib = strip(read("components/crm/social/SocialAutopilotClient.tsx"))
  ok("the post chooser renders through it", /\{formatSocialDisplayDate\(p\.name\)\}/.test(lib))
  ok("…and the raw p.name is gone from that line", !/>\{p\.name\}</.test(lib))
  ok("the Content Library card is UNCHANGED — still titleLabel", /\{c\.titleLabel\}/.test(lib))
  ok("…still built with formatSocialDisplayName", /titleLabel: formatSocialDisplayName\(/.test(lib))
  ok("search still matches the STORED name", /list\.filter\(\(c\) => \[c\.displayName, c\.propertyName, c\.originalFilename\]/.test(lib))
}

// ── 6. Requirement 4: nothing stored changes ──────────────────────────────────────────────────
console.log("\nnothing is rewritten")
eq(
  "buildSocialDisplayName still writes ISO",
  buildSocialDisplayName({ propertyName: "The Drakestone Apartments", market: "Dallas", dateISO: "2026-11-01T14:03:00Z", seq: 1 }),
  "The Drakestone Apartments - Dallas - 2026-11-01 - 01",
)
ok(
  "…so no month name can reach the database",
  !/Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/.test(
    buildSocialDisplayName({ propertyName: "A", market: "Dallas", dateISO: "2026-11-01", seq: 1 }),
  ),
)
{
  const editor = strip(read("components/crm/social/PostEditor.tsx"))
  ok(
    "the Post Editor's Video Title field carries no month-name formatter",
    /value=\{displayName\}/.test(editor) && !/value=\{formatSocialDisplay/.test(editor),
    "formatting this input with formatSocialDisplayDate would save a month name back into display_name",
  )
  ok("…and never loads one into the field either", !/setDisplayName\(formatSocialDisplay/.test(editor))
  // It is no longer loaded unformatted: the field shows MM-DD-YYYY. That is safe where a month
  // name was not, because the pair is an exact round trip and the save path converts back —
  // see scripts/social/videoEditorTitleDate.test.ts for the inverse and no-op proofs.
  ok(
    "…it loads through the editable pair and saves back through its inverse",
    /setDisplayName\(formatSocialEditableDate\(/.test(editor) &&
      /displayName: parseSocialEditableDate\(displayName\)/.test(editor),
  )
}
for (const f of [
  "app/api/admin/social-autopilot/content/route.ts",
  "app/api/admin/social-autopilot/content/[id]/route.ts",
  "app/api/admin/social-autopilot/content/bulk/route.ts",
  "app/api/admin/social-autopilot/posts/route.ts",
  "lib/social/generateRecurrence.ts",
]) {
  ok(`${f.split("/").slice(-2).join("/")} imports no display formatter`, !/formatSocialDisplay/.test(read(f)))
}

// ── 7. Real stored titles — existing videos, not invented ones ────────────────────────────────
console.log("\nthe titles actually in the library today")
const REAL = [
  ["Gables Republic Square - Austin - 2026-11-02 - 01", "Gables Republic Square - Austin - Nov 2, 2026 - 01"],
  ["The Bouldin - Austin - 2026-11-01 - 01", "The Bouldin - Austin - Nov 1, 2026 - 01"],
  ["Town Arlington - Dallas - 2026-10-31 - 01", "Town Arlington - Dallas - Oct 31, 2026 - 01"],
  ["The Waylon Apartments Townhomes - Dallas - 2026-10-30 - 01", "The Waylon Apartments Townhomes - Dallas - Oct 30, 2026 - 01"],
  ["One Dallas Center - Dallas - 2026-10-30 - 01", "One Dallas Center - Dallas - Oct 30, 2026 - 01"],
  ["The Drakestone Apartments Unit 1905 - Dallas - 2026-10-29 - 01", "The Drakestone Apartments Unit 1905 - Dallas - Oct 29, 2026 - 01"],
  ["Atelier Dallas Apartments Unit 5202 - Dallas - 2026-10-29 - 01", "Atelier Dallas Apartments Unit 5202 - Dallas - Oct 29, 2026 - 01"],
  ["Aura Southgate - Dallas - 2026-10-28 - 01", "Aura Southgate - Dallas - Oct 28, 2026 - 01"],
] as const
for (const [stored, want] of REAL) eq(stored.slice(0, 46), formatSocialDisplayDate(stored), want)

console.log("\na NEWLY uploaded video, end to end")
{
  // Built the way an upload builds it, then displayed the way the Queue displays it.
  const stored = buildSocialDisplayName({ propertyName: "Gables Republic Square", market: "Austin", dateISO: "2026-11-02T20:30:00Z", seq: 1 })
  eq("stored as ISO", stored, "Gables Republic Square - Austin - 2026-11-02 - 01")
  eq("shown with a readable date", formatSocialDisplayDate(stored), "Gables Republic Square - Austin - Nov 2, 2026 - 01")
  eq("…and on the library card, without the sequence", formatSocialDisplayName(stored), "Gables Republic Square - Austin - Nov 2, 2026")
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
