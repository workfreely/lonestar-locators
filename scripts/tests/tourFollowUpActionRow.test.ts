// TOUR FOLLOW-UP MOVED INTO THE PROPERTY ACTION ROW. ONLY ITS PRESENTATION MOVED.
//
// Before: a bordered row at the bottom of the card carrying a "TOURED" eyebrow, the tour's date
// and time, and a Tour Follow-Up button on the right.
// After:  "✓ Guest Card Sent | ▤ Tour Follow-Up" — the same compact row Check Application uses.
//
// The risk in a change like this is never the markup. It is (a) moving a button and quietly
// changing what it calls, (b) letting the card offer two next actions at once, and (c) touching
// UPCOMING tours, which must keep showing their scheduled date and time. All three are asserted.
import { readFileSync } from "node:fs"
import { favoriteSecondaryAction } from "@/lib/leads/favoriteActions"

let pass = 0
let fail = 0
function ok(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}${detail ? `  — ${detail}` : ""}`) }
}
const raw = readFileSync("components/crm/LeadFavorites.tsx", "utf8")
/** Comments stripped: a historical note about the old row is fine, a live one is not. */
const code = raw.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")

console.log("the stripper works:")
const needle = ["TOUR FOLLOW-UP MOVED INTO", "THE PROPERTY ACTION ROW"].join(" ")
ok("this file's own explanation would not be scanned",
  !readFileSync("scripts/tests/tourFollowUpActionRow.test.ts", "utf8")
    .replace(/\/\/[^\n]*/g, "").includes(needle))

// ── 1. THE OLD ROW IS GONE ────────────────────────────────────────────────────────────────────
console.log("\nthe bottom TOURED row no longer renders:")
ok("no `!tour && tourOccurred && tfAction && onTourFollowUp` block remains",
  !/!tour && tourOccurred && tfAction && onTourFollowUp/.test(code))
ok("no TOURED eyebrow label is left", !/>Toured</.test(code))
ok("…and no uppercase-tracked 'Toured' heading", !/tracking-\[0\.14em\][^]{0,80}Toured/.test(code))
ok("the tour's date is no longer printed beside a follow-up button",
  !/formatDueDateTime\(scheduledTour!\.scheduled_at/.test(code))
ok("no Tour Follow-Up button sits in a justify-between state row",
  !/justify-between[^]{0,500}Tour Follow-Up\s*<\/button>/.test(code))

// ── 2. IT IS NOW IN THE ACTION ROW, STYLED AS CHECK APPLICATION ───────────────────────────────
console.log("\nit renders in the Guest Card row, with Check Application's exact styling:")
const ACTION_CLASS = 'className="inline-flex items-center gap-1.5 text-[var(--crm-accent)] hover:underline"'
const tfBlock = code.slice(code.indexOf("showTourFollowUp && ("), code.indexOf("showTourFollowUp && (") + 600)
const caBlock = code.slice(code.indexOf("showCheckApp && ("), code.indexOf("showCheckApp && (") + 600)
ok("the Tour Follow-Up button exists", /showTourFollowUp && \(/.test(code) && /Tour Follow-Up/.test(raw))
ok("…with the SAME class string as Check Application", tfBlock.includes(ACTION_CLASS) && caBlock.includes(ACTION_CLASS))
ok("…the same 13px icon size", /HiOutlineClipboardDocumentCheck className="text-\[13px\]"/.test(code))
ok("…an outline icon from the same hi2 family", /HiOutlineClipboardDocumentCheck/.test(code) && /from "react-icons\/hi2"/.test(code))
ok("…and the icon is imported", /import \{[^}]*HiOutlineClipboardDocumentCheck[^}]*\} from "react-icons\/hi2"/.test(code))
ok("it sits in the same flex row as Guest Card Sent",
  code.indexOf("Guest Card Sent") < code.indexOf("showTourFollowUp && (") &&
  code.indexOf("showTourFollowUp && (") < code.indexOf("Schedule Tour"))
ok("the divider renders for it too",
  /\(gcSent \|\| onSendGuestCard\) && \(showCheckApp \|\| showTourFollowUp \|\| showScheduleTour\)/.test(code))
ok("no second 'Toured' badge was added anywhere", (raw.match(/>Toured</g) ?? []).length === 0)

// ── 3. THE HANDLER AND ITS ARGUMENTS ARE UNCHANGED ────────────────────────────────────────────
// This is the half that proves BEHAVIOUR did not move with the markup.
console.log("\nthe handler is the same call with the same arguments:")
ok("onTourFollowUp is still invoked", /onTourFollowUp!?\(lead,/.test(code))
ok("…exactly once", (code.match(/onTourFollowUp!?\(lead,/g) ?? []).length === 1,
  String((code.match(/onTourFollowUp!?\(lead,/g) ?? []).length))
ok("…with { tour: scheduledTour, favorite: fav, actionId: tfAction.id }",
  /onTourFollowUp!?\(lead, \{ tour: scheduledTour, favorite: fav, actionId: tfAction\.id \}\)/.test(code))
ok("the tfAction lookup is untouched (open, property-scoped, tour_follow_up)",
  /action_key \?\? ""\) === "tour_follow_up"/.test(code) && /!a\.completed/.test(code))
ok("the component still issues no write of its own for this action",
  !/showTourFollowUp[\s\S]{0,200}?(supabase|fetch\(|\.update\(|\.insert\()/.test(code))

// ── 4. UPCOMING TOURS ARE UNTOUCHED ───────────────────────────────────────────────────────────
console.log("\nupcoming and incomplete tours still show their scheduled date and time:")
ok("the follow-up slot is gated on the tour having OCCURRED",
  /const tourFollowUpOpen = !tour && tourOccurred && !!tfAction/.test(code))
ok("tourOccurred is still derived from the scheduled time",
  /tourOccurred = !!scheduledTour && new Date\(scheduledTour\.scheduled_at\)\.getTime\(\) <= Date\.now\(\)/.test(code))
ok("formatDueDateTime is still used for tour display elsewhere", /formatDueDateTime\(/.test(code))
ok("the upcoming-tour block still reads the scheduled time", /scheduled_at/.test(code))
// And at the resolver: an upcoming tour can never resolve to tour_follow_up.
const base = { checkApplicationOpen: false, canCheckApplication: false, tourFollowUpOpen: false,
  canTourFollowUp: true, hasScheduledTour: true, canScheduleTour: true, hasScheduleTarget: true }
ok("an upcoming tour never resolves to tour_follow_up", favoriteSecondaryAction(base) !== "tour_follow_up")
ok("an occurred one does", favoriteSecondaryAction({ ...base, tourFollowUpOpen: true }) === "tour_follow_up")

// ── 5. NOTHING ELSE ON THE CARD MOVED ─────────────────────────────────────────────────────────
console.log("\nthe rest of the card is unchanged:")
ok("Guest Card Sent is still rendered", /Guest Card Sent/.test(raw))
ok("Check Application is still rendered", /Check Application/.test(raw))
ok("Schedule Tour is still rendered", /Schedule Tour/.test(raw))
ok("commission information is untouched", /[Cc]ommission/.test(raw))
ok("the Apply row still renders its own state line", /applyAction && onStartApplication/.test(code))
ok("Confirm Lease is untouched", /confirmLeaseOpen/.test(code))
ok("the Top Pick badge is untouched", /the property this lead is moving on/.test(raw))
ok("the no-action fallback line still exists", /!tour && !tfAction && !applyAction && !checkAppOpen/.test(code))

console.log(`\nTour Follow-Up action row: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
