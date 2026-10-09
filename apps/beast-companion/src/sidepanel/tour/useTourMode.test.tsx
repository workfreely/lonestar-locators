// TOUR MODE CONTEXT SURVIVES THE SCHEDULING TRIP — one Schedule Tour click is enough.
//
// Mounts the REAL useTourMode hook against a fake chrome.storage.local, so these
// exercise the shipped effects (including the re-evaluation that happens when
// activeLeadId changes), not a reimplementation of the logic.
//
// THE INVARIANT UNDER TEST:
//     a stored lb-tour-mode record EXISTS  ⇔  an UNRESOLVED Tour Mode context
// cleared ONLY by: saving the tour, an explicit exit, or a replacing click.
//
// Run: npx tsx src/sidepanel/tour/useTourMode.test.tsx   (from apps/beast-companion)
import TestRenderer, { act } from "react-test-renderer";

// jsx: "react-jsx" — no React import needed. @types/node is not in this project's
// `types`, so declare the one Node global this runner uses.
declare const process: { exit(code: number): void };

let pass = 0, fail = 0;
const ok = (label: string, cond: boolean) => {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}`); }
};

// ── fake chrome.storage.local ────────────────────────────────────────────────
type Listener = (changes: Record<string, { newValue?: unknown; oldValue?: unknown }>, area: string) => void;
const KEY = "lb-tour-mode";
let store: Record<string, unknown> = {};
let listeners: Listener[] = [];
const fakeChrome = {
  storage: {
    local: {
      get: (k: string, cb: (res: Record<string, unknown>) => void) => cb({ [k]: store[k] }),
      set: (o: Record<string, unknown>) => {
        const changes: Record<string, { newValue?: unknown; oldValue?: unknown }> = {};
        for (const [k, v] of Object.entries(o)) { changes[k] = { oldValue: store[k], newValue: v }; store[k] = v; }
        listeners.forEach((l) => l(changes, "local"));
      },
      remove: (k: string) => {
        const oldValue = store[k];
        delete store[k];
        listeners.forEach((l) => l({ [k]: { oldValue, newValue: undefined } }, "local"));
      },
    },
    onChanged: {
      addListener: (l: Listener) => listeners.push(l),
      removeListener: (l: Listener) => { listeners = listeners.filter((x) => x !== l); },
    },
  },
};
(globalThis as unknown as { chrome: unknown }).chrome = fakeChrome;

// Imported AFTER the chrome shim so module-level access (if any) sees it.
const { useTourMode } = await import("./useTourMode");

/** A Schedule Tour click, as the content bridge writes it.
 *
 *  The nonce mirrors the real CRM emitter, `${Date.now()}-${Math.random()}`
 *  (DashboardClient.tsx). An earlier version of this helper hardcoded the random
 *  half, so two clicks inside the same millisecond produced an IDENTICAL nonce and
 *  consider() correctly ignored the second as "already showing this request" —
 *  which looked like a replacement bug but was purely an artifact of the fake. */
let nonceSeq = 0;
const click = (leadId: number | string, favoriteId: number, propertyName = "Prop", atMs = Date.now()) =>
  fakeChrome.storage.local.set({
    [KEY]: { leadId, favoriteId, propertyName, url: "https://example.com/tour", nonce: `${atMs}-${++nonceSeq}` },
  });

/** Mount the hook with a settable active client; returns live probes. */
function mount(initialLead: number | string | null) {
  const api: { tour: unknown; exit: () => void } = { tour: null, exit: () => {} };
  function Probe({ leadId }: { leadId: number | string | null }) {
    const { tour, exit } = useTourMode(leadId);
    api.tour = tour; api.exit = exit;
    return null;
  }
  let renderer!: TestRenderer.ReactTestRenderer;
  act(() => { renderer = TestRenderer.create(<Probe leadId={initialLead} />); });
  return {
    api,
    setLead: (leadId: number | string | null) => act(() => { renderer.update(<Probe leadId={leadId} />); }),
    unmount: () => act(() => { renderer.unmount(); }),
  };
}
const favOf = (t: unknown) => (t as { favoriteId?: unknown } | null)?.favoriteId ?? null;
const reset = () => { store = {}; listeners = []; };
const LONG_AGO = Date.now() - 45 * 60 * 1000; // 45 minutes — far beyond the old 30s cap

// ── 1. panel open → click → Tour Mode opens immediately ──────────────────────
console.log("1. panel OPEN at click time:");
reset();
{
  const m = mount(84);
  ok("no Tour Mode before any click", m.api.tour === null);
  act(() => { click(84, 62); });
  ok("clicking Schedule Tour enters Tour Mode immediately", favOf(m.api.tour) === 62);
  m.unmount();
}

// ── 2. panel CLOSED at click → minutes pass → panel opens → still enters ─────
console.log("\n2. panel CLOSED at click, opened MUCH later (the live workflow):");
reset();
{
  click(84, 62, "Altitude at Brooks", LONG_AGO);        // clicked while panel was closed
  const m = mount(84);                                   // panel opened 45 min later
  ok("a 45-minute-old request STILL enters (no age cap)", favOf(m.api.tour) === 62);
  ok("...and carries the right property", (m.api.tour as { propertyName?: string }).propertyName === "Altitude at Brooks");
  ok("...and the scheduler URL for Autofill binding", (m.api.tour as { schedulerUrl?: string }).schedulerUrl === "https://example.com/tour");
  m.unmount();
}

// ── 3. panel closes/reopens mid-scheduling → context survives ────────────────
console.log("\n3. panel closed and reopened during scheduling:");
reset();
{
  const a = mount(84);
  act(() => { click(84, 62, "Prop", LONG_AGO); });
  ok("entered on first open", favOf(a.api.tour) === 62);
  a.unmount();                                           // panel closed
  ok("record still present after close", !!store[KEY]);
  const b = mount(84);                                   // panel reopened
  ok("context survives a close/reopen cycle", favOf(b.api.tour) === 62);
  b.unmount();
}

// ── 4. wrong / not-yet-loaded client → HELD, activates when the client loads ─
console.log("\n4. active client missing or mismatched — HELD, not discarded:");
reset();
{
  const m = mount(null);                                 // panel cold, no client yet
  act(() => { click(84, 62); });
  ok("no client loaded → does NOT enter yet", m.api.tour === null);
  ok("...and the request is HELD in storage, not discarded", !!store[KEY]);
  m.setLead(99);                                         // a different client loads first
  ok("wrong client → still held, still not entered", m.api.tour === null && !!store[KEY]);
  m.setLead(84);                                         // the right client finally loads
  ok("correct client loads → pending request ACTIVATES", favOf(m.api.tour) === 62);
  m.unmount();
}

// ── 4b. a client switch HIDES but must not dismiss ───────────────────────────
console.log("\n4b. switching clients hides, never resolves:");
reset();
{
  const m = mount(84);
  act(() => { click(84, 62); });
  ok("entered for lead 84", favOf(m.api.tour) === 62);
  m.setLead(99);
  ok("switching away hides Tour Mode", m.api.tour === null);
  ok("...but the record is KEPT (not a resolution)", !!store[KEY]);
  m.setLead(84);
  ok("switching back restores it", favOf(m.api.tour) === 62);
  m.unmount();
}

// ── 5. explicit exit clears permanently ──────────────────────────────────────
console.log("\n5. explicit Exit resolves the context PERMANENTLY:");
reset();
{
  const m = mount(84);
  act(() => { click(84, 62); });
  ok("entered", favOf(m.api.tour) === 62);
  act(() => { m.api.exit(); });
  ok("exit leaves Tour Mode", m.api.tour === null);
  ok("exit REMOVES the stored record (durable dismissal)", store[KEY] === undefined);
  m.unmount();
  const b = mount(84);
  ok("reopening the panel does NOT resurrect it", b.api.tour === null);
  b.unmount();
}

// ── 6. saving the tour clears permanently (confirmTourMode → exitTourMode) ───
console.log("\n6. saving the tour resolves it permanently:");
reset();
{
  const m = mount(84);
  act(() => { click(84, 62); });
  act(() => { m.api.exit(); });   // exactly what confirmTourMode calls after queueing the verb
  ok("record cleared on save", store[KEY] === undefined);
  m.unmount();
  const b = mount(84);
  ok("a later panel open stays out of Tour Mode", b.api.tour === null);
  b.unmount();
}

// ── 7. a new click replaces the pending context ──────────────────────────────
console.log("\n7. a new Schedule Tour click REPLACES the pending context:");
reset();
{
  const m = mount(84);
  act(() => { click(84, 62, "Altitude"); });
  ok("pending context is property 62", favOf(m.api.tour) === 62);
  act(() => { click(84, 63, "Tobin"); });
  ok("clicking a different property switches to it", favOf(m.api.tour) === 63);
  ok("...and only ONE record exists", (store[KEY] as { favoriteId: number }).favoriteId === 63);
  act(() => { click(84, 63, "Tobin"); });
  ok("re-clicking the SAME property still re-enters (new nonce)", favOf(m.api.tour) === 63);
  m.unmount();
}

// ── 7b. replacement across clients, panel cold ───────────────────────────────
console.log("\n7b. replacement for a DIFFERENT client:");
reset();
{
  const m = mount(84);
  act(() => { click(84, 62); });
  ok("entered for 84/62", favOf(m.api.tour) === 62);
  act(() => { click(99, 70); });                          // CRM switched client and clicked
  ok("a request for another client does not show under 84", m.api.tour === null);
  ok("...and it replaced the stored context", (store[KEY] as { leadId: number }).leadId === 99);
  m.setLead(99);
  ok("loading that client activates the new context", favOf(m.api.tour) === 70);
  m.unmount();
}

// ── guard: a malformed record never enters ───────────────────────────────────
console.log("\nmalformed records are ignored:");
reset();
{
  const m = mount(84);
  act(() => { fakeChrome.storage.local.set({ [KEY]: { leadId: 84, nonce: "1-0" } }); }); // no favoriteId
  ok("missing favoriteId → ignored", m.api.tour === null);
  act(() => { fakeChrome.storage.local.set({ [KEY]: { leadId: 84, favoriteId: 62 } }); }); // no nonce
  ok("missing nonce → ignored", m.api.tour === null);
  m.unmount();
}

console.log(`\nuseTourMode: ${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
