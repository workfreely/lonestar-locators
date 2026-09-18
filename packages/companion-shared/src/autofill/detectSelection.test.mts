/**
 * Standalone test for the PURE tour date/time detection logic (no DOM needed).
 * Run: npx tsx packages/companion-shared/src/autofill/detectSelection.test.mts
 *
 * Covers a positive machine-readable selection plus the required negatives:
 * move-in date, business hours, and multiple unselected slots — and the PERQ
 * (year-less date text, unexposed time) case which must yield nothing.
 */
import { decideSelection, parseDateValue, parseTimeValue, type SelectionCandidate } from "./detectSelection";

let failures = 0;
function eq(label: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { failures++; console.error(`✗ ${label}\n    got  ${g}\n    want ${w}`); }
  else console.log(`✓ ${label}`);
}
const TODAY = "2026-09-17";

// ── parsers ──
eq("parseDate ISO", parseDateValue("2026-09-30"), "2026-09-30");
eq("parseDate ISO datetime", parseDateValue("2026-09-30T11:00:00"), "2026-09-30");
eq("parseDate US", parseDateValue("9/30/2026"), "2026-09-30");
eq("parseDate long", parseDateValue("Wednesday, September 30, 2026"), "2026-09-30");
eq("parseDate year-less REJECTED", parseDateValue("Wednesday, September 30th"), null);
eq("parseDate bare day REJECTED", parseDateValue("30"), null);
eq("parseDate month/year only REJECTED", parseDateValue("September 2026"), null);
eq("parseTime 12h", parseTimeValue("11:00 AM"), "11:00");
eq("parseTime 12h pm", parseTimeValue("1:30 PM"), "13:30");
eq("parseTime 24h", parseTimeValue("13:00"), "13:00");
eq("parseTime ISO part", parseTimeValue("2026-09-30T09:15"), "09:15");
eq("parseTime junk REJECTED", parseTimeValue("open until 6"), null);

const C = (o: Partial<SelectionCandidate>): SelectionCandidate => ({
  kind: "datetime", value: "", selected: true, tier: 4, context: "", ...o,
});

// ── POSITIVE: native inputs with values in an appointment context ──
eq("positive: native date+time inputs", decideSelection([
  C({ kind: "date", value: "2026-09-30", tier: 1, context: "tour appointment date" }),
  C({ kind: "time", value: "11:00 AM", tier: 1, context: "tour appointment time" }),
], TODAY), { date: "2026-09-30", time: "11:00" });

// ── POSITIVE: a CHECKED slot (tier 2) with an explicit datetime value ──
eq("positive: checked datetime slot", decideSelection([
  C({ kind: "datetime", value: "2026-10-02T14:30", selected: true, tier: 2, context: "select your tour time" }),
], TODAY), { date: "2026-10-02", time: "14:30" });

// ── POSITIVE: aria-selected day (tier 4) needs tour context + full value ──
eq("positive: aria-selected data-date", decideSelection([
  C({ kind: "datetime", value: "2026-09-30", selected: true, tier: 4, context: "preferred date calendar tour" }),
  C({ kind: "datetime", value: "9:15 AM", selected: true, tier: 4, context: "preferred time appointment slot selected" }),
], TODAY), { date: "2026-09-30", time: "09:15" });

// ── NEGATIVE: move-in date must NOT become the tour date ──
eq("negative: move-in date input", decideSelection([
  C({ kind: "date", value: "2026-11-01", tier: 1, context: "desired move-in date" }),
], TODAY), { date: null, time: null });

eq("negative: move-in timeline field", decideSelection([
  C({ kind: "datetime", value: "2026-11-01", tier: 4, context: "move-in timeline when do you plan to move" }),
], TODAY), { date: null, time: null });

// ── NEGATIVE: business/office hours time must NOT become the tour time ──
eq("negative: office hours time", decideSelection([
  C({ kind: "datetime", value: "9:00 AM", selected: true, tier: 6, context: "office hours mon-fri 9:00 am - 6:00 pm" }),
], TODAY), { date: null, time: null });

// ── NEGATIVE: multiple UNSELECTED available slots → nothing ──
eq("negative: unselected slots", decideSelection([
  C({ kind: "datetime", value: "8:30 AM", selected: false, tier: 4, context: "select a preferred time tour" }),
  C({ kind: "datetime", value: "11:00 AM", selected: false, tier: 4, context: "select a preferred time tour" }),
  C({ kind: "datetime", value: "1:30 PM", selected: false, tier: 4, context: "select a preferred time tour" }),
], TODAY), { date: null, time: null });

// ── NEGATIVE: weak, non-tour value equal to today (a "generated on" date) ──
eq("negative: today weak non-tour", decideSelection([
  C({ kind: "datetime", value: "2026-09-17", selected: true, tier: 6, context: "form generated on quote reference" }),
], TODAY), { date: null, time: null });

// ── PERQ case: year-less date text + no exposed time → nothing ──
eq("perq: year-less heading + no time", decideSelection([
  C({ kind: "datetime", value: "Wednesday, September 30th", selected: true, tier: 6, context: "select a preferred time tour" }),
], TODAY), { date: null, time: null });

// ── PARTIAL: reliable date only, time absent ──
eq("partial: date only", decideSelection([
  C({ kind: "date", value: "2026-09-30", tier: 1, context: "tour date" }),
], TODAY), { date: "2026-09-30", time: null });

if (failures) { console.error(`\n${failures} FAILED`); process.exit(1); }
else console.log("\nAll detection tests passed.");
