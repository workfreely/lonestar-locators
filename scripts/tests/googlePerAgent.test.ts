// GOOGLE — one per-agent integration, and no second synchronisation system.
//
// Pure and offline. Run: `npx tsx scripts/tests/googlePerAgent.test.ts`
// No Google call, no contact, no calendar event, no lead.
//
// ── WHAT THIS LOCKS DOWN ────────────────────────────────────────────────────────────────────
// Two Google architectures coexisted. The modern one resolves the LEAD'S OWNER and uses that
// agent's token — proven in production by lead 92, which got both a contact and a calendar
// event in the right account. The legacy one built a single global client from
// GOOGLE_REFRESH_TOKEN, a variable that does not exist in production, so every path on it had
// been failing silently: List Sent events were never created and contact notes never updated.
//
// The legacy path is gone. These assertions are what stop it coming back.

import { readFileSync, existsSync } from "node:fs"

let pass = 0
let fail = 0
function ok(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}`) }
}

/** Strip comments — an assertion about what the CODE does must not match the prose about it. */
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/(^|\s)\/\/.*$/, "$1")).join("\n")
}

const calendar = readFileSync("lib/google/createCalendarEvent.ts", "utf8")
const calendarCode = codeOnly(calendar)
const stage = readFileSync("app/api/admin/leads/update-stage/route.ts", "utf8")
const submit = readFileSync("app/api/leads/submit/route.ts", "utf8")
const notes = readFileSync("lib/google/updateContactNotes.ts", "utf8")

// ── THE GLOBAL ACCOUNT IS GONE ──────────────────────────────────────────────────────────────
console.log("\nOne architecture")
ok("lib/google/getOAuthClient.ts no longer exists", !existsSync("lib/google/getOAuthClient.ts"))
for (const [f, src] of [["createCalendarEvent", calendar], ["update-stage", stage], ["submit", submit], ["updateContactNotes", notes]] as const) {
  ok(`${f} calls no global client`, !/\bgetOAuthClient\s*\(/.test(codeOnly(src)))
}
ok("nothing reads GOOGLE_REFRESH_TOKEN", !/process\.env\.GOOGLE_REFRESH_TOKEN/.test(calendar + stage + submit + notes))
ok("nothing reads GOOGLE_CALENDAR_ID", !/process\.env\.GOOGLE_CALENDAR_ID/.test(calendar + stage + submit + notes))

console.log("\nThe dead surfaces are retired")
for (const p of [
  "app/api/google/new-lead-event/route.ts",
  "app/api/google/followup-event/route.ts",
  "app/api/google/create-contact/route.ts",
  "lib/google/syncFollowUpEvent.ts",
]) ok(`${p} removed`, !existsSync(p))
// Only the two routes that authorise an agent remain.
for (const p of ["app/api/google/auth/route.ts", "app/api/google/callback/route.ts"]) ok(`${p} preserved`, existsSync(p))

// ── EVERY WRITE IS THE OWNER'S ──────────────────────────────────────────────────────────────
console.log("\nOwner isolation")
ok("the calendar insert takes a REQUIRED client", /async function insertCalendarEvent\(\s*eventBody: object,\s*label: string,\s*oauth2Client: GoogleOAuthClient,\s*\)/.test(calendar))
ok("and is pinned to the owner's primary calendar", /const calendarId = "primary"/.test(calendar))
ok("no configurable calendar id survives", !/calendarIdOverride/.test(calendarCode))
ok("List Sent takes the owner's client", /createListSentCalendarEvent\(\s*lead: ListSentEventInput,\s*client: GoogleOAuthClient,/.test(calendar))
ok("New Lead takes the owner's client", /createNewLeadCalendarEvent\([\s\S]{0,200}oauth2Client: GoogleOAuthClient,/.test(calendar))
ok("contact notes take the owner's client", /notes: string,\s*client: GoogleOAuthClient\s*\): Promise<void>/.test(notes))
ok("the stage route resolves the LEAD's owner, not the caller", /const googleOwnerId = \(lead\.owner_user_id as string \| null\) \?\? null/.test(stage))
ok("and builds that owner's client once", /getOAuthClientForUser\(googleOwnerId, \{ verify: false \}\)/.test(stage))
ok("the phone search is scoped to that client", /findContactByPhone\(formattedPhone, googleClient\)/.test(stage))
ok("no connected account ⇒ no List Sent event, rather than a write to nobody", /crm_status === "list_sent" && googleClient\)/.test(stage))
ok("a lead with no attributed owner gets no calendar write", !/await createNewLeadCalendarEvent\(leadInput\)\s*$/m.test(submit))

// ── NOTHING IS DUPLICATED ───────────────────────────────────────────────────────────────────
console.log("\nNo duplicates")
for (const f of ["app/components/LandingForm.tsx", "app/components/ContactForm.tsx"]) {
  ok(`${f} no longer creates a contact from the browser`, !readFileSync(f, "utf8").includes("/api/google/create-contact"))
}
// The server path remains the ONE contact writer.
ok("the submit route is the single contact creator", /createGoogleContactForOwner\(attributedOwnerId, data\.id/.test(submit))
// Calendar dedupe: contact_lead reuses its stored event id rather than inserting again.
const sync = readFileSync("lib/google/syncContactLeadEvent.ts", "utf8")
ok("Contact Lead reuses its stored google_event_id", /existingEventId: action\.google_event_id/.test(sync))
ok("and writes the id back so a repeat updates in place", /update\(\{ google_event_id: eventId \}\)/.test(sync))
ok("the upsert patches when an id exists, inserts when it does not", /events\.patch\(\{ calendarId: "primary", eventId: existingEventId/.test(calendar))
// Contact dedupe: the stage route prefers the stored id and only then searches by phone.
ok("contact notes prefer the stored resourceName", stage.indexOf("if (lead.google_contact_id)") < stage.indexOf("Path B"))
ok("List Sent fires only on the FIRST transition into list_sent", /oldStage !== "list_sent" && crm_status === "list_sent"/.test(stage))

// ── FAILURES ARE RECORDED, NOT SWALLOWED ────────────────────────────────────────────────────
console.log("\nFailures surface")
for (const [f, src] of [["the contact sync", stage], ["the submit paths", submit], ["createGoogleContact", readFileSync("lib/google/createGoogleContact.ts", "utf8")], ["the Contact Lead sync", sync]] as const) {
  ok(`${f} records a failure`, /recordGoogleFailure\(/.test(src))
}
ok("through the safe classifier, never a raw provider message", /classifyGoogleError\(/.test(stage))

// ── UNTOUCHED ───────────────────────────────────────────────────────────────────────────────
console.log("\nOut of scope and unchanged")
ok("Supabase Google Login is untouched", readFileSync("app/(auth)/_components/GoogleButton.tsx", "utf8").includes("signInWithIdToken"))
ok("OAuth scopes are unchanged (contacts + calendar.events)", (() => {
  const auth = readFileSync("app/api/google/auth/route.ts", "utf8")
  return auth.includes("auth/contacts") && auth.includes("auth/calendar.events") && !auth.includes("calendar.events.owned")
})())
ok("Maps and Places are untouched", !/GOOGLE_PLACES_API_KEY|GOOGLE_MAPS_API_KEY/.test(calendar + stage + submit))

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
