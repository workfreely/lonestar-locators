// DISMISSING THE TOUR CALENDAR MUST NOT STRAND THE CLIENT.
//
// Reported on Ka'Leah's list: tap Done Selecting Favorites, the calendar opens, close it without
// submitting — and on a phone there was no way back. Hearts still worked, the sticky bar was gone
// (correctly, done=true), and the "Choose Tour Availability" button that exists for exactly this
// case was invisible, because it reuses .lbr-done and the phone breakpoint sets that to
// display:none so the pre-Done CTA cannot compete with the sticky bar.
//
// done=true is NOT the bug and must not be reverted: /api/r/done-selecting already reconciled the
// favorites into lead_favorites, advanced the lead to Ready to Tour and created the locator's
// Ready-to-Tour action. Closing a modal cannot undo a CRM stage change.
import { readFileSync } from "node:fs"

let pass = 0
let fail = 0
function ok(label: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`) }
}

const list = readFileSync("app/locator-beast/r/[token]/RecommendationList.tsx", "utf8")
const page = readFileSync("app/locator-beast/r/[token]/page.tsx", "utf8")

console.log("\n1. ONE STICKY BAR, THREE STATES — and exactly one is up at a time:")
ok("state 1: selecting favorites", /\{!done && \(\s*<div className="lbr-sticky"/.test(list))
ok("state 2: done, nothing submitted", /\{done && !availability && !modalOpen && \(\s*<div className="lbr-sticky"/.test(list))
ok("state 3: availability submitted", /\{done && availability && !modalOpen && \(\s*<div className="lbr-sticky"/.test(list))
ok("the three conditions are mutually exclusive", (() => {
  // !done | done&&!availability | done&&availability — no pair can both be true.
  for (const done of [false, true]) for (const availability of [false, true]) {
    const on = [!done, done && !availability, done && !!availability].filter(Boolean).length
    if (on > 1) return false
  }
  return true
})())
ok("all three reuse the SAME element and class, not a second bar",
  (list.match(/<div className="lbr-sticky"/g) ?? []).length === 3)
ok("states 2 and 3 hide while the calendar is open, so no bar sits under the modal",
  /\{done && !availability && !modalOpen/.test(list) && /\{done && availability && !modalOpen/.test(list))

console.log("\n2. THE WORDING AND ACTIONS MATCH THE APPROVED STATES:")
ok('state 2 reads "Your favorites are saved"', /Your favorites are saved/.test(list))
ok("…and offers Choose Tour Availability", /Choose Tour Availability <Arrow \/>/.test(list))
ok('state 3 reads "Tour availability sent!"', /Tour availability sent!/.test(list))
ok("…and offers Edit Tour Availability", /Edit Tour Availability <Arrow \/>/.test(list))
ok("both new actions reopen the SAME modal handler", (list.match(/onClick=\{\(\) => setModalOpen\(true\)\}/g) ?? []).length >= 3)

console.log("\n2b. NO DUPLICATE CONTROLS ON A PHONE:")
ok("the inline reopen block is hidden on a phone", /\.lbr-done\{display:none\}/.test(page))
ok("…and the Availability Sent card's Edit is too, since the bar carries it",
  /\.lbr-avsent \.lbr-ta-edit\{display:none\}/.test(page))
ok("…but the card itself still shows the chosen dates", !/\.lbr-avsent\{display:none\}/.test(page))
ok("the dead .lbr-done--reopen marker is gone from both files",
  !/lbr-done--reopen/.test(list) && !/lbr-done--reopen/.test(page))

console.log("\n3. done=true IS NOT REVERTED — closing a modal cannot undo CRM state:")
ok("onClose only closes the modal", /onClose=\{\(\) => setModalOpen\(false\)\}/.test(list))
ok("…it does NOT reset done", !/onClose=\{\(\) => \{[^}]*setDone\(false\)/.test(list))
ok("setDone(true) happens only after the API call succeeds",
  /const res = await fetch\("\/api\/r\/done-selecting"[\s\S]{0,400}setDone\(true\)/.test(list))
ok("nothing in the component ever calls setDone(false)", !/setDone\(false\)/.test(list))

console.log("\n4. FAVORITES STAY EDITABLE AND SAVED:")
ok("toggling a heart is not gated on done", (() => {
  const i = list.indexOf("async function toggle(")
  const body = list.slice(i, i + 700)
  return !/\bif \(done\)/.test(body) && /\/api\/r\/favorite/.test(body)
})())
ok("each toggle persists immediately", /fetch\("\/api\/r\/favorite"/.test(list))

console.log("\n5. A SUBMITTED REQUEST STILL SHOWS ITS CONFIRMATION:")
ok("the Availability Sent block renders once availability exists",
  /\{done && !modalOpen && availability && \(/.test(list))
ok("…it uses lbr-avsent, which the phone never hid", /className="lbr-avsent"/.test(list) && !/\.lbr-avsent\{display:none\}/.test(page))
ok("…and offers Edit to reopen the calendar", /className="lbr-ta-edit" onClick=\{\(\) => setModalOpen\(true\)\}/.test(list))
ok("only a real submission sets availability", /onSubmitted=\{onAvailabilitySubmitted\}/.test(list))

console.log("\n6. THE FINALISED STICKY-BAR SIZING IS UNTOUCHED:")
ok("instruction line still 40px at 15px/600", /\.lbr-sticky-count\{font-size:15px;font-weight:600;min-height:40px\}/.test(page))
ok("button still 48px / 16px",
  /\.lbr-sticky-btn\{[^}]*min-height:48px/.test(page) && /\.lbr-sticky-btn\{font-size:16px\}/.test(page))
ok("clearance still 135px and still scoped to the bar",
  /\.lbr-shell:has\(\.lbr-sticky\)\{padding-bottom:calc\(135px \+ env\(safe-area-inset-bottom\)\)\}/.test(page))
ok("safe-area support intact on both the bar and the no-bar page end",
  /\.lbr-sticky\{[^}]*env\(safe-area-inset-bottom\)/.test(page) &&
  /\.lbr-shell\{padding-bottom:env\(safe-area-inset-bottom\)\}/.test(page))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
