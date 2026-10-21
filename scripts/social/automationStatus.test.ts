// THE STATUS PILL MUST NOT LIE IN EITHER DIRECTION.
//
// This exists because three lines on the Comments screen were hardcoded literals. After live
// sending was armed, the pill still read "Automation off" while real DMs were being delivered —
// the screen reported the opposite of the truth. These assertions pin the two failures that
// matter: claiming live when something is off, and claiming off when everything is on.
import { automationStatus } from "@/components/crm/social/CommentsClient"

let pass = 0
let fail = 0
function ok(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}`) }
}

const ALL_ON = {
  globalEnabled: true,
  globalUnreadable: false,
  accountEnabled: true,
  accountSettingsUnreadable: false,
  hasCommentsScope: true,
  sendingEnabled: true,
}

console.log("\n1. ALL GATES OPEN — and only then — reads live:")
ok('every gate open reads "Automation live"', automationStatus(ALL_ON).text === "Automation live")

console.log("\n2. ANY SINGLE GATE CLOSED MUST NOT READ LIVE:")
for (const k of ["globalEnabled", "accountEnabled", "hasCommentsScope", "sendingEnabled"] as const) {
  const s = automationStatus({ ...ALL_ON, [k]: false })
  ok(`${k}=false does not read live`, s.text !== "Automation live")
}

console.log("\n3. DRY RUN IS ITS OWN STATE — not 'off', because detection IS running:")
const dry = automationStatus({ ...ALL_ON, sendingEnabled: false })
ok('sending off reads "Automation on · dry run"', dry.text === "Automation on · dry run")
ok("…and is visually distinct from off", dry.tone.includes("amber"))

console.log("\n4. UNREADABLE IS NOT OFF — a fault must not render as a confident 'off':")
ok('global unreadable reads "unknown"', automationStatus({ ...ALL_ON, globalUnreadable: true }).text === "Automation unknown")
ok('account settings unreadable reads "unknown"', automationStatus({ ...ALL_ON, accountSettingsUnreadable: true }).text === "Automation unknown")
ok("unknown wins over every gate being open", automationStatus({ ...ALL_ON, globalUnreadable: true }).text !== "Automation live")

console.log("\n5. EVERYTHING OFF reads off:")
ok('all gates closed reads "Automation off"', automationStatus({
  globalEnabled: false, globalUnreadable: false, accountEnabled: false,
  accountSettingsUnreadable: false, hasCommentsScope: false, sendingEnabled: false,
}).text === "Automation off")

console.log("\n6. TODAY'S ACTUAL PRODUCTION STATE reads live:")
// global_enabled=true, enabled=true, public_replies_enabled=true, scope granted, env armed.
ok("the live configuration reads live", automationStatus(ALL_ON).text === "Automation live")

console.log("\n7. NO HARDCODED STATUS STRINGS REMAIN IN THE CLIENT:")
const src = require("node:fs").readFileSync("components/crm/social/CommentsClient.tsx", "utf8")
ok('no literal ["Automatic public replies", "Off"]', !/\["Automatic public replies",\s*"Off"\]/.test(src))
ok('no literal ["Maximum comment age", "24 hours"]', !/\["Maximum comment age",\s*"24 hours"\]/.test(src))
ok("the pill is not a bare literal any more", !/\n\s*Automation off\n\s*<\/span>/.test(src))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
