// Thank-you page step flow + intro — editable overrides, dynamic apply step,
// conditional reward. Run: npx tsx scripts/leads/thankYouSteps.test.ts
import { buildThankYouSteps, buildThankYouIntro, shouldShowReward, THANKYOU_DEFAULTS } from "@/lib/smartForm/thankYouSteps"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }

console.log("Base flow (no overrides, no reward) = 4 steps, step 1 completed:")
const base = buildThankYouSteps({ agentName: "Dana Reyes", brokerage: "Hill Country Living" })
ok("4 steps", base.length === 4)
ok("step 1 completed + standardized", base[0].done === true && base[0].title === THANKYOU_DEFAULTS.step1Title)
ok("step 2 default title", base[1].title === "Get your personalized apartment list")
ok("step 3 default title", base[2].title === "Tour your favorites")
ok("step 4 default title", base[3].title === "List your locator when you apply")

console.log("\nStep overrides win when provided:")
const ov = buildThankYouSteps({ agentName: "Dana Reyes", step2Title: "Custom 2", step2Body: "Body 2", step3Title: "Custom 3", step4Title: "Custom 4" })
ok("step2 title override", ov[1].title === "Custom 2" && ov[1].body === "Body 2")
ok("step3 title override", ov[2].title === "Custom 3")
ok("step4 title override", ov[3].title === "Custom 4")
ok("blank override falls back to default", buildThankYouSteps({ agentName: "Dana Reyes", step2Title: "   " })[1].title === "Get your personalized apartment list")

console.log("\nStep 4 apply body is DYNAMIC (agent + brokerage), overridable, nothing hardcoded:")
ok("names the given agent + brokerage", base[3].body.includes("Dana Reyes") && base[3].body.includes("Hill Country Living"))
const other = buildThankYouSteps({ agentName: "Morgan Lee", brokerage: "Peachtree Rentals" })
ok("different workspace → different names", other[3].body.includes("Morgan Lee") && other[3].body.includes("Peachtree Rentals"))
ok("never Jay/AptAmigo/ReLIVe/Lone Star", !/Jay Morris|AptAmigo|ReLIVe|Relive|Lone Star/i.test(JSON.stringify(base) + JSON.stringify(other)))
ok("apply-instruction override wins", buildThankYouSteps({ agentName: "Dana Reyes", applyInstructions: "List me as Dana." })[3].body === "List me as Dana.")
ok("missing agent → 'your locator'", buildThankYouSteps({ agentName: "" })[3].body.includes("your locator"))

console.log("\nReward step toggle (three-state) + description reuse:")
ok('showReward "" + no incentive → hidden', shouldShowReward("", "") === false && buildThankYouSteps({ agentName: "D", showReward: "", incentive: "" }).length === 4)
ok('showReward "" + incentive set → shown (auto)', shouldShowReward("", "a $200 rebate") === true)
ok('showReward "on" → shown even with blank incentive (uses default body)', shouldShowReward("on", "") === true)
ok('showReward "off" → hidden even WITH incentive', shouldShowReward("off", "a $200 rebate") === false)
const withReward = buildThankYouSteps({ agentName: "D", showReward: "on", rewardTitle: "", incentive: "a $200 rebate" })
ok("reward is step 5", withReward.length === 5)
ok("reward default title", withReward[4].title === "Move in and get rewarded")
ok("reward description = the configured reward text", withReward[4].body === "a $200 rebate")
ok("reward on + blank description → default body", buildThankYouSteps({ agentName: "D", showReward: "on", incentive: "" })[4].body === THANKYOU_DEFAULTS.rewardBody)
ok("custom reward title wins", buildThankYouSteps({ agentName: "D", showReward: "on", rewardTitle: "Get $500 back", incentive: "x" })[4].title === "Get $500 back")

console.log("\nIntro builder — variables + city fallback + override:")
ok("default intro (with city) substitutes {city}", buildThankYouIntro("", { firstName: "Jerry", city: "San Antonio" }).includes("in San Antonio"))
ok("default intro (no city) omits the 'home in {city}' clause", !buildThankYouIntro("", { firstName: "Jerry", city: "" }).includes("{city}") && !buildThankYouIntro("", { firstName: "Jerry", city: "" }).includes("home in"))
ok("override substitutes {firstName} and {city}", buildThankYouIntro("Hi {firstName}, welcome to {city}!", { firstName: "Alex", city: "Dallas" }) === "Hi Alex, welcome to Dallas!")
ok("override with missing firstName → 'there'", buildThankYouIntro("Hi {firstName}!", { firstName: "", city: "" }) === "Hi there!")
ok("override with missing city → 'your area'", buildThankYouIntro("Search in {city}.", { firstName: "", city: "" }) === "Search in your area.")

console.log("\nNo overpromising in defaults:")
ok("no 'guaranteed'", !/guarantee/i.test(JSON.stringify(base)))
ok("no '24 hours'", !/24 hours/i.test(JSON.stringify(base) + buildThankYouIntro("", { city: "Austin" })))
ok("uses current pricing / specials framing", base[1].body.includes("current pricing") && base[1].body.includes("specials"))

console.log(`\nThank-you steps unit: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
