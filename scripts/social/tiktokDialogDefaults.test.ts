// TIKTOK PUBLISH DIALOG — the initial defaults, and what they must never override.
//
// Three defaults changed for the Sandbox confirmation dialog:
//   • Content Disclosure ON with "Your brand" selected. Every video Social Beast posts promotes
//     the locating service itself, which is what TikTok's own-brand disclosure describes; the
//     published post is labelled "Promotional content" as a result.
//   • "Branded content" stays OFF. It means a paid third-party promotion, which these are not —
//     and TikTok forbids it outright on a SELF_ONLY post.
//   • "Allow comments" ON, because the CTA burned into every one of these videos is
//     Comment "LIST". A default that silenced it was working against the content.
//
// THEY ARE DEFAULTS, NOT SETTINGS. Two properties carry that, and both are asserted here against
// the real server resolvers rather than against a copy of their rules:
//   1. Creator Info wins. resolveDirectPostSelection clamps an enable request for a creator who
//      has the interaction disabled, so no client default can turn comments on for an account
//      TikTok says cannot have them.
//   2. The operator wins. The dialog applies defaults once per post, so closing and reopening it
//      no longer discards choices already made.
//
// Pure: the resolvers are exercised directly, and the dialog's own behaviour is asserted against
// its source. No network, no TikTok API, no publishing.
// Run: npx tsx scripts/social/tiktokDialogDefaults.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"
import { resolveDirectPostSelection, resolveContentDisclosure, tiktokConsentText, type TikTokCreatorInfo } from "@/lib/social/tiktokPublish"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}${d ? ` — ${d}` : ""}`) }
}
const dialog = readFileSync(path.join(process.cwd(), "components/crm/social/TikTokPostConfirm.tsx"), "utf8")

const creator = (over: Partial<TikTokCreatorInfo> = {}): TikTokCreatorInfo => ({
  creator_username: "jay", creator_nickname: "Jay", creator_avatar_url: "",
  privacy_level_options: ["SELF_ONLY"],
  comment_disabled: false, duet_disabled: false, stitch_disabled: false,
  max_video_post_duration_sec: 600,
  ...over,
} as TikTokCreatorInfo)

console.log("1. THE DEFAULT SELECTION IS VALID AT THE SERVER (disclosure on + your brand):")
{
  const d = resolveContentDisclosure({ on: true, yourBrand: true, brandedContent: false }, "SELF_ONLY")
  ok("your-brand disclosure is accepted on a SELF_ONLY post", d.brandOrganicToggle === true && d.brandContentToggle === false)
  ok("branded content stays off in the outgoing payload", d.brandContentToggle === false)
  ok("the consent line stays the plain Music Usage one", tiktokConsentText(false) === "By posting, you agree to TikTok's Music Usage Confirmation.")

  // The pair has to be set together: disclosure on with neither box ticked is refused.
  let threw = false
  try { resolveContentDisclosure({ on: true, yourBrand: false, brandedContent: false }, "SELF_ONLY") } catch { threw = true }
  ok("disclosure ON with nothing selected is refused (so the defaults must be set together)", threw)

  // Branded content remains impossible on a private post, default or not.
  let threw2 = false
  try { resolveContentDisclosure({ on: true, yourBrand: true, brandedContent: true }, "SELF_ONLY") } catch { threw2 = true }
  ok("branded content on SELF_ONLY is still refused", threw2)
}

console.log("\n2. ALLOW COMMENTS IS A DEFAULT, NOT AN OVERRIDE:")
{
  // The EXACT payload the dialog sends with the new defaults: allowComment true, duet/stitch false
  // (the dialog always sends all three explicitly — `disableX: !allowX`).
  const defaultPayload = { privacyLevel: "SELF_ONLY" as const, disableComment: false, disableDuet: true, disableStitch: true }
  const enabled = resolveDirectPostSelection(creator(), defaultPayload, { unaudited: true })
  ok("a normal creator gets comments enabled", enabled.disableComment === false)

  // THE IMPORTANT ONE: the client asks to enable, the creator cannot.
  const restricted = resolveDirectPostSelection(creator({ comment_disabled: true }), defaultPayload, { unaudited: true })
  ok("a creator with comments disabled stays disabled even when the client asks to enable", restricted.disableComment === true)

  ok("duet and stitch are still disabled by the default payload", enabled.disableDuet === true && enabled.disableStitch === true)
  // Worth pinning: the resolver treats an OMITTED flag as "enable" (!!undefined === false), so the
  // dialog sending all three explicitly is what keeps duet/stitch off — not a resolver default.
  ok("an omitted flag would mean ENABLED, which is why the dialog always sends all three",
    resolveDirectPostSelection(creator(), { privacyLevel: "SELF_ONLY" }, { unaudited: true }).disableDuet === false)
  ok("a restricted duet/stitch creator is clamped too",
    resolveDirectPostSelection(creator({ duet_disabled: true, stitch_disabled: true }), { privacyLevel: "SELF_ONLY", disableDuet: false, disableStitch: false }, { unaudited: true }).disableDuet === true)

  // The unaudited SELF_ONLY restriction is untouched by any of this.
  let threw = false
  try { resolveDirectPostSelection(creator({ privacy_level_options: ["SELF_ONLY", "PUBLIC_TO_EVERYONE"] }), { privacyLevel: "PUBLIC_TO_EVERYONE" }, { unaudited: true }) } catch { threw = true }
  ok("an unaudited client still cannot post anything but SELF_ONLY", threw)
}

console.log("\n3. THE DIALOG APPLIES THE DEFAULTS, AND APPLIES THEM ONCE:")
{
  ok("disclosure + your brand default ON together", /setDisclosureOn\(true\); setYourBrand\(true\); setBrandedContent\(false\)/.test(dialog))
  ok("comments default from the CAPABILITY, not a literal true", /setAllowComment\(!d\.capabilities\.commentDisabled\)/.test(dialog))
  ok("duet and stitch still default off", /setAllowDuet\(false\)\s*\n\s*setAllowStitch\(false\)/.test(dialog))
  ok("privacy is still never pre-selected", /setPrivacy\(""\)/.test(dialog) && !/setPrivacy\("SELF_ONLY"\)/.test(dialog))

  ok("defaults are gated on a first initialisation for this post", /const firstForThisPost = initialisedFor\.current !== postId/.test(dialog))
  ok("…and the gate wraps the reset, so a reopen does not clear choices", /if \(firstForThisPost\) \{ setPrivacy\(""\)/.test(dialog))
  ok("…and wraps the interaction defaults too", /if \(firstForThisPost\) \{[\s\S]{0,400}setAllowComment\(!d\.capabilities\.commentDisabled\)/.test(dialog))
  ok("the marker is set after initialising", /initialisedFor\.current = postId/.test(dialog))
  ok("a reopen still re-clamps comments if the creator has since disabled them",
    /else if \(d\.capabilities\.commentDisabled\) \{[\s\S]{0,300}setAllowComment\(false\)/.test(dialog))
  ok("a successful post clears the marker so the next one starts fresh", /initialisedFor\.current = null/.test(dialog))

  // Nothing may force a value past the operator at post time: the payload still reads state.
  ok("the post payload still sends the operator's current selections",
    /disableComment: !allowComment, disableDuet: !allowDuet, disableStitch: !allowStitch/.test(dialog)
    && /disclosureOn, disclosureYourBrand: yourBrand, disclosureBrandedContent: brandedContent/.test(dialog))
  ok("every control is still user-editable (no disabled/readOnly on the toggles)",
    /onChange=\{\(e\) => setYourBrand\(e\.target\.checked\)\}/.test(dialog)
    && /onChange=\{\(e\) => setAllowComment\(e\.target\.checked\)\}/.test(dialog))
  ok("branded content is still blocked while SELF_ONLY", /brandedContentBlocked = privacy === "SELF_ONLY"/.test(dialog))
  ok("a comment-disabled creator is still not offered the toggle", /data\.capabilities\.commentDisabled \?/.test(dialog))
}

console.log("\n4. NOTHING OUTSIDE THE DIALOG MOVED:")
{
  const publishRoute = readFileSync(path.join(process.cwd(), "app/api/integrations/tiktok/publish/route.ts"), "utf8")
  ok("the publish route still defaults privacy to SELF_ONLY server-side", /body\.privacyLevel \?\? "SELF_ONLY"/.test(publishRoute))
  ok("UNAUDITED is still true", /const UNAUDITED = true/.test(publishRoute))
  ok("the destination guard is still in place", /wrong_destination/.test(publishRoute))
  ok("the caption still goes through buildTikTokCaptionPayload", /buildTikTokCaptionPayload/.test(publishRoute))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
