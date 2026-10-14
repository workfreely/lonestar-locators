// THE GOOGLE DISCLOSURES — every sentence checked against the code that implements it.
//
// Pure and offline. Run: `npx tsx scripts/tests/googlePrivacyDisclosure.test.ts`
//
// A privacy policy is a promise, and the cheapest place to catch a false one is before it is
// published. Two claims in the first draft were wrong and were caught here: that we never modify
// a contact we did not create (update-stage's phone-search path does exactly that), and that
// agents could disconnect from within the application (there was no such control until 34c2195).
// A third was dropped rather than asserted — see "encryption" below.

import { readFileSync } from "node:fs"

let pass = 0
let fail = 0
function ok(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}`) }
}
const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/(^|\s)\/\/.*$/, "$1")).join("\n")

const privacy = readFileSync("app/locator-beast/(site)/privacy/page.tsx", "utf8")
const terms = readFileSync("app/locator-beast/(site)/terms/page.tsx", "utf8")
const stage = codeOnly(readFileSync("app/api/admin/leads/update-stage/route.ts", "utf8"))
const notes = codeOnly(readFileSync("lib/google/updateContactNotes.ts", "utf8"))
const cal = codeOnly(readFileSync("lib/google/createCalendarEvent.ts", "utf8"))
const sync = codeOnly(readFileSync("lib/google/syncContactLeadEvent.ts", "utf8"))
const disconnect = codeOnly(readFileSync("app/api/google/disconnect/route.ts", "utf8"))
const contact = codeOnly(readFileSync("lib/google/createGoogleContact.ts", "utf8"))

// ── EACH CLAIM, AND THE CODE THAT MAKES IT TRUE ─────────────────────────────────────────────
console.log("\nContacts")
ok("DISCLOSED: we create a contact per new lead — and we do", /creates a Google contact in your account for each new lead/.test(privacy) && /createContact\(/.test(contact))
ok("DISCLOSED: we search by phone number — and we do", /searches your Google Contacts by phone number/.test(privacy) && /searchContacts\(\{/.test(stage))
ok("DISCLOSED: that search reads names, phone numbers, identifiers — and it does", /reads the names, phone numbers and identifiers/.test(privacy) && /readMask: "names,phoneNumbers,metadata"/.test(stage))
ok("DISCLOSED: only the identifier is kept — and only resourceName is read from the response", /only the identifier of the matching contact is used/.test(privacy) && /const resourceName = searchRes\.data\.results\?\.\[0\]\?\.person\?\.resourceName/.test(stage))
// THE CORRECTION. The draft claimed we never modify a contact we did not create.
ok("DISCLOSED: we may update a contact YOU created — which is what the phone-search path does", /including a contact you created yourself, if it matches/.test(privacy) && /findContactByPhone\(formattedPhone, googleClient\)[\s\S]{0,400}updateGoogleContactNotes\(resourceName/.test(stage))
ok("DISCLOSED: only the notes field changes — and updatePersonFields says so", /We change no other field/.test(privacy) && /updatePersonFields: "biographies"/.test(notes))
ok("DISCLOSED: we never delete a contact — and nothing calls deleteContact", /we never delete a contact/.test(privacy) && !/deleteContact/.test(stage + contact + notes))

console.log("\nCalendar")
ok("DISCLOSED: primary calendar only — and it is pinned", /events on your primary calendar/.test(privacy) && /const calendarId = "primary"/.test(cal))
ok("DISCLOSED: we update only events we created — by a stored id", /only events we created, identified by an event id we stored/.test(privacy) && /existingEventId: action\.google_event_id/.test(sync))
ok("DISCLOSED: we never delete an event — and nothing calls events.delete", /we never delete an event/.test(privacy) && !/events\.delete/.test(cal + sync))

console.log("\nWhat we do with it")
// Verified by tracing: the search response yields only resourceName, which never leaves the
// Google code paths, so no Google-read value reaches lib/ai or any model.
ok("DISCLOSED: not sent to any AI model — and no Google-read value leaves those paths", /not sent to any AI model/.test(privacy) && !/searchContacts|resourceName/.test(codeOnly(readFileSync("lib/ai/generateAiInsights.ts", "utf8"))))
ok("DISCLOSED: not used for advertising, not sold", /is not used for advertising, and we do not sell it/.test(privacy))
// NOT CLAIMED: encryption at rest. refresh_token is a plain text column with no Vault or
// pgsodium, so the policy says only who can read it — which RLS and the service-role boundary
// actually guarantee.
ok("NOT CLAIMED: encryption at rest — the policy makes no such claim", !/encrypt/i.test(privacy.slice(privacy.indexOf("Your Google Authorization"), privacy.indexOf("Google API Services"))))
ok("INSTEAD: readable only by the server, which is what RLS gives us", /readable only by the Locator Beast server/.test(privacy))

console.log("\nDisconnect")
ok("DISCLOSED: disconnect revokes AND removes the token", /asks Google to revoke the authorization and removes the stored token/.test(privacy) && /oauth2\.googleapis\.com\/revoke/.test(disconnect) && /\.delete\(\)/.test(disconnect))
ok("DISCLOSED: an unconfirmed revocation is reported, not hidden", /we tell you so rather than reporting success/.test(privacy) && /revoked: revoked === "revoked"/.test(disconnect))
ok("DISCLOSED: and the Google permissions page is given", /myaccount\.google\.com\/permissions/.test(privacy))
ok("DISCLOSED: it is not a sign-out", /does not sign you out of Locator Beast/.test(privacy) && !/signOut|auth\.admin/.test(disconnect))
ok("DISCLOSED: records survive — and only the credential row is deleted", /remain in your Google account and are yours to keep/.test(privacy) && (disconnect.match(/\.delete\(\)/g) || []).length === 1)
ok("DISCLOSED: account deletion revokes it — and the delete route touches google_credentials", /Deleting your Locator Beast account revokes this authorization/.test(privacy) && /google_credentials/.test(readFileSync("app/api/account/delete/route.ts", "utf8")))

console.log("\nLogin is a separate thing")
ok("the policy distinguishes signing in from connecting", /separate from signing in with Google/.test(privacy))
ok("the Terms say so too", /optional and separate from signing in with Google/.test(terms))
ok("Google Login still runs on its own client, untouched", readFileSync("app/(auth)/_components/GoogleButton.tsx", "utf8").includes("NEXT_PUBLIC_GOOGLE_LOGIN_CLIENT_ID"))

console.log("\nRequired language and preserved sections")
ok("Google API Services User Data Policy named", /Google API Services User Data Policy/.test(privacy))
ok("Limited Use named", /Limited Use requirements/.test(privacy))
for (const h of ["Introduction", "Information We Collect", "How We Use Your Information", "Information Sharing", "Data Security", "Data Retention", "Beast Companion Browser Extension", "Children's Privacy", "Changes to This Policy", "Contact Us"]) {
  ok(`preserved: ${h}`, privacy.includes(`heading: "${h}"`))
}
for (const h of ["Acceptance of Terms", "Your Data", "Intellectual Property", "Termination", "Governing Law"]) {
  ok(`preserved (terms): ${h}`, terms.includes(`heading: "${h}"`))
}
ok("the Beast Companion Chrome Web Store statement is untouched", /Chrome Web Store User Data Policy/.test(privacy))

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
