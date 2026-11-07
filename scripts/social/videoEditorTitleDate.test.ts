/**
 * SOCIAL BEAST — the Video Editor's title date reads MM-DD-YYYY, the column keeps ISO.
 *
 * The Post Editor's Video Title field is an INPUT bound to social_content.display_name and saved
 * back to it. That is exactly why the deployed display-only formatter was kept away from it: a
 * field that renders "Oct 17, 2026" saves a month name into the column on the next edit. So the
 * editor gets a PAIR instead of a formatter —
 *
 *   formatSocialEditableDate   stored → shown    "… - 2026-10-17 - 01"  →  "… - 10-17-2026 - 01"
 *   parseSocialEditableDate    shown  → stored   "… - 10-17-2026 - 01"  →  "… - 2026-10-17 - 01"
 *
 * — and the whole safety of the change is that the two are exact inverses, that each is a no-op
 * on the other's output, and that the editor decides "did the operator touch this?" by comparing
 * a SHOWN value against the SHOWN form of what was loaded. Compare shown against stored and
 * every open looks like an edit, which would set name_customized = true on every save and
 * silently freeze auto-naming across the library.
 *
 * WHAT MUST NOT MOVE: the Content Library card, the Queue and the "Edit which post?" chooser keep
 * "Oct 17, 2026"; buildSocialDisplayName keeps writing ISO; storage paths are separate columns and
 * are not touched anywhere here.
 *
 * Run: npx tsx scripts/social/videoEditorTitleDate.test.ts
 */
import { readFileSync } from "node:fs"
import {
  formatSocialEditableDate,
  parseSocialEditableDate,
  formatSocialDisplayDate,
  formatSocialDisplayName,
  buildSocialDisplayName,
} from "@/lib/social/displayName"

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
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n")

/**
 * The editor's save decision, mirrored from PostEditor.patchSource. `shown` is the field's current
 * value, `stored` is what the server sent. Returns what the PATCH body carries for displayName —
 * undefined meaning the key is absent, which is what keeps name_customized alone.
 */
const patchBody = (shown: string, stored: string): string | undefined =>
  shown !== formatSocialEditableDate(stored) ? parseSocialEditableDate(shown) : undefined

const SOLARIS_STORED = "Solaris House - Austin - 2026-10-17 - 01"
const SOLARIS_SHOWN = "Solaris House - Austin - 10-17-2026 - 01"

console.log("\nSOCIAL BEAST — VIDEO EDITOR TITLE DATE (MM-DD-YYYY)\n")

// ── 1. The requested behavior, in the reported example ────────────────────────────────────────
console.log("the field reads as asked")
eq("the reported title, shown MM-DD-YYYY", formatSocialEditableDate(SOLARIS_STORED), SOLARIS_SHOWN)
ok("no ISO date survives in the shown value", !/\d{4}-\d{2}-\d{2}/.test(formatSocialEditableDate(SOLARIS_STORED)))
ok("the month leads", /- 10-17-2026 -/.test(formatSocialEditableDate(SOLARIS_STORED)))
ok("no month name in an editable field", !/Oct|October/.test(formatSocialEditableDate(SOLARIS_STORED)))
eq("property, market and sequence all survive", formatSocialEditableDate(SOLARIS_STORED).replace(" - 10-17-2026", ""), "Solaris House - Austin - 01")

// ── 2. Opening an existing video title ────────────────────────────────────────────────────────
console.log("\nopening an existing title")
eq("a one-bedroom auto name", formatSocialEditableDate("AMLI North Park 1 Bed - Austin - 2026-11-07 - 01"), "AMLI North Park 1 Bed - Austin - 11-07-2026 - 01")
eq("a unit-numbered title", formatSocialEditableDate("The Drakestone Apartments Unit 1905 - Dallas - 2026-10-29 - 01"), "The Drakestone Apartments Unit 1905 - Dallas - 10-29-2026 - 01")
eq("a two-word market", formatSocialEditableDate("Altitude at Brooks - San Antonio - 2026-11-07 - 01"), "Altitude at Brooks - San Antonio - 11-07-2026 - 01")
eq("a numeric property name is not a date", formatSocialEditableDate("8119 - Dallas - 2026-10-03 - 01"), "8119 - Dallas - 10-03-2026 - 01")
eq("a hyphenated property name is untouched", formatSocialEditableDate("Twenty-Four Twenty - DFW - 2026-03-05 - 02"), "Twenty-Four Twenty - DFW - 03-05-2026 - 02")
eq("a sequence past 09 survives", formatSocialEditableDate("Knox 1200 - Dallas - 2026-09-09 - 17"), "Knox 1200 - Dallas - 09-09-2026 - 17")

// ── 3. Editing and saving ─────────────────────────────────────────────────────────────────────
console.log("\nediting and saving")
{
  const edited = "Solaris House Penthouse - Austin - 10-17-2026 - 01"
  eq("the PATCH carries ISO, not what was typed", patchBody(edited, SOLARIS_STORED) ?? "ABSENT", "Solaris House Penthouse - Austin - 2026-10-17 - 01")
  ok("…and no MM-DD-YYYY reaches the column", !/\d{2}-\d{2}-\d{4}/.test(patchBody(edited, SOLARIS_STORED) ?? ""))
}
{
  const retyped = "Solaris House - Austin - 11-02-2026 - 01"
  eq("a date the operator retyped is stored as ISO", patchBody(retyped, SOLARIS_STORED) ?? "ABSENT", "Solaris House - Austin - 2026-11-02 - 01")
}
eq("clearing the field sends an empty name", patchBody("", SOLARIS_STORED) ?? "ABSENT", "")

// ── 4. Saving WITHOUT touching the title ──────────────────────────────────────────────────────
// The one that silently breaks auto-naming across the library if it regresses.
console.log("\nsaving without changing the title")
ok("an untouched title sends no displayName at all", patchBody(formatSocialEditableDate(SOLARIS_STORED), SOLARIS_STORED) === undefined)
for (const stored of [
  SOLARIS_STORED,
  "my hero clip FINAL v3",
  "Selene - Dallas - 01",
  "Cirque Residences - Dallas - 2026-11-05 - 01",
  "A - 2026-02-31 - 01",
  "Unit 01-02-2020 Reno - Dallas - 2026-05-04 - 02",
]) {
  ok(`…also for ${JSON.stringify(stored)}`, patchBody(formatSocialEditableDate(stored), stored) === undefined)
}

// ── 5. Refreshing and reopening ───────────────────────────────────────────────────────────────
console.log("\nrefreshing and reopening — the round trip is exact")
for (const stored of [
  SOLARIS_STORED,
  "Prospect - Austin - 2026-11-07 - 01",
  "Encore Lakeside 2 Bed Penthouse - Austin - 2026-11-07 - 01",
  "West Koenig Flats Apartment Homes - Austin - 2026-11-04 - 01",
  "The Oliver Dallas Corner Unit 2 - Dallas - 2026-11-04 - 01",
  "my hero clip FINAL v3",
  "Selene - Dallas - 01",
  "",
]) {
  eq(`parse(format(x)) === x for ${JSON.stringify(stored)}`, parseSocialEditableDate(formatSocialEditableDate(stored)), stored)
}
ok("format is idempotent", formatSocialEditableDate(formatSocialEditableDate(SOLARIS_STORED)) === SOLARIS_SHOWN)
ok("parse is idempotent", parseSocialEditableDate(parseSocialEditableDate(SOLARIS_SHOWN)) === SOLARIS_STORED)
eq("parse is a no-op on a stored ISO name", parseSocialEditableDate(SOLARIS_STORED), SOLARIS_STORED)
eq("format is a no-op on an already-shown name", formatSocialEditableDate(SOLARIS_SHOWN), SOLARIS_SHOWN)

// ── 6. Titles with no date ────────────────────────────────────────────────────────────────────
console.log("\ntitles with no date")
eq("free text passes through", formatSocialEditableDate("my hero clip FINAL v3"), "my hero clip FINAL v3")
eq("…and back", parseSocialEditableDate("my hero clip FINAL v3"), "my hero clip FINAL v3")
eq("a name with a sequence but no date", formatSocialEditableDate("Selene - Dallas - 01"), "Selene - Dallas - 01")
eq("empty in, empty out", formatSocialEditableDate(""), "")
eq("null in, empty out", formatSocialEditableDate(null), "")
eq("undefined in, empty out", formatSocialEditableDate(undefined), "")
eq("null parses to empty", parseSocialEditableDate(null), "")

// ── 7. Nonstandard and hand-edited names ──────────────────────────────────────────────────────
// Segment anchoring is the reason these are safe: only a whole " - " segment that is ENTIRELY a
// date is rewritten, so a date sitting inside prose is never touched in either direction.
console.log("\nnonstandard and manually edited names")
eq("a date inside prose is left alone going out", formatSocialEditableDate("Unit 01-02-2020 Reno - Dallas - 2026-05-04 - 02"), "Unit 01-02-2020 Reno - Dallas - 05-04-2026 - 02")
eq("…and coming back", parseSocialEditableDate("Unit 01-02-2020 Reno - Dallas - 05-04-2026 - 02"), "Unit 01-02-2020 Reno - Dallas - 2026-05-04 - 02")
ok("the prose date is never reordered", parseSocialEditableDate(formatSocialEditableDate("Unit 01-02-2020 Reno - Dallas - 2026-05-04 - 02")).includes("Unit 01-02-2020 Reno"))
eq("an ISO date inside prose is left alone", formatSocialEditableDate("shot 2026-10-17 raw - Dallas - 2026-05-04 - 02"), "shot 2026-10-17 raw - Dallas - 05-04-2026 - 02")
eq("a hand-typed MM-DD-YYYY nobody edits is never rewritten", patchBody(formatSocialEditableDate("Icon - Austin - 10-17-2026 - 01"), "Icon - Austin - 10-17-2026 - 01") ?? "ABSENT", "ABSENT")
eq("a title that is nothing but a date still works", formatSocialEditableDate("2026-10-17"), "10-17-2026")
eq("two dates in one title both convert", formatSocialEditableDate("A - 2026-01-02 - B - 2026-03-04 - 01"), "A - 01-02-2026 - B - 03-04-2026 - 01")
eq("…and both convert back", parseSocialEditableDate("A - 01-02-2026 - B - 03-04-2026 - 01"), "A - 2026-01-02 - B - 2026-03-04 - 01")
eq("odd separators are not segments", formatSocialEditableDate("A-2026-10-17-01"), "A-2026-10-17-01")

// ── 8. Month, day and year boundaries ─────────────────────────────────────────────────────────
console.log("\nmonth, day and year boundaries")
for (const [iso, mdy] of [
  ["2026-01-01", "01-01-2026"],
  ["2026-12-31", "12-31-2026"],
  ["2026-01-31", "01-31-2026"],
  ["2026-02-28", "02-28-2026"],
  ["2026-04-30", "04-30-2026"],
  ["2026-11-30", "11-30-2026"],
  ["2024-02-29", "02-29-2024"],
  ["2000-02-29", "02-29-2000"],
  ["2026-12-01", "12-01-2026"],
  ["2027-01-01", "01-01-2027"],
  ["1999-12-31", "12-31-1999"],
] as const) {
  eq(`${iso} → ${mdy}`, formatSocialEditableDate(`A - ${iso} - 01`), `A - ${mdy} - 01`)
  eq(`${mdy} → ${iso}`, parseSocialEditableDate(`A - ${mdy} - 01`), `A - ${iso} - 01`)
}
ok("the day keeps its leading zero, unlike the library card", formatSocialEditableDate("A - 2026-11-01 - 01") === "A - 11-01-2026 - 01")
console.log("  — unreal dates are left exactly as they are, in both directions")
for (const bad of ["2026-02-31", "2026-13-01", "2026-00-10", "2026-04-31", "2025-02-29", "2026-11-00", "2100-02-29"]) {
  eq(`${bad} stays put`, formatSocialEditableDate(`A - ${bad} - 01`), `A - ${bad} - 01`)
}
for (const bad of ["13-01-2026", "02-31-2026", "00-10-2026", "04-31-2026", "02-29-2025", "11-00-2026"]) {
  eq(`${bad} is not stored as a date`, parseSocialEditableDate(`A - ${bad} - 01`), `A - ${bad} - 01`)
}
ok("an unreal date still round-trips untouched", parseSocialEditableDate(formatSocialEditableDate("A - 2026-02-31 - 01")) === "A - 2026-02-31 - 01")

// ── 9. Nothing else moves ─────────────────────────────────────────────────────────────────────
console.log("\nthe Library card, the Queue and the chooser are unchanged")
eq("the Queue still spells it out", formatSocialDisplayDate(SOLARIS_STORED), "Solaris House - Austin - Oct 17, 2026 - 01")
eq("the Library card too, without the sequence", formatSocialDisplayName(SOLARIS_STORED), "Solaris House - Austin - Oct 17, 2026")
ok("neither has become MM-DD-YYYY", !/\d{2}-\d{2}-\d{4}/.test(formatSocialDisplayDate(SOLARIS_STORED) + formatSocialDisplayName(SOLARIS_STORED)))

console.log("\nupload naming still writes the canonical ISO form")
{
  const stored = buildSocialDisplayName({ propertyName: "Gables Republic Square", market: "Austin", dateISO: "2026-11-02T20:30:00Z", seq: 1 })
  eq("stored as ISO", stored, "Gables Republic Square - Austin - 2026-11-02 - 01")
  ok("no MM-DD-YYYY is ever built", !/\d{2}-\d{2}-\d{4}/.test(stored))
  eq("and the editor shows it reordered", formatSocialEditableDate(stored), "Gables Republic Square - Austin - 11-02-2026 - 01")
}

// ── 10. The pair reaches ONLY the editor ──────────────────────────────────────────────────────
console.log("\nthe pair is wired to the Video Editor and nowhere else")
{
  const editor = strip(read("components/crm/social/PostEditor.tsx"))
  ok("PostEditor shows the field formatted", /setDisplayName\(formatSocialEditableDate\(/.test(editor))
  ok("PostEditor saves it parsed", /displayName: parseSocialEditableDate\(displayName\)/.test(editor))
  ok("the touched test compares shown against shown", /displayName !== formatSocialEditableDate\(loadedDisplayName\.current\)/.test(editor))
  ok("loadedDisplayName is kept canonical after a save", /loadedDisplayName\.current = parseSocialEditableDate\(displayName\)/.test(editor))
  ok("the raw server value is never put in the field", !/setDisplayName\(p\.source\?\.displayName/.test(editor))

  for (const f of [
    "components/crm/social/QueueClient.tsx",
    "components/crm/social/SocialAutopilotClient.tsx",
    "app/api/admin/social-autopilot/content/route.ts",
    "app/api/admin/social-autopilot/content/[id]/route.ts",
    "app/api/admin/social-autopilot/content/bulk/route.ts",
  ]) {
    ok(`${f} does not use the editable pair`, !/SocialEditableDate/.test(strip(read(f))))
  }

  const lib = strip(read("lib/social/displayName.ts"))
  ok("no Date is constructed in the pair", !/new Date/.test(lib.slice(lib.indexOf("const SEP"), lib.indexOf("function stripTrailingSeq"))))
  ok("storage paths are not mentioned in the name builder at all", !/storage_path|storagePath/.test(lib))
}

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
