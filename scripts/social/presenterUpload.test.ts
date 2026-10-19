// AVATAR UPLOAD — Phase 1.
//
// Four things can go wrong here, and three of them fail SILENTLY rather than loudly:
//
//   1. A FORMAT WITH NO ALPHA GETS THROUGH. An MP4 composites as a solid rectangle and, because
//      buildPresenterFilter fades the ALPHA channel, fades to a BLACK box. No error anywhere.
//   2. A WEBM WITH NO ALPHA GETS THROUGH. Passes every filename check. Same wrong render. This is
//      why the extension whitelist is not the protection and a decode probe exists.
//   3. THE PROBE OMITS THE DECODER FLAG. FFmpeg's native vp9 decoder discards alpha, so a probe
//      without `-c:v libvpx-vp9` reports yuv420p on a perfectly good transparent clip and rejects
//      it. Measured: the same file reads yuva420p with the flag and yuv420p without.
//   4. A CALLER REGISTERS A PATH THAT IS NOT THEIRS. The browser chooses the storage key, so the
//      route cannot trust it — in particular it must never accept a key naming an original master.
//
// Run: npx tsx scripts/social/presenterUpload.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"
import {
  PRESENTER_UPLOAD, checkPresenterFormat, checkPresenterSize, checkTransparency, decoderArgsFor,
  extensionOf, isAlphaPixFmt, isOwnedPresenterKey, labelFromFilename, pixFmtFromProbe,
  presenterStorageKey,
} from "../../lib/social/presenterUpload"
import { decoderForPresenterClip } from "../../lib/social/presenterSpec"
import { isSourceObjectPath } from "../../lib/social/storagePaths"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")

const OWNER = "c567c077-d3f4-4532-8807-a54795f753f5"
const OTHER = "11111111-2222-3333-4444-555555555555"

// ── 1. VALID UPLOADS ────────────────────────────────────────────────────────
console.log("1. formats the renderer can actually read transparency from:")
{
  for (const name of ["jay.webm", "jay.WEBM", "Jay Morris Hook.webm", "avatar.mov", "avatar.MOV"]) {
    const r = checkPresenterFormat(name)
    ok(`accepts ${name}`, r.ok)
  }
  ok("the accepted set is exactly webm + mov", JSON.stringify(PRESENTER_UPLOAD.acceptedExtensions) === JSON.stringify(["webm", "mov"]))
  // The whitelist must not drift from the renderer's decoder table: a format accepted here whose
  // alpha the renderer cannot read would upload fine and then composite as a box.
  ok("every accepted extension is one presenterSpec has a decoder answer for",
    PRESENTER_UPLOAD.acceptedExtensions.every((e) => decoderForPresenterClip(`x.${e}`) !== undefined))
  ok("webm gets the libvpx decoder the renderer forces", decoderForPresenterClip("x.webm") === "libvpx-vp9")
  ok("mov needs no special decoder", decoderForPresenterClip("x.mov") === null)
  ok("decoderArgsFor mirrors that for webm", JSON.stringify(decoderArgsFor("x.webm")) === JSON.stringify(["-c:v", "libvpx-vp9"]))
  ok("decoderArgsFor mirrors that for mov", JSON.stringify(decoderArgsFor("x.mov")) === JSON.stringify([]))
  // NEGATIVE CONTROL for the drift check above.
  ok("...and mp4 is NOT in the accepted set", !(PRESENTER_UPLOAD.acceptedExtensions as readonly string[]).includes("mp4"))
}

console.log("\n2. labels and keys:")
{
  ok("label comes from the filename", labelFromFilename("Jay-Morris_hook.webm") === "Jay Morris hook")
  ok("extension is stripped", !labelFromFilename("avatar.webm").includes("."))
  ok("a nameless file still gets a label", labelFromFilename(".webm") === "My Avatar")
  ok("label is bounded", labelFromFilename(`${"x".repeat(400)}.webm`).length <= 120)
  const key = presenterStorageKey(OWNER, "webm", "abc-123")
  ok("the key is owner-scoped under presenters/", key === `${OWNER}/presenters/abc-123.webm`)
  // THE ONE THAT MATTERS: a presenters/ key can never be mistaken for an original master, so the
  // restrictive storage policy protecting the 76 source videos is untouched by this feature.
  ok("a generated key is NEVER a protected source object", !isSourceObjectPath(key))
  // A reserved id cannot produce a master-looking filename. Without this the discard path would
  // throw in assertDisposablePath on exactly the failures it exists to clean up after.
  ok("an id of \"source\" cannot produce a protected-looking key",
    !isSourceObjectPath(presenterStorageKey(OWNER, "webm", "source")))
  ok("...the key is rewritten rather than rejected silently",
    presenterStorageKey(OWNER, "webm", "source") === `${OWNER}/presenters/clip-source.webm`)
  ok("an id with path junk is sanitised", presenterStorageKey(OWNER, "webm", "../../x") === `${OWNER}/presenters/x.webm`)
  ok("an empty id still yields a usable key", presenterStorageKey(OWNER, "webm", "") === `${OWNER}/presenters/clip.webm`)
  ok("a real uuid passes through unchanged",
    presenterStorageKey(OWNER, "webm", "3f2b1c9a-0000-4000-8000-abcdefabcdef") === `${OWNER}/presenters/3f2b1c9a-0000-4000-8000-abcdefabcdef.webm`)
  // And the registration gate refuses a master-looking name even inside presenters/.
  ok("a source-named key inside presenters/ is REFUSED", !isOwnedPresenterKey(`${OWNER}/presenters/source.webm`, OWNER))
}

// ── 3. INVALID FILES ────────────────────────────────────────────────────────
console.log("\n3. invalid files are refused, with a reason an operator can act on:")
{
  const mp4 = checkPresenterFormat("avatar.mp4")
  ok("mp4 is refused", !mp4.ok)
  ok("...and the message names the fix rather than just saying no",
    !mp4.ok && /transparent WebM/i.test(mp4.detail) && /HeyGen/i.test(mp4.detail))
  ok("...and explains the actual consequence", !mp4.ok && /fade to black|solid rectangle/i.test(mp4.detail))
  ok("m4v is refused too", !checkPresenterFormat("avatar.m4v").ok)
  for (const bad of ["avatar.gif", "avatar.png", "avatar.mkv", "avatar.avi", "avatar.txt", "avatar.webm.exe"]) {
    ok(`refuses ${bad}`, !checkPresenterFormat(bad).ok)
  }
  const none = checkPresenterFormat("avatar")
  ok("a file with no extension is refused", !none.ok && none.reason === "no_extension")
  ok("extensionOf lowercases and strips junk", extensionOf("a.WeBm") === "webm")
  ok("extensionOf handles a dotless name", extensionOf("avatar") === "")

  // SIZE
  ok("an empty file is refused", checkPresenterSize(0) !== null)
  ok("a negative size is refused", checkPresenterSize(-1) !== null)
  ok("a 3 MB clip is fine", checkPresenterSize(3 * 1024 * 1024) === null)
  ok("exactly at the cap is fine", checkPresenterSize(PRESENTER_UPLOAD.maxBytes) === null)
  ok("one byte over the cap is refused", checkPresenterSize(PRESENTER_UPLOAD.maxBytes + 1) !== null)
  ok("...and the message states the cap", (checkPresenterSize(PRESENTER_UPLOAD.maxBytes + 1) ?? "").includes("40"))
}

// ── 4. TRANSPARENCY, THE CHECK A WHITELIST CANNOT MAKE ──────────────────────
console.log("\n4. transparency is proven from a real decode, not inferred from the name:")
{
  ok("yuva420p is alpha", isAlphaPixFmt("yuva420p"))
  ok("yuva444p10le is alpha", isAlphaPixFmt("yuva444p10le"))
  ok("rgba is alpha", isAlphaPixFmt("rgba"))
  ok("bgra is alpha", isAlphaPixFmt("bgra"))
  ok("gbrap is alpha", isAlphaPixFmt("gbrap"))
  ok("ya8 is alpha", isAlphaPixFmt("ya8"))
  // NEGATIVE CONTROLS — the lookalikes.
  ok("yuv420p is NOT alpha", !isAlphaPixFmt("yuv420p"))
  ok("yuv444p is NOT alpha", !isAlphaPixFmt("yuv444p"))
  ok("rgb24 is NOT alpha", !isAlphaPixFmt("rgb24"))
  ok("gbrp is NOT alpha (gbrap is)", !isAlphaPixFmt("gbrp"))
  ok("an empty pix fmt is NOT alpha", !isAlphaPixFmt(""))

  // REAL ffmpeg banners, captured from the renderer's own binary against the real sample clip.
  const WITH_FLAG = `Input #0, matroska,webm, from '/tmp/clip.webm':
  Duration: 00:00:04.00, start: 0.000000, bitrate: 313 kb/s
  Stream #0:0: Video: vp9 (Profile 0), yuva420p(tv, progressive), 720x1080, SAR 1:1 DAR 2:3, 30 fps, 30 tbr, 1k tbn`
  const WITHOUT_FLAG = `Input #0, matroska,webm, from '/tmp/clip.webm':
  Duration: 00:00:04.00, start: 0.000000, bitrate: 313 kb/s
  Stream #0:0: Video: vp9 (Profile 0), yuv420p(tv, progressive), 720x1080, SAR 1:1 DAR 2:3, 30 fps, 30 tbr, 1k tbn`
  const AUDIO_ONLY = `Input #0, mov,mp4,m4a, from '/tmp/clip.mov':
  Stream #0:0: Audio: aac (LC), 44100 Hz, stereo, fltp, 128 kb/s`

  ok("the parenthesised suffix is dropped", pixFmtFromProbe(WITH_FLAG) === "yuva420p")
  ok("a transparent clip PASSES", checkTransparency(WITH_FLAG).ok)
  ok("...reporting the pix fmt it proved", checkTransparency(WITH_FLAG).ok && checkTransparency(WITH_FLAG).pixFmt === "yuva420p")
  // THE CASE THE WHITELIST MISSES — same container, no alpha.
  const noAlpha = checkTransparency(WITHOUT_FLAG)
  ok("a non-transparent WEBM FAILS, even though its extension is accepted", !noAlpha.ok)
  ok("...with reason no_alpha", !noAlpha.ok && noAlpha.reason === "no_alpha")
  ok("...naming the pix fmt it found", !noAlpha.ok && noAlpha.pixFmt === "yuv420p")
  ok("...and telling the operator what to export", !noAlpha.ok && /transparent/i.test(noAlpha.detail))
  const noVideo = checkTransparency(AUDIO_ONLY)
  ok("a file with no video stream FAILS", !noVideo.ok && noVideo.reason === "no_video_stream")
  ok("empty stderr FAILS rather than passing", !checkTransparency("").ok)
  ok("garbage stderr FAILS rather than passing", !checkTransparency("some unrelated text").ok)
}

// ── 5. UNAUTHORIZED ACCESS ──────────────────────────────────────────────────
console.log("\n5. the storage key the client supplies is never trusted:")
{
  ok("the owner's own presenters/ key is accepted", isOwnedPresenterKey(`${OWNER}/presenters/a.webm`, OWNER))
  ok("...and a mov too", isOwnedPresenterKey(`${OWNER}/presenters/a.mov`, OWNER))
  // ANOTHER AGENT'S OBJECT
  ok("another owner's key is REFUSED", !isOwnedPresenterKey(`${OTHER}/presenters/a.webm`, OWNER))
  // OUTSIDE presenters/ — this is the one that could point the renderer at a master
  ok("a key outside presenters/ is REFUSED", !isOwnedPresenterKey(`${OWNER}/voice/a.webm`, OWNER))
  ok("an ORIGINAL MASTER key is REFUSED", !isOwnedPresenterKey(`${OWNER}/abc/source.mp4`, OWNER))
  ok("...and a source named .webm is still REFUSED", !isOwnedPresenterKey(`${OWNER}/abc/source.webm`, OWNER))
  // TRAVERSAL AND SHAPE
  ok("traversal is REFUSED", !isOwnedPresenterKey(`${OWNER}/presenters/../../x.webm`, OWNER))
  ok("a leading slash is REFUSED", !isOwnedPresenterKey(`/${OWNER}/presenters/a.webm`, OWNER))
  ok("a nested path is REFUSED", !isOwnedPresenterKey(`${OWNER}/presenters/sub/a.webm`, OWNER))
  ok("a bare prefix is REFUSED", !isOwnedPresenterKey(`${OWNER}/presenters/`, OWNER))
  ok("an unsupported extension is REFUSED", !isOwnedPresenterKey(`${OWNER}/presenters/a.mp4`, OWNER))
  ok("an empty path is REFUSED", !isOwnedPresenterKey("", OWNER))
  ok("an empty owner is REFUSED", !isOwnedPresenterKey(`${OWNER}/presenters/a.webm`, ""))
  // A prefix that merely STARTS with the owner id must not pass.
  ok("an owner-id prefix collision is REFUSED", !isOwnedPresenterKey(`${OWNER}x/presenters/a.webm`, OWNER))
}

// ── 6. THE ROUTE'S OWN GUARANTEES ───────────────────────────────────────────
console.log("\n6. the route: authorization, cleanup, and what it must not touch:")
{
  const route = read("app/api/admin/social-autopilot/presenters/route.ts")
  ok("POST exists", /export async function POST/.test(route))
  ok("GET still exists", /export async function GET/.test(route))
  ok("both are platform-admin guarded", (route.match(/requirePlatformAdmin\(\)/g) ?? []).length >= 2)
  ok("POST refuses before reading anything when the key is not the caller's",
    /isOwnedPresenterKey\(storagePath, userId\)/.test(route))
  ok("the insert is owner-scoped and never a sample",
    /owner_user_id: userId, is_sample: false/.test(route))
  ok("transparency is checked with the renderer's decoder args", /decoderArgsFor\(/.test(route))
  ok("...and the verdict gates the insert", route.indexOf("checkTransparency") < route.indexOf(".insert("))
  // CLEANUP — requirement 7. A failed insert must not leave an unreferenced object behind.
  ok("a failed insert removes the uploaded object",
    /if \(insErr \|\| !inserted\) \{[\s\S]{0,400}await discard\(\)/.test(route))
  ok("cleanup goes through the source-video guard", /assertDisposablePath\(storagePath\)/.test(route))
  ok("every failure path discards", (route.match(/await discard\(\)/g) ?? []).length >= 5)
  ok("the temp working dir is always removed", /finally \{[\s\S]{0,200}fs\.rm\(work/.test(route))
  ok("it runs on node (ffmpeg cannot run on the edge)", /export const runtime = "nodejs"/.test(route))
  ok("size is read from metadata BEFORE downloading", route.indexOf("checkPresenterSize") < route.indexOf("createSignedUrl"))
  ok("...and re-measured from the real bytes", /checkPresenterSize\(bytes\.byteLength\)/.test(route))
  // NOT TOUCHED — the whole point of Phase 1 being narrow.
  ok("the route never writes social_posts", !/from\("social_posts"\)/.test(route))
  ok("the route never touches property tables", !/property_catalog|property_attributes/.test(route))
  ok("the route does not import or call the HeyGen client",
    !/from "@\/lib\/social\/heygen"/.test(route) && !/createAvatarVideo|listAvatarLooks|uploadAudioAsset|waitForVideo/.test(route))
  ok("the route does not render", !/renderReel|renderPost/.test(route))
  // The SELECT lists are what could leak a column, not the prose explaining why they don't.
  const selects = [...route.matchAll(/\.select\("([^"]+)"\)/g)].map((m) => m[1])
  ok("there are select lists to check", selects.length >= 2)
  ok("no select list exposes a HeyGen or ElevenLabs identifier",
    selects.every((s2) => !/heygen_avatar_id|elevenlabs_voice_id/.test(s2)))
  ok("...and none of them is a select *", selects.every((s2) => !s2.includes("*")))
}

console.log("\n7. the renderer, templates and voice handling are untouched:")
{
  // Phase 1 must be additive. These are the files whose behaviour was NOT to change; the assertion
  // is that the upload module is not imported into any of them.
  for (const f of ["lib/social/renderVideo.ts", "lib/social/renderPost.ts", "lib/social/presenterSpec.ts", "lib/social/composePost.ts", "lib/social/overlaySpec.ts"]) {
    ok(`${f} does not import the upload module`, !/presenterUpload/.test(read(f)))
  }
  // The upload module reads the renderer's decoder table but must define no geometry or filter.
  const mod = read("lib/social/presenterUpload.ts")
  ok("the upload module defines no ffmpeg filter", !/overlay=|scale=|fade=/.test(mod))
  ok("the upload module defines no geometry", !/xPx|widthPx:|captionOverlap/.test(mod))
  ok("...and defers to presenterSpec for the decoder", /decoderForPresenterClip/.test(mod))

  const ui = read("components/crm/social/AiPresenterControl.tsx")
  ok("the control uploads to the owner's presenters/ key via the shared helper", /presenterStorageKey\(uid/.test(ui))
  ok("the control posts the key to the existing route", /\/api\/admin\/social-autopilot\/presenters/.test(ui))
  ok("the control refreshes the list after a successful upload", /await load\(\)/.test(ui))
  ok("...and selects the new avatar", /patch\(\{ presenterId: saved\.id/.test(ui))
  ok("upload errors are separate from list errors", /setUploadErr/.test(ui) && /setLoadErr/.test(ui))
  ok("the control still reads its defaults from presenterSpec", /presenterSpec/.test(ui))
  ok("the control does not define its own size or format rules", !/40 \* 1024|\.webm"/.test(ui))
}

console.log(`\nAvatar upload: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
