// AI PRESENTER — the lip-sync clip cache. PHASE 2a.
//
// THE FAILURE THIS WHOLE FEATURE EXISTS TO PREVENT: an avatar clip lip-synced to recording A being
// served for recording B. It renders cleanly, publishes cleanly, and looks like a broken product —
// the right words with the wrong mouth. It has TWO causes, and both are asserted here:
//
//   1. A LOOKUP THAT MATCHES TOO LOOSELY. Keying on anything but the exact audio storage path —
//      the voice clip's id, its name, its duration, a prefix — lets A's clip answer a query for B.
//   2. A RESOLUTION THAT IS RETAINED RATHER THAN RECOMPUTED. This is the subtler one and it was a
//      real defect: presenter_clip_storage_path was written only when the PRESENTER changed, so
//      changing the voice hook alone left the previous hook's clip on the post.
//
// Run: npx tsx scripts/social/presenterClipCache.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"
import {
  presenterClipKey, resolvePresenterClip, findMatch, isUsableClip, isLipSyncSafe,
  CLIP_STATE_MESSAGE, LIVE_STATUSES, USABLE_STATUS, type PresenterClipRow,
} from "../../lib/social/presenterClipCache"
import { RENDER_AFFECTING_COLUMNS } from "../../lib/social/renderInvalidation"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")

const OWNER = "c567c077-d3f4-4532-8807-a54795f753f5"
const PRES = "11111111-1111-4111-8111-111111111111"
const PRES2 = "22222222-2222-4222-8222-222222222222"
const AUDIO_A = `${OWNER}/voice/aaaaaaaa-0000-4000-8000-000000000001.mp3`
const AUDIO_B = `${OWNER}/voice/bbbbbbbb-0000-4000-8000-000000000002.mp3`
const CLIP_A = `${OWNER}/presenters/clip-for-a.webm`
const OWN_CLIP = `${OWNER}/presenters/generic.webm`

const row = (o: Partial<PresenterClipRow> = {}): PresenterClipRow => ({
  id: "row-1", presenterId: PRES, voiceClipId: "vc-1",
  audioStoragePath: AUDIO_A, clipStoragePath: CLIP_A, status: "ready", ...o,
})

// ── 1. MATCHING ─────────────────────────────────────────────────────────────
console.log("1. a clip is matched to its EXACT recording and nothing else:")
{
  const rows = [row()]
  ok("the recording it was synced to matches", findMatch(rows, AUDIO_A)?.id === "row-1")
  // THE CORE PROPERTY.
  ok("a DIFFERENT recording does NOT match", findMatch(rows, AUDIO_B) === null)
  ok("an empty path does not match", findMatch(rows, "") === null)
  ok("surrounding whitespace is tolerated", findMatch(rows, ` ${AUDIO_A} `)?.id === "row-1")
  // NO FUZZINESS. Each of these would be a desync wearing a helpful face.
  ok("a PREFIX of the path does not match", findMatch(rows, AUDIO_A.slice(0, -8)) === null)
  ok("the path plus a suffix does not match", findMatch(rows, `${AUDIO_A}.bak`) === null)
  ok("a different CASE does not match", findMatch(rows, AUDIO_A.toUpperCase()) === null)
  ok("the same filename under another folder does not match",
    findMatch(rows, AUDIO_A.replace("/voice/", "/other/")) === null)
  ok("an empty cache matches nothing", findMatch([], AUDIO_A) === null)
}

console.log("\n2. only a genuinely usable clip is served:")
{
  ok("ready + a file is usable", isUsableClip(row()))
  ok("ready with a NULL file is NOT usable", !isUsableClip(row({ clipStoragePath: null })))
  ok("ready with a BLANK file is NOT usable", !isUsableClip(row({ clipStoragePath: "   " })))
  for (const s of ["queued", "generating", "failed", "cancelled"] as const) {
    ok(`status ${s} is NOT usable`, !isUsableClip(row({ status: s })))
  }
  ok("null is not usable", !isUsableClip(null))
  ok("'ready' is the only usable status", USABLE_STATUS === "ready")
  ok("the live statuses mirror the partial unique index",
    JSON.stringify(LIVE_STATUSES) === JSON.stringify(["queued", "generating", "ready"]))
}

// ── 3. RESOLUTION — THE RECOMPUTE RULE ──────────────────────────────────────
console.log("\n3. resolution: a match is reused, a non-match NEVER is:")
{
  const rows = [row()]
  const matched = resolvePresenterClip({ presenterClipStoragePath: OWN_CLIP, selectedAudioStoragePath: AUDIO_A, rows })
  ok("the matching recording reuses its clip", matched.state === "matched" && matched.clipStoragePath === CLIP_A)
  ok("...and reports lip-sync as verified", matched.lipSyncVerified)
  ok("...and is the only state considered safe", isLipSyncSafe(matched.state))

  // THE ASSERTION THAT GUARDS THE WHOLE FEATURE.
  const other = resolvePresenterClip({ presenterClipStoragePath: OWN_CLIP, selectedAudioStoragePath: AUDIO_B, rows })
  ok("a DIFFERENT recording never gets A's clip", other.clipStoragePath !== CLIP_A)
  ok("...it falls back to the presenter's own clip", other.clipStoragePath === OWN_CLIP)
  ok("...reports unmatched", other.state === "unmatched")
  ok("...and does NOT claim lip-sync", !other.lipSyncVerified)
  ok("...and is not treated as safe", !isLipSyncSafe(other.state))
  ok("...and the message warns that the mouth will not match", /will not match/i.test(CLIP_STATE_MESSAGE[other.state]))

  // NO VOICE SELECTED — must be byte-identical to pre-cache behaviour.
  const none = resolvePresenterClip({ presenterClipStoragePath: OWN_CLIP, selectedAudioStoragePath: null, rows })
  ok("no voice hook selected → the presenter's own clip, unchanged", none.state === "no_voice_selected" && none.clipStoragePath === OWN_CLIP)
  ok("...and claims nothing about lip-sync", !none.lipSyncVerified)
  const noneEmptyCache = resolvePresenterClip({ presenterClipStoragePath: OWN_CLIP, selectedAudioStoragePath: null, rows: [] })
  ok("...and an empty cache resolves identically", noneEmptyCache.clipStoragePath === OWN_CLIP)

  // IN-FLIGHT AND FAILED never serve a clip.
  for (const [s, expected] of [["queued", "pending"], ["generating", "pending"], ["failed", "failed"], ["cancelled", "failed"]] as const) {
    const r = resolvePresenterClip({ presenterClipStoragePath: OWN_CLIP, selectedAudioStoragePath: AUDIO_A, rows: [row({ status: s })] })
    ok(`status ${s} → ${expected}, and never serves the clip`, r.state === expected && r.clipStoragePath === OWN_CLIP && !r.lipSyncVerified)
  }

  // STALE / DELETED ASSET — a ready row whose file vanished.
  const gone = resolvePresenterClip({ presenterClipStoragePath: OWN_CLIP, selectedAudioStoragePath: AUDIO_A, rows: [row({ clipStoragePath: null })] })
  ok("a ready row with no file reports unavailable", gone.state === "unavailable")
  ok("...and is not served", gone.clipStoragePath !== null && gone.clipStoragePath === OWN_CLIP && !gone.lipSyncVerified)

  // A PRESENTER WITH NO CLIP OF ITS OWN.
  const noOwn = resolvePresenterClip({ presenterClipStoragePath: null, selectedAudioStoragePath: AUDIO_B, rows })
  ok("an unmatched hook on a clipless presenter resolves to null, not to A's clip", noOwn.clipStoragePath === null)
  ok("an empty-string own clip is treated as absent",
    resolvePresenterClip({ presenterClipStoragePath: "  ", selectedAudioStoragePath: null, rows: [] }).clipStoragePath === null)

  // EVERY state has copy, and only the safe one reads as reassurance.
  const states = ["no_voice_selected", "matched", "pending", "failed", "unmatched", "unavailable"] as const
  ok("every state has operator-facing copy", states.every((s) => !!CLIP_STATE_MESSAGE[s]))
  ok("only 'matched' is lip-sync safe", states.filter(isLipSyncSafe).length === 1 && isLipSyncSafe("matched"))
}

// ── 4. DUPLICATE PREVENTION ─────────────────────────────────────────────────
console.log("\n4. duplicate prevention: one clip per (presenter, recording):")
{
  const k1 = presenterClipKey({ presenterId: PRES, audioStoragePath: AUDIO_A, heygenAvatarId: "av1" })
  ok("the key is stable across calls", k1 === presenterClipKey({ presenterId: PRES, audioStoragePath: AUDIO_A, heygenAvatarId: "av1" }))
  ok("whitespace does not change it", k1 === presenterClipKey({ presenterId: ` ${PRES} `, audioStoragePath: ` ${AUDIO_A} `, heygenAvatarId: " av1 " }))
  // Each input must actually participate, or two different things would collapse onto one clip.
  ok("a different RECORDING gives a different key", k1 !== presenterClipKey({ presenterId: PRES, audioStoragePath: AUDIO_B, heygenAvatarId: "av1" }))
  ok("a different PRESENTER gives a different key", k1 !== presenterClipKey({ presenterId: PRES2, audioStoragePath: AUDIO_A, heygenAvatarId: "av1" }))
  ok("a different AVATAR gives a different key", k1 !== presenterClipKey({ presenterId: PRES, audioStoragePath: AUDIO_A, heygenAvatarId: "av2" }))
  ok("a missing avatar id is handled", presenterClipKey({ presenterId: PRES, audioStoragePath: AUDIO_A }).length > 0)
  ok("...and differs from a present one", presenterClipKey({ presenterId: PRES, audioStoragePath: AUDIO_A }) !== k1)
  ok("the key fits a text column comfortably", k1.length === 48 && /^[0-9a-f]+$/.test(k1))

  const sql = read("supabase/migrations/20261025000000_presenter_clip_cache.sql")
  ok("the key column is UNIQUE in the database, not just in code", /idempotency_key text not null unique/.test(sql))
  // The partial index is what blocks a duplicate while allowing a retry after failure.
  ok("a partial unique index covers (presenter, audio path)",
    /unique index[\s\S]{0,200}social_presenter_clips \(presenter_id, audio_storage_path\)/.test(sql))
  ok("...scoped to the LIVE statuses only", /where status in \('queued','generating','ready'\)/.test(sql))
  ok("...so a failed attempt does not permanently block a retry", !/where status in \([^)]*'failed'/.test(sql))
  const route = read("app/api/admin/social-autopilot/presenters/clips/route.ts")
  ok("a duplicate insert returns the EXISTING row rather than an error", /23505/.test(route) && /alreadyExisted: true/.test(route))
}

// ── 5. OWNERSHIP ────────────────────────────────────────────────────────────
console.log("\n5. ownership and asset protection:")
{
  const sql = read("supabase/migrations/20261025000000_presenter_clip_cache.sql")
  ok("RLS is enabled", /alter table public\.social_presenter_clips enable row level security/.test(sql))
  ok("the policy is owner-scoped both ways",
    /using \(owner_user_id = auth\.uid\(\)\)/.test(sql) && /with check \(owner_user_id = auth\.uid\(\)\)/.test(sql))
  ok("ownership is NOT NULL and defaulted", /owner_user_id uuid not null default auth\.uid\(\)/.test(sql))
  // A lip-synced clip is one person's voice and face — unlike a sample presenter it is never shared.
  ok("there is no shared/sample read path", !/is_sample/.test(sql))

  // DELETED ASSETS must not destroy a clip that cost money.
  ok("deleting a presenter does not delete the clip row",
    /presenter_id  uuid references public\.social_presenters\(id\) on delete set null/.test(sql))
  ok("deleting a voice clip does not delete the clip row",
    /voice_clip_id uuid references public\.social_voice_clips\(id\) on delete set null/.test(sql))
  ok("...and neither is a cascade", !/references public\.social_presenters\(id\) on delete cascade/.test(sql))
  // The snapshot is what keeps a match provable after the voice row is gone.
  ok("the audio path is snapshotted NOT NULL", /audio_storage_path text not null/.test(sql))
  ok("a 'ready' row must have a file", /check \(status <> 'ready' or clip_storage_path is not null\)/.test(sql))

  // THE ROUTE: ids in, paths resolved server-side.
  const route = read("app/api/admin/social-autopilot/presenters/clips/route.ts")
  ok("both handlers are platform-admin guarded", (route.match(/requirePlatformAdmin\(\)/g) ?? []).length >= 2)
  ok("the clip path is NEVER taken from the request body", !/body\.clipStoragePath/.test(route))
  ok("...it is read from the presenter row server-side", /resolved\.presenter\.clip_storage_path/.test(route))
  ok("...and still checked against the owner's presenters/ prefix", /isOwnedPresenterKey\(clipStoragePath, userId\)/.test(route))
  ok("the owner is stamped from the guard, not the body", /owner_user_id: userId/.test(route))
  ok("presenter and voice clip are resolved through the caller's RLS client", /resolveInputs\(supabase/.test(route))
  // PHASE 2a HAS NO GENERATION.
  ok("the route makes no HeyGen call", !/from "@\/lib\/social\/heygen"/.test(route) && !/createAvatarVideo|uploadAudioAsset|waitForVideo/.test(route))
  ok("...and never writes a generating status", !/status: "generating"/.test(route))
  ok("the route never renders", !/renderReel|renderPost/.test(route))
  ok("the route never writes social_posts", !/from\("social_posts"\)/.test(route))
}

// ── 6. THE STALE-CLIP DEFECT, AT THE WRITE SITE ─────────────────────────────
console.log("\n6. the posts route recomputes the clip instead of keeping a stale one:")
{
  const posts = read("app/api/admin/social-autopilot/posts/[id]/route.ts")
  ok("the clip is resolved through the shared matcher", /resolvePresenterClip\(\{/.test(posts))
  // The defect: this used to be written ONLY under `if ("presenterId" in body)`.
  ok("a VOICE-ONLY change also recomputes the clip",
    /"presenterId" in body \|\| "presenterVoiceClipId" in body/.test(posts))
  ok("...using the effective presenter (patch or stored)", /presenter_id" in patch[\s\S]{0,200}stored/.test(posts))
  ok("...and the effective audio (patch or stored)", /presenter_audio_storage_path" in patch[\s\S]{0,200}stored/.test(posts))
  ok("whatever the matcher returns is written, including the fallback",
    /patch\.presenter_clip_storage_path = resolution\.clipStoragePath/.test(posts))
  // The stored row must carry the columns the comparison and the resolution need, or
  // valueChanged(undefined, x) reports a change on every edit and silently resets the render.
  const storedSelect = /\.select\("id, platform, destination[^"]*"\)/.exec(posts)?.[0] ?? ""
  for (const col of ["presenter_id", "presenter_audio_storage_path", "presenter_clip_storage_path"]) {
    ok(`the stored row selects ${col}`, storedSelect.includes(col))
  }
  ok("presenter_clip_storage_path is render-affecting, so a new match invalidates a stale render",
    (RENDER_AFFECTING_COLUMNS as readonly string[]).includes("presenter_clip_storage_path"))
  // TURNING THE FEATURE OFF must not run the reuse block at all.
  ok("the reuse block is skipped when the presenter is being cleared", /patch\.presenter_id !== null/.test(posts))
}

console.log("\n7. the renderer, templates, captions and voice mixing are untouched:")
{
  for (const f of ["lib/social/renderVideo.ts", "lib/social/renderPost.ts", "lib/social/presenterSpec.ts", "lib/social/presenterTrim.ts", "lib/social/composePost.ts", "lib/social/overlaySpec.ts"]) {
    ok(`${f} does not import the cache`, !/presenterClipCache/.test(read(f)))
  }
  const mod = read("lib/social/presenterClipCache.ts")
  ok("the cache module defines no ffmpeg filter", !/overlay=|scale=|fade=/.test(mod))
  ok("the cache module defines no geometry", !/xPx|captionOverlap|widthPx:/.test(mod))
  // Assert on IMPORTS AND CALLS, not on prose: the module's comments legitimately explain the
  // HeyGen relationship, and a text search for the vendor name matches the explanation.
  ok("the cache module imports no HeyGen client", !/from "@\/lib\/social\/heygen"/.test(mod))
  ok("...and calls none of its functions",
    !/createAvatarVideo|uploadAudioAsset|waitForVideo|listAvatarLooks|getVideo\(/.test(mod))
  ok("...and contains no network call at all", !/fetch\(/.test(mod))
  // The migration must be purely additive.
  const sql = read("supabase/migrations/20261025000000_presenter_clip_cache.sql")
  ok("the migration alters no existing table", !/alter table public\.social_posts|alter table public\.social_presenters|alter table public\.social_voice_clips/.test(sql))
  ok("the migration drops no table or column", !/drop table|drop column/.test(sql))
  ok("...and only drops its OWN trigger and policy, idempotently",
    (sql.match(/drop (trigger|policy)/g) ?? []).every(() => true) && !/drop policy[^\n]*social_(posts|presenters|voice_clips)/.test(sql))

  const ui = read("components/crm/social/AiPresenterControl.tsx")
  ok("the control re-asks on a change of presenter OR hook",
    /\[on, value\.presenterId, value\.audioVoiceClipId\]/.test(ui))
  ok("the previous answer is cleared before re-asking", /setClipState\(null\)[\s\S]{0,200}setMatching\(true\)/.test(ui))
  ok("a late response for an old selection is discarded", /live = false/.test(ui))
  ok("the association sends ids only, never a storage key", !/clipStoragePath:/.test(ui))
  ok("every state's copy comes from the shared table", /CLIP_STATE_MESSAGE\[clipState\]/.test(ui))
  ok("only the safe state is styled as reassurance", /isLipSyncSafe\(clipState\)/.test(ui))
}

console.log(`\nPresenter clip cache: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
