/**
 * Guest Card composer content — two modes + no-placeholder guarantees (Phase 1
 * refinement). Pure builders, no DB / DOM:
 *   npx tsx scripts/tests/guest-card-composer.test.ts
 *
 * MODE A (scheduled tour): [TOUR SCHEDULED] subject with date/time; body states
 *   the tour and puts Tour Details BEFORE Client Details.
 * MODE B (guest card only): [GUEST CARD] subject; Property of Interest section,
 *   NO Tour Details, NO fabricated tour date.
 * Both: "Move Date" (never "Move-in"); never renders "Not specified" or an
 *   instructional placeholder; missing optional data omits its row/phrase.
 */
import { buildGuestCardFields, buildGuestCardSubject, buildGuestCardBody } from "@/lib/leads/guestCard"

let pass = 0,
  fail = 0
function ok(cond: boolean, name: string, extra = "") {
  cond ? pass++ : fail++
  console.log(`${cond ? "✓" : "✗"} ${name}${cond ? "" : `  ${extra}`}`)
}

const AGENT = { name: "Jordan Reyes", brokerage: "Relive Realty", phone: "5125551234", email: "jordan@relive.example" }
const LEAD = {
  first_name: "carlos",
  last_name: "mendez",
  email: "carlos@example.com",
  phone: "2145559090",
  desired_rent: "2500-2700",
  beds: "2",
  baths: "2",
  move_date: "2026-10-01",
}
// 9:00 AM America/Chicago on 2026-09-22 → 14:00Z (CDT, UTC-5).
const TOUR_AT = "2026-09-22T14:00:00.000Z"
const TZ = "America/Chicago"

// ── MODE A: scheduled tour ──────────────────────────────────────────────────
{
  const f = buildGuestCardFields(LEAD, { property_name: "The Foundry", tourAt: TOUR_AT, timeZone: TZ }, AGENT)
  const subject = buildGuestCardSubject(f)
  const body = buildGuestCardBody(f)

  ok(
    subject === "[TOUR SCHEDULED] The Foundry | Carlos Mendez | Tue 9/22/2026 at 9 AM",
    "MODE A subject exact (abbrev weekday + on-the-hour '9 AM', pipes, no brokerage)",
    subject,
  )
  ok(!/Relive Realty/.test(subject), "subject has NO brokerage")
  ok(body.includes("has scheduled a tour for Tuesday, September 22, 2026 at 9:00 AM"), "MODE A intro uses the full human-readable body date")
  ok(body.includes("interested in a 2 bed / 2 bath at The Foundry"), "MODE A intro states beds/baths + property")
  ok(body.includes("Tour Details"), "MODE A has a Tour Details section")
  ok(body.includes("Client Details"), "MODE A has a Client Details section")
  ok(body.indexOf("Tour Details") < body.indexOf("Client Details"), "MODE A: Tour Details BEFORE Client Details")
  ok(body.includes("Move Date: 10/01/2026"), 'MODE A uses "Move Date" (not "Move-in")')
  ok(!/move-?in/i.test(body), "MODE A body never says Move-in")
  ok(body.includes("current locator commission"), "MODE A asks for commission")
  ok(!body.includes("Property of Interest"), "MODE A has NO Property of Interest section")

  // CC request removed entirely.
  ok(!/Please CC me/i.test(body), "CC-request paragraph is absent")
  ok(!/\bCC\b/.test(body), "no stray 'CC' anywhere in the body")
  // After Client Details it flows straight into Thank you! (one blank line).
  ok(body.includes("Move Date: 10/01/2026\n\nThank you!"), "Client Details → Thank you! (clean single blank line, no CC in between)")

  // Spacing: blank line after a section header before its fields; fields compact.
  ok(body.includes("Tour Details\n\nTouring Property:"), "blank line after 'Tour Details' before fields")
  ok(body.includes("Client Details\n\nClient Name:"), "blank line after 'Client Details' before fields")
  ok(body.includes("Touring Property: The Foundry\nTour Date:"), "Tour Details fields stay compact (single-spaced)")
  ok(body.includes("Tour Date: Tuesday, September 22, 2026 at 9:00 AM"), "MODE A Tour Date is full weekday + full month (human-readable)")
  ok(
    body.includes("Client Name: Carlos Mendez\nBeds / Baths: 2 / 2\nBudget: 2500-2700\nMove Date: 10/01/2026"),
    "Client Details fields stay compact (no blank lines between fields)",
  )
  ok(body.includes("Tour Date: Tuesday, September 22, 2026 at 9:00 AM\n\nClient Details"), "clear separation between last Tour Details field and Client Details")
  ok(body.includes("\n\nThank you!"), "blank line before Thank you!")
}

// ── MODE A subject: nonzero minutes keep ":mm" (9:30 AM) ─────────────────────
{
  // 9:30 AM America/Chicago on 2026-09-22 → 14:30Z (CDT).
  const f = buildGuestCardFields(LEAD, { property_name: "The Foundry", tourAt: "2026-09-22T14:30:00.000Z", timeZone: TZ }, AGENT)
  ok(
    buildGuestCardSubject(f) === "[TOUR SCHEDULED] The Foundry | Carlos Mendez | Tue 9/22/2026 at 9:30 AM",
    "MODE A subject keeps nonzero minutes (9:30 AM)",
    buildGuestCardSubject(f),
  )
}

// ── MODE B: guest card only (no tour) ───────────────────────────────────────
{
  const f = buildGuestCardFields(LEAD, { property_name: "Skyline Lofts" }, AGENT)
  const subject = buildGuestCardSubject(f)
  const body = buildGuestCardBody(f)

  ok(subject === "[GUEST CARD] Skyline Lofts | Carlos Mendez", "MODE B subject exact", subject)
  ok(!subject.includes(" at "), "MODE B subject appends NO tour date/time")
  ok(subject.startsWith("[GUEST CARD]"), "MODE B uses the [GUEST CARD] tag")
  ok(body.includes("would like more information about your current availability"), "MODE B intro wording")
  ok(body.includes("Property of Interest"), "MODE B has a Property of Interest section")
  ok(!body.includes("Tour Details"), "MODE B has NO Tour Details section")
  ok(!/scheduled a tour/i.test(body), "MODE B never claims a scheduled tour")
}

// ── No placeholders when optional data is missing ───────────────────────────
{
  // Beds/baths + budget + move date absent → phrase drops, rows omitted, no "Not specified".
  const sparse = { first_name: "Dana", last_name: "Kim" }
  const f = buildGuestCardFields(sparse, { property_name: "Elm & Vine", tourAt: TOUR_AT, timeZone: TZ }, AGENT)
  const body = buildGuestCardBody(f)
  ok(!/Not specified/i.test(body), "no 'Not specified' anywhere in the body")
  ok(!/\(#|\(Apartment|\(Community name/i.test(body), "no instructional placeholder parentheticals")
  ok(body.includes("My client has scheduled a tour at Elm & Vine for Tuesday, September 22, 2026 at 9:00 AM"), "intro drops the beds/baths phrase cleanly")
  ok(!body.includes("Beds / Baths:"), "Beds/Baths row omitted when unknown")
  ok(!body.includes("Budget:"), "Budget row omitted when unknown")
  ok(!body.includes("Move Date:"), "Move Date row omitted when unknown")
  ok(body.includes("Client Name: Dana Kim"), "Client Name still present")
}

console.log(`\n${fail === 0 ? "ALL PASS ✅" : "FAILURES ❌"}  (${pass} passed, ${fail} failed)`)
if (fail > 0) process.exit(1)
