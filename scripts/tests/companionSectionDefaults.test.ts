/**
 * BEAST COMPANION — Search Criteria, Credit Screening and Client History open EXPANDED.
 *
 * They used to pass `defaultOpen={false}`, so every lead opened with the renter's own
 * answers hidden behind three clicks. The CRM's own Credit Screening card has always been
 * `defaultOpen={true}` (components/crm/LeadPanel.tsx), so the extension was the odd one out.
 *
 * FOUR THINGS HAVE TO HOLD AT ONCE, and this guards each:
 *   1. the three sections default to open;
 *   2. they are still collapsible by hand (nothing was pinned open);
 *   3. each keeps its per-lead `key`, which is what makes the NEXT lead open expanded too —
 *      the key remounts the section, so useState(defaultOpen) runs again. Without it a
 *      section the agent collapsed on lead A would still be collapsed on lead B;
 *   4. Client Notes and Invoice Details are UNCHANGED, still collapsed.
 *
 * The extension's SectionCard is deliberately uncontrolled — no storageKey, no persistence
 * (unlike the CRM's). That is what keeps requirement 3 from defeating requirement 1, so the
 * absence of persistence is asserted rather than assumed.
 *
 * Run: npx tsx scripts/tests/companionSectionDefaults.test.ts   (pure — reads source)
 */
import { readFileSync } from "node:fs"

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

/** Comments quote the old `defaultOpen={false}`, so assertions must run against code. */
const strip = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n")

const P = {
  view: "apps/beast-companion/src/sidepanel/lead/LeadPanelView.tsx",
  prim: "apps/beast-companion/src/sidepanel/lead/primitives.tsx",
  crm: "components/crm/LeadPanel.tsx",
}
const raw = Object.fromEntries(Object.entries(P).map(([k, p]) => [k, readFileSync(p, "utf8")])) as Record<
  keyof typeof P,
  string
>
const src = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, strip(v)])) as Record<keyof typeof P, string>

console.log("\nBEAST COMPANION — SECTION OPEN-BY-DEFAULT\n")

// ── 1. The accordion, as behaviour ────────────────────────────────────────────────────────────
console.log("the accordion (ported from primitives.tsx)")

/** Port of SectionCard's open state: uncontrolled useState(defaultOpen) + a click toggle. */
function mountSection(defaultOpen = true, collapsible = true) {
  let open = defaultOpen
  return {
    get open() {
      return open
    },
    click() {
      if (collapsible) open = !open
    },
  }
}

ok("a section with no defaultOpen mounts OPEN (the primitive's default)", mountSection().open === true)
ok("defaultOpen=false mounts closed — the behaviour the other sections keep", mountSection(false).open === false)
const s1 = mountSection(true)
s1.click()
ok("an expanded section can still be collapsed by hand", s1.open === false)
s1.click()
ok("…and expanded again", s1.open === true)
ok(
  "opening ANOTHER lead remounts the section, so it is expanded again regardless of the last lead",
  (() => {
    const a = mountSection(true)
    a.click() // agent collapses it on lead A
    const b = mountSection(true) // per-lead key -> fresh mount for lead B
    return a.open === false && b.open === true
  })(),
)

// ── 2. The primitive still defaults to open and holds no memory ────────────────────────────────
console.log("\nthe SectionCard primitive")
ok("defaultOpen's own default is true", /defaultOpen = true/.test(src.prim))
ok("open state is uncontrolled useState(defaultOpen)", /useState\(defaultOpen\)/.test(src.prim))
ok("the head toggles when collapsible", /onClick=\{\(\) => collapsible && setOpen\(\(o\) => !o\)\}/.test(src.prim))
ok(
  "NO persistence in the extension primitive — nothing can remember a collapsed section across leads",
  !/storageKey/.test(src.prim) && !/localStorage/.test(src.prim) && !/sessionStorage/.test(src.prim),
)
ok("the openSignal force-open path is untouched", /openSignal === lastSignal\.current/.test(src.prim))

// ── 3. The three sections open expanded ───────────────────────────────────────────────────────
console.log("\nthe three sections")

/** The props of one JSX element, by its title, from the panel source. */
function propsOf(title: string): string {
  const i = src.view.indexOf(`title="${title}"`)
  if (i < 0) return ""
  const start = src.view.lastIndexOf("<", i)
  const end = src.view.indexOf(">", i)
  // a FieldSection's props run past the first ">" inside rows={[…]}, so take the whole element
  const close = src.view.indexOf("/>", i)
  return src.view.slice(start, close > 0 && close < end + 4000 ? close : end)
}

for (const title of ["Search Criteria", "Credit Screening"]) {
  const p = propsOf(title)
  ok(`${title} is present`, p.length > 0)
  ok(`${title} passes defaultOpen (expanded)`, /defaultOpen(?!=)/.test(p), p.slice(0, 160))
  ok(`${title} no longer passes defaultOpen={false}`, !/defaultOpen=\{false\}/.test(p))
  ok(`${title} is keyed on the lead, so the next lead opens expanded`, /key=\{`[a-z-]+\$\{lead\.id\}`\}/.test(p))
  ok(`${title} does not disable collapsing`, !/collapsible=\{false\}/.test(p))
}

ok(
  "Client History opens expanded",
  /<SectionCard key=\{`client-history-\$\{lead\.id\}`\} title="Client History" defaultOpen>/.test(src.view),
)

// ── 4. Nothing else moved ─────────────────────────────────────────────────────────────────────
console.log("\nevery other section is unchanged")
ok(
  "Client Notes is still collapsed by default",
  /<SectionCard key=\{`client-notes-\$\{lead\.id\}`\} title="Client Notes" defaultOpen=\{false\}>/.test(src.view),
)
ok(
  "Invoice Details is still collapsed by default",
  /title="Invoice Details"[\s\S]{0,80}?defaultOpen=\{false\}/.test(src.view),
)
ok("exactly two sections remain collapsed by default", (src.view.match(/defaultOpen=\{false\}/g) ?? []).length === 2)
ok(
  "the five Credit Screening rows are untouched (no data or layout change rode along)",
  ["Credit Score", "Credit History", "Broken Lease", "Eviction", "Criminal Background"].every((l) =>
    src.view.includes(`label: "${l}"`),
  ),
)
ok(
  "the balance fix from the previous change is still in place",
  /historyDetail\(cs\.brokenLeaseAge, cs\.brokenLeaseAmount\)/.test(src.view) &&
    /historyDetail\(cs\.evictionAge, cs\.evictionBalance\)/.test(src.view),
)

// ── 5. Parity with the CRM ────────────────────────────────────────────────────────────────────
console.log("\nparity with the CRM card")
ok("the CRM's Credit Screening card is open by default too", /title="Credit Screening"[^>]*defaultOpen=\{true\}/.test(src.crm))

console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
