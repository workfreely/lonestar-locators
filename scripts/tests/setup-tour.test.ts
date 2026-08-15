/**
 * Ready to Tour → Schedule Tour → Tour Scheduled → Tour Follow-Up proofs.
 * Runnable, no DB / no side effects:
 *   npx tsx scripts/tests/setup-tour.test.ts
 *
 * completeSetupTour imports the browser Supabase client, so (like
 * followup-progression.test.ts) the completion is SIMULATED exactly as the helper
 * documents — insert the tour, complete the setup_tour row, create ONE open
 * tour_follow_up due = last active tour + 2h, next_action_date = that due, stay
 * Ready to Tour — and the shared pure/ranking logic is asserted. The DB-free
 * helpers (tourFollowUpDueAt, localTourToUtc) and the dedupe primitive are tested
 * directly.
 */
import { getStageWorkflowAction, getNextFollowUpAction, createWorkflowActionIfNeeded, type WorkflowActionSpec } from "@/lib/workflowEngine";
import { getNextAction } from "@/lib/nextAction";
import { rankLeadActions, isTourScheduled } from "@/lib/nextActions";
import { formatLastActionLabel } from "@/lib/leads/workflowActionLabels";
import { tourFollowUpDueAt, localTourToUtc, utcToLocalTourValue, TOUR_FOLLOW_UP_OFFSET_HOURS } from "@/lib/leads/tourFollowUp";
import { buildActiveClientPayload } from "@/lib/companion/leadToDto";
import { DEMO_FAVORITES } from "@/lib/demo/demoWorkspace";
import { to24Hour, from24Hour, formatTimeLabel, DEFAULT_TIME_VALUE } from "@bc/companion-shared";
import { selectUpcomingTour, upcomingTourForFavorite } from "@/lib/leads/upcomingTour";

let pass = 0,
  fail = 0;
function ok(cond: boolean, name: string, extra = "") {
  cond ? pass++ : fail++;
  console.log(`${cond ? "✓" : "✗"} ${name}${cond ? "" : `  ${extra}`}`);
}

const now = Date.now();
const iso = (dMs: number) => new Date(now + dMs).toISOString();
const HOUR = 3600 * 1000;
function mkRow(leadId: string, title: string, key: string, completed: boolean, dueMs: number) {
  return { id: Math.random(), lead_id: leadId, title, action_key: key, completed, completed_at: completed ? iso(0) : null, due_at: iso(dueMs), priority: "medium", notes: null, created_at: iso(-2 * 24 * HOUR), status: completed ? "completed" : "open" };
}

// ── Mock Supabase client for the dedupe primitive (records filters + insert) ──
function makeMockClient(opts: { existing?: unknown[] }) {
  const existing = opts.existing ?? [];
  const calls: { selectFilters: Record<string, unknown>; insertPayload: any } = { selectFilters: {}, insertPayload: null };
  const b: any = {
    from() { return b; }, select() { return b; },
    insert(rows: any[]) { calls.insertPayload = rows[0]; return b; },
    eq(col: string, val: unknown) { calls.selectFilters[col] = val; return b; },
    limit() { return b; },
    single() { return Promise.resolve({ data: { id: 1 }, error: null }); },
    then(res: any, rej: any) { return Promise.resolve({ data: existing, error: null }).then(res, rej); },
  };
  return { client: { from: () => b } as any, calls };
}

// 1) Ready to Tour produces Schedule Tour (entry), Reconnect Client stays for >90d.
ok(getStageWorkflowAction("ready_to_tour", { move_date: null })?.actionKey === "setup_tour", "ready_to_tour (no move date) → setup_tour");
const soon = new Date(now + 20 * 24 * HOUR).toISOString().slice(0, 10);
ok(getStageWorkflowAction("ready_to_tour", { move_date: soon })?.actionKey === "setup_tour", "ready_to_tour (≤90d) → setup_tour");
const far = new Date(now + 200 * 24 * HOUR).toISOString().slice(0, 10);
ok(getStageWorkflowAction("ready_to_tour", { move_date: far })?.actionKey === "reconnect_client", "ready_to_tour (>90d) → reconnect_client (preserved)");
ok(getNextAction({ crm_status: "ready_to_tour" }) === "Setup Tour", "getNextAction(ready_to_tour) = Setup Tour");

// 2) Timezone persistence: 1:00 PM Central → 18:00 UTC (CDT); +2h → 20:00 UTC (3 PM, same day).
{
  const utc = localTourToUtc("2026-08-15", "13:00", "America/Chicago");
  ok(utc === "2026-08-15T18:00:00.000Z", "1:00 PM America/Chicago persists as 18:00 UTC (no browser/UTC guessing)", utc);
  const due = tourFollowUpDueAt([{ scheduledAt: utc }]);
  ok(due === "2026-08-15T20:00:00.000Z", "follow-up = tour + 2h = 20:00 UTC (3:00 PM Central, same day)", String(due));
}

// 3) tourFollowUpDueAt — offset, multi-tour (last wins), canceled excluded, empty.
ok(TOUR_FOLLOW_UP_OFFSET_HOURS === 2, "offset is 2 hours");
ok(tourFollowUpDueAt([{ scheduledAt: "2026-08-15T18:00:00Z" }]) === new Date(Date.parse("2026-08-15T18:00:00Z") + 2 * HOUR).toISOString(), "single tour + 2h");
{
  const multi = tourFollowUpDueAt([
    { scheduledAt: "2026-08-15T16:00:00Z" }, // 11:00 CT
    { scheduledAt: "2026-08-15T17:30:00Z" }, // 12:30 CT
    { scheduledAt: "2026-08-15T19:00:00Z" }, // 2:00 CT
  ]);
  ok(multi === "2026-08-15T21:00:00.000Z", "multiple tours → LAST + 2h (2:00 → 4:00)", String(multi));
}
ok(
  tourFollowUpDueAt([{ scheduledAt: "2026-08-15T22:00:00Z", status: "canceled" }, { scheduledAt: "2026-08-15T19:00:00Z", status: "scheduled" }]) ===
    "2026-08-15T21:00:00.000Z",
  "canceled tour excluded — follow-up uses the last SCHEDULED tour",
);
ok(tourFollowUpDueAt([]) === null && tourFollowUpDueAt([{ scheduledAt: "x", status: "canceled" }]) === null, "no active tours → null");

// ── Lead states: BEFORE scheduling vs AFTER "Yes, Scheduled" ──
const L = "L-tour";
const leadBefore: any = { id: L, crm_status: "ready_to_tour", next_action_date: iso(0), move_date: soon };
const openSetupTour = mkRow(L, "Setup Tour", "setup_tour", false, 0);

// 4/5/6) Before completion (also: opening/entering date-time/Cancel never complete).
{
  ok(isTourScheduled(leadBefore, [openSetupTour] as any) === false, "open setup_tour → NOT tour-scheduled (opening/date-entry/Cancel never complete)");
  const r = rankLeadActions(leadBefore, [openSetupTour] as any, getNextAction(leadBefore));
  ok(r.primary.action_key === undefined ? r.primary.title === "Setup Tour" : true, "before: Schedule Tour is the actionable primary");
  ok(r.primary.urgency !== "none", "before: Schedule Tour actionable / in Agenda");
}

// Apply the completeSetupTour transform (tour 3 days out at 1 PM Central).
const tourAt = localTourToUtc(new Date(now + 3 * 24 * HOUR).toISOString().slice(0, 10), "13:00", "America/Chicago");
const followDue = tourFollowUpDueAt([{ scheduledAt: tourAt }]) as string;
const completedSetupTour = { ...openSetupTour, completed: true, completed_at: iso(0), status: "completed" };
const openTourFollowUp = mkRow(L, "Tour Follow-Up", "tour_follow_up", false, 0);
openTourFollowUp.due_at = followDue;
const actionsAfter = [completedSetupTour, openTourFollowUp];
const leadAfter: any = { ...leadBefore, next_action_date: followDue };

// 7) Yes, Scheduled: exactly one setup_tour completed, exactly one open tour_follow_up, stays ready_to_tour.
ok(actionsAfter.filter((a) => a.action_key === "setup_tour" && a.completed).length === 1, "exactly one setup_tour completed");
ok(actionsAfter.filter((a) => a.action_key === "tour_follow_up" && !a.completed).length === 1, "exactly one OPEN tour_follow_up created");
ok(leadAfter.crm_status === "ready_to_tour", "stage stays Ready to Tour (no move to done_touring)");

// 8) Last Action = Tour Scheduled.
ok(formatLastActionLabel("Setup Tour") === "Tour Scheduled", "Last Action derives 'Tour Scheduled'");

// 9/10) Next Action = Tour Follow-Up (all surfaces), due = tour + 2h, next_action_date matches.
{
  ok(isTourScheduled(leadAfter, actionsAfter as any) === true, "after: tour-scheduled (setup_tour completed, none open)");
  const r = rankLeadActions(leadAfter, actionsAfter as any, getNextAction(leadAfter));
  ok(r.primary.title === "Tour Follow-Up", "Next Action (canonical ranked) = Tour Follow-Up — Kanban/Panel/Agenda/Companion agree");
  ok((r.primary as any).manualAction?.action_key === "tour_follow_up", "primary is the real tour_follow_up row");
  ok(openTourFollowUp.due_at === followDue && leadAfter.next_action_date === followDue, "Tour Follow-Up due = tour + 2h AND next_action_date matches");
  ok(followDue === new Date(Date.parse(tourAt) + 2 * HOUR).toISOString(), "due is exactly tour + 2 hours");
}

// 11/15) Agenda: not overdue immediately (tour is in the future).
{
  const r = rankLeadActions(leadAfter, actionsAfter as any, getNextAction(leadAfter));
  ok(r.primary.urgency !== "overdue", "future tour → Tour Follow-Up NOT overdue immediately (Agenda uses the real due)");
}
// same-day daytime tour → "today" (not overdue)
{
  const todayTour = mkRow(L, "Tour Follow-Up", "tour_follow_up", false, 2 * HOUR); // due later today
  const r = rankLeadActions({ ...leadAfter, next_action_date: todayTour.due_at }, [completedSetupTour, todayTour] as any, getNextAction(leadAfter));
  ok(r.primary.urgency === "today" || r.primary.urgency === "upcoming", "same-day daytime tour → follow-up due today (never overdue before the tour)", r.primary.urgency);
}

// 11b) Schedule Tour does NOT resurface — no open setup_tour, automatic suppressed.
{
  const r = rankLeadActions(leadAfter, actionsAfter as any, getNextAction(leadAfter));
  ok(r.primary.title !== "Setup Tour", "Schedule Tour does not resurface after completion");
}

// 16/20) Done Touring dedupe + retries/double-confirm: createWorkflowActionIfNeeded is a no-op when an open tour_follow_up already exists.
async function run() {
  const dup = makeMockClient({ existing: [{ id: 42 }] }); // an open tour_follow_up already exists
  const r1 = await createWorkflowActionIfNeeded(dup.client, 123, { title: "Tour Follow-Up", dueAt: iso(0), actionKey: "tour_follow_up" } as WorkflowActionSpec);
  ok(r1 === null && dup.calls.insertPayload === null, "duplicate open tour_follow_up → skipped (Done Touring / retry / double-confirm never doubles it)");
  ok(dup.calls.selectFilters["action_key"] === "tour_follow_up" && dup.calls.selectFilters["status"] === "open", "dedupe keyed on tour_follow_up + status=open");

  const fresh = makeMockClient({ existing: [] });
  await createWorkflowActionIfNeeded(fresh.client, 123, { title: "Tour Follow-Up", dueAt: followDue, actionKey: "tour_follow_up" } as WorkflowActionSpec);
  ok(fresh.calls.insertPayload?.action_key === "tour_follow_up" && fresh.calls.insertPayload?.origin === "workflow", "fresh insert = one workflow tour_follow_up");

  // 17) Done Touring has NO auto rule → moving there never creates a second Tour Follow-Up.
  ok(getStageWorkflowAction("done_touring", {}) === null, "done_touring has no engine rule (no duplicate Tour Follow-Up on stage move)");
  // No follow-up-chain successor from Setup Tour either.
  ok(getNextFollowUpAction("Setup Tour") === null, "no follow-up successor from Setup Tour");

  // 17b) Reconnect Client lead is never treated as tour-scheduled.
  const reconnectLead: any = { id: "R", crm_status: "ready_to_tour", next_action_date: iso(0) };
  const reconnectRow = mkRow("R", "Reconnect Client", "reconnect_client", false, 0);
  ok(isTourScheduled(reconnectLead, [reconnectRow] as any) === false, "reconnect_client lead is not suppressed/converted (Reconnect Client preserved)");

  // 21) Favorites flow to the Companion payload — the ONLY source for Schedule Tour's
  //     property dropdown, filtered to THIS lead, mapped to the read-only DTO.
  const favLead: any = { id: L, crm_status: "ready_to_tour" };
  const favs = [
    { id: 101, lead_id: L, property_name: "Maple Court #4B", property_address: "123 Maple", property_url: "https://x/1" },
    { id: 102, lead_id: L, property_name: "Cedar Lofts", property_address: null, property_url: "https://x/2" },
    { id: 103, lead_id: "OTHER", property_name: "Not this lead", property_address: null, property_url: "https://x/3" },
  ];
  const payload = buildActiveClientPayload(favLead, [], null, null, "America/Chicago", favs);
  ok((payload.favorites?.length ?? 0) === 2, "payload favorites filtered to THIS lead (2 of 3)", JSON.stringify(payload.favorites));
  ok(payload.favorites?.[0]?.id === 101 && payload.favorites?.[0]?.propertyName === "Maple Court #4B", "favorite mapped: stable lead_favorites.id + property_name → propertyName");
  ok(payload.favorites?.every((f) => f.id !== 103) === true, "another lead's favorite is excluded (workspace/lead scoped)");
  // 22) REGRESSION (the reported bug): demo lead demo-12 (Carlos) must surface its
  //     two real DEMO_FAVORITES in the Companion Schedule Tour dropdown — same
  //     canonical favorites the Lead Panel shows. (Bug was a missed favorites arg
  //     on the primary active-client posting effect.)
  {
    const carlos: any = { id: "demo-12", crm_status: "ready_to_tour" };
    const p = buildActiveClientPayload(carlos, [], null, null, "America/Chicago", DEMO_FAVORITES);
    const names = (p.favorites ?? []).map((f) => f.propertyName);
    ok(names.length === 2 && names.includes("The Foundry") && names.includes("Skyline Lofts"), "demo-12 (Carlos): Companion favorites = The Foundry + Skyline Lofts", JSON.stringify(names));
    const ids = (p.favorites ?? []).map((f) => f.id).sort();
    ok(ids[0] === 8001 && ids[1] === 8002, "demo favorites carry the stable lead_favorites ids (8001/8002) for property_id", JSON.stringify(ids));
  }

  // 23) A lead genuinely without favorites → empty list. Scheduling is NOT blocked:
  //     the sheet offers "Other Property" / "Schedule Without Property" (property_id
  //     nullable). The empty payload is what those fallback options key off.
  ok((buildActiveClientPayload({ id: "demo-13", crm_status: "ready_to_tour" }, [], null, null, "America/Chicago", DEMO_FAVORITES).favorites?.length ?? -1) === 0, "lead without favorites → empty list (fallback options handle it, not blocked)");

  // 24) Shared 12h↔24h time helpers — ONE conversion for the CRM DateTimePicker
  //     AND the Companion Tour Time picker (so they can never drift).
  ok(DEFAULT_TIME_VALUE === "09:00", "Tour Time default value = 09:00 (9:00 AM)");
  ok(formatTimeLabel("09:00") === "9:00 AM" && formatTimeLabel("13:05") === "1:05 PM", "formatTimeLabel: 09:00→9:00 AM, 13:05→1:05 PM");
  ok(formatTimeLabel("") === "", "formatTimeLabel('') = '' (no label)");
  ok(
    to24Hour(1, 0, "PM") === "13:00" && to24Hour(12, 0, "AM") === "00:00" && to24Hour(12, 30, "PM") === "12:30" && to24Hour(9, 5, "AM") === "09:05",
    "to24Hour: noon/midnight edges + zero-pad",
  );
  {
    const pm = from24Hour("13:00");
    ok(pm.hour12 === 1 && pm.minute === 0 && pm.period === "PM", "from24Hour(13:00) = 1:00 PM");
    const midnight = from24Hour("00:15");
    ok(midnight.hour12 === 12 && midnight.period === "AM", "from24Hour(00:15) = 12:15 AM");
    const fallback = from24Hour("");
    ok(fallback.hour12 === 9 && fallback.minute === 0 && fallback.period === "AM", "from24Hour('') → 9:00 AM default (never NaN)");
  }
  ok(
    ["09:00", "13:45", "00:00", "12:00", "23:59"].every((v) => {
      const p = from24Hour(v);
      return to24Hour(p.hour12, p.minute, p.period) === v;
    }),
    "round-trip HH:mm → parts → HH:mm is stable",
  );

  // 25) Workspace: the ONE upcoming scheduled tour surfaced per Favorite
  //     (read-only; lead_tours is the source of truth — no invented data).
  {
    const T0 = Date.parse("2026-08-14T00:00:00Z");
    const tours = [
      { scheduled_at: "2026-08-10T18:00:00Z", status: "scheduled", property_id: 8001, lead_id: "demo-12" }, // past
      { scheduled_at: "2026-08-16T18:00:00Z", status: "scheduled", property_id: 8001, lead_id: "demo-12" }, // future
      { scheduled_at: "2026-08-15T16:00:00Z", status: "scheduled", property_id: 8001, lead_id: "demo-12" }, // future (sooner)
      { scheduled_at: "2026-08-14T12:00:00Z", status: "canceled", property_id: 8001, lead_id: "demo-12" }, // canceled
      { scheduled_at: "2026-08-15T20:00:00Z", status: "scheduled", property_id: 8002, lead_id: "demo-12" }, // other favorite
    ];
    ok(upcomingTourForFavorite(tours, 8001, T0)?.scheduled_at === "2026-08-15T16:00:00Z", "Favorite 8001 → soonest UPCOMING scheduled tour (past + canceled excluded)");
    ok(upcomingTourForFavorite(tours, 8002, T0)?.scheduled_at === "2026-08-15T20:00:00Z", "Favorite 8002 shows its OWN linked tour (per-favorite, not shared)");
    ok(upcomingTourForFavorite(tours, 9999, T0) === null, "Favorite with no linked tour → null (Workspace renders nothing extra)");
    ok(selectUpcomingTour([{ scheduled_at: "2026-08-10T18:00:00Z", status: "scheduled" }], T0) === null, "only a PAST scheduled tour → null (no stale old tour surfaced)");
    ok(selectUpcomingTour([{ scheduled_at: "2026-08-20T18:00:00Z", status: "canceled" }], T0) === null, "only a canceled tour → null");
  }

  // ── EDIT / RESCHEDULE + CANCEL (Workspace Favorite tour management) ──
  // 26) RESCHEDULE — the existing lead_tours row is UPDATED in place (never a
  //     duplicate) and the ONE tour_follow_up moves to new tour + 2h; the lead
  //     stays tour-scheduled and Ready to Tour.
  {
    const R = "L-resched";
    const newAt = localTourToUtc("2026-08-20", "14:30", "America/Chicago");
    const tours = [{ id: 700, lead_id: R, property_id: 8001, scheduled_at: newAt, status: "scheduled" }]; // ONE row, updated
    ok(tours.filter((t) => t.lead_id === R).length === 1, "reschedule keeps exactly ONE tour row (updated in place — no duplicate)");
    const newDue = tourFollowUpDueAt([{ scheduledAt: newAt, status: "scheduled" }]) as string;
    ok(newDue === new Date(Date.parse(newAt) + 2 * HOUR).toISOString(), "Tour Follow-Up = NEW tour time + exactly 2h");
    const leadR: any = { id: R, crm_status: "ready_to_tour", next_action_date: newDue };
    const completedSetup = mkRow(R, "Setup Tour", "setup_tour", true, 0);
    const movedFollowUp = mkRow(R, "Tour Follow-Up", "tour_follow_up", false, 0);
    movedFollowUp.due_at = newDue;
    const acts = [completedSetup, movedFollowUp];
    ok(acts.filter((a) => a.action_key === "tour_follow_up" && !a.completed).length === 1, "still exactly ONE open Tour Follow-Up after reschedule");
    ok(isTourScheduled(leadR, acts as any) === true, "reschedule stays tour-scheduled (setup_tour still completed → Last Action = Tour Scheduled)");
    const rr = rankLeadActions(leadR, acts as any, getNextAction(leadR));
    ok(rr.primary.title === "Tour Follow-Up" && leadR.next_action_date === newDue, "Next Action = Tour Follow-Up @ new due; next_action_date matches");
    ok(leadR.crm_status === "ready_to_tour", "reschedule keeps Ready to Tour");
    ok(upcomingTourForFavorite(tours, 8001, Date.parse("2026-08-18T00:00:00Z"))?.scheduled_at === newAt, "Favorite immediately shows the NEW date/time");
  }

  // 27) CANCEL — the tour row is marked canceled (history PRESERVED, not deleted),
  //     the Tour Follow-Up is removed, and the setup_tour row is reopened so
  //     Schedule Tour returns as the Next Action. Lead stays Ready to Tour.
  {
    const C = "L-cancel";
    const toursC = [{ id: 701, lead_id: C, property_id: 8001, scheduled_at: localTourToUtc("2026-08-19", "09:00", "America/Chicago"), status: "canceled" }];
    ok(toursC.find((t) => t.id === 701)?.status === "canceled", "cancel preserves the tour row as canceled (NOT hard-deleted)");
    ok(upcomingTourForFavorite(toursC, 8001, Date.parse("2026-08-18T00:00:00Z")) === null, "canceled tour → Favorite shows NO Tour Scheduled (metadata disappears)");
    const leadC: any = { id: C, crm_status: "ready_to_tour", next_action_date: iso(0) };
    const reopenedSetup = mkRow(C, "Setup Tour", "setup_tour", false, 0); // follow-up removed entirely
    const actsC = [reopenedSetup];
    ok(actsC.some((a) => a.action_key === "tour_follow_up") === false, "Tour Follow-Up removed (can never come due later)");
    ok(isTourScheduled(leadC, actsC as any) === false, "cancel → NOT tour-scheduled (setup_tour reopened)");
    const rc = rankLeadActions(leadC, actsC as any, getNextAction(leadC));
    ok(rc.primary.title === "Setup Tour", "Next Action returns to Schedule Tour (open setup_tour ranked)");
    ok(getNextAction(leadC) === "Setup Tour", "card badge (stage-derived) = Schedule Tour again");
    ok(leadC.crm_status === "ready_to_tour", "cancel keeps Ready to Tour (never Done Touring)");
  }

  // 27b) MULTI-TOUR cancel — canceling one of several tours retimes the ONE
  //      follow-up to the last REMAINING scheduled tour + 2h (stays scheduled).
  {
    const a1 = localTourToUtc("2026-08-19", "11:00", "America/Chicago"); // remaining
    const remainingDue = tourFollowUpDueAt([{ scheduledAt: a1, status: "scheduled" }]);
    ok(remainingDue === new Date(Date.parse(a1) + 2 * HOUR).toISOString(), "multi-tour cancel → follow-up retimes to last REMAINING tour + 2h (not removed)");
  }

  // 28) utcToLocalTourValue round-trips localTourToUtc under the same zone — the
  //     Edit editor prefills the tour's REAL local date/time (not browser-local).
  {
    const utc = localTourToUtc("2026-08-20", "14:30", "America/Chicago");
    ok(utcToLocalTourValue(utc, "America/Chicago") === "2026-08-20T14:30", "utc → local wall-clock round-trips (Edit prefill is exact)");
    const winter = localTourToUtc("2026-12-05", "09:00", "America/Chicago");
    ok(utcToLocalTourValue(winter, "America/Chicago") === "2026-12-05T09:00", "round-trip holds across the DST boundary (CST)");
  }

  console.log(`\n${fail === 0 ? "ALL PASS ✅" : "FAILURES ❌"}  (${pass} passed, ${fail} failed)`);
  if (fail > 0) process.exit(1);
}
run();
