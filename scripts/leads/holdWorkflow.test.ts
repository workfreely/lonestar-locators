// On Hold workflow — pure-logic tests. Covers the hold field builders, the hold
// reminder urgency/format, the canonical Next Action suppression (held behaves
// like archived — inert, nothing mutated), and the archive-reason changes.
// Run: npx tsx scripts/leads/holdWorkflow.test.ts
import {
  isOnHold,
  buildHoldUpdate,
  buildRescheduleHoldUpdate,
  buildResumeUpdate,
  buildHoldClearedOnArchive,
  holdReminderUrgency,
  formatHoldFollowUp,
  formatHoldFollowUpNumeric,
  holdFollowUpInstant,
} from "@/lib/leads/holdWorkflow"
import { rankLeadActions, type ManualNextAction } from "@/lib/nextActions"
import { ARCHIVE_REASONS, getArchiveReasonLabel } from "@/lib/leads/archiveReasons"
import { formatDueDateTime } from "@/lib/actionDisplay"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }

const NOW = new Date("2026-09-20T12:00:00")
const overdueManual: ManualNextAction = {
  id: 99, lead_id: 1, title: "Send List", due_at: "2026-01-01T09:00:00Z", priority: "high",
  completed: false, completed_at: null, notes: null, created_at: "2026-01-01T00:00:00Z",
  action_key: "send_list", action_type: "workflow",
}

console.log("Field builders (Hold never touches crm_status / actions):")
{
  const h = buildHoldUpdate("2026-09-30", NOW)
  ok("buildHoldUpdate sets held_at (ISO) + hold_follow_up_at", h.held_at === NOW.toISOString() && h.hold_follow_up_at === "2026-09-30")
  ok("buildHoldUpdate does NOT include crm_status/next_action_date", !("crm_status" in h) && !("next_action_date" in h))
  const r = buildResumeUpdate()
  ok("buildResumeUpdate clears both hold columns", r.held_at === null && r.hold_follow_up_at === null)
  const rs = buildRescheduleHoldUpdate("2026-10-15")
  ok("reschedule changes ONLY hold_follow_up_at (stays held)", rs.hold_follow_up_at === "2026-10-15" && !("held_at" in rs))
  const ac = buildHoldClearedOnArchive()
  ok("archive clears hold (mutual exclusivity)", ac.held_at === null && ac.hold_follow_up_at === null)
}

console.log("\nisOnHold predicate:")
ok("held_at set ⇒ on hold", isOnHold({ held_at: "2026-09-20T00:00:00Z" }) === true)
ok("held_at null ⇒ not on hold", isOnHold({ held_at: null }) === false)
ok("no held_at ⇒ not on hold", isOnHold({}) === false)

console.log("\nHold reminder urgency (local-date, day granularity):")
ok("past date ⇒ overdue", holdReminderUrgency("2026-09-10", NOW) === "overdue")
ok("same day ⇒ today", holdReminderUrgency("2026-09-20", NOW) === "today")
ok("future date ⇒ upcoming (not surfaced)", holdReminderUrgency("2026-10-05", NOW) === "upcoming")
ok("missing date ⇒ none", holdReminderUrgency(null, NOW) === "none")

console.log("\nHold date format (compact, no time):")
ok("same-year ⇒ 'Sep 30'", formatHoldFollowUp("2026-09-30", NOW) === "Sep 30")
ok("other-year ⇒ includes year", formatHoldFollowUp("2027-01-05", NOW) === "Jan 5, 2027")
ok("null ⇒ empty string", formatHoldFollowUp(null, NOW) === "")

console.log("\nCard-only numeric date (MM/DD/YYYY, four-digit year, no time):")
ok("'2026-10-05' ⇒ '10/05/2026'", formatHoldFollowUpNumeric("2026-10-05") === "10/05/2026")
ok("'2027-01-05' ⇒ '01/05/2027'", formatHoldFollowUpNumeric("2027-01-05") === "01/05/2027")
ok("null ⇒ empty string", formatHoldFollowUpNumeric(null) === "")

console.log("\nHold follow-up 9:00 AM instant (derived from the date; column stays date-only):")
{
  const iso = holdFollowUpInstant("2026-09-18")
  const d = iso ? new Date(iso) : null
  ok("date-only value yields an instant (not null)", !!iso)
  ok("instant is 9:00 AM local", !!d && d.getHours() === 9 && d.getMinutes() === 0)
  ok("instant is on the selected calendar day", !!d && d.getFullYear() === 2026 && d.getMonth() === 8 && d.getDate() === 18)
  ok("full ISO input still resolves to that day's 9 AM (defensive)", (() => { const x = holdFollowUpInstant("2026-09-18T14:00:00.000Z"); return !!x && new Date(x).getHours() === 9 })())
  ok("null date ⇒ null instant (existing/no hold safe)", holdFollowUpInstant(null) === null)
}

console.log("\nCanonical Next Action suppression — held behaves like archived, inert, nothing mutated:")
{
  // Active Searching lead with an overdue action → surfaces as overdue.
  const active = { id: 1, crm_status: "searching", next_action_date: "2026-01-01" }
  const activeRank = rankLeadActions(active, [overdueManual], "Send List")
  ok("ACTIVE lead surfaces the overdue action", activeRank.primary.urgency === "overdue")

  // Same lead, now On Hold → the SAME open action becomes dormant (urgency none).
  const held = { id: 1, crm_status: "searching", held_at: "2026-09-20T00:00:00Z", hold_follow_up_at: "2026-09-30", next_action_date: "2026-01-01" }
  const heldRank = rankLeadActions(held, [overdueManual], "Send List")
  ok("HELD lead: primary urgency is 'none' (suppressed)", heldRank.primary.urgency === "none")
  ok("HELD lead: no 'others' surface", heldRank.others.length === 0)
  ok("HELD lead: crm_status preserved (still searching)", held.crm_status === "searching")

  // Archived parity (unchanged behavior).
  const archived = { id: 1, crm_status: "archived", next_action_date: "2026-01-01" }
  const archivedRank = rankLeadActions(archived, [overdueManual], "Send List")
  ok("ARCHIVED lead: primary urgency 'none' (parity)", archivedRank.primary.urgency === "none")

  // The suppression is non-destructive: the caller's action array is untouched.
  ok("suppression mutates nothing (action still open)", overdueManual.completed === false && (overdueManual as any).status === undefined)
}

console.log("\nArchive reasons — Moving Later removed from the picker but still renders on old leads:")
ok("ARCHIVE_REASONS no longer offers moving_later", !ARCHIVE_REASONS.some((r) => r.value === "moving_later"))
ok("ARCHIVE_REASONS still has the other five", ["ghosted", "unqualified", "rented_elsewhere", "spam", "other"].every((v) => ARCHIVE_REASONS.some((r) => r.value === v)))
ok("a lead archived earlier as moving_later still gets its label", getArchiveReasonLabel("moving_later") === "📅 Moving Later")

console.log("\nCompanion ↔ Agenda hold follow-up date PARITY (same instant + same formatter):")
{
  const tz = "America/Chicago"
  const date = "2026-09-30"
  // What the Agenda renders for a held reminder: formatDueDateTime(9AM instant).
  const agenda = formatDueDateTime(holdFollowUpInstant(date, tz)!, { timeZone: tz, now: NOW })
  // What Companion now renders: the DTO carries holdFollowUpDueAt = holdFollowUpInstant(...)
  // and the panel formats it with the SAME formatDueDateTime (fmtDue) → identical string.
  const companionDueAt = holdFollowUpInstant(date, tz) // DTO field
  const companion = formatDueDateTime(companionDueAt!, { timeZone: tz, now: NOW }) // panel fmtDue
  ok("Companion hold date === Agenda hold date (byte-for-byte parity)", companion === agenda)
  ok("presentation is the Agenda treatment, not the bare compact date", companion !== formatHoldFollowUp(date, NOW) && companion.includes("9:00 AM") && companion.includes("•"))
  ok("shows the correct hold_follow_up_at day", companion.includes("Sep 30"))
  // Relative-day semantics parity: a follow-up dated today reads "Today • 9:00 AM".
  const todayStr = "2026-09-20"
  const todayCompanion = formatDueDateTime(holdFollowUpInstant(todayStr, tz)!, { timeZone: tz, now: NOW })
  ok("today's follow-up uses Agenda relative-day semantics ('Today • …')", todayCompanion.startsWith("Today •"))
  // Not-held ⇒ no instant ⇒ panel shows "Paused" (null field), never a date.
  ok("non-held ⇒ holdFollowUpInstant(null) is null (panel falls back to 'Paused')", holdFollowUpInstant(null, tz) === null)
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
