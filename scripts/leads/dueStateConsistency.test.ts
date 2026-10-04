/**
 * DUE STATE — the Companion and the CRM board must agree.
 *
 * The bug: automatic workflow actions are DAY-scheduled. A new lead's Contact
 * Lead is due 9:00 AM local on its creation day (lib/workflowEngine.ts →
 * autoDueInDays(0)). The CRM board's urgencyOf normalises both sides to midnight,
 * so it read "Today". The Companion's isPastDue compared instants, so for any
 * lead arriving after 9:00 AM it read "Overdue" the moment the lead landed.
 *
 * Same lead, same timestamp, two different answers depending on which panel the
 * locator was looking at — the "second implementation" failure this codebase has
 * been bitten by before.
 *
 * This file runs the REAL isPastDue (not a regex over its source) and pins it
 * against a reimplementation of the board's rule, so the two can only agree.
 *
 * Run: npx tsx scripts/leads/dueStateConsistency.test.ts
 */
import { isPastDue, formatDueDateTime } from "@bc/companion-shared"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}${d ? `\n      ${d}` : ""}`) }
}

/** The CRM board's rule, lib/nextActions.ts urgencyOf — reimplemented here so a
 *  change to either side shows up as a disagreement rather than silently. */
function boardSaysOverdue(dueAt: string, now: Date): boolean {
  const today = new Date(now)
  const d = new Date(dueAt)
  today.setHours(0, 0, 0, 0)
  d.setHours(0, 0, 0, 0)
  return d.getTime() < today.getTime()
}

/** Local "YYYY-MM-DDTHH:mm" → a real local Date (no UTC parsing). */
function localAt(y: number, m: number, d: number, h: number, min = 0): Date {
  return new Date(y, m - 1, d, h, min, 0, 0)
}

async function main() {
  console.log("\nDUE STATE CONSISTENCY — Companion vs CRM board\n")

  console.log("THE REPORTED BUG — a lead created AFTER 9 AM with a same-day action:")
  {
    // Contact Lead seeded at 9:00 AM local on the creation day.
    const due = localAt(2026, 10, 3, 9, 0).toISOString()

    // The lead lands at 2:14 PM — three hours past its own due time.
    const atCreation = localAt(2026, 10, 3, 14, 14)
    ok("it is NOT overdue the moment it lands", isPastDue(due, atCreation) === false)
    ok("…and the board agrees", boardSaysOverdue(due, atCreation) === false)
    ok("…and it reads as Today", formatDueDateTime(due, { now: atCreation }).startsWith("Today"))

    // Still the same calendar day, late evening.
    const lateSameDay = localAt(2026, 10, 3, 23, 59)
    ok("still not overdue at 11:59 PM the same day", isPastDue(due, lateSameDay) === false)
    ok("…and the board still agrees", boardSaysOverdue(due, lateSameDay) === false)

    // One minute later it IS a new day.
    const nextDay = localAt(2026, 10, 4, 0, 1)
    ok("overdue once the calendar day advances", isPastDue(due, nextDay) === true)
    ok("…and the board agrees", boardSaysOverdue(due, nextDay) === true)
  }

  console.log("\nTHE TWO IMPLEMENTATIONS AGREE ACROSS A WHOLE DAY:")
  {
    // Sweep every hour of the due day plus the days either side. Any hour where
    // the Companion and the board disagree is the bug reappearing.
    const due = localAt(2026, 10, 3, 9, 0).toISOString()
    const disagreements: string[] = []
    for (let dayOffset = -1; dayOffset <= 1; dayOffset++) {
      for (let h = 0; h < 24; h++) {
        const now = localAt(2026, 10, 3 + dayOffset, h, 30)
        const mine = isPastDue(due, now)
        const board = boardSaysOverdue(due, now)
        if (mine !== board) disagreements.push(`${now.toString().slice(0, 24)} companion=${mine} board=${board}`)
      }
    }
    ok("72 hourly samples, zero disagreements", disagreements.length === 0,
      disagreements.slice(0, 5).join("\n      "))
  }

  console.log("\nGENUINELY PAST ACTIONS ARE STILL OVERDUE (the fix must not blunt it):")
  {
    const now = localAt(2026, 10, 3, 14, 0)
    ok("yesterday's 9 AM action is overdue",
      isPastDue(localAt(2026, 10, 2, 9, 0).toISOString(), now) === true)
    ok("last week's action is overdue",
      isPastDue(localAt(2026, 9, 26, 9, 0).toISOString(), now) === true)
    ok("tomorrow's action is NOT overdue",
      isPastDue(localAt(2026, 10, 4, 9, 0).toISOString(), now) === false)
    ok("a null due is not overdue", isPastDue(null, now) === false)
    ok("an invalid timestamp is not overdue", isPastDue("not-a-date", now) === false)
  }

  console.log("\nTHE BADGE AND THE LABEL CANNOT CONTRADICT EACH OTHER:")
  {
    // Both now resolve day boundaries through the same dayKeyInZone helper, so
    // "Today" + "Overdue" can never render together.
    const now = localAt(2026, 10, 3, 14, 14)
    const samples = [
      localAt(2026, 10, 3, 9, 0),
      localAt(2026, 10, 3, 23, 0),
      localAt(2026, 10, 2, 9, 0),
      localAt(2026, 10, 4, 9, 0),
    ]
    const contradictions = samples.filter((d) => {
      const iso = d.toISOString()
      return formatDueDateTime(iso, { now }).startsWith("Today") && isPastDue(iso, now)
    })
    ok("nothing labelled 'Today' is also flagged Overdue", contradictions.length === 0)
  }

  console.log("\nZONE-AWARE WHEN A ZONE IS GIVEN (and matches the label's zone):")
  {
    // 2026-10-04 02:00 UTC is still Oct 3 in Chicago (UTC-5).
    const due = "2026-10-04T02:00:00.000Z"
    const now = new Date("2026-10-04T03:00:00.000Z")
    ok("not overdue in America/Chicago (both still Oct 3)",
      isPastDue(due, now, "America/Chicago") === false)
    ok("…and the label agrees it is Today there",
      formatDueDateTime(due, { now, timeZone: "America/Chicago" }).startsWith("Today"))
  }

  console.log("\nSCHEDULING ITSELF WAS NOT TOUCHED:")
  {
    const { readFileSync } = await import("node:fs")
    const path = await import("node:path")
    const engine = readFileSync(path.join(process.cwd(), "lib/workflowEngine.ts"), "utf8")
    ok("a new lead's Contact Lead is still autoDueInDays(0)",
      /actionKey: "contact_lead"/.test(engine) && /autoDueInDays\(0, timeZone, workHours\)/.test(engine))
    const auto = readFileSync(path.join(process.cwd(), "lib/workflow/autoDueDate.ts"), "utf8")
    ok("…and the 9 AM constant is unchanged", /export const AUTO_ACTION_HOUR = 9/.test(auto))
  }

  console.log(`\n${pass} passed, ${fail} failed\n`)
  if (fail > 0) process.exit(1)
}

void main()
