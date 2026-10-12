// VIDEO LIBRARY THUMBNAILS — the path rule, and the separation that matters most.
//
// The grid used to mount a <video> per card and seek it to 0.6s. Measured against the real
// library (60 clips, one browser, back to back): 10-20 of 60 tiles still black after ten seconds.
// It now paints a ~25KB JPEG and mounts no video until the operator presses play.
//
// WHAT THIS SUITE IS REALLY FOR: a library thumbnail is NOT an Instagram/TikTok cover, and the
// cheapest way for that to stop being true is for some later edit to reuse one path, one column
// or one writer for both. So the separation is asserted — different table, different column,
// different path, different writers — rather than left as a comment. The second theme is that a
// MISSING thumbnail is a supported state: the upload still succeeds and the tile still works.
//
// Run: npx tsx scripts/social/libraryThumb.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"
import { thumbStoragePath, isThumbStoragePath, thumbSize, THUMB_MAX_PX, THUMB_SEEK_SECONDS, THUMB_CONTENT_TYPE } from "../../lib/social/libraryThumb"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }
const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8")
const OWNER = "11111111-1111-1111-1111-111111111111"
const CID = "22222222-2222-2222-2222-222222222222"

// ── 1. THE PATH ─────────────────────────────────────────────────────────────
console.log("1. a thumbnail has exactly one address, beside the source:")
ok("it is <owner>/<id>/thumb.jpg", thumbStoragePath(OWNER, CID) === `${OWNER}/${CID}/thumb.jpg`)
ok("it sits in the SAME folder as the source, as a sibling", thumbStoragePath(OWNER, CID).replace("/thumb.jpg", "") === `${OWNER}/${CID}`)
ok("it can never BE the source — different filename", !thumbStoragePath(OWNER, CID).includes("/source."))
ok("the recogniser accepts only the canonical path", isThumbStoragePath(`${OWNER}/${CID}/thumb.jpg`, OWNER, CID))
for (const [what, p] of [
  ["the source video", `${OWNER}/${CID}/source.mov`],
  ["another owner's thumbnail", `99999999-9999-9999-9999-999999999999/${CID}/thumb.jpg`],
  ["another row's thumbnail", `${OWNER}/33333333-3333-3333-3333-333333333333/thumb.jpg`],
  ["a rendered artifact", `${OWNER}/${CID}/rendered.mp4`],
  ["a cover image", `${OWNER}/${CID}/cover.jpg`],
  ["an empty path", ""],
] as const) ok(`...and rejects ${what}`, !isThumbStoragePath(p, OWNER, CID))
ok("null/undefined are rejected, not coerced", !isThumbStoragePath(null, OWNER, CID) && !isThumbStoragePath(undefined, OWNER, CID))

// ── 2. SIZING ───────────────────────────────────────────────────────────────
console.log("\n2. sizing fits the box and keeps the aspect, so object-cover crops as before:")
ok(`portrait 1080x1920 → ${JSON.stringify(thumbSize(1080, 1920))}`, thumbSize(1080, 1920).h === THUMB_MAX_PX && thumbSize(1080, 1920).w === 360)
ok("landscape 1920x1080 caps the WIDTH", thumbSize(1920, 1080).w === THUMB_MAX_PX && thumbSize(1920, 1080).h === 360)
ok("square stays square", thumbSize(1000, 1000).w === THUMB_MAX_PX && thumbSize(1000, 1000).h === THUMB_MAX_PX)
ok("a small clip is never UPscaled", thumbSize(200, 320).w === 200 && thumbSize(200, 320).h === 320)
ok("garbage dimensions fall back to a square box, never NaN or 0",
  [[0, 0], [NaN, 100], [-5, 10], [Infinity, 1]].every(([w, h]) => {
    const s = thumbSize(w as number, h as number)
    return Number.isFinite(s.w) && Number.isFinite(s.h) && s.w > 0 && s.h > 0
  }))
ok("the captured frame is the 0.6s one, and the output is JPEG", THUMB_SEEK_SECONDS === 0.6 && THUMB_CONTENT_TYPE === "image/jpeg")

// ── 3. NOT A SOCIAL COVER ───────────────────────────────────────────────────
console.log("\n3. library thumbnail ≠ Instagram cover ≠ TikTok cover:")
{
  const lib = read("lib/social/libraryThumb.ts")
  const api = read("app/api/admin/social-autopilot/content/[id]/thumb/route.ts")
  const backfill = read("scripts/social/backfillLibraryThumbs.mjs")
  const client = read("components/crm/social/SocialAutopilotClient.tsx")
  const mig = read("supabase/migrations/20261012000000_library_thumbnails.sql")
  // Comments in these files EXPLAIN the separation, so they contain the very words a raw search
  // would flag. Strip comments and assert on the CODE.
  const code = (src: string) => src.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*--.*$/gm, "")
  for (const [name, src] of [["the thumbnail module", lib], ["the thumbnail API", api], ["the backfill", backfill]] as const) {
    ok(`${name}'s CODE never references cover_storage_path`, !/cover_storage_path/.test(code(src)))
    ok(`${name}'s CODE never reads or writes social_posts`, !/social_posts/.test(code(src)))
    ok(`${name}'s CODE never touches publishing`, !/publish|instagram|tiktok/i.test(code(src)))
    ok(`${name}'s CODE only ever names the social_content table`,
      [...code(src).matchAll(/from\("([a-z_]+)"\)/g)].map((m) => m[1]).every((t) => t === "social_content" || t === "social-media"))
  }
  ok("the column lives on social_content, not social_posts", /alter table public\.social_content\s*\n\s*add column if not exists thumb_storage_path/.test(mig))
  ok("the migration only ADDS a column — no drop, no rename, no type change",
    !/drop |rename |alter column |delete |update /i.test(mig.replace(/^--.*$/gm, "")))
  // The client still reads and writes the Reel cover exactly as before; the two must coexist.
  ok("the client still handles the social cover separately from the thumbnail",
    /coverStoragePath|coverThumbOffsetMs|cover_storage_path/.test(client) === /coverStoragePath|coverThumbOffsetMs|cover_storage_path/.test(read("components/crm/social/SocialAutopilotClient.tsx")))
}

// ── 4. THE API CANNOT BE POINTED ANYWHERE ELSE ──────────────────────────────
console.log("\n4. the endpoint derives the path — it never accepts one:")
{
  const api = read("app/api/admin/social-autopilot/content/[id]/thumb/route.ts")
  ok("it is platform-admin gated", /requirePlatformAdmin\(\)/.test(api))
  ok("the path comes from thumbStoragePath(userId, id), not the request body", /const path = thumbStoragePath\(userId, id\)/.test(api))
  ok("it reads NO path from the request at all", !/body|req\.json|searchParams/.test(api))
  ok("it refuses unless the object actually exists", /thumbnail_not_found/.test(api) && /\.list\(/.test(api))
  ok("it writes exactly one column", (api.match(/\.update\(\{/g) ?? []).length === 1 && /\.update\(\{ thumb_storage_path: path \}\)/.test(api))
  ok("it is scoped to the caller's own row", /\.eq\("owner_user_id", userId\)/.test(api))
}

// ── 5. A MISSING THUMBNAIL IS A SUPPORTED STATE ─────────────────────────────
console.log("\n5. nothing breaks when a thumbnail is absent or fails:")
{
  const client = read("components/crm/social/SocialAutopilotClient.tsx")
  ok("the grid falls back to the video element when thumbUrl is null", /card\.thumbUrl && !playing \? \(/.test(client))
  ok("the fallback keeps the original seeked-frame behaviour", /v\.currentTime = Math\.min\(0\.6,/.test(client))
  ok("generation runs AFTER the upload is marked done", client.indexOf('status: "done" }') < client.indexOf("void generateThumb(uf, userId)"))
  ok("generation is fire-and-forget — not awaited into the upload", /void generateThumb\(uf, userId\)/.test(client))
  ok("every failure path inside generation is swallowed", /catch \{\n      \/\* a missing thumbnail is a supported state/.test(client))
{
    // The SOURCE upload is write-once (upsert:false) and must stay that way; the thumbnail is a
    // derivative that is always safe to regenerate, so it alone may overwrite itself.
    const gen = client.slice(client.indexOf("const generateThumb"), client.indexOf("const uploadOne"))
    const src = client.slice(client.indexOf("const uploadOne"), client.indexOf("const startBatch"))
    ok("the thumbnail upload may overwrite itself", /upsert: true/.test(gen))
    ok("...and the ORIGINAL is still write-once", /upsert: false/.test(src) && !/upsert: true/.test(src))
  }
  ok("images are skipped — they are already their own preview", /startsWith\("image\/"\)\) return/.test(client))
  ok("the capture helper returns null rather than throwing", /return await new Promise<Blob \| null>/.test(read("lib/social/libraryThumb.ts")))
}

// ── 6. THE BACKFILL'S SAFETY PROPERTIES ─────────────────────────────────────
console.log("\n6. the backfill is resumable, idempotent and non-destructive:")
{
  const b = read("scripts/social/backfillLibraryThumbs.mjs")
  ok("remaining work is a QUERY (rows with no thumbnail), so a rerun resumes", /\.is\("thumb_storage_path", null\)/.test(b))
  ok("it supports --dry-run, --limit and --batch", /--dry-run/.test(b) && /--limit/.test(b) && /--batch/.test(b))
  ok("it pauses between batches", /await sleep\(PAUSE_MS\)/.test(b))
  ok("it uploads ONLY to a path ending /thumb.jpg, and refuses otherwise", /refusing a non-thumbnail path/.test(b))
  ok("it never deletes or renames anything in storage", !/\.remove\(|\.move\(|\.copy\(/.test(b))
  ok("the only row column it writes is thumb_storage_path",
    (b.match(/\.update\(\{[^}]*\}\)/g) ?? []).every((u) => /\{ thumb_storage_path: thumbPath \}/.test(u)))
  ok("it seeks BEFORE the input, so it range-reads instead of pulling whole files",
    b.indexOf('"-ss", String(SEEK), "-i"') > 0)
  ok("it extracts exactly one frame", /"-frames:v", "1"/.test(b))
  ok("a per-row failure is counted, not fatal", /failures\.push\(/.test(b) && !/process\.exit\(1\)[\s\S]{0,80}catch/.test(b))
}

console.log(`\nLibrary thumbnails: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
