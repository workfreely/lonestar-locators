/**
 * TIKTOK CONTENT POSTING API — the UX rules the audit actually checks.
 *
 *   npx tsx scripts/social/tiktokCompliance.test.ts
 *
 * These are not our preferences. Each assertion below mirrors a line in TikTok's Content Sharing
 * Guidelines, and failing one is an audit rejection rather than a bug report.
 *
 * WHY THIS FILE EXISTS. Every one of these rules was already satisfied in September. On
 * 2026-10-13 a commit titled "sensible defaults in the publish dialog" turned the commercial
 * disclosure ON with "Your brand" pre-ticked and pre-checked Allow Comment. The reasoning was
 * sound — every video we post does promote the locating service — but the guidelines require the
 * CREATOR to declare it, so a pre-made declaration is not a declaration. Nothing caught it,
 * because nothing was watching. These assertions are the thing watching.
 *
 * Source: https://developers.tiktok.com/doc/content-sharing-guidelines
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  resolveDirectPostSelection,
  resolveContentDisclosure,
  tiktokConsentText,
  withinCreatorDuration,
  mp4DurationSeconds,
  type TikTokCreatorInfo,
} from "@/lib/social/tiktokPublish"

let pass = 0
let fail = 0
const ok = (label: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  ✓ ${label}`) } else { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`) }
}
const eq = (label: string, a: unknown, b: unknown) =>
  ok(label, JSON.stringify(a) === JSON.stringify(b), `got ${JSON.stringify(a)}`)
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
const read = (p: string) => strip(readFileSync(join(process.cwd(), p), "utf8"))

const UI = read("components/crm/social/TikTokPostConfirm.tsx")
const ROUTE = read("app/api/integrations/tiktok/publish/route.ts")

const INFO: TikTokCreatorInfo = {
  creator_username: "locatorbeast", creator_nickname: "Jay | TX Apartment Locator",
  creator_avatar_url: "https://example/a.jpg",
  privacy_level_options: ["PUBLIC_TO_EVERYONE", "MUTUAL_FOLLOW_FRIENDS", "SELF_ONLY"],
  comment_disabled: false, duet_disabled: false, stitch_disabled: false,
  max_video_post_duration_sec: 600,
}

console.log("\n=== 1. NOTHING IS PRE-SELECTED FOR THE CREATOR ===")
{
  // "Users must manually select the privacy status … there should be no default value."
  ok("privacy starts empty", /useState<string>\(""\)/.test(UI))
  ok("…and is re-cleared for each new post", /setPrivacy\(""\)/.test(UI))
  ok("posting is blocked until a privacy level is chosen", /postBlocked = .*!privacy/.test(UI))

  // "Users must manually turn on these interaction settings and none should be checked by default."
  for (const [name, decl] of [["comment", "allowComment"], ["duet", "allowDuet"], ["stitch", "allowStitch"]] as const) {
    ok(`${name} starts off`, new RegExp(`const \\[${decl}, set\\w+\\] = useState\\(false\\)`).test(UI))
  }
  ok("…and all three are re-set to off for each new post",
    /setAllowComment\(false\)\s*\n\s*setAllowDuet\(false\)\s*\n\s*setAllowStitch\(false\)/.test(UI))
  // The specific regression: Allow Comment used to follow the creator's capability instead.
  ok("comment is NOT pre-checked from the capability", !/setAllowComment\(!d\.capabilities\.commentDisabled\)/.test(UI))

  // "the feature is turned off by default"
  ok("content disclosure starts off", /const \[disclosureOn, setDisclosureOn\] = useState\(false\)/.test(UI))
  ok("neither disclosure box starts ticked",
    /const \[yourBrand, setYourBrand\] = useState\(false\)/.test(UI) &&
    /const \[brandedContent, setBrandedContent\] = useState\(false\)/.test(UI))
  ok("…and a new post resets all three to off",
    /setDisclosureOn\(false\); setYourBrand\(false\); setBrandedContent\(false\)/.test(UI))
}

console.log("\n=== 2. A CREATOR-DISABLED CAPABILITY STILL WINS ===")
{
  // Defaulting to off must not mean we let someone ENABLE what TikTok says is unavailable.
  const locked: TikTokCreatorInfo = { ...INFO, comment_disabled: true, duet_disabled: true, stitch_disabled: true }
  const r = resolveDirectPostSelection(locked,
    { privacyLevel: "SELF_ONLY", disableComment: false, disableDuet: false, disableStitch: false },
    { unaudited: true })
  eq("a requested enable is clamped to disabled", [r.disableComment, r.disableDuet, r.disableStitch], [true, true, true])
  ok("the UI greys out a creator-disabled interaction", /Comments off \(creator setting\)/.test(UI))
  ok("…and a reopen re-clamps comments", /else if \(d\.capabilities\.commentDisabled\)/.test(UI))
}

console.log("\n=== 3. THE DISCLOSURE RULES ===")
{
  eq("off → both toggles false", resolveContentDisclosure({ on: false, yourBrand: false, brandedContent: false }, "SELF_ONLY"),
    { brandOrganicToggle: false, brandContentToggle: false })
  // "at least one of the options above must be chosen to proceed with publishing"
  let threw = false
  try { resolveContentDisclosure({ on: true, yourBrand: false, brandedContent: false }, "PUBLIC_TO_EVERYONE") } catch { threw = true }
  ok("on with neither box is refused server-side", threw)
  ok("…and the button is disabled for it in the UI", /disclosureIncomplete = disclosureOn && !yourBrand && !brandedContent/.test(UI))
  ok("…with TikTok's exact hover wording",
    UI.includes("You need to indicate if your content promotes yourself, a third party, or both."))
  ok("Your Brand prompts the Promotional content label", /labeled as &quot;Promotional content/.test(UI))
  ok("Branded Content prompts the Paid partnership label", /labeled as &quot;Paid partnership/.test(UI))

  // "Branded content can only be configured with public or friends visibility."
  let blocked = false
  try { resolveContentDisclosure({ on: true, yourBrand: false, brandedContent: true }, "SELF_ONLY") } catch { blocked = true }
  ok("branded content is refused on a private post", blocked)
  ok("…and the checkbox is disabled under SELF_ONLY", /brandedContentBlocked = privacy === "SELF_ONLY"/.test(UI))
  ok("…with TikTok's exact explanation",
    UI.includes("Branded content visibility cannot be set to private."))
}

console.log("\n=== 4. THE CONSENT DECLARATION, AND ITS LINKS ===")
{
  eq("default wording", tiktokConsentText(false), "By posting, you agree to TikTok's Music Usage Confirmation.")
  eq("branded wording", tiktokConsentText(true),
    "By posting, you agree to TikTok's Branded Content Policy and Music Usage Confirmation.")
  // The guidelines require the policy names to be LINKED to their pages.
  ok("Music Usage Confirmation is a link", /MUSIC_USAGE_CONFIRMATION_URL = "https:\/\/www\.tiktok\.com\/legal\//.test(UI))
  ok("Branded Content Policy is a link", /BRANDED_CONTENT_POLICY_URL = "https:\/\/www\.tiktok\.com\/legal\//.test(UI))
  ok("both open safely in a new tab", (UI.match(/rel="noreferrer noopener"/g) ?? []).length >= 2)
  ok("the branded link appears only when branded content is selected", /\{brandedContent && \(/.test(UI))
  // Anchored on the BUTTON ELEMENT, not the label: "Post to TikTok" is also the modal's <h2>,
  // which sits above the declaration, so a plain string search compares the wrong two things.
  const postButton = UI.indexOf("onClick={() => void doPost()}")
  const declaration = UI.indexOf("By posting, you agree")
  ok("the declaration sits immediately above the Post button",
    declaration > 0 && postButton > declaration, `declaration@${declaration} button@${postButton}`)
  // Cancel legitimately sits between them in the actions row. What must NOT intervene is any
  // control that changes the post, which would mean the creator agreed and then altered it.
  const between = UI.slice(declaration, postButton)
  ok("…with no setting control between the declaration and the button",
    !/<input|<select|<textarea/.test(between), between.slice(0, 120))
}

console.log("\n=== 5. THE VIDEO IS CHECKED AGAINST THIS CREATOR'S LIMIT ===")
{
  ok("within the limit passes", withinCreatorDuration(45, 600))
  ok("exactly at the limit passes", withinCreatorDuration(600, 600))
  ok("over the limit fails", !withinCreatorDuration(601, 600))
  // An unreadable header must not block a video TikTok would accept.
  ok("an unknown duration is allowed through", withinCreatorDuration(null, 600))
  ok("a nonsense limit is ignored rather than blocking everything", withinCreatorDuration(45, 0))

  // The parser reads a real MP4 header: a minimal moov/mvhd with timescale 1000, duration 12000.
  const buf = new ArrayBuffer(8 + 8 + 108)
  const v = new DataView(buf)
  const tag = (off: number, s: string) => [...s].forEach((c, i) => v.setUint8(off + i, c.charCodeAt(0)))
  v.setUint32(0, 8 + 8 + 108); tag(4, "moov")
  v.setUint32(8, 8 + 108); tag(12, "mvhd")
  v.setUint8(16, 0)                 // version 0
  v.setUint32(16 + 4 + 8, 1000)     // timescale
  v.setUint32(16 + 4 + 12, 12000)   // duration
  eq("the MP4 header is read correctly", mp4DurationSeconds(buf), 12)
  eq("a non-MP4 buffer yields null", mp4DurationSeconds(new ArrayBuffer(32)), null)

  ok("the route reads the duration from the bytes it uploads", /mp4DurationSeconds\(bytes\)/.test(ROUTE))
  ok("…against the creator's own value, never a constant",
    /withinCreatorDuration\(durationSeconds, info\.max_video_post_duration_sec\)/.test(ROUTE))
  ok("the real post is refused when too long", /error: "video_too_long"/.test(ROUTE))
  ok("the dry run reports both numbers so the dialog can show them", /durationSeconds,\s*\n\s*durationOk,/.test(ROUTE))
  ok("the dialog disables Post when too long", /postBlocked = .*\|\| tooLong/.test(UI))
}

console.log("\n=== 6. THE UNAUDITED CLIENT RESTRICTION ===")
{
  let threw = false
  try {
    resolveDirectPostSelection(INFO, { privacyLevel: "PUBLIC_TO_EVERYONE" }, { unaudited: true })
  } catch (e) { threw = (e as Error).message === "unaudited_client_can_only_post_to_private_accounts" }
  ok("an unaudited client cannot post publicly", threw)
  const selfOnly = resolveDirectPostSelection(INFO, { privacyLevel: "SELF_ONLY" }, { unaudited: true })
  eq("…but SELF_ONLY is accepted", selfOnly.privacyLevel, "SELF_ONLY")
  // A privacy level TikTok did not offer this creator is refused whatever the audit state.
  let unoffered = false
  try { resolveDirectPostSelection(INFO, { privacyLevel: "FOLLOWER_OF_CREATOR" }, { unaudited: false }) } catch { unoffered = true }
  ok("a privacy level creator_info did not offer is refused", unoffered)
  ok("the UI flag is a single constant", /const UNAUDITED = true/.test(ROUTE))
}

console.log("\n=== 7. THE INTERFACE SHOWS WHAT THE GUIDELINES REQUIRE ===")
{
  // "The upload page must display the creator's nickname"
  ok("the creator's nickname is displayed", /\{data\.creator\.nickname\}/.test(UI))
  ok("…with the handle and avatar", /@\{data\.creator\.username\}/.test(UI) && /data\.creator\.avatarUrl/.test(UI))
  // "Retrieve the latest creator info when rendering the Post to TikTok page."
  ok("creator info is fetched on every open", /useEffect\(\(\) => \{[\s\S]{0,120}void load\(\)/.test(UI))
  ok("privacy options come only from creator_info", /data\.capabilities\.privacyLevelOptions\.map/.test(UI))
  ok("the exact caption that will be posted is shown", /value=\{data\.title\}/.test(UI))
  ok("posting status is reported back", /Status: <span className="font-semibold">\{result\.status\}/.test(UI))
  ok("…with the publish id", /publish_id: \{result\.publishId\}/.test(UI))
  ok("…and a way to re-check it", /Check status/.test(UI))
  ok("the transfer method is stated", /\{data\.transferMethod\}/.test(UI))
}

console.log("\n=== 8. NOTHING FROM THE PUBLISH PATH IS PERSISTED (yet) ===")
{
  // Stated as a FACT for the audit answer, not an aspiration: if this ever changes, the
  // database-fields answer submitted to TikTok becomes wrong and must be updated with it.
  for (const f of ["app/api/integrations/tiktok/publish/route.ts",
                   "app/api/integrations/tiktok/publish/status/route.ts",
                   "app/api/integrations/tiktok/creator-info/route.ts"]) {
    const src = read(f)
    const writes = /\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/.test(src)
    ok(`${f.split("/").slice(-2).join("/")} writes nothing`, !writes)
  }
}

console.log(fail === 0 ? `\nALL PASS ✅ (${pass} passed, ${fail} failed)\n` : `\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
