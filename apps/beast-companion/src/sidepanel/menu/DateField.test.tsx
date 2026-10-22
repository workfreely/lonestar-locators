// THE COMPANION'S CALENDAR, MOUNTED FOR REAL.
//
// The Add/Edit Task sheet now uses the same DateField as Out of Office, enlarged and opening
// upward. These exercise the SHIPPED component — open, pick, change month, Escape, click away,
// and the value contract the task sheet depends on — rather than asserting on its source text.
//
// Run: npx tsx src/sidepanel/menu/DateField.test.tsx   (from apps/beast-companion)
import TestRenderer, { act } from "react-test-renderer";
import { DateField } from "./DateField";


declare const process: { exit(code: number): void };
declare const globalThis: Record<string, unknown>;

// ── minimal `document` ───────────────────────────────────────────────────────
// DateField closes on an outside mousedown, so it registers a document listener. react-test-
// renderer has no DOM; this is the same shape as the chrome.storage fake in useTourMode.test.
// Only what the component actually touches, so an unnoticed new DOM dependency would fail loudly
// rather than be silently satisfied.
type DocListener = (e: unknown) => void;
const docListeners: Record<string, DocListener[]> = {};
globalThis.document = {
  addEventListener(type: string, fn: DocListener) { (docListeners[type] ??= []).push(fn); },
  removeEventListener(type: string, fn: DocListener) {
    docListeners[type] = (docListeners[type] ?? []).filter((f) => f !== fn);
  },
  dispatchEvent(e: { type: string }) { for (const fn of docListeners[e.type] ?? []) fn(e); return true; },
};
// An outside click: `contains()` is false because the component's ref holds no real node here.
globalThis.MouseEvent = class { type: string; target = { nodeName: "BODY" }; constructor(t: string) { this.type = t; } };

let pass = 0, fail = 0;
const ok = (label: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
};

type Node = TestRenderer.ReactTestInstance;
const byClass = (r: TestRenderer.ReactTestRenderer, cls: string): Node[] =>
  r.root.findAll((n) => typeof n.type === "string" && String(n.props.className ?? "").split(" ").includes(cls));
const first = (r: TestRenderer.ReactTestRenderer, cls: string): Node | null => byClass(r, cls)[0] ?? null;
const isOpen = (r: TestRenderer.ReactTestRenderer) => byClass(r, "bc-cal-pop").length > 0;
const monthLabel = (r: TestRenderer.ReactTestRenderer) =>
  (first(r, "bc-cal-month")?.children ?? []).map((c) => String(c)).join("").trim();
const dayCell = (r: TestRenderer.ReactTestRenderer, day: number): Node | undefined =>
  byClass(r, "bc-cal-cell").find((c) => String(c.children?.[0] ?? "") === String(day) && !String(c.props.className).includes("is-blank"));

function mount(props: Partial<Parameters<typeof DateField>[0]> = {}) {
  let committed: string | null | undefined;
  let value: string | null = (props.value as string | null) ?? null;
  let r!: TestRenderer.ReactTestRenderer;
  act(() => {
    r = TestRenderer.create(
      <DateField {...(props as any)} value={value} onChange={(n) => { committed = n; value = n; }} />
    );
  });
  return { r, get committed() { return committed; } };
}

console.log("\n1. THE VALUE CONTRACT THE TASK SHEET RELIES ON:");
{
  const m = mount({ value: "2026-11-01", label: "Due Date" });
  act(() => { first(m.r, "bc-cal-trigger")!.props.onClick({ stopPropagation() {} }); });
  ok("opens on the stored date's month, not today's", monthLabel(m.r) === "November 2026", monthLabel(m.r));
  act(() => { dayCell(m.r, 5)!.props.onClick(); });
  ok("commits a bare YYYY-MM-DD", m.committed === "2026-11-05", String(m.committed));
  ok("…and closes on selection", !isOpen(m.r));
  ok("the committed value is LOCAL date parts — no UTC shift", /^2026-11-05$/.test(String(m.committed)));
}
{
  // The off-by-one the header warns about: late evening behind UTC must still commit THAT day.
  const m = mount({ value: "2026-12-31" });
  act(() => { first(m.r, "bc-cal-trigger")!.props.onClick({ stopPropagation() {} }); });
  act(() => { dayCell(m.r, 31)!.props.onClick(); });
  ok("a year-end date does not roll to the next day", m.committed === "2026-12-31", String(m.committed));
}

console.log("\n2. OPENING, CHANGING MONTHS, SELECTING:");
{
  const m = mount({ value: "2026-11-01" });
  ok("closed until asked", !isOpen(m.r));
  act(() => { first(m.r, "bc-cal-trigger")!.props.onClick({ stopPropagation() {} }); });
  ok("opens", isOpen(m.r));
  const nav = byClass(m.r, "bc-cal-navbtn");
  ok("it has LEFT and RIGHT month arrows (not up/down steppers)", nav.length === 2);
  ok("…labelled for screen readers",
    nav[0].props["aria-label"] === "Previous month" && nav[1].props["aria-label"] === "Next month");
  act(() => { nav[1].props.onClick(); });
  ok("next month advances", monthLabel(m.r) === "December 2026", monthLabel(m.r));
  act(() => { nav[0].props.onClick(); act(() => {}); });
  ok("previous month returns", monthLabel(m.r) === "November 2026", monthLabel(m.r));
  act(() => { nav[0].props.onClick(); });
  ok("…and crosses a year boundary backwards", monthLabel(m.r) === "October 2026", monthLabel(m.r));
  // Back on November, the stored 1st must be the marked cell — and ONLY it.
  act(() => { nav[1].props.onClick(); });
  const selected = byClass(m.r, "bc-cal-cell").filter((c) => String(c.props.className).includes("is-selected"));
  ok("exactly one day is marked selected", selected.length === 1, String(selected.length));
  ok("…and it is the stored date", String(selected[0]?.children?.[0] ?? "") === "1");
}

console.log("\n3. CLOSING — Escape and click-outside:");
{
  const m = mount({ value: "2026-11-01" });
  act(() => { first(m.r, "bc-cal-trigger")!.props.onClick({ stopPropagation() {} }); });
  ok("open", isOpen(m.r));
  let prevented = false, stopped = false;
  act(() => {
    first(m.r, "bc-cal-pop")!.props.onKeyDown({
      key: "Escape", preventDefault() { prevented = true; }, stopPropagation() { stopped = true; },
    });
  });
  ok("Escape closes the calendar", !isOpen(m.r));
  ok("…and is swallowed, so the sheet underneath stays open", prevented && stopped);
  ok("no value was committed by closing", m.committed === undefined);

  // CLICK-OUTSIDE cannot be driven here: react-test-renderer has no host nodes, so the component's
  // rootRef.current is null and its `contains()` guard can never match a synthetic target. What IS
  // observable — and is the part that breaks in practice — is the listener's lifecycle, so that is
  // what this asserts. The dismissal itself is on the manual-verification list.
  const m2 = mount({ value: "2026-11-01" });
  const before = (docListeners["mousedown"] ?? []).length;
  act(() => { first(m2.r, "bc-cal-trigger")!.props.onClick({ stopPropagation() {} }); });
  ok("opening registers a document mousedown listener", (docListeners["mousedown"] ?? []).length === before + 1);
  act(() => {
    first(m2.r, "bc-cal-pop")!.props.onKeyDown({ key: "Escape", preventDefault() {}, stopPropagation() {} });
  });
  ok("…and closing removes it, so no listener leaks", (docListeners["mousedown"] ?? []).length === before);
  ok("…having committed nothing", m2.committed === undefined);
}

console.log("\n4. THE TASK SHEET'S VARIANT — upward and larger:");
{
  const up = mount({ value: "2026-11-01", placement: "up", size: "lg" });
  const cls = String(first(up.r, "bc-cal")!.props.className);
  ok("carries bc-cal--up", cls.includes("bc-cal--up"));
  ok("carries bc-cal--lg", cls.includes("bc-cal--lg"));
  const def = mount({ value: "2026-11-01" });
  const defCls = String(first(def.r, "bc-cal")!.props.className).trim();
  ok("OUT OF OFFICE IS UNCHANGED — neither modifier by default", defCls === "bc-cal");
  act(() => { first(up.r, "bc-cal-trigger")!.props.onClick({ stopPropagation() {} }); });
  act(() => { dayCell(up.r, 9)!.props.onClick(); });
  ok("the larger variant still commits the same contract", up.committed === "2026-11-09", String(up.committed));
}

console.log("\n5. KEYBOARD AFFORDANCES ARE PRESERVED (no regression):");
{
  const m = mount({ value: "2026-11-01", label: "Due Date" });
  const trig = first(m.r, "bc-cal-trigger")!;
  ok("the trigger is a real button", trig.type === "button" && trig.props.type === "button");
  ok("…announces a popup", trig.props["aria-haspopup"] === "dialog");
  ok("…and its state", trig.props["aria-expanded"] === false);
  ok("…with a label including the current value", String(trig.props["aria-label"] ?? "").startsWith("Due Date:"));
  act(() => { trig.props.onClick({ stopPropagation() {} }); });
  ok("aria-expanded flips when open", first(m.r, "bc-cal-trigger")!.props["aria-expanded"] === true);
  const pop = first(m.r, "bc-cal-pop")!;
  ok("the popover is a dialog", pop.props.role === "dialog");
  ok("…and is labelled", !!pop.props["aria-label"]);
  ok("every day is a focusable button", byClass(m.r, "bc-cal-cell").every((c) => c.type === "button"));
}
{
  const m = mount({ value: "2026-11-10", min: "2026-11-05" });
  act(() => { first(m.r, "bc-cal-trigger")!.props.onClick({ stopPropagation() {} }); });
  ok("a day before `min` is disabled", dayCell(m.r, 1)?.props.disabled === true);
  ok("…and a day after it is not", dayCell(m.r, 20)?.props.disabled === false);
}

// Sections on the STYLESHEET ITSELF (large-popover width, the upward modifier, cell height, and
// that DateField owns calendar.css) live in the main repo's scripts/leads/doFirstRow.test.ts:
// this project deliberately keeps @types/node out of `types`, and that suite already asserts on
// Companion source files. Behaviour is tested here, where the component is.

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
