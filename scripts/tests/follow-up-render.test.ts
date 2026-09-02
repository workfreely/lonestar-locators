/**
 * CP3: live message rendering with workspace overrides. Proves the required
 * behavior end-to-end at the builder level (the send sites call these exact
 * builders with the workspace overrides map):
 *   1. no override → exact existing production text
 *   2. each message uses its saved override when present
 *   3. approved variables interpolate correctly
 *   4. missing variables never render "undefined"/"null"
 *   5. punctuation stays clean ("Hey {first_name}," → "Hey Sarah,")
 *   6. Text Top 3 preserves its dynamic property list exactly
 *   7. an override for one template cannot affect another
 *   8. overrides never change which message an action maps to (no workflow effect)
 *
 *   npx tsx scripts/tests/follow-up-render.test.ts
 */
import { buildIntroSmsBody, buildFollowUpSmsBody, buildTextTop3Body } from "@bc/companion-shared"

let pass = 0, fail = 0
const eq = (a: unknown, b: unknown, name: string) => {
  if (a === b) pass++
  else { fail++; console.error("✗", name, `\n   got:  ${JSON.stringify(a)}\n   want: ${JSON.stringify(b)}`) }
}
const ok = (c: boolean, name: string) => { if (c) pass++; else { fail++; console.error("✗", name) } }

// Reference = the EXACT pre-feature production strings.
const introOpts = { firstName: "Sarah", locatorFirstName: "Jay", propertyType: "Apartment", beds: "2", baths: "1", moveDate: "2026-09-15" }
const oldIntro = "Hey Sarah it's Jay! I got your form for a 2 bed move in September. Are you trying to stay near a specific address or side of town?"
const matches = [{ name: "The Millbrook", website: "https://a.com" }, { name: "Vue 22", website: "b.com" }]
const oldTextTop3 =
  "Hey Sarah, I found 3 excellent options for you!\n\n1. The Millbrook\nhttps://a.com\n\n2. Vue 22\nhttps://b.com\n\nWhich one do you like most?"

// ── 1. No override → exact existing production text ───────────────────────────
eq(buildIntroSmsBody(introOpts), oldIntro, "intro: no override → exact current text")
eq(buildIntroSmsBody(introOpts, {}), oldIntro, "intro: empty overrides → exact current text")
eq(buildFollowUpSmsBody("follow_up_1", "Sarah"), "Hey! Did you see any properties on the list that you'd like to tour?", "FU1: no override → current")
eq(buildFollowUpSmsBody("follow_up_2", "Sarah"), "Is there one that stands out or would you like me to narrow the list down a bit more?", "FU2: no override → current")
eq(buildFollowUpSmsBody("follow_up_3", "Sarah"), "I'm calling communities you were interested in to get updated pricing and specials. Are you still looking to move?", "FU3: no override → current")
eq(buildFollowUpSmsBody("final_follow_up", "Sarah"), "Hey Sarah, I haven't heard back so I'll pause your search for now. No rush, just let me know when you'd like me to pick it back up!", "Final: no override → current")
eq(buildTextTop3Body({ firstName: "Sarah", topMatches: matches }), oldTextTop3, "Text Top 3: no override → exact current text")
eq(buildTextTop3Body({ firstName: "Sarah", topMatches: matches }, {}), oldTextTop3, "Text Top 3: empty overrides → exact current text")

// ── 2. Uses saved override when present ───────────────────────────────────────
eq(buildIntroSmsBody(introOpts, { intro: "Hi {first_name}! — {agent_first_name}" }), "Hi Sarah! — Jay", "intro: uses saved override")
eq(buildFollowUpSmsBody("follow_up_1", "Sarah", { follow_up_1: "Custom nudge, {first_name}?" }), "Custom nudge, Sarah?", "FU1: uses saved override")
eq(buildFollowUpSmsBody("final_follow_up", "Sarah", { final_follow_up: "Pausing, {first_name}." }), "Pausing, Sarah.", "Final: uses saved override")

// ── 3. Approved variables interpolate (all six) ──────────────────────────────
eq(
  buildIntroSmsBody(introOpts, { intro: "{first_name}/{agent_first_name}/{move_month}/{beds}/{baths}/{property_type}" }),
  "Sarah/Jay/September/2 bed/1 bath/Apartment",
  "intro override: all six approved variables interpolate",
)
// Follow-ups can use the same variables when the send site supplies them.
eq(
  buildFollowUpSmsBody("follow_up_2", "Sarah", { follow_up_2: "{first_name} — {beds} {property_type} in {move_month}?" },
    { agentFirstName: "Jay", beds: "3+", baths: "2", propertyType: "High-Rise", moveDate: "2026-12-15" }),
  "Sarah — 3+ bed High-Rise in December?",
  "follow-up override: approved variables interpolate from send-site values",
)

// ── 4. Missing variables render "" (never undefined/null) ─────────────────────
{
  const out = buildIntroSmsBody({ firstName: "Sarah", locatorFirstName: "Jay" }, { intro: "{first_name} {beds}{baths}{property_type}{move_month} done" })
  ok(!/undefined|null/.test(out), "missing variables never render 'undefined'/'null'")
  eq(out, "Sarah done", "missing variables collapse cleanly (tidy removes the gaps)")
}

// ── 5. Punctuation stays clean ────────────────────────────────────────────────
eq(buildFollowUpSmsBody("follow_up_1", "Sarah", { follow_up_1: "Hey {first_name}, I wanted to check in." }), "Hey Sarah, I wanted to check in.", "override: 'Hey {first_name},' → 'Hey Sarah,'")
eq(buildFollowUpSmsBody("follow_up_1", "", { follow_up_1: "Hey {first_name}, I wanted to check in." }), "Hey, I wanted to check in.", "override with empty name → no space before comma")

// ── 6. Text Top 3 preserves its dynamic property list exactly ────────────────
{
  const custom = buildTextTop3Body({ firstName: "Sarah", topMatches: matches }, { text_top_3: "Top picks for {first_name}:\n\n{property_list}\n\nThoughts?" })
  eq(custom, "Top picks for Sarah:\n\n1. The Millbrook\nhttps://a.com\n\n2. Vue 22\nhttps://b.com\n\nThoughts?", "Text Top 3 override changes only wording; property list identical")
  ok(custom.includes("1. The Millbrook\nhttps://a.com"), "property #1 name+URL preserved")
  ok(custom.includes("2. Vue 22\nhttps://b.com"), "property #2 https:// normalization preserved")
}

// ── 7. One template's override cannot affect another ─────────────────────────
eq(buildIntroSmsBody(introOpts, { follow_up_1: "X", text_top_3: "Y", final_follow_up: "Z" }), oldIntro, "intro unaffected by other templates' overrides")
eq(buildFollowUpSmsBody("follow_up_1", "Sarah", { follow_up_2: "OTHER", final_follow_up: "OTHER" }), "Hey! Did you see any properties on the list that you'd like to tour?", "FU1 unaffected by FU2/Final overrides")
eq(buildTextTop3Body({ firstName: "Sarah", topMatches: matches }, { intro: "X" }), oldTextTop3, "Text Top 3 unaffected by intro override")

// ── 8. Overrides never change which message an action maps to (no workflow) ───
// The action identity → content key mapping is unchanged; an override for a
// DIFFERENT key never redirects the action, and the same title always yields the
// same message family.
eq(buildFollowUpSmsBody("FU1", "Sarah", { follow_up_2: "SHOULD NOT APPEAR" }), "Hey! Did you see any properties on the list that you'd like to tour?", "legacy title 'FU1' still maps to FU1 regardless of a FU2 override")
eq(buildFollowUpSmsBody("final", "Sarah"), buildFollowUpSmsBody("final_follow_up", "Sarah"), "legacy 'final' and action_key 'final_follow_up' resolve to the same message")
ok(buildFollowUpSmsBody("follow_up_3", "Sarah", { follow_up_3: "{first_name}" }) === "Sarah", "an override renders for its OWN key only")

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
