// PROPERTY RESEARCH PANEL — the +4px around the three section labels, and the gaps that must not
// move with them.
//
// Run: npx tsx scripts/social/researchPanelSpacing.test.ts   (pure — reads the component source)
//
// Spacing polish is the easiest kind of change to over-apply: a bigger gap on the panel would have
// produced the same visual result for the three labels AND quietly loosened everything else,
// including the one gap that was explicitly out of scope. These assertions pin both halves —
// what gained air, and what kept exactly the value it had.

import { readFileSync } from "node:fs"
import { execSync } from "node:child_process"

let pass = 0, fail = 0
const ok = (label: string, cond: boolean) => {
  if (cond) { pass++; console.log(`  ✓ ${label}`) } else { fail++; console.log(`  ✗ ${label}`) }
}
// Comments here explain the spacing by naming the very classes under test, so absence assertions
// run on source with COMMENTS stripped. Block comments are stripped only where one opens at the
// start of a line — a /* inside an attribute (accept="video/*") must never open one.
const codeOnly = (src: string) =>
  src.replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
     .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, " ")
     .replace(/^\s*\/\/.*$/gm, " ")

const src = readFileSync("components/crm/social/PropertyResearch.tsx", "utf8")
const code = codeOnly(src)
// CANARY: if stripping ate the code under test, every absence assertion below is vacuous.
if (!/const inputCls =/.test(code) || !/\+ More/.test(code)) {
  console.log("  ✗ FATAL — codeOnly() removed code under test")
  process.exit(1)
}

console.log("\nthe three section labels gained air (+4px each)")
ok("THIS VIDEO sits 8px above its first input row, not 4",
  /This Video<\/div>\s*<div className="mt-2 grid grid-cols-2 md:grid-cols-3/.test(code))
ok("PROPERTY STARTING PRICES is separated from the preceding fields",
  /<div className="mt-1">\s*<div className=\{tiny\}>Property Starting Prices/.test(code))
ok("PROPERTY STARTING PRICES sits 8px above its pricing inputs, not 4",
  /Property Starting Prices<\/div>\s*<div className="mt-2 grid grid-cols-2 sm:grid-cols-4/.test(code))
ok("FEATURES OBSERVED has space ABOVE its label",
  /<div className="mt-1">\s*<div className=\{tiny\}>Features Observed/.test(code))
ok("FEATURES OBSERVED has 8px BELOW its label, before the amenity input",
  /Features Observed<\/div>\s*<div className="mt-2">/.test(code))

console.log("\nthe gaps that were out of scope are byte-identical")
// THE ONE THE OPERATOR NAMED. The space beneath "+ More" is the panel's gap-3 falling through to
// the Observations block, so it moves if EITHER the panel gap changes or that block gains a top
// margin. Both are asserted.
ok('the "+ More" button still carries mt-1', /className="mt-1 text-\[11px\] font-semibold/.test(code))
ok("the panel's own gap-3 between sections is unchanged",
  /rounded-lg border border-\[var\(--crm-border\)\] bg-\[var\(--crm-inset\)\] p-3 flex flex-col gap-3/.test(code))
ok("the Observations block gained NO top margin — that edge IS the gap beneath + More",
  /\{\/\* ── OBSERVATIONS[^}]*\*\/\}\s*<div className="flex flex-col gap-1\.5">/.test(src))
ok("the expanded More grid still carries mt-1.5",
  /<div className="mt-1\.5 grid grid-cols-2 sm:grid-cols-4 gap-1\.5">/.test(code))
ok("THIS VIDEO's two input rows are still 6px apart",
  /<div className="mt-1\.5 grid grid-cols-2 md:grid-cols-3 gap-1\.5">/.test(code))
ok("every input grid still uses gap-1.5", (code.match(/grid-cols-2 (?:sm|md):grid-cols-\d gap-1\.5/g) ?? []).length === 4)

console.log("\nnothing but spacing changed")
ok("input heights and widths are untouched",
  /"w-full text-\[12\.5px\] rounded-lg border border-\[var\(--crm-border\)\] bg-\[var\(--crm-card\)\] text-\[var\(--crm-text-primary\)\] px-2 py-1"/.test(code))
ok("the label style is untouched",
  /const tiny = "text-\[10px\] uppercase tracking-wide text-\[var\(--crm-text-muted\)\]"/.test(code))
ok("section order is still This Video -> Property Starting Prices -> Features Observed",
  code.indexOf("This Video") < code.indexOf("Property Starting Prices") &&
  code.indexOf("Property Starting Prices") < code.indexOf("Features Observed"))
// lastIndexOf, not indexOf: the component is also IMPORTED at the top of the file, and the import
// naturally sorts before every section — the first assertion written here compared against that.
ok("the panel still ends with the read-only shared record",
  code.lastIndexOf("VerifiedPropertyDetails") > code.lastIndexOf("Features Observed"))
// No behaviour, data or copy change: the save path and its payload keys are as they were.
ok("the save handler is unchanged", /const save = useCallback/.test(code) || /async function save/.test(code) || /const save =/.test(code))
// Compared against the COMMITTED file rather than a number typed here. A hard-coded count is a
// guess that has to be right twice; this one cannot drift, and it states the real claim — this
// change added no state — rather than a fact about today's source.
const committed = codeOnly(
  execSync("git show HEAD:components/crm/social/PropertyResearch.tsx", { encoding: "utf8" }))
const countOf = (src: string, re: RegExp) => (src.match(re) ?? []).length
ok("no state was added or removed", countOf(code, /useState/g) === countOf(committed, /useState/g))
ok("no handler was added or removed", countOf(code, /useCallback/g) === countOf(committed, /useCallback/g))
ok("no input or select was added or removed",
  countOf(code, /<input\b/g) === countOf(committed, /<input\b/g) &&
  countOf(code, /<select\b/g) === countOf(committed, /<select\b/g))
// THE DECISIVE ONE: strip every margin/gap utility from both versions. What remains must be
// IDENTICAL — proof that spacing is the only thing this change touched.
// Blank lines are not evidence: codeOnly() turns each stripped comment line into a space, so the
// explanatory comments added with this change show up as a dozen whitespace-only lines. Compare
// the SUBSTANTIVE lines — that is the claim being made.
const substantive = (src: string) =>
  src.replace(/\bm[tbxyrl]?-[0-9.]+\s*/g, "").replace(/\bgap-[0-9.]+\s*/g, "")
     // Two of these sections were bare <div>s that gained ONLY a margin, so stripping it leaves an
     // empty className where the original had no attribute at all. Normalise that away, or the
     // comparison reports a difference that is precisely the spacing it was told to ignore.
     .replace(/\s*className=""/g, "")
     .split("\n").map((l) => l.trim()).filter(Boolean)
const now = substantive(code), was = substantive(committed)
const differing = now.filter((l, i) => l !== was[i])
ok(`with every margin and gap removed, the two versions are identical${differing.length ? ` — differs at: ${differing[0].slice(0, 70)}` : ""}`,
  now.length === was.length && differing.length === 0)
ok("the labels' text is unchanged",
  />This Video</.test(code) && />Property Starting Prices</.test(code) && />Features Observed</.test(code))

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
