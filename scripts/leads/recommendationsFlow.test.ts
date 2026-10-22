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

console.log("\n1. THERE IS A WAY BACK TO THE CALENDAR:")
ok("the reopen block renders when done, modal closed, nothing submitted",
  /\{done && !modalOpen && !availability && \(/.test(list))
ok("…and its button reopens the modal", /onClick=\{\(\) => setModalOpen\(true\)\}>Choose Tour Availability/.test(list))
ok("it carries its own class so the phone can show it",
  /className="lbr-done lbr-done--reopen"/.test(list))

console.log("\n2. IT IS VISIBLE ON A PHONE — the actual bug:")
ok("the phone breakpoint un-hides it", /\.lbr-done--reopen\{display:block\}/.test(page))
ok("…and that override comes AFTER .lbr-done{display:none} (same specificity, order decides)",
  page.indexOf(".lbr-done{display:none}") < page.indexOf(".lbr-done--reopen{display:block}"))
ok("the pre-Done CTA is still hidden on a phone, so it cannot compete with the sticky bar",
  /\.lbr-done\{display:none\}/.test(page))

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
