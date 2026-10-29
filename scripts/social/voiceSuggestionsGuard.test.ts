// VOICE CLIPS — a suggestions payload that arrives missing a field.
//
// The suggestions fetch hands whatever JSON came back straight to setSug:
//
//     .then((r) => (r.ok ? r.json() : null))
//     .then((j) => { if (alive && j) setSug(j) })
//
// Nothing validates the shape, so the cast to Suggestions is a promise, not a fact. Three reads
// took it on trust by stopping their optional chain at `sug`:
//
//     sug?.warnings.hook     sug?.warnings.cta     sug?.recommended.hooks / .ctas
//
// With `sug` truthy and the field absent, reading off undefined threw DURING RENDER — which takes
// the whole editor down, not just this dropdown. A non-ok response is already turned into null, so
// the hazard is specifically a 200 whose body is not the shape this component expects: a client
// bundle talking to an older or newer route, or a partial payload.
//
// The expressions are pure, so they are lifted out of the component source and EVALUATED here
// against payloads that omit each field. That tests the behaviour, not the spelling — and control
// cases re-evaluate the old unguarded forms to confirm they really did throw, so this file would
// have caught the bug rather than merely describing it.
//
// Run: npx tsx scripts/social/voiceSuggestionsGuard.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")

const src = read("components/crm/social/VoiceClipsControl.tsx")

// Lifted verbatim from the component, so these go stale the moment the real expressions change.
const slotBlocksExpr = src.match(/const slotBlocks = ([\s\S]*?)\n  useEffect/)?.[1] ?? ""
const warningExpr = src.match(/const warning = (.*?) \?\? null/)?.[1] ?? ""
const recsExpr = src.match(/const recs = (.*?) \?\? \[\]/)?.[1] ?? ""
const evalSlotBlocks = (sug: unknown, slot: string) =>
  new Function("sug", "slot", `return (${slotBlocksExpr})`)(sug, slot)
const evalWarning = (sug: unknown, type: string) =>
  new Function("sug", "type", `return (${warningExpr}) ?? null`)(sug, type)
const evalRecs = (sug: unknown, type: string) =>
  new Function("sug", "type", `return (${recsExpr}) ?? []`)(sug, type)
const threw = (f: () => unknown) => { try { f(); return false } catch { return true } }
// A throw must register as a FAILED assertion, not kill the run — otherwise reintroducing the bug
// ends the suite at the first crash instead of listing everything it broke.
const THREW = Symbol("threw")
const safe = <T>(f: () => T): T => { try { return f() } catch { return THREW as unknown as T } }

const property = { name: "The Drakestone", market: "Dallas", propertyType: null, propertyTypeSource: null, startingRent: null }
const hook = { id: "h1", displayName: "Dallas hook", why: ["market match"] }
const cta = { id: "c1", displayName: "Dallas CTA", why: ["market match"] }
// The full shape, then one field removed from each copy — what a mismatched route can send.
const full = {
  property, recommended: { hooks: [hook], ctas: [cta] }, conditional: [], rejected: [],
  warnings: { hook: { level: "hard", reasons: ["market mismatch"] }, cta: null }, blocksPublish: true,
}
const noWarnings = { ...full, warnings: undefined, blocksPublish: false } as Record<string, unknown>
const noRecommended = { ...full, recommended: undefined } as Record<string, unknown>
delete noWarnings.warnings
delete noRecommended.recommended
const softHook = { ...full, warnings: { hook: { level: "soft", reasons: ["needs confirming"] }, cta: null }, blocksPublish: false }

console.log("the expressions under test were found in the component:")
ok("the slotBlocks publish gate", slotBlocksExpr.includes("sug") && slotBlocksExpr.includes("warnings"))
ok("the per-section warning", warningExpr.includes("sug") && warningExpr.includes("warnings"))
ok("the per-section recommendations", recsExpr.includes("sug") && recsExpr.includes("recommended"))

console.log("\nA PAYLOAD WITHOUT warnings — must read as 'no warning', never throw:")
ok("the hook slot's publish gate survives it", !threw(() => evalSlotBlocks(noWarnings, "hook")))
ok("…and reads as not blocking", safe(() => evalSlotBlocks(noWarnings, "hook")) === false)
ok("the cta slot's publish gate survives it", !threw(() => evalSlotBlocks(noWarnings, "cta")))
ok("…and reads as not blocking", safe(() => evalSlotBlocks(noWarnings, "cta")) === false)
ok("the hook section's warning survives it", !threw(() => evalWarning(noWarnings, "hook")))
ok("…and renders nothing", safe(() => evalWarning(noWarnings, "hook")) === null)
ok("the cta section's warning survives it", !threw(() => evalWarning(noWarnings, "cta")))
ok("…and renders nothing", safe(() => evalWarning(noWarnings, "cta")) === null)

console.log("\nA PAYLOAD WITHOUT recommended — must read as 'nothing recommended', never throw:")
ok("the hook section survives it", !threw(() => evalRecs(noRecommended, "hook")))
ok("…and recommends nothing", JSON.stringify(safe(() => evalRecs(noRecommended, "hook"))) === "[]")
ok("the cta section survives it", !threw(() => evalRecs(noRecommended, "cta")))
ok("…and recommends nothing", JSON.stringify(safe(() => evalRecs(noRecommended, "cta"))) === "[]")
ok("a payload missing BOTH fields is still safe",
  !threw(() => evalRecs({ property, conditional: [], rejected: [], blocksPublish: false }, "hook")) &&
  !threw(() => evalWarning({ property, conditional: [], rejected: [], blocksPublish: false }, "hook")))

console.log("\nthe controls — the old forms really did throw on those payloads:")
ok("`sug?.warnings.hook` throws when warnings is absent",
  threw(() => new Function("sug", "return sug?.warnings.hook")(noWarnings)))
ok("…while `sug?.warnings?.hook` does not",
  !threw(() => new Function("sug", "return sug?.warnings?.hook")(noWarnings)))
ok("`sug?.recommended.hooks` throws when recommended is absent",
  threw(() => new Function("sug", "return sug?.recommended.hooks")(noRecommended)))
ok("…while `sug?.recommended?.hooks` does not",
  !threw(() => new Function("sug", "return sug?.recommended?.hooks")(noRecommended)))

console.log("\nBEHAVIOUR IS UNCHANGED when the payload is complete:")
ok("a hard conflict still blocks publishing", evalSlotBlocks(full, "hook") === true)
ok("a soft one still does not", evalSlotBlocks(softHook, "hook") === false)
ok("…and the slot still reads its own half only", evalSlotBlocks(full, "cta") === false)
ok("the section still gets the warning object, reasons intact",
  evalWarning(full, "hook")?.reasons?.[0] === "market mismatch")
ok("an explicit null warning is still nothing to render", evalWarning(full, "cta") === null)
ok("the 'both' menu still asks blocksPublish, not the per-slot warning",
  evalSlotBlocks(full, "both") === true && evalSlotBlocks(noWarnings, "both") === false)
ok("the hook section still gets its own recommendations",
  JSON.stringify(evalRecs(full, "hook")) === JSON.stringify([hook]))
ok("…and the cta section its own", JSON.stringify(evalRecs(full, "cta")) === JSON.stringify([cta]))
ok("an empty recommendation list is still empty, not absent",
  JSON.stringify(evalRecs({ ...full, recommended: { hooks: [], ctas: [] } }, "hook")) === "[]")
ok("no suggestions at all is still safe",
  evalSlotBlocks(null, "hook") === false && evalWarning(null, "hook") === null &&
  JSON.stringify(evalRecs(null, "hook")) === "[]")

console.log("\nthe guards are declared, not just spelled:")
ok("no read of warnings stops its chain at sug", !/sug\?\.warnings\./.test(src))
ok("no read of recommended does either", !/sug\?\.recommended\./.test(src))
// The sweep: EVERY read off sug must either chain through or be a leaf. `sug?.x.y` is the bug's
// shape, whatever `x` is, so this catches the next field added without a guard.
ok("NO read off sug stops its chain early — the whole object, not just these two fields",
  !/sug\?\.[A-Za-z_$][A-Za-z0-9_$]*\./.test(src))
ok("every warnings read is optional-chained", (src.match(/sug\?\.warnings\?\./g) ?? []).length === 4)
ok("every recommended read is optional-chained", (src.match(/sug\?\.recommended\?\./g) ?? []).length === 2)
ok("the type admits warnings can be absent, so tsc demands the ?.",
  /warnings\?: \{ hook: Warning; cta: Warning \}/.test(src))
ok("…and that recommended can be too",
  /recommended\?: \{ hooks: Suggested\[\]; ctas: Suggested\[\] \}/.test(src))
ok("the leaf reads that were already safe are untouched",
  /sug\?\.blocksPublish \?\? false/.test(src) && /\(sug\?\.conditional \?\? \[\]\)/.test(src))
ok("nothing else about the payload changed", /blocksPublish: boolean/.test(src) && /conditional: Suggested\[\]/.test(src) && /rejected: Suggested\[\]/.test(src))

console.log(`\nVoice suggestions guard: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
