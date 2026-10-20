/**
 * THE TOUR MODAL ON A PHONE — the default tour type, and revealing the time preferences.
 *
 *   npx tsx scripts/leads/tourModalMobile.test.ts
 *
 * On an iPhone the calendar fills the modal, so "What times work best?" renders below the fold.
 * A client taps a date, sees nothing move — the sticky footer stays put — and reasonably concludes
 * nothing happened. The modal's own body now scrolls to the row for the date they tapped.
 *
 * The risk in a fix like this is scrolling people around when they did not ask: on a time toggle,
 * on a deselect, on any incidental re-render. So most of what follows pins the cases that must
 * NOT move, and the one place the intent is recorded.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { TOUR_TYPE_LABELS, TOUR_WINDOWS } from "@bc/companion-shared"

let pass = 0
let fail = 0
const ok = (label: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ✓ ${label}`) } else { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`) }
}
const eq = (label: string, a: unknown, b: unknown) =>
  ok(label, JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)}`)
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
const SRC = "app/locator-beast/r/[token]/TourAvailability.tsx"
const raw = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const src = strip(raw(SRC))
const css = raw("app/locator-beast/r/[token]/page.tsx")

console.log("\n=== 1. IN PERSON IS THE DEFAULT, VIRTUAL STAYS AVAILABLE ===")
{
  ok("a new submission starts on In Person",
    /useState<TourType>\(initial\?\.tourType === "virtual" \? "virtual" : "in_person"\)/.test(src))
  ok("both options are offered", /SELECTABLE_TOUR_TYPES: TourType\[\] = \["in_person", "virtual"\]/.test(src))
  ok("the segmented control marks the active one", /aria-checked=\{tourType === t\}/.test(src))

  // "either" is a legacy stored value. It must still READ, and must not be silently rewritten.
  const mapped = (stored: string | null) => (stored === "virtual" ? "virtual" : "in_person")
  eq("a stored 'either' opens as In Person", mapped("either"), "in_person")
  eq("a stored 'virtual' is respected", mapped("virtual"), "virtual")
  eq("no stored value → In Person", mapped(null), "in_person")
  ok("'either' is still a readable label", typeof TOUR_TYPE_LABELS.either === "string")
  ok("the stored value only changes on a real resubmit — submit sends the CURRENT tourType",
    /body: JSON\.stringify\(\{ token, tourType, dates \}\)/.test(src))
}

console.log("\n=== 2. A DATE IS REQUIRED; TIMES ARE NOT ===")
{
  ok("submit is gated on at least one date",
    /const canSubmit = selectedDates\.length > 0 && !submitting/.test(src))
  ok("…and the button honours it", /disabled=\{!canSubmit\}/.test(src))
  // Every selected date is given a window immediately, so "no times chosen" cannot occur.
  ok("a newly picked date defaults to a window", /new Set<TourWindow>\(\["flexible"\]\)/.test(src))
  ok("a date can never end up with zero windows",
    /if \(set\.size > 1\) set\.delete\(w\)/.test(src) && /if \(set\.size === 0\) set = new Set<TourWindow>\(\[w\]\)/.test(src))
  ok("'flexible' is one of the windows offered", (TOUR_WINDOWS as readonly string[]).includes("flexible"))
}

console.log("\n=== 3. THE REVEAL SCROLLS THE MODAL, NOT THE PAGE ===")
{
  ok("the scroller is the modal body", /<div className="lbr-modal-body" ref=\{bodyRef\}>/.test(src))
  ok("…and it is the thing scrolled", /body\.scrollTo\(\{ top: body\.scrollTop \+ delta - 12/.test(src))
  ok("scrollIntoView is NOT used — it would walk every scrollable ancestor",
    !/scrollIntoView/.test(src))
  ok("the page behind stays locked while the modal is open",
    /document\.body\.style\.overflow = "hidden"/.test(src))
  // The footer is a flex sibling of the body, not an overlay, so body content cannot sit under it.
  ok("the footer is a flex sibling, so scrolled content is never behind it",
    /\.lbr-modal-foot\{[^}]*flex:none/.test(css) && /\.lbr-modal-body\{[^}]*flex:1 1 auto/.test(css))
  ok("the row is top-aligned, putting it as far from the footer as the container allows",
    /row\.getBoundingClientRect\(\)\.top - body\.getBoundingClientRect\(\)\.top/.test(src))
  ok("each day row is addressable", /data-ta-day=\{d\}/.test(src))
}

console.log("\n=== 4. IT MOVES ONLY WHEN A DATE IS ADDED ===")
{
  ok("the intent is recorded on ADD only", /if \(!selected\.has\(dateStr\)\) pendingScrollRef\.current = dateStr/.test(src))
  // A state updater must be pure: React may call it twice or throw the render away, so a ref
  // written inside it is not reliably what the effect later reads. This was a real failure.
  const updater = src.slice(src.indexOf("setSelected((prev) => {"), src.indexOf("function toggleWindow"))
  ok("the ref is NOT written inside the state updater", !updater.includes("pendingScrollRef"))
  ok("the effect consumes the intent once and clears it",
    /const date = pendingScrollRef\.current[\s\S]{0,80}pendingScrollRef\.current = null/.test(src))
  ok("…and does nothing without one", /if \(!date\) return/.test(src))
  // toggleWindow is a different handler entirely, so a time change cannot set the intent.
  const windowFn = src.slice(src.indexOf("function toggleWindow"), src.indexOf("async function submit"))
  ok("changing a time option never sets the intent", !windowFn.includes("pendingScrollRef"))
  ok("changing the tour type never sets it", !/setTourType\([^)]*\)[\s\S]{0,60}pendingScrollRef/.test(src))
}

console.log("\n=== 5. REDUCED MOTION IS HONOURED ===")
{
  ok("the preference is read", /prefers-reduced-motion: reduce/.test(src))
  ok("…and chooses an instant jump", /behavior: reduced \? "auto" : "smooth"/.test(src))
  ok("it is guarded for SSR", /typeof window !== "undefined"/.test(src))
  ok("and for browsers without matchMedia", /window\.matchMedia\?\./.test(src))
}

console.log("\n=== 6. NOTHING ELSE IN THE FLOW MOVED ===")
{
  ok("the submission endpoint is unchanged", /fetch\("\/api\/r\/tour-availability"/.test(src))
  ok("the payload shape is unchanged", /\{ token, tourType, dates \}/.test(src))
  ok("onSubmitted still reports what was sent", /onSubmitted\(\{ tourType, dates \}\)/.test(src))
  ok("the calendar still renders every day of the month", /daysInMonth/.test(src))
  ok("past dates are still disabled", /const past = ds < todayStr/.test(src))
  ok("Escape still closes", /e\.key === "Escape"/.test(src))
  for (const forbidden of ["lead_favorites", "crm_status", "lead_next_actions", "social_", "property_catalog"]) {
    ok(`the modal never touches ${forbidden}`, !src.includes(forbidden))
  }
}

console.log(fail === 0 ? `\nALL PASS ✅ (${pass} passed, ${fail} failed)\n` : `\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
