// NEW-LEAD TEXT 2 — the question follows what the renter already told us.
//
// Run: npx tsx scripts/tests/newLeadText2Areas.test.ts   (pure)
//
// ONE area named → ask for a zip code; they have already said which side of town.
// TWO OR MORE    → unchanged.
// NONE           → unchanged, which is the path every pre-existing lead takes.
import { readFileSync } from "node:fs"
import { renderNewLeadText2, countDesiredAreas, NEW_LEAD_TEXT2 } from "@/lib/followup/copy"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}${d ? `\n      ${d}` : ""}`) } }
const SIDE = "Are you trying to stay near a specific address or side of town?"
const ZIP = "Are you trying to stay near a specific address or zip code?"
const lead = (n: string | null, s: string | null = null) => ({ neighborhoods: n, submarkets: s })

console.log("\nthe three cases")
ok("exactly one area → zip code", renderNewLeadText2(lead("Alamo Heights")) === ZIP, renderNewLeadText2(lead("Alamo Heights")))
ok("two areas → side of town (unchanged)", renderNewLeadText2(lead("Alamo Heights, Stone Oak")) === SIDE)
ok("three areas → side of town", renderNewLeadText2(lead("Alamo Heights, Stone Oak, Downtown")) === SIDE)
ok("no areas → unchanged default", renderNewLeadText2(lead(null, null)) === SIDE)
ok("blank strings count as none", renderNewLeadText2(lead("", "   ")) === SIDE)
ok("the default IS the shipped template", NEW_LEAD_TEXT2 === SIDE)

console.log("\ncounting is honest about what the renter actually named")
ok("one in each field, SAME area, is one", countDesiredAreas(lead("Alamo Heights", "Alamo Heights")) === 1)
ok("…case and spacing do not make it two", countDesiredAreas(lead("alamo heights", "  Alamo Heights  ")) === 1)
ok("one in each field, DIFFERENT areas, is two", countDesiredAreas(lead("Alamo Heights", "Stone Oak")) === 2)
ok("…and that two asks about the side of town", renderNewLeadText2(lead("Alamo Heights", "Stone Oak")) === SIDE)
ok("a submarket alone still counts", countDesiredAreas(lead(null, "Boerne")) === 1 && renderNewLeadText2(lead(null, "Boerne")) === ZIP)
ok("trailing commas and empties are dropped", countDesiredAreas(lead("Alamo Heights, , ,")) === 1)
ok("duplicates inside one field collapse", countDesiredAreas(lead("Stone Oak, Stone Oak")) === 1)
ok("nothing named is zero", countDesiredAreas(lead(null)) === 0)

console.log("\nonly the final noun moves")
ok("the two messages differ in exactly one word",
  ZIP.replace("zip code", "X") === SIDE.replace("side of town", "X"))
ok("both still open identically", ZIP.startsWith("Are you trying to stay near a specific address or"))

console.log("\nnothing else in the sequence changed")
const seq = readFileSync("lib/followup/sequences.ts", "utf8")
const cad = readFileSync("lib/followup/cadence.ts", "utf8")
ok("t2 calls the renderer", /case "t2":[\s\S]{0,200}return C\.renderNewLeadText2\(lead\)/.test(seq))
ok("t1 is untouched", /return lead\.oooReleasedAt \? C\.renderOooRestartText1\(lead\) : C\.renderNewLeadText1\(lead\)/.test(seq))
ok("the t1 delay is untouched", /NEW_LEAD_TEXT1_DELAY_MS = 5 \* 60 \* 1000/.test(cad))
ok("the t1→t2 hand-off is untouched", /NEW_LEAD_TEXT2_DELAY_MS = DOUBLE_TEXT_MIN_MS/.test(cad))
ok("both steps keep the consent_only gate", /\{ key: "t1", gate: "consent_only"[\s\S]{0,160}\{ key: "t2", gate: "consent_only"/.test(seq))
ok("the renderer writes nothing — it only reads two fields",
  !/supabase|update\(|insert\(|from\(/.test(readFileSync("lib/followup/copy.ts", "utf8").slice(
    readFileSync("lib/followup/copy.ts", "utf8").indexOf("export function countDesiredAreas"),
    readFileSync("lib/followup/copy.ts", "utf8").indexOf("export function renderOooRestartText1"))))

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
