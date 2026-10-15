// PROPERTY IDENTITY — the guard against a research record pointing at a building that isn't there.
//
// ── THE INCIDENT ────────────────────────────────────────────────────────────────────────────
// 49 research records were written with place_ids whose first 22 characters were correct and
// whose last 5 were invented, read from a listing script that truncated ids for display. EVERY
// ONE WAS WELL-FORMED: 27 characters, ChIJ-prefixed, URL-safe. Shape validation would have passed
// all 49. Only existence catches them, and only existence scoped to the owner.
//
// The fixtures below use the REAL before/after pair from that incident, so the test is anchored to
// what actually happened rather than to a plausible-looking invention.
//
// Run: npx tsx scripts/social/placeIdentity.test.ts

import { readFileSync } from "node:fs"
import path from "node:path"
import { checkPlaceIdShape, resolvePlaceId, resolveByPropertyName } from "@/lib/social/placeIdentity"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")

// The real pair from the incident: Watterscape Urban Residential.
const REAL = "ChIJP0xW1vMXTIYRurnpxc7mCf4"
const FABRICATED = "ChIJP0xW1vMXTIYRurnpxc5HJFI"   // same first 22, invented tail
const TRUNCATED = "ChIJP0xW1vMXTIYRurnpxc"          // what the listing script actually printed
const OTHER_OWNER_ID = "ChIJYXqdHM-vQIYRI1dz28H2snM"
const OWNER = "c567c077-d3f4-4532-8807-a54795f753f5"
const STRANGER = "00000000-0000-4000-8000-00000000beef"

const mine = new Set([REAL, "ChIJHVPjCHuZToYRwuYmw-8Nisw"])
const all = new Set([...mine, OTHER_OWNER_ID])
const res = (over: Partial<Parameters<typeof resolvePlaceId>[0]> = {}) =>
  resolvePlaceId({ ownerUserId: OWNER, placeId: REAL, ownedPlaceIds: mine, allPlaceIds: all, ...over })

console.log("\nthe incident itself:")
ok("the FABRICATED id is well-formed — shape alone would have let it through",
  checkPlaceIdShape(FABRICATED).ok === true)
ok("...and it is REFUSED anyway, because it exists nowhere", res({ placeId: FABRICATED }).ok === false)
const fab = res({ placeId: FABRICATED })
ok("the refusal names it as unknown, not malformed", !fab.ok && fab.reason === "unknown_place_id")
ok("the near miss is DIAGNOSED by its shared 22-character prefix", !fab.ok && fab.nearMiss === REAL)
ok("the message says the tail looks fabricated", !fab.ok && /FABRICATED or completed tail/.test(fab.message))
ok("the correct id is NOT substituted — the result stays a failure", !fab.ok)
ok("...and the module says so in as many words", /NEVER auto-corrected/.test(read("lib/social/placeIdentity.ts")))

console.log("\ntruncation is named, never completed:")
const tr = checkPlaceIdShape(TRUNCATED)
ok("a 22-character ChIJ id is identified as TRUNCATED", !tr.ok && tr.reason === "truncated")
ok("the message gives the expected length and forbids completing it",
  !tr.ok && /expected 27/.test(tr.message) && /Never complete a partial id/.test(tr.message))
ok("a truncated id is refused by the resolver too", res({ placeId: TRUNCATED }).ok === false)
ok("no prefix match is attempted for a truncated id — it is not silently upgraded to the real one",
  (() => { const r = res({ placeId: TRUNCATED }); return !r.ok && !("placeId" in r) })())

console.log("\nmalformed input:")
for (const [label, v, reason] of [
  ["null", null, "not_a_string"], ["a number", 12345, "not_a_string"], ["undefined", undefined, "not_a_string"],
  ["an empty string", "", "missing_place_id"],
  ["an id with a trailing space", `${REAL} `, "whitespace"],
  ["an id with an inner space", "ChIJ P0xW1vMXTIYRurnpxc7mCf4", "whitespace"],
  ["an id with punctuation", "ChIJP0xW1vMX!IYRurnpxc7mCf4", "bad_charset"],
] as const) {
  const r = checkPlaceIdShape(v)
  ok(`${label} is refused as ${reason}`, !r.ok && r.reason === reason)
}

console.log("\nowner scope is part of identity:")
ok("the owner's own id resolves", res().ok === true)
const wrong = resolvePlaceId({ ownerUserId: STRANGER, placeId: REAL, ownedPlaceIds: new Set(), allPlaceIds: all })
ok("another account's id is REFUSED", wrong.ok === false)
ok("...and is named wrong_owner, not unknown — a different problem deserves a different message",
  !wrong.ok && wrong.reason === "wrong_owner")
ok("an id belonging to no one is still unknown, not wrong_owner",
  (() => { const r = resolvePlaceId({ ownerUserId: OWNER, placeId: "ChIJzzzzzzzzzzzzzzzzzzzzzzz", ownedPlaceIds: mine, allPlaceIds: all }); return !r.ok && r.reason === "unknown_place_id" })())
ok("a missing owner is refused before the id is even looked at",
  (() => { const r = res({ ownerUserId: "" }); return !r.ok && r.reason === "missing_owner" })())
ok("the refusal explains that identity is the PAIR", (() => { const r = res({ ownerUserId: null as never }); return !r.ok && /the PAIR/.test(r.message) })())

console.log("\nname resolution refuses to guess:")
const names = new Map<string, Set<string>>([
  ["Watterscape Urban Residential", new Set([REAL])],
  ["Elmira Flats", new Set(["ChIJaaaaaaaaaaaaaaaaaaaaaaa", "ChIJbbbbbbbbbbbbbbbbbbbbbbb"])],
])
ok("an unambiguous name resolves", (() => { const r = resolveByPropertyName("Watterscape Urban Residential", names); return r.ok && r.placeId === REAL })())
ok("a name matching TWO ids is refused as ambiguous rather than picking the first",
  (() => { const r = resolveByPropertyName("Elmira Flats", names); return !r.ok && r.reason === "ambiguous_name" })())
ok("an unknown name is refused", (() => { const r = resolveByPropertyName("Nowhere Towers", names); return !r.ok && r.reason === "no_match_for_name" })())

console.log("\nthe gate is wired into the ONLY save path:")
const sr = read("scripts/social/saveResearch.ts")
const code = sr.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")
ok("saveResearch imports the resolver", /import \{ resolvePlaceId \} from "@\/lib\/social\/placeIdentity"/.test(code))
ok("it validates BEFORE any insert or update",
  code.indexOf("resolvePlaceId({") < code.indexOf(".insert(") && code.indexOf("resolvePlaceId({") < code.indexOf(".update("))
ok("a failed identity THROWS rather than warning", /if \(!identity\.ok\) \{[\s\S]{0,120}throw new Error/.test(code))
ok("the owned set is read FRESH from the table, not cached", /async function ownedPlaceIds/.test(code) && /\.from\("social_content"\)\.select\("place_id, owner_user_id"\)/.test(code))
ok("the check is owner-scoped", /row\.owner_user_id === ownerUserId/.test(code))
ok("both owned and all are passed, so wrong_owner can be told from unknown",
  /ownedPlaceIds: owned\.mine/.test(code) && /allPlaceIds: owned\.all/.test(code))
ok("saveResearch still never deletes a record", !/\.delete\(/.test(code))

console.log("\nidentity changes are now history:")
const mig = read("supabase/migrations/20261022000000_research_identity_revisions.sql")
const migCode = mig.replace(/^--.*$/gm, "")
ok("place_id is the FIRST watched column on the research trigger", /social_capture_revision\(\s*'place_id',/.test(migCode))
ok("the existing content columns are all still watched",
  ["property_name", "stable", "pricing", "sources", "unresolved"].every((c) => new RegExp(`'${c}'`).test(migCode)))
// Check for actual DML and DDL, not the word "update" — which legitimately appears in the
// trigger's own event clause, "before update on public.social_property_research".
ok("the migration runs NO data modification and alters no table",
  !/\bupdate\s+\S+\s+set\b/i.test(migCode) && !/\balter\s+table\b/i.test(migCode) &&
  !/\binsert\s+into\b/i.test(migCode) && !/\bdelete\s+from\b/i.test(migCode))
ok("...and touches only the trigger, nothing else",
  /^\s*(drop trigger|create trigger|before update on|for each row execute function|'[a-z_]+',?\)?;?)/m.test(migCode) &&
  !/create (table|index|policy|function)/i.test(migCode))
ok("it explains that old and new are both recoverable", /previous\.place_id/.test(mig) && /row_id/.test(mig))

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
