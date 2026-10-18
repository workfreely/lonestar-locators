// Instagram authorization — WHAT WE RECORD AS GRANTED, and what we refuse to record.
//
// This file exists because of a real incident: re-authorizing for comment access returned to the
// Accounts page still saying "Permission needed", and the connection's updated_at had not moved —
// the callback wrote nothing. Two defects were found behind it, and both are asserted here.
//
//   1. PARSING. `permissions` was typed string[] and read with .map(). Meta's current docs show a
//      COMMA-SEPARATED STRING, and the token response wrapped in a `data` array. Either shape
//      threw or produced an undefined token inside the callback, which the catch turned into a
//      generic failure with nothing written.
//   2. ASSUMING. When nothing was reported, the code stored the REQUESTED scopes — an assumed
//      grant. That would have recorded comment access on an authorization where the switch was
//      left off, and every comment call would then have failed with no record of why.
//
// The second is a DELIBERATE BEHAVIOUR CHANGE, so the old expectation is inverted here on purpose.
// Run: npx tsx scripts/social/instagramScopeGrant.test.ts
import {
  parsePermissions, resolveGrantedScopes, unwrapShortToken, INSTAGRAM_ADMIN_SCOPES, INSTAGRAM_SCOPES,
} from "@/lib/social/instagram"
import { readFileSync } from "node:fs"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}${d ? ` — ${d}` : ""}`) }
}
const BASIC = "instagram_business_basic"
const PUBLISH = "instagram_business_content_publish"
const COMMENTS = "instagram_business_manage_comments"
const REQ = INSTAGRAM_ADMIN_SCOPES as readonly string[]

console.log("1. PARSING `permissions` — every documented and malformed shape:")
{
  ok("ABSENT ⇒ null (not an empty array — \"told us nothing\" ≠ \"granted nothing\")",
    parsePermissions(undefined) === null && parsePermissions(null) === null)
  ok("ARRAY of scopes ⇒ those scopes",
    JSON.stringify(parsePermissions([BASIC, PUBLISH, COMMENTS])) === JSON.stringify([BASIC, PUBLISH, COMMENTS]))
  ok("COMMA-SEPARATED STRING ⇒ those scopes (the shape that used to throw)",
    JSON.stringify(parsePermissions(`${BASIC},${PUBLISH},${COMMENTS}`)) === JSON.stringify([BASIC, PUBLISH, COMMENTS]))
  ok("…with spaces after the commas", 
    JSON.stringify(parsePermissions(`${BASIC}, ${PUBLISH}`)) === JSON.stringify([BASIC, PUBLISH]))
  ok("a single scope string ⇒ one scope", JSON.stringify(parsePermissions(BASIC)) === JSON.stringify([BASIC]))
  ok("EMPTY array ⇒ null", parsePermissions([]) === null)
  ok("EMPTY string ⇒ null", parsePermissions("") === null && parsePermissions("   ") === null)
  ok("a string of only commas ⇒ null", parsePermissions(",,,") === null)
  // MALFORMED. None of these may throw — a throw inside the callback is the original bug.
  for (const junk of [42, true, {}, { a: 1 }, [1, 2, 3], [null], [{}], Symbol("x"), () => {}]) {
    try {
      const out = parsePermissions(junk)
      if (out !== null) { fail++; console.log(`  ✗ malformed input produced scopes: ${String(junk)}`) }
    } catch (e) { fail++; console.log(`  ✗ malformed input THREW: ${String(junk)} — ${(e as Error).message}`) }
  }
  ok("MALFORMED input never throws, and never yields scopes", true)
  ok("array entries are trimmed", parsePermissions([` ${BASIC} `])?.[0] === BASIC)
  ok("non-string array entries are dropped, keeping the valid ones",
    JSON.stringify(parsePermissions([BASIC, 7, null, PUBLISH])) === JSON.stringify([BASIC, PUBLISH]))
}

console.log("\n2. THE TOKEN RESPONSE ENVELOPE — flat and data[]:")
{
  const flat = { access_token: "TOKEN", user_id: 123, permissions: [BASIC] }
  ok("FLAT object (what arrived in Sep 2026) parses", unwrapShortToken(flat).access_token === "TOKEN")
  ok("…keeping user_id", unwrapShortToken(flat).user_id === 123)
  ok("…and permissions", JSON.stringify(unwrapShortToken(flat).permissions) === JSON.stringify([BASIC]))

  const wrapped = { data: [{ access_token: "TOKEN2", user_id: "456", permissions: `${BASIC},${PUBLISH}` }] }
  ok("DATA-ARRAY envelope (what the docs now show) parses", unwrapShortToken(wrapped).access_token === "TOKEN2")
  ok("…keeping user_id", unwrapShortToken(wrapped).user_id === "456")
  ok("…and the comma-separated permissions survive to the resolver",
    JSON.stringify(parsePermissions(unwrapShortToken(wrapped).permissions)) === JSON.stringify([BASIC, PUBLISH]))

  // THE ORIGINAL SILENT FAILURE: a wrapped body read flat left access_token undefined, so the next
  // call was made with "undefined" and failed three steps from the cause.
  const throws = (label: string, fn: () => unknown) => {
    try { fn(); fail++; console.log(`  ✗ ${label} — did not throw`) }
    catch { pass++; console.log(`  ✓ ${label}`) }
  }
  throws("a body with NO access_token is refused immediately, not passed on", () => unwrapShortToken({ user_id: 1 }))
  throws("…including inside a data[] envelope", () => unwrapShortToken({ data: [{ user_id: 1 }] }))
  throws("an empty access_token is refused", () => unwrapShortToken({ access_token: "   " }))
  throws("an unreadable body is refused", () => unwrapShortToken("nope"))
  throws("an empty data array is refused", () => unwrapShortToken({ data: [] }))
  ok("a token is trimmed", unwrapShortToken({ access_token: " T ", user_id: 1 }).access_token === "T")
}

console.log("\n3. RULE 1 — NEVER substitute the request for the grant:")
{
  // THE INVERTED EXPECTATION. This used to return all three requested scopes.
  const r = resolveGrantedScopes({ requested: REQ, reported: undefined, existing: [] })
  ok("nothing reported + NO existing connection ⇒ REFUSE (fail closed)", r.ok === false)
  ok("…with reason unverified_grant", !r.ok && r.reason === "unverified_grant")
  ok("…and it does NOT return the requested scopes", !("scopes" in r))

  const confirmedFull = resolveGrantedScopes({ requested: REQ, reported: [BASIC, PUBLISH, COMMENTS], existing: [] })
  ok("a confirmed FULL grant is recorded, and marked verified",
    confirmedFull.ok && confirmedFull.verified && JSON.stringify(confirmedFull.scopes) === JSON.stringify([BASIC, PUBLISH, COMMENTS]))

  const confirmedPartial = resolveGrantedScopes({ requested: REQ, reported: [BASIC, PUBLISH], existing: [] })
  ok("a confirmed PARTIAL grant records ONLY what was confirmed",
    confirmedPartial.ok && JSON.stringify(confirmedPartial.scopes) === JSON.stringify([BASIC, PUBLISH]))
  ok("…so comment access is NOT recorded when it was not granted",
    confirmedPartial.ok && !confirmedPartial.scopes.includes(COMMENTS))

  // The exact scenario behind the incident.
  const switchesOff = resolveGrantedScopes({ requested: REQ, reported: [BASIC], existing: [] })
  ok("allowing with the switches off records only what was actually granted",
    switchesOff.ok && JSON.stringify(switchesOff.scopes) === JSON.stringify([BASIC]))
}

console.log("\n4. RULE 2 — a grant may ADD, but never silently TAKE AWAY:")
{
  const HELD = [BASIC, PUBLISH]
  const addsComments = resolveGrantedScopes({ requested: REQ, reported: [BASIC, PUBLISH, COMMENTS], existing: HELD })
  ok("adding comment access to what we hold is accepted",
    addsComments.ok && addsComments.scopes.includes(COMMENTS) && addsComments.scopes.includes(PUBLISH))

  // THE FAILURE THIS GUARDS: re-authorizing for comments and losing publishing.
  const dropsPublish = resolveGrantedScopes({ requested: REQ, reported: [BASIC, COMMENTS], existing: HELD })
  ok("a grant MISSING our existing publishing scope is REFUSED", dropsPublish.ok === false)
  ok("…with reason would_revoke", !dropsPublish.ok && dropsPublish.reason === "would_revoke")
  ok("…naming exactly what would have been lost",
    !dropsPublish.ok && JSON.stringify(dropsPublish.lost) === JSON.stringify([PUBLISH]))
  ok("…so NOTHING is written and publishing survives", !dropsPublish.ok && !("scopes" in dropsPublish))

  const dropsAll = resolveGrantedScopes({ requested: REQ, reported: [COMMENTS], existing: HELD })
  ok("a grant dropping BOTH held scopes is refused, naming both",
    !dropsAll.ok && dropsAll.lost.length === 2)

  const same = resolveGrantedScopes({ requested: REQ, reported: HELD, existing: HELD })
  ok("re-confirming exactly what we hold is accepted (no change, no refusal)",
    same.ok && JSON.stringify(same.scopes) === JSON.stringify(HELD))
}

console.log("\n5. RULE 3 — unverifiable leaves an EXISTING connection exactly as it was:")
{
  const HELD = [BASIC, PUBLISH]
  const r = resolveGrantedScopes({ requested: REQ, reported: undefined, existing: HELD })
  ok("nothing reported + an existing connection ⇒ accepted", r.ok === true)
  ok("…recording the scopes we ALREADY had, unchanged",
    r.ok && JSON.stringify(r.scopes) === JSON.stringify(HELD))
  ok("…marked NOT verified", r.ok && r.verified === false)
  ok("…and comment access is NOT added on faith", r.ok && !r.scopes.includes(COMMENTS))
  ok("an empty permissions array behaves the same as absent",
    JSON.stringify(resolveGrantedScopes({ requested: REQ, reported: [], existing: HELD })) ===
    JSON.stringify(r))
  ok("a malformed permissions value behaves the same as absent",
    JSON.stringify(resolveGrantedScopes({ requested: REQ, reported: 42, existing: HELD })) ===
    JSON.stringify(r))
}

console.log("\n6. THE LIVE ACCOUNT'S SCOPES SURVIVE EVERY PATH:")
{
  // Nothing may produce a recorded set that lacks publishing when publishing was already held.
  const HELD = [...INSTAGRAM_SCOPES] as string[]
  const shapes: unknown[] = [
    undefined, null, [], "", 42, {}, [BASIC], [COMMENTS], `${BASIC},${COMMENTS}`,
    [BASIC, PUBLISH], [BASIC, PUBLISH, COMMENTS], `${BASIC},${PUBLISH},${COMMENTS}`,
  ]
  let lostPublish = 0
  for (const reported of shapes) {
    const r = resolveGrantedScopes({ requested: REQ, reported, existing: HELD })
    if (r.ok && !r.scopes.includes(PUBLISH)) { lostPublish++; console.log(`  ✗ publishing lost for ${JSON.stringify(reported)}`) }
  }
  ok(`across ${shapes.length} response shapes, publishing is NEVER dropped from a write`, lostPublish === 0)
}

console.log("\n7. THE CALLBACK REPORTS THE REAL REASON, WITHOUT LEAKING SECRETS:")
{
  const cb = readFileSync("app/api/admin/social-autopilot/accounts/instagram/callback/route.ts", "utf8")
  const page = readFileSync("app/admin/social-autopilot/accounts/page.tsx", "utf8")

  ok("the callback uses resolveGrantedScopes, not the assuming helper",
    /resolveGrantedScopes\(/.test(cb) && !/\bgrantedScopes\(/.test(cb))
  ok("it reads the existing scopes before deciding what to write", /\.select\("scopes"\)/.test(cb))
  ok("a refusal redirects with the resolver's own reason", /\?error=\$\{resolution\.reason\}/.test(cb))
  ok("a missing account id is reported distinctly", /error=no_account/.test(cb))

  // THE SECRET-LEAK GUARD. These URLs carry client_secret and access_token.
  ok("the caught error's MESSAGE is logged, never redirected",
    /console\.error\([^)]*\(e as Error\)\.message/.test(cb))
  ok("the error object itself is never logged (no stack, no request echo)",
    !/console\.error\(\s*e\s*\)/.test(cb) && !/console\.error\([^)]*\be\b\s*\)/.test(cb))
  ok("no provider message is ever put in the redirect URL",
    !/error=\$\{(?!resolution\.reason)[^}]*message/.test(cb))
  for (const secret of ["client_secret", "access_token", "p_token"]) {
    if (new RegExp(`redirect\\([^)]*${secret}`).test(cb)) {
      fail++; console.log(`  ✗ ${secret} appears in a redirect`)
    }
  }
  ok("no secret appears in any redirect", true)

  // Every code the callback can emit must have user-facing copy, or the page says "Something went wrong".
  const emitted = [...cb.matchAll(/\?error=([a-z_]+)/g)].map((m) => m[1])
  const dynamic = /\?error=\$\{resolution\.reason\}/.test(cb) ? ["would_revoke", "unverified_grant"] : []
  const all = [...new Set([...emitted, ...dynamic])]
  const missing = all.filter((c) => !new RegExp(`^\\s*${c}:`, "m").test(page))
  ok(`every emitted error code has copy on the page (${all.length} codes)`, missing.length === 0, missing.join(", "))
  ok("the would_revoke copy explains that nothing changed",
    /would_revoke:[^\n]*nothing was changed/i.test(page))
  ok("the denied copy tells the user to switch the permissions ON",
    /denied:[^\n]*switch ON every permission/i.test(page))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
