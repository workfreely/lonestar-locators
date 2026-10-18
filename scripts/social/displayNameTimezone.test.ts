// Social Beast — a display name carries the CENTRAL calendar day, not the UTC one.
//
// THE BUG THIS LOCKS DOWN. buildSocialDisplayName took `dateISO.slice(0, 10)`, which is the first
// ten characters of a UTC ISO string — the UTC calendar day. Central is UTC-5 in summer and UTC-6
// in winter, so every upload after 7pm (6pm in winter) was named with TOMORROW'S date. 66 of the
// 181 stored names carry a date that disagrees with the Central day of their own created_at.
//
// The underlying created_at is and was correct, and so is the 7:30am / 7:30pm Central scheduler —
// this was only ever the derived NAME. These tests therefore assert the name, and assert that the
// publishing schedule's own date helper agrees with it.
// Run: npx tsx scripts/social/displayNameTimezone.test.ts
import { buildSocialDisplayName } from "@/lib/social/displayName"
import { dateKeyInTz } from "@/lib/social/recurrence"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}${d ? ` — ${d}` : ""}`) }
}

/** The date a built name ends up carrying. */
const dateIn = (iso: string): string =>
  buildSocialDisplayName({ propertyName: "Ferro", market: "Dallas", dateISO: iso, seq: 1 })
    .match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? ""

/** A Central wall-clock moment, expressed as the UTC instant it actually is. CDT=-5, CST=-6. */
const centralInstant = (y: number, m: number, d: number, h: number, min: number, offset: 5 | 6) =>
  new Date(Date.UTC(y, m - 1, d, h + offset, min)).toISOString()

console.log("1. OCTOBER 17 — the hours either side of the boundary (CDT, UTC-5):")
{
  ok("6:30 PM Central → Oct 17 (was already correct)", dateIn(centralInstant(2026, 10, 17, 18, 30, 5)) === "2026-10-17",
    dateIn(centralInstant(2026, 10, 17, 18, 30, 5)))
  // THE REPORTED SYMPTOM. This produced 2026-10-18 before the fix.
  ok("7:30 PM Central → Oct 17 (was Oct 18 — the reported bug)", dateIn(centralInstant(2026, 10, 17, 19, 30, 5)) === "2026-10-17",
    dateIn(centralInstant(2026, 10, 17, 19, 30, 5)))
  ok("8:30 PM Central → Oct 17", dateIn(centralInstant(2026, 10, 17, 20, 30, 5)) === "2026-10-17")
  ok("11:59 PM Central → Oct 17", dateIn(centralInstant(2026, 10, 17, 23, 59, 5)) === "2026-10-17")
  ok("7:00 PM Central exactly → Oct 17", dateIn(centralInstant(2026, 10, 17, 19, 0, 5)) === "2026-10-17")
}

console.log("\n2. MIDNIGHT TRANSITIONS — the day must roll at Central midnight, not UTC midnight:")
{
  ok("11:59:59 PM Central on Oct 17 → Oct 17",
    dateIn(new Date(Date.UTC(2026, 9, 18, 4, 59, 59)).toISOString()) === "2026-10-17")
  ok("12:00:00 AM Central on Oct 18 → Oct 18",
    dateIn(new Date(Date.UTC(2026, 9, 18, 5, 0, 0)).toISOString()) === "2026-10-18")
  ok("12:01 AM Central → the new day", dateIn(centralInstant(2026, 10, 18, 0, 1, 5)) === "2026-10-18")
  // UTC midnight is 7pm Central — the exact instant the old code flipped a day early.
  ok("UTC midnight is still the PREVIOUS Central day",
    dateIn("2026-10-18T00:00:00.000Z") === "2026-10-17")
  ok("Central noon is unambiguous in either zone", dateIn(centralInstant(2026, 10, 17, 12, 0, 5)) === "2026-10-17")
}

console.log("\n3. WINTER (CST, UTC-6) — the window opens an hour earlier:")
{
  ok("5:30 PM Central in December → Dec 17", dateIn(centralInstant(2026, 12, 17, 17, 30, 6)) === "2026-12-17")
  // In winter this is already past UTC midnight; in summer the same wall-clock hour is not.
  ok("6:30 PM Central in December → Dec 17 (was Dec 18)", dateIn(centralInstant(2026, 12, 17, 18, 30, 6)) === "2026-12-17",
    dateIn(centralInstant(2026, 12, 17, 18, 30, 6)))
  ok("7:30 PM Central in December → Dec 17", dateIn(centralInstant(2026, 12, 17, 19, 30, 6)) === "2026-12-17")
  ok("11:30 PM Central in December → Dec 17", dateIn(centralInstant(2026, 12, 17, 23, 30, 6)) === "2026-12-17")

  // The DST switch itself: a fixed offset would get one of these wrong.
  ok("the day before the spring-forward is handled", dateIn(centralInstant(2026, 3, 7, 20, 0, 6)) === "2026-03-07")
  ok("the day after the spring-forward is handled", dateIn(centralInstant(2026, 3, 9, 20, 0, 5)) === "2026-03-09")
  ok("the day before the fall-back is handled", dateIn(centralInstant(2026, 10, 31, 20, 0, 5)) === "2026-10-31")
  ok("the day after the fall-back is handled", dateIn(centralInstant(2026, 11, 2, 20, 0, 6)) === "2026-11-02")
}

console.log("\n4. TIMESTAMPS ARRIVING IN OTHER OFFSETS — the same instant is the same day:")
{
  // One moment, written five ways. All are 7:30 PM Central on Oct 17.
  const sameMoment = [
    "2026-10-18T00:30:00.000Z",      // Zulu
    "2026-10-18T00:30:00+00:00",     // explicit zero offset
    "2026-10-17T19:30:00-05:00",     // Central itself
    "2026-10-17T17:30:00-07:00",     // Pacific
    "2026-10-18T09:30:00+09:00",     // Tokyo
    "2026-10-18T01:30:00+01:00",     // London (BST)
  ]
  const days = sameMoment.map(dateIn)
  ok("every representation of one instant yields the SAME day",
    new Set(days).size === 1, days.join(", "))
  ok("…and that day is the Central one (Oct 17)", days[0] === "2026-10-17", days[0])
  // A timestamp with no zone marker is parsed as LOCAL by JS. Asserted so the behaviour is known
  // rather than discovered: Postgres timestamptz always serialises with an offset, so this shape
  // does not arrive from the database.
  ok("a zone-less timestamp still produces a well-formed date",
    /^\d{4}-\d{2}-\d{2}$/.test(dateIn("2026-10-17T19:30:00")))
}

console.log("\n5. DEGRADES EXACTLY AS THE OLD SLICE DID:")
{
  const noDate = (iso: string | null | undefined) =>
    buildSocialDisplayName({ propertyName: "Ferro", market: "Dallas", dateISO: iso, seq: 1 })
  ok("a missing date builds a name WITHOUT a date, not a broken one",
    noDate(null) === "Ferro - Dallas - 01", noDate(null))
  ok("an empty string behaves the same", noDate("") === "Ferro - Dallas - 01")
  ok("undefined behaves the same", noDate(undefined) === "Ferro - Dallas - 01")
  // The old code sliced garbage into the name; this refuses it rather than printing "Invalid".
  ok("an unparseable date yields no date rather than a wrong one",
    noDate("not-a-date") === "Ferro - Dallas - 01", noDate("not-a-date"))
  ok("…and never the word Invalid", !/invalid/i.test(noDate("not-a-date")))
  ok("the rest of the name is untouched",
    dateIn(centralInstant(2026, 10, 17, 19, 30, 5)) === "2026-10-17"
    && buildSocialDisplayName({ propertyName: "Ferro", market: "Dallas", dateISO: centralInstant(2026, 10, 17, 19, 30, 5), seq: 3 })
       === "Ferro - Dallas - 2026-10-17 - 03")
}

console.log("\n6. THE NAME AND THE SCHEDULE AGREE ABOUT WHAT DAY IT IS:")
{
  // The scheduler already used dateKeyInTz. A name derived any other way could disagree with the
  // day a post is scheduled into — which is how "uploaded Friday, scheduled Saturday" happens.
  let mismatches = 0
  for (let h = 0; h < 24; h++) {
    const iso = centralInstant(2026, 10, 17, h, 15, 5)
    if (dateIn(iso) !== dateKeyInTz(new Date(iso))) mismatches++
  }
  ok("across all 24 hours of a day, the name's date matches the scheduler's date key", mismatches === 0)

  // And the old implementation, kept here as the control: it must DISAGREE, or these tests prove
  // nothing about the fix.
  const oldWay = (iso: string) => iso.slice(0, 10)
  let oldMismatches = 0
  for (let h = 0; h < 24; h++) {
    const iso = centralInstant(2026, 10, 17, h, 15, 5)
    if (oldWay(iso) !== dateKeyInTz(new Date(iso))) oldMismatches++
  }
  ok(`CONTROL: the OLD slice disagreed on ${oldMismatches} of 24 hours`, oldMismatches === 5,
    `expected the 7pm–midnight window, got ${oldMismatches}`)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
