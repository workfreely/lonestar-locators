/**
 * THE CREATOR'S SAVED TIKTOK DECISION — and the three rules that keep replaying it honest.
 *
 *   npx tsx scripts/social/tiktokPublishSettings.test.ts
 *
 * A scheduled TikTok post publishes with nobody present. TikTok's guidelines require the creator
 * to choose privacy, interactions and disclosure themselves, so the only compliant unattended
 * post is one that REPLAYS a decision a person actually made. Three properties make that a replay
 * rather than a loophole, and they are what this file pins:
 *
 *   1. No decision, no post — nothing is ever defaulted.
 *   2. Changing the decision un-approves the post, WITHOUT invalidating its render.
 *   3. A decision that has gone stale STOPS the post; it is never quietly narrowed to fit.
 *
 * The third is the subtle one. resolveDirectPostSelection CLAMPS a disallowed interaction, which
 * is right for a human looking at a greyed-out control and wrong for a cron job, where it would
 * mean publishing something other than what was approved with nobody told.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  readSavedSettings, hasCompleteTikTokSettings, normaliseInteractions,
  disclosureToToggles, togglesToDisclosure, interactionsToDisableFlags,
  publishAffectingChanges, settingChanged, validateAgainstCreatorInfo,
  PUBLISH_AFFECTING_COLUMNS, TIKTOK_DISCLOSURES,
} from "@/lib/social/tiktokPublishSettings"
import { RENDER_AFFECTING_COLUMNS } from "@/lib/social/renderInvalidation"
import type { TikTokCreatorInfo } from "@/lib/social/tiktokPublish"

let pass = 0
let fail = 0
const ok = (label: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ✓ ${label}`) } else { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`) }
}
const eq = (label: string, a: unknown, b: unknown) =>
  ok(label, JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)}`)
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
const read = (p: string) => strip(readFileSync(join(process.cwd(), p), "utf8"))

const ROUTE = read("app/api/admin/social-autopilot/posts/[id]/route.ts")
const WORKER = read("app/api/cron/social-tiktok-publish/route.ts")
const DIALOG = read("components/crm/social/TikTokPostConfirm.tsx")
const MIGRATION = readFileSync(join(process.cwd(), "supabase/prepared/20261104000000_tiktok_publish_settings.sql"), "utf8")

const FULL = {
  tiktok_privacy_level: "SELF_ONLY",
  tiktok_allowed_interactions: ["comment"],
  tiktok_disclosure: "none",
}
const info = (over: Partial<TikTokCreatorInfo> = {}): TikTokCreatorInfo => ({
  creator_username: "u", creator_nickname: "n", creator_avatar_url: "a",
  privacy_level_options: ["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "SELF_ONLY"],
  comment_disabled: false, duet_disabled: false, stitch_disabled: false,
  max_video_post_duration_sec: 600, ...over,
})

console.log("\n=== 1. NULL IS 'NOBODY CHOSE', NOT A DEFAULT ===")
{
  ok("a complete row reads as a decision", readSavedSettings(FULL) !== null)
  eq("…with exactly what was stored", readSavedSettings(FULL), {
    privacyLevel: "SELF_ONLY", allowedInteractions: ["comment"], disclosure: "none",
  })
  // THE DISTINCTION THAT JUSTIFIES THE WHOLE COLUMN SHAPE: allowing nothing is a real choice.
  eq("an EMPTY allow-list is a decision, not an absence",
    readSavedSettings({ ...FULL, tiktok_allowed_interactions: [] })?.allowedInteractions, [])
  ok("…and is not confused with 'not chosen'",
    readSavedSettings({ ...FULL, tiktok_allowed_interactions: null }) === null)
  // ALL THREE OR NOTHING — a partial row is incomplete, not half-decided.
  for (const col of PUBLISH_AFFECTING_COLUMNS) {
    ok(`missing ${col} ⇒ no decision`, readSavedSettings({ ...FULL, [col]: null }) === null)
  }
  ok("an empty row is no decision", readSavedSettings({}) === null)
  ok("null is no decision", readSavedSettings(null) === null)
  // Garbage never becomes a decision.
  ok("an unknown privacy value is refused", readSavedSettings({ ...FULL, tiktok_privacy_level: "PUBLIC" }) === null)
  ok("an unknown disclosure value is refused", readSavedSettings({ ...FULL, tiktok_disclosure: "maybe" }) === null)
  eq("unknown interactions are dropped, not trusted", normaliseInteractions(["comment", "nope"]), ["comment"])
  eq("…and the order is canonical, so equal sets compare equal",
    normaliseInteractions(["stitch", "comment"]), ["comment", "stitch"])
  eq("a non-array is 'not chosen'", normaliseInteractions("comment"), null)
  ok("the gate helper agrees with the reader",
    hasCompleteTikTokSettings(FULL) && !hasCompleteTikTokSettings({ ...FULL, tiktok_disclosure: null }))
}

console.log("\n=== 2. THE API MAPPINGS ROUND-TRIP ===")
{
  eq("none", disclosureToToggles("none"), { yourBrand: false, brandedContent: false })
  eq("your_brand", disclosureToToggles("your_brand"), { yourBrand: true, brandedContent: false })
  eq("branded_content", disclosureToToggles("branded_content"), { yourBrand: false, brandedContent: true })
  eq("both", disclosureToToggles("both"), { yourBrand: true, brandedContent: true })
  for (const d of TIKTOK_DISCLOSURES) {
    const t = disclosureToToggles(d)
    eq(`${d} survives a round trip`, togglesToDisclosure(d !== "none", t.yourBrand, t.brandedContent), d)
  }
  // The API takes disable_*; the creator thinks in allow. The inversion is the bug-prone part.
  eq("allow comment only", interactionsToDisableFlags(["comment"]),
    { disableComment: false, disableDuet: true, disableStitch: true })
  eq("allow none", interactionsToDisableFlags([]),
    { disableComment: true, disableDuet: true, disableStitch: true })
  eq("allow all", interactionsToDisableFlags(["comment", "duet", "stitch"]),
    { disableComment: false, disableDuet: false, disableStitch: false })
}

console.log("\n=== 3. CHANGING THE DECISION UN-APPROVES — BUT DOES NOT RE-RENDER ===")
{
  eq("a no-op save changes nothing", publishAffectingChanges(FULL, { tiktok_privacy_level: "SELF_ONLY" }), [])
  eq("a real privacy change is detected",
    publishAffectingChanges(FULL, { tiktok_privacy_level: "PUBLIC_TO_EVERYONE" }), ["tiktok_privacy_level"])
  eq("a reordered allow-list is NOT a change",
    publishAffectingChanges({ ...FULL, tiktok_allowed_interactions: ["comment", "duet"] },
      { tiktok_allowed_interactions: ["duet", "comment"] }), [])
  eq("a genuinely different allow-list is",
    publishAffectingChanges(FULL, { tiktok_allowed_interactions: ["duet"] }), ["tiktok_allowed_interactions"])
  eq("clearing a decision is a change",
    publishAffectingChanges(FULL, { tiktok_privacy_level: null }), ["tiktok_privacy_level"])
  eq("a column absent from the patch is not a change", publishAffectingChanges(FULL, { caption: "x" }), [])
  ok("empty string normalises to null, as the render comparator does", !settingChanged(null, "   "))

  // THE ASYMMETRY. These two sets must not overlap, or a privacy change would discard a good MP4.
  const overlap = PUBLISH_AFFECTING_COLUMNS.filter((c) => (RENDER_AFFECTING_COLUMNS as readonly string[]).includes(c))
  eq("no publish-affecting column is also render-affecting", overlap, [])
  ok("the route clears approved_at on a publish change",
    /const publishChanged = publishAffectingChanges\(stored, patch\)\s*\n\s*if \(publishChanged\.length > 0\) \{\s*\n\s*patch\.approved_at = null/.test(ROUTE))
  // Proven by absence: the block must not touch render_status.
  const block = ROUTE.slice(ROUTE.indexOf("const publishChanged"), ROUTE.indexOf("let approvedNow"))
  ok("…and does NOT touch render_status", !block.includes("render_status"))
  ok("it runs BEFORE the approval block, so one request cannot approve what it changed",
    ROUTE.indexOf("const publishChanged") < ROUTE.indexOf('if ("approved" in body)'))
  ok("the database enforces the same rule", /new\.tiktok_privacy_level\s+is distinct from old\.tiktok_privacy_level/.test(MIGRATION))
  ok("…and the trigger leaves render_status alone",
    !MIGRATION.slice(MIGRATION.indexOf("unapprove_on_settings_change")).includes("render_status"))
  ok("…and preserves an explicit re-approval in the same update",
    /new\.approved_at is not distinct from old\.approved_at/.test(MIGRATION))
}

console.log("\n=== 4. A STALE DECISION STOPS THE POST — IT IS NEVER NARROWED ===")
{
  const saved = { privacyLevel: "SELF_ONLY" as const, allowedInteractions: ["comment" as const], disclosure: "none" as const }
  ok("a still-valid decision passes", validateAgainstCreatorInfo(saved, info(), { unaudited: true }).ok)

  const gone = validateAgainstCreatorInfo(
    { ...saved, privacyLevel: "FOLLOWER_OF_CREATOR" }, info(), { unaudited: false })
  ok("a privacy level no longer offered is refused", !gone.ok)
  eq("…with a reason the creator can act on", gone.ok ? null : gone.reason, "privacy_no_longer_offered")

  // THE CLAMP THAT MUST NOT HAPPEN. The creator approved "comments allowed"; TikTok now says no.
  const clamped = validateAgainstCreatorInfo(saved, info({ comment_disabled: true }), { unaudited: true })
  ok("an interaction the creator has since disabled STOPS the post", !clamped.ok)
  eq("…rather than being silently turned off", clamped.ok ? null : clamped.reason, "interaction_no_longer_permitted")
  ok("…and the message names what changed", !clamped.ok && clamped.detail.includes("comments"))

  const pub = validateAgainstCreatorInfo({ ...saved, privacyLevel: "PUBLIC_TO_EVERYONE" }, info(), { unaudited: true })
  ok("an unaudited client still cannot publish publicly", !pub.ok)
  eq("…with the audit reason", pub.ok ? null : pub.reason, "unaudited_requires_self_only")

  const branded = validateAgainstCreatorInfo({ ...saved, disclosure: "branded_content" }, info(), { unaudited: true })
  ok("branded content on a private post is refused", !branded.ok)
}

console.log("\n=== 5. THE WORKER REPLAYS, AND NEVER INVENTS ===")
{
  ok("it reads the saved decision", /const saved = readSavedSettings\(row\)/.test(WORKER))
  ok("no decision ⇒ the post is sent for review, not published",
    /if \(!saved\) \{[\s\S]{0,200}markFailed\(postId, "no saved TikTok publishing settings/.test(WORKER))
  // Anchored inside the publish loop, not on the import list where both names also appear.
  const loop = WORKER.slice(WORKER.indexOf("const saved = readSavedSettings(row)"))
  ok("Creator Info is fetched before validating",
    loop.indexOf("await fetchTikTokCreatorInfo(") < loop.indexOf("validateAgainstCreatorInfo(") &&
    loop.indexOf("await fetchTikTokCreatorInfo(") > 0)
  ok("a stale decision stops the post", /if \(!check\.ok\) \{[\s\S]{0,160}markFailed\(postId, check\.detail\)/.test(WORKER))
  ok("the privacy sent is the SAVED one", /privacyLevel: saved\.privacyLevel/.test(WORKER))
  ok("the interactions sent come from the saved allow-list", /interactionsToDisableFlags\(saved\.allowedInteractions\)/.test(WORKER))
  ok("the disclosure sent is the saved one", /saved\.disclosure !== "none"/.test(WORKER))
  // The old hardcoded values must be gone.
  ok("no hardcoded SELF_ONLY selection remains",
    !/privacyLevel: "SELF_ONLY", disableComment: true/.test(WORKER))
  ok("no hardcoded 'declare nothing' disclosure remains",
    !/\{ on: false, yourBrand: false, brandedContent: false \}/.test(WORKER))
  ok("the saved decision still passes through the one rules function",
    /resolveDirectPostSelection\(\s*\n\s*info,/.test(WORKER))
}

console.log("\n=== 6. SCHEDULING REFUSES A POST WITH NO DECISION ===")
{
  ok("the gate exists", /error: "tiktok_settings_required"/.test(ROUTE))
  ok("…only for TikTok posts", /destNow === "tiktok_video"/.test(ROUTE))
  ok("…reading fresh, merged with this request's own patch", /if \(col in patch\) merged\[col\] = patch\[col\]/.test(ROUTE))
  ok("…and it uses the same completeness rule as the worker", /hasCompleteTikTokSettings\(merged\)/.test(ROUTE))
  ok("the existing approval gate is still there",
    /error: "not_approved"/.test(ROUTE) && /This post has not been approved/.test(ROUTE))
  ok("the settings gate runs BEFORE the post is marked scheduled",
    ROUTE.indexOf("tiktok_settings_required") < ROUTE.indexOf('patch.status = "scheduled"'))
}

console.log("\n=== 7. ONE SET OF CONTROLS — THE DIALOG SAVES WHAT IT COLLECTS ===")
{
  ok("the dialog has a Save for Scheduling action", /Save for Scheduling/.test(DIALOG))
  ok("…gated by the SAME validation as Post", /if \(postBlocked \|\| savingSettings\) return/.test(DIALOG))
  ok("…and the button is disabled by it too", /disabled=\{savingSettings \|\| postBlocked\}/.test(DIALOG))
  ok("it saves all three choices together", /tiktokSettings: \{ privacyLevel: privacy, allowedInteractions, disclosure \}/.test(DIALOG))
  ok("the creator is told re-approval is needed", /needs to be approved again before it can be scheduled/.test(DIALOG))
  ok("…and that the video is unaffected", /no re-render is needed/.test(DIALOG))
  // No second settings UI anywhere.
  ok("no separate settings screen was created",
    !/TikTokSettings(Panel|Modal|Editor|Form)/.test(readFileSync(join(process.cwd(), "components/crm/social/TikTokPostConfirm.tsx"), "utf8")))
}

console.log("\n=== 8. STILL GATED, STILL UNAPPLIED, STILL INSTAGRAM-SAFE ===")
{
  ok("the migration is prepared, not applied", /PREPARED, NOT APPLIED/.test(MIGRATION))
  ok("…and warns about its own self-transacting hazard", /SELF-TRANSACTING/.test(MIGRATION))
  ok("all three columns are nullable (no NOT NULL)", !/add column if not exists tiktok_\w+\s+\w+(\[\])? not null/i.test(MIGRATION))
  ok("legal values are constrained in the database", (MIGRATION.match(/add constraint social_posts_tiktok/g) ?? []).length === 4)
  ok("all-three-or-none is enforced", /social_posts_tiktok_settings_complete_chk/.test(MIGRATION))
  ok("the worker is still disarmed by default", /SOCIAL_TIKTOK_AUTOPUBLISH_ENABLED/.test(read("lib/social/tiktokGate.ts")))
  ok("unaudited still forces SELF_ONLY", /const UNAUDITED = true/.test(WORKER))
  ok("no cron entry was added", !readFileSync(join(process.cwd(), "vercel.json"), "utf8").includes("social-tiktok-publish"))
  // Instagram's own invalidation is untouched.
  ok("render invalidation still governs the Instagram path", /const changed = renderAffectingChanges\(stored, patch\)/.test(ROUTE))
  ok("…and still clears render_status", /if \(changed\.length > 0\) \{\s*\n\s*patch\.render_status = "none"/.test(ROUTE))
}

console.log(fail === 0 ? `\nALL PASS ✅ (${pass} passed, ${fail} failed)\n` : `\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
