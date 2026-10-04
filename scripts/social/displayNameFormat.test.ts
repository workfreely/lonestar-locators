/**
 * VIDEO LIBRARY — display-only date formatting of the stored name.
 *
 * The stored value must not move. social_content.display_name keeps its ISO
 * form because more than tidiness depends on it: the library's search box
 * matches against the stored string, post_name snapshots copy it verbatim, and
 * the bulk-rename modal promises "Storage and original filenames are untouched."
 *
 * So this file checks two different things, and the second matters more:
 *   1. the formatter turns 2026-10-02 into Oct 2, 2026 and leaves everything
 *      else alone;
 *   2. the COMPONENT uses it only for rendering — search, sorting, storage
 *      paths and the stored field itself still see the raw name.
 *
 * Run: npx tsx scripts/social/displayNameFormat.test.ts
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { formatSocialDisplayName, buildSocialDisplayName } from "@/lib/social/displayName"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}${d ? `\n      ${d}` : ""}`) }
}
const eq = (l: string, got: string, want: string) => ok(l, got === want, `got:  ${JSON.stringify(got)}\n      want: ${JSON.stringify(want)}`)
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")
// Comments stripped: displayName.ts's own doc comment NAMES `new Date(...)` and
// `toLocaleDateString` as the things it avoids, so a raw grep would match the
// warning rather than the code and fail for the wrong reason.
const strip = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")

async function main() {
  console.log("\nVIDEO LIBRARY — DISPLAY-ONLY DATE FORMATTING\n")

  console.log("THE REQUESTED TRANSFORM:")
  {
    eq("the example from the request",
      formatSocialDisplayName("Selene Luxury Residences - Dallas - 2026-10-02 - 01"),
      "Selene Luxury Residences - Dallas - Oct 2, 2026")
    eq("the day loses its leading zero", formatSocialDisplayName("X - 2026-10-02 - 01"), "X - Oct 2, 2026")
    eq("a two-digit day is unchanged in value", formatSocialDisplayName("X - 2026-10-20 - 01"), "X - Oct 20, 2026")
    eq("January", formatSocialDisplayName("A - 2026-01-01 - 01"), "A - Jan 1, 2026")
    eq("December", formatSocialDisplayName("A - 2026-12-31 - 01"), "A - Dec 31, 2026")
    eq("a real leap day formats", formatSocialDisplayName("A - 2024-02-29 - 01"), "A - Feb 29, 2024")
  }

  console.log("\nEVERYTHING THAT IS NOT A DATE SURVIVES BYTE-FOR-BYTE:")
  {
    eq("the sequence suffix is preserved",
      formatSocialDisplayName("Alta Westover Hills - San Antonio - 2026-09-11 - 07"),
      "Alta Westover Hills - San Antonio - Sep 11, 2026")
    eq("a name with NO date passes through untouched",
      formatSocialDisplayName("Selene Luxury Residences - Dallas - 01"),
      "Selene Luxury Residences - Dallas")
    eq("a fully custom name is untouched",
      formatSocialDisplayName("my hero clip FINAL v3"), "my hero clip FINAL v3")
    eq("hyphens inside a property name are not mistaken for a date",
      formatSocialDisplayName("Twenty-Four Twenty - DFW - 2026-03-05 - 02"),
      "Twenty-Four Twenty - DFW - Mar 5, 2026")
    eq("empty in, empty out", formatSocialDisplayName(""), "")
    eq("null in, empty out", formatSocialDisplayName(null), "")
    eq("undefined in, empty out", formatSocialDisplayName(undefined), "")
  }

  console.log("\nTHE TRAILING SEQUENCE IS HIDDEN, REAL NUMBERS ARE NOT:")
  {
    eq("the request's example",
      formatSocialDisplayName("EastEnder - Dallas - 2026-10-04 - 01"),
      "EastEnder - Dallas - Oct 4, 2026")
    eq("a later sequence in the same batch",
      formatSocialDisplayName("The M9 - Austin - 2026-09-10 - 02"),
      "The M9 - Austin - Sep 10, 2026")
    eq("a two-digit sequence",
      formatSocialDisplayName("Knox - Dallas - 2026-09-09 - 17"),
      "Knox - Dallas - Sep 9, 2026")

    // The whole risk of this rule is eating a number that belongs to the name.
    eq("a number INSIDE a property name survives",
      formatSocialDisplayName("Knox 1200 - Dallas - 2026-09-09 - 01"),
      "Knox 1200 - Dallas - Sep 9, 2026")
    eq("a property name ENDING in a number survives when it is not last",
      formatSocialDisplayName("The M9 - Austin - 2026-09-10 - 01"),
      "The M9 - Austin - Sep 10, 2026")
    eq("a trailing number with no ' - ' separator survives",
      formatSocialDisplayName("Property 12"), "Property 12")
    eq("a trailing 4-digit number is NOT a sequence",
      formatSocialDisplayName("Studio - 1200"), "Studio - 1200")
    eq("a trailing 3-digit number is left alone (padSeq pads to 2)",
      formatSocialDisplayName("A - Dallas - 101"), "A - Dallas - 101")
    eq("only ONE trailing sequence is removed",
      formatSocialDisplayName("A - Dallas - 01 - 02"), "A - Dallas - 01")
    eq("a bare property name with no sequence is untouched",
      formatSocialDisplayName("EastEnder - Dallas"), "EastEnder - Dallas")
  }

  console.log("\nNO TIMEZONE SHIFT — the move_date bug must not reappear here:")
  {
    // new Date("2026-10-02") is UTC midnight and renders Oct 1 anywhere behind
    // UTC. The formatter builds the month from the string's own digits, so the
    // answer cannot depend on the host zone.
    const naive = new Date("2026-01-01").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    const ours = formatSocialDisplayName("A - 2026-01-01 - 01")
    ok("a naive new Date() would shift this date in a behind-UTC zone (control)",
      typeof naive === "string" && naive.length > 0)
    eq("ours does not — Jan 1 stays Jan 1", ours, "A - Jan 1, 2026")
    const impl = strip(read("lib/social/displayName.ts"))
    ok("the implementation constructs no Date at all", !/new Date\(/.test(impl))
    ok("…and does not use toLocaleDateString", !/toLocaleDateString/.test(impl))
    ok("…the month name comes from a fixed table", /MONTHS_SHORT\[month - 1\]/.test(impl))
  }

  console.log("\nIMPOSSIBLE DATES STAY RAW (showing the stored value beats inventing one):")
  {
    eq("Feb 31 is not rendered", formatSocialDisplayName("A - 2026-02-31 - 01"), "A - 2026-02-31")
    eq("month 13 is not rendered", formatSocialDisplayName("A - 2026-13-01 - 01"), "A - 2026-13-01")
    eq("month 00 is not rendered", formatSocialDisplayName("A - 2026-00-10 - 01"), "A - 2026-00-10")
    eq("day 00 is not rendered", formatSocialDisplayName("A - 2026-10-00 - 01"), "A - 2026-10-00")
    eq("Feb 29 in a NON-leap year is not rendered", formatSocialDisplayName("A - 2026-02-29 - 01"), "A - 2026-02-29")
    eq("…and 1900 is not a leap year (the %4 trap)", formatSocialDisplayName("A - 1900-02-29 - 01"), "A - 1900-02-29")
    eq("…but 2000 is (the %400 rule)", formatSocialDisplayName("A - 2000-02-29 - 01"), "A - Feb 29, 2000")
  }

  console.log("\nTHE BUILDER IS UNCHANGED — stored names still ISO:")
  {
    eq("buildSocialDisplayName still emits YYYY-MM-DD",
      buildSocialDisplayName({ propertyName: "Selene Luxury Residences", market: "Dallas", dateISO: "2026-10-02T14:03:00Z", seq: 1 }),
      "Selene Luxury Residences - Dallas - 2026-10-02 - 01")
    ok("…and still emits the trailing sequence",
      /- 01$/.test(buildSocialDisplayName({ propertyName: "A", market: "Dallas", dateISO: "2026-10-02", seq: 1 })))
    ok("…so what is written to the database never contains a month name",
      !/Oct|Jan|Dec/.test(buildSocialDisplayName({ propertyName: "A", market: "Dallas", dateISO: "2026-10-02", seq: 1 })))
  }

  console.log("\nTHE COMPONENT USES IT FOR DISPLAY ONLY:")
  {
    const src = read("components/crm/social/SocialAutopilotClient.tsx")

    ok("the card carries a separate titleLabel", /titleLabel: string/.test(src))
    ok("…derived from the stored name", /titleLabel: formatSocialDisplayName\(/.test(src))
    ok("the rendered title uses titleLabel", /\{c\.titleLabel\}/.test(src))
    ok("…and the raw displayName is NOT rendered any more", !/\{c\.displayName\}/.test(src))

    // The decisive negatives — these are the things that must not have moved.
    ok("SEARCH still matches the STORED name",
      /list\.filter\(\(c\) => \[c\.displayName, c\.propertyName, c\.originalFilename\]/.test(src))
    ok("…and search does NOT look at titleLabel", !/titleLabel[^\n]*toLowerCase|toLowerCase[^\n]*titleLabel/.test(src))
    ok("SORTING never touches either name field",
      /sorted\.sort\(\(a, b\) => b\.sortDate - a\.sortDate\)/.test(src) &&
      !/sort\(\([^)]*\) => [^)]*titleLabel/.test(src) &&
      !/sort\(\([^)]*\) => [^)]*displayName/.test(src))
    ok("the STORAGE PATH is still {owner}/{contentId}/source.{ext}",
      /\$\{userId\}\/\$\{uf\.contentId\}\/source\.\$\{extOf\(uf\.file\.name\)\}/.test(src))
    ok("…and no formatted label is anywhere near it",
      !/titleLabel[\s\S]{0,200}storagePath|storagePath[\s\S]{0,200}titleLabel/.test(src))
    ok("the hover tooltip still shows the untouched original filename",
      /title=\{c\.originalFilename \?\? undefined\}/.test(src))

    // The date is now shown ONCE. The small grey row under property/market used
    // to repeat it; with the title carrying a readable date that row was the
    // same string twice.
    ok("the duplicate dateLabel row is gone", !/\{c\.dateLabel\}/.test(src))
    ok("…and no dead dateLabel field is left behind", !/dateLabel/.test(src))
    ok("…nor the fmt helper that existed only to build it", !/const fmt = /.test(src))
    ok("property · market still renders between title and actions",
      /\{c\.propertyName \|\| <span className="text-\[var\(--crm-text-muted\)\]">No property<\/span>\}/.test(src))
  }

  console.log("\nNOTHING WRITES A FORMATTED NAME BACK:")
  {
    for (const f of [
      "app/api/admin/social-autopilot/content/route.ts",
      "app/api/admin/social-autopilot/content/[id]/route.ts",
      "app/api/admin/social-autopilot/content/bulk/route.ts",
      "app/api/admin/social-autopilot/posts/route.ts",
      "lib/social/generateRecurrence.ts",
    ]) {
      ok(`${f.split("/").slice(-2).join("/")} never imports the formatter`,
        !/formatSocialDisplayName/.test(read(f)))
    }
  }

  console.log(`\n${pass} passed, ${fail} failed\n`)
  if (fail > 0) process.exit(1)
}

void main()
