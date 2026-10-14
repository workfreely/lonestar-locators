// THANK YOU PAGE — media selection, genuine testimonials, and the approved copy.
//
// Pure and offline. Run: `npx tsx scripts/tests/thankYouMedia.test.ts`
//
// The assertion that matters most is the one about fiction: an agent who has never written a
// testimonial still carries three invented ones in their config, and a renter who has just trusted
// this agent with their search must never be shown them as reviews.

import {
  resolveThankYouMedia,
  genuineTestimonials,
  thankYouMediaToShow,
  THANKYOU_MEDIA_DEFAULT,
} from "@/lib/smartForm/thankYouMedia"
import { DEFAULT_CONFIG } from "@/app/smart-lead-form/_lib/defaultConfig"
import { THANKYOU_DEFAULTS, buildThankYouSteps, buildThankYouIntro } from "@/lib/smartForm/thankYouSteps"

let pass = 0
let fail = 0
function ok(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}`) }
}

const REAL = [
  { name: "Tiffany P.", city: "San Antonio, TX", quote: "We just submitted our application and got approved!", photoUrl: null },
  { name: "Ashley V", city: "San Antonio, TX", quote: "You're the best — I switched units because of the view.", photoUrl: null },
  { name: "Eris S.", city: "Houston, TX", quote: "Appreciate you pointing me in the right direction.", photoUrl: null },
]
const SAMPLES = DEFAULT_CONFIG.copy.testimonials

// ── default and legacy resolution ───────────────────────────────────────────────────────────
console.log("\nWhich media a page shows")
ok("the default is testimonials", THANKYOU_MEDIA_DEFAULT === "testimonials")
ok("a brand-new page gets testimonials", resolveThankYouMedia({}) === "testimonials")
ok("an unconfigured page with no video gets testimonials", resolveThankYouMedia({ thankYouMedia: "", thankYouVideoUrl: "" }) === "testimonials")
// THE LEGACY RULE: a video configured before this control existed is an explicit choice.
ok(
  "an unset page WITH a configured video keeps its video",
  resolveThankYouMedia({ thankYouMedia: "", thankYouVideoUrl: "https://youtu.be/abc" }) === "video",
)
ok("an explicit video choice wins", resolveThankYouMedia({ thankYouMedia: "video", thankYouVideoUrl: "" }) === "video")
ok(
  "an explicit testimonials choice beats a configured video",
  resolveThankYouMedia({ thankYouMedia: "testimonials", thankYouVideoUrl: "https://youtu.be/abc" }) === "testimonials",
)
ok("an unknown stored value falls back to the default", resolveThankYouMedia({ thankYouMedia: "banner" }) === "testimonials")

// ── NEVER FABRICATE ─────────────────────────────────────────────────────────────────────────
console.log("\nOnly genuine testimonials are ever shown")
ok("the built-in samples are rejected", genuineTestimonials(SAMPLES).length === 0)
ok("real ones are kept", genuineTestimonials(REAL).length === 2)
ok("at most two", genuineTestimonials(REAL).length === 2)
ok("one real one yields exactly one", genuineTestimonials([REAL[0]]).length === 1)
ok("samples mixed with real ones yield only the real", genuineTestimonials([...SAMPLES, REAL[0]]).length === 1)
ok("a blank quote is not a review", genuineTestimonials([{ name: "A", quote: "   " }]).length === 0)
ok("a missing name is not a review", genuineTestimonials([{ name: "", quote: "Great service" }]).length === 0)
ok("an empty list yields none", genuineTestimonials([]).length === 0)
ok("null yields none", genuineTestimonials(null).length === 0)
ok("sample matching ignores case and padding", genuineTestimonials([{ ...SAMPLES[0], quote: `  ${SAMPLES[0].quote.toUpperCase()}  ` }]).length === 0)

// ── the eleven scenarios, as the page actually asks them ────────────────────────────────────
console.log("\nPage scenarios")
const s1 = thankYouMediaToShow({ testimonials: REAL })
ok("1. unconfigured agent with real testimonials → two shown", s1.media === "testimonials" && s1.show && s1.testimonials.length === 2)
const s2 = thankYouMediaToShow({ testimonials: [REAL[0]] })
ok("2. only one testimonial → one shown", s2.show && s2.testimonials.length === 1)
const s3 = thankYouMediaToShow({ testimonials: SAMPLES })
ok("3. only samples → NOTHING shown, no empty cards", s3.media === "testimonials" && s3.show === false && s3.testimonials.length === 0)
const s3b = thankYouMediaToShow({})
ok("3b. no testimonials at all → nothing shown", s3b.show === false)
const s4 = thankYouMediaToShow({ thankYouMedia: "video", thankYouVideoUrl: "https://youtu.be/x" })
ok("4. agent selects Video → video shown", s4.media === "video" && s4.show)
const s4b = thankYouMediaToShow({ thankYouMedia: "video", thankYouVideoUrl: "" })
ok("4b. Video selected with no URL → nothing, never a broken player", s4b.media === "video" && s4b.show === false)
// 5. switching away and back must not lose the URL: the setting and the URL are separate fields,
//    so the page resolves the original video again with the config unchanged apart from the choice.
const saved = { thankYouVideoUrl: "https://youtu.be/keepme", testimonials: REAL }
const toTestimonials = thankYouMediaToShow({ ...saved, thankYouMedia: "testimonials" })
const backToVideo = thankYouMediaToShow({ ...saved, thankYouMedia: "video" })
ok("5. Video → Testimonials → Video: the original video is intact", toTestimonials.media === "testimonials" && backToVideo.show && saved.thankYouVideoUrl === "https://youtu.be/keepme")
const s7 = thankYouMediaToShow({ thankYouMedia: "", thankYouVideoUrl: "https://youtu.be/legacy", testimonials: REAL })
ok("7. an existing agent's configured video is preserved, not overwritten", s7.media === "video" && s7.show)

// ── approved copy ───────────────────────────────────────────────────────────────────────────
console.log("\nApproved copy, shared by desktop and mobile")
ok("hero intro (with city)", buildThankYouIntro("", { firstName: "Jay", city: "San Antonio" }) === "You're one step closer to your perfect home in San Antonio! Let's find your best options.")
ok("hero intro (no city) does not invent one", buildThankYouIntro("", { firstName: "Jay", city: "" }) === "You're one step closer to your perfect home! Let's find your best options.")
ok("an agent's own intro override still wins", buildThankYouIntro("Welcome {firstName}", { firstName: "Jay", city: "Austin" }) === "Welcome Jay")

const steps = buildThankYouSteps({ agentName: "Jay Morris", brokerage: "AptAmigo Brokerage", incentive: "", showReward: "on" })
ok("step 1 wording is unchanged", steps[0].title === "Tell us what you're looking for" && steps[0].done === true)
ok("step 2 body", steps[1].body === "I'll find the best options for your budget, preferences, and move-in date.")
ok("step 3 body", steps[2].body === "I'll help coordinate your tours and answer questions along the way.")
ok("step 4 lists agent WITH brokerage", steps[3].body === "When you apply, select Realtor or Apartment Locator and list Jay Morris with AptAmigo Brokerage.")
ok("step 5 reward body", steps[4].body === "Enjoy free movers or a cash rebate when you lease with me.")

// NO FABRICATED BROKERAGE for an agent who has none.
const noBrokerage = buildThankYouSteps({ agentName: "Lisette Hernandez", brokerage: "", showReward: "on", incentive: "" })
ok("step 4 implies NO brokerage when the agent has none", noBrokerage[3].body === "When you apply, select Realtor or Apartment Locator and list Lisette Hernandez.")
ok("and never contains a dangling 'with'", !noBrokerage[3].body.includes(" with "))

// The reward step stays conditional.
ok("no reward step when the agent configured none", buildThankYouSteps({ agentName: "A", showReward: "", incentive: "" }).length === 4)
ok("reward step appears when an incentive is configured", buildThankYouSteps({ agentName: "A", showReward: "", incentive: "Free movers" }).length === 5)
ok("explicit off hides it even with an incentive", buildThankYouSteps({ agentName: "A", showReward: "off", incentive: "Free movers" }).length === 4)
ok("an agent's own reward wording is used", buildThankYouSteps({ agentName: "A", showReward: "on", incentive: "Half off your first month" })[4].body === "Half off your first month")
ok("five steps maximum", buildThankYouSteps({ agentName: "A", showReward: "on", incentive: "x" }).length === 5)
ok("the defaults object carries the new copy", THANKYOU_DEFAULTS.step3Body === "I'll help coordinate your tours and answer questions along the way.")

// ── "None" hides both, and deletes neither ──────────────────────────────────────────────────
console.log("\nNone")
const noneCfg = { thankYouMedia: "none", thankYouVideoUrl: "https://youtu.be/keepme", testimonials: REAL }
const none = thankYouMediaToShow(noneCfg)
ok("None resolves to none", none.media === "none")
ok("None shows nothing", none.show === false)
ok("None returns no testimonials to render", none.testimonials.length === 0)
ok("None does NOT touch the saved video URL", noneCfg.thankYouVideoUrl === "https://youtu.be/keepme")
ok("None does NOT touch the saved testimonials", noneCfg.testimonials.length === 3)
// Round trip: None → Video → Testimonials, same stored config, nothing lost.
ok("None → Video restores the video", thankYouMediaToShow({ ...noneCfg, thankYouMedia: "video" }).show === true)
ok("None → Testimonials restores the reviews", thankYouMediaToShow({ ...noneCfg, thankYouMedia: "testimonials" }).testimonials.length === 2)
ok("an unset page still never resolves to none", resolveThankYouMedia({}) !== "none")

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
