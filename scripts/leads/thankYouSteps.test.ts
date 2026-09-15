// Thank-you page step flow — dynamic apply step + conditional reward step. Run:
//   npx tsx scripts/leads/thankYouSteps.test.ts
import { buildThankYouSteps } from "@/lib/smartForm/thankYouSteps"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }

console.log("Base flow (no incentive) = 4 steps, step 1 completed:")
const base = buildThankYouSteps({ agentName: "Dana Reyes", brokerage: "Hill Country Living" })
ok("4 steps", base.length === 4)
ok("step 1 is completed", base[0].done === true && base[0].title === "Tell us what you're looking for")
ok("step 2 is the personalized-list value prop", base[1].title === "Get your personalized apartment list")
ok("step 3 is touring", base[2].title === "Tour your favorites")
ok("step 4 is the apply step", base[3].title === "Apply with your locator listed")

console.log("\nStep 4 apply copy is DYNAMIC (agent + brokerage, nothing hardcoded):")
ok("names the given agent + brokerage", base[3].body.includes("Dana Reyes") && base[3].body.includes("Hill Country Living"))
const other = buildThankYouSteps({ agentName: "Morgan Lee", brokerage: "Peachtree Rentals" })
ok("names a DIFFERENT agent + brokerage for a different workspace", other[3].body.includes("Morgan Lee") && other[3].body.includes("Peachtree Rentals"))
ok("never contains Jay / AptAmigo / ReLIVe / Lone Star", !/Jay Morris|AptAmigo|ReLIVe|Relive|Lone Star/i.test(JSON.stringify(base) + JSON.stringify(other)))
ok("brokerage omitted gracefully when missing", buildThankYouSteps({ agentName: "Sam Carter", brokerage: "" })[3].body.includes("Sam Carter") && !buildThankYouSteps({ agentName: "Sam Carter", brokerage: "" })[3].body.includes(" with "))
ok("missing agent falls back to 'your locator'", buildThankYouSteps({ agentName: "" })[3].body.includes("your locator"))

console.log("\nApply-instruction override wins when configured:")
const overridden = buildThankYouSteps({ agentName: "Dana Reyes", brokerage: "Hill Country Living", applyInstructions: "List me as your agent: Dana, license #123." })
ok("uses the override text verbatim", overridden[3].body === "List me as your agent: Dana, license #123.")

console.log("\nStep 5 reward is CONDITIONAL on a configured incentive:")
const noReward = buildThankYouSteps({ agentName: "Dana Reyes", brokerage: "Hill Country Living", incentive: "" })
ok("no incentive → no reward step (still 4)", noReward.length === 4)
const withReward = buildThankYouSteps({ agentName: "Dana Reyes", brokerage: "Hill Country Living", incentive: "a $200 rebate" })
ok("incentive set → 5 steps", withReward.length === 5)
ok("reward step titled correctly", withReward[4].title === "Move in and get rewarded")
ok("reward copy interpolates the configured incentive", withReward[4].body === "After you move in and your lease is confirmed, you'll receive a $200 rebate.")
ok("whitespace-only incentive → omitted", buildThankYouSteps({ agentName: "Dana Reyes", incentive: "   " }).length === 4)

console.log("\nNo overpromising language in the default copy:")
const blob = JSON.stringify(base)
ok("no 'guaranteed'", !/guarantee/i.test(blob))
ok("no '24 hours' promise", !/24 hours/i.test(blob))
ok("uses 'current pricing / specials' framing", withReward[1].body.includes("current pricing") && withReward[1].body.includes("specials"))

console.log(`\nThank-you steps unit: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
