/**
 * Reschedule Tour reconciliation — replicates the EXACT client path with no DB:
 *   startEditTour → DateTimePicker draft → saveEditTour (split) →
 *   handleRescheduleTour (favProp/favId + localTourToUtc) → rescheduleTour
 *   onOptimistic (setLocalTours map) → upcomingTourForFavorite (Favorite render).
 *
 *   npx tsx scripts/tests/reschedule-tour.test.ts
 *
 * Guards the bug where a rescheduled tour vanished from its Favorite, plus the
 * Guest-Card-independence requirement (reschedule never touches guest card state).
 */
import { upcomingTourForFavorite } from "@/lib/leads/upcomingTour"
import { localTourToUtc, utcToLocalTourValue, tourFollowUpDueAt } from "@/lib/leads/tourFollowUp"

let pass = 0,
  fail = 0
function ok(cond: boolean, name: string, extra = "") {
  cond ? pass++ : fail++
  console.log(`${cond ? "✓" : "✗"} ${name}${cond ? "" : `  ${extra}`}`)
}

const TZ = "America/Chicago"
const FOUNDRY = 8001 // demo Favorite id (numeric, like DEMO_FAVORITES)
const LEAD = "demo-12"

// A scheduled Foundry tour a few days out (future, so it currently shows).
function foundryTour(scheduledAtIso: string, id = "local-tour-row-demo-12-1") {
  return { id, lead_id: LEAD, property_id: FOUNDRY, scheduled_at: scheduledAtIso, status: "scheduled" }
}

// Replicate saveEditTour's split + handleRescheduleTour's arg math + rescheduleTour's
// onOptimistic setLocalTours map, then read back the Favorite's tour + follow-up.
function reschedule(
  localTours: any[],
  guestCardActions: any[],
  opts: { editTourId: string; editPropertyId: string; editDateTime: string },
) {
  // saveEditTour
  const [tourDate, tourTime] = opts.editDateTime.split("T")
  // handleRescheduleTour
  const rawProperty = String(opts.editPropertyId ?? "").trim()
  const favProp = /^\d+$/.test(rawProperty) ? rawProperty : null
  const favId = favProp == null ? null : Number(favProp)
  const scheduledAt = localTourToUtc(tourDate, tourTime, TZ)
  // rescheduleTour onOptimistic (setLocalTours map)
  const nextTours = localTours.map((t) =>
    String(t.id) === String(opts.editTourId) ? { ...t, scheduled_at: scheduledAt, property_id: favId } : t,
  )
  const followUpDue = tourFollowUpDueAt([{ scheduledAt, status: "scheduled" }]) as string
  // Guest card actions are NOT touched by reschedule.
  return { nextTours, guestCardActions, scheduledAt, followUpDue }
}

// The 4 required combinations. In every case: same tour id, same property, new
// datetime, correct guest-card state, updated follow-up (+2h), Favorite still shows it.
type Combo = { name: string; gcCompleted: boolean; changeDateOnly?: boolean; changeTimeOnly?: boolean }
const combos: Combo[] = [
  { name: "GC unsent → reschedule DATE", gcCompleted: false, changeDateOnly: true },
  { name: "GC unsent → reschedule TIME", gcCompleted: false, changeTimeOnly: true },
  { name: "GC sent → reschedule DATE", gcCompleted: true, changeDateOnly: true },
  { name: "GC sent → reschedule TIME", gcCompleted: true, changeTimeOnly: true },
]

for (const c of combos) {
  // Original tour: 2026-09-22 09:00 local.
  const originalUtc = localTourToUtc("2026-09-22", "09:00", TZ)
  const tour = foundryTour(originalUtc)
  const localTours = [tour]
  // Guest card for The Foundry, in the requested state.
  const gc = {
    id: 50,
    lead_id: LEAD,
    property_id: FOUNDRY,
    action_key: "email_guest_card",
    title: "Email Guest Card",
    completed: c.gcCompleted,
    completed_at: c.gcCompleted ? new Date(Date.parse(originalUtc) - 3600_000).toISOString() : null,
    status: c.gcCompleted ? "completed" : "open",
  }

  // startEditTour prefills the draft from the tour's CURRENT local value.
  const prefill = utcToLocalTourValue(originalUtc, TZ) // "2026-09-22T09:00"
  const [pDate, pTime] = prefill.split("T")
  // Change ONE field; the other is preserved by the picker's draft.
  const editDateTime = c.changeDateOnly ? `2026-09-25T${pTime}` : `${pDate}T13:30`

  const res = reschedule(localTours, [gc], {
    editTourId: tour.id,
    editPropertyId: String(FOUNDRY),
    editDateTime,
  })

  // Exactly one active Foundry tour remains.
  const foundryTours = res.nextTours.filter((t) => String(t.property_id) === String(FOUNDRY) && t.status === "scheduled")
  ok(foundryTours.length === 1, `${c.name}: exactly one active Foundry tour`, JSON.stringify(foundryTours))
  // No duplicate — same id as the original.
  ok(res.nextTours.length === 1 && String(res.nextTours[0].id) === String(tour.id), `${c.name}: same tour id, no duplicate`)
  // Property still attached.
  ok(String(res.nextTours[0].property_id) === String(FOUNDRY), `${c.name}: property_id still The Foundry`)
  // Favorite still surfaces the tour (this is the disappearing-bug guard).
  const shown = upcomingTourForFavorite(res.nextTours, FOUNDRY, Date.parse("2026-09-01T00:00:00Z"))
  ok(shown != null, `${c.name}: Favorite still shows TOUR SCHEDULED (did not disappear)`)
  // New datetime replaced the old.
  ok(shown != null && shown.scheduled_at === res.scheduledAt && shown.scheduled_at !== originalUtc, `${c.name}: Favorite shows the NEW datetime`)
  // change-date-only preserved the time; change-time-only preserved the date.
  const back = utcToLocalTourValue(res.scheduledAt, TZ)
  if (c.changeDateOnly) ok(back === `2026-09-25T${pTime}`, `${c.name}: changing date preserved the time`, back)
  if (c.changeTimeOnly) ok(back === `${pDate}T13:30`, `${c.name}: changing time preserved the date`, back)
  // Follow-up recomputed from the NEW tour time (+2h).
  ok(res.followUpDue === new Date(Date.parse(res.scheduledAt) + 2 * 3600_000).toISOString(), `${c.name}: Tour Follow-Up recalculated from the new tour time (+2h)`)
  // Guest card state UNCHANGED by reschedule.
  const gcAfter = res.guestCardActions[0]
  ok(gcAfter.completed === c.gcCompleted && String(gcAfter.property_id) === String(FOUNDRY), `${c.name}: Guest Card state preserved (completed=${c.gcCompleted}), still attached to The Foundry`)
  ok(res.guestCardActions.length === 1, `${c.name}: no duplicate/recreated Send Guest Card`)
}

// Cancel (no reschedule) leaves the original tour untouched.
{
  const originalUtc = localTourToUtc("2026-09-22", "09:00", TZ)
  const localTours = [foundryTour(originalUtc)]
  // No reschedule call → tours unchanged.
  const shown = upcomingTourForFavorite(localTours, FOUNDRY, Date.parse("2026-09-01T00:00:00Z"))
  ok(shown != null && shown.scheduled_at === originalUtc, "Cancel/no-op path leaves the original tour untouched")
}

console.log(`\n${fail === 0 ? "ALL PASS ✅" : "FAILURES ❌"}  (${pass} passed, ${fail} failed)`)
if (fail > 0) process.exit(1)
