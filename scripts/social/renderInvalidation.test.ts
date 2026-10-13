// RENDER INVALIDATION IS CHANGE-BASED, AND A POST MAY CARRY ITS OWN FOOTAGE.
//
// The headline test here is the REGRESSION one: a schedule-only save must not throw away a valid
// MP4. That bug was reproduced live on 2026-10-08 — scheduling post 882a9b4c reset render_status
// to 'none' while every burned-in value stayed byte-identical, because the route decided
// "render-affecting" from key presence and the editor posts every composer field on every save.
//
// Run: npx tsx scripts/social/renderInvalidation.test.ts
import { readFileSync } from "node:fs"
import path from "node:path"
import {
  RENDER_AFFECTING_COLUMNS, valueChanged, renderAffectingChanges, shouldInvalidateRender,
} from "@/lib/social/renderInvalidation"
import { resolveSourcePath } from "@/lib/social/renderPost"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")

// A rendered post, exactly as the database holds it.
const STORED = {
  id: "p1",
  platform: "instagram",
  render_version: 3,
  published_at: null,
  external_post_id: null,
  source_storage_path: null,
  overlay_headline: "DALLAS APARTMENTS",
  overlay_subheadline: "Starting at $2,600/month",
  overlay_mode: "generate",
  overlay_template: "market_type",
  audio_choice: "original",
  audio_track_id: null,
  voice_hook_id: null,
  voice_cta_id: null,
}
/** What the editor's fieldsBody() posts on EVERY save — all composer keys, unchanged values. */
const UNCHANGED_COMPOSER = {
  overlay_headline: "DALLAS APARTMENTS",
  overlay_subheadline: "Starting at $2,600/month",
  overlay_mode: "generate",
  overlay_template: "market_type",
  audio_choice: "original",
  audio_track_id: null,
  voice_hook_id: null,
  voice_cta_id: null,
}

console.log("THE REPRODUCED BUG — a non-pixel save must PRESERVE the render:")
ok("schedule-only save (composer keys present, values identical) does NOT invalidate",
  !shouldInvalidateRender(STORED, { ...UNCHANGED_COMPOSER, scheduled_at: "2026-10-09T16:46:00Z", status: "scheduled" }))
ok("caption-only save does NOT invalidate",
  !shouldInvalidateRender(STORED, { ...UNCHANGED_COMPOSER, caption: "a brand new caption" }))
ok("hashtag-only save does NOT invalidate",
  !shouldInvalidateRender(STORED, { ...UNCHANGED_COMPOSER, hashtags: ["#dallas", "#apartments"] }))
ok("cover-only save does NOT invalidate",
  !shouldInvalidateRender(STORED, { ...UNCHANGED_COMPOSER, cover_thumb_offset_ms: 1500, cover_render_version: 3 }))
ok("post-name / social-special save does NOT invalidate",
  !shouldInvalidateRender(STORED, { ...UNCHANGED_COMPOSER, post_name: "Renamed", social_special: "1 month free" }))
ok("a save carrying NO composer keys at all does not invalidate",
  !shouldInvalidateRender(STORED, { scheduled_at: null, status: "draft" }))
ok("...and none of those report a changed column",
  renderAffectingChanges(STORED, { ...UNCHANGED_COMPOSER, caption: "x", scheduled_at: "2026-10-09T16:46:00Z" }).length === 0)

console.log("\na GENUINE burned-in change still REQUIRES a re-render:")
const changes: [string, Record<string, unknown>, string][] = [
  ["headline",    { overlay_headline: "DALLAS PENTHOUSES" },        "overlay_headline"],
  ["price line",  { overlay_subheadline: "Starting at $3,100/mo" }, "overlay_subheadline"],
  ["template",    { overlay_template: "special_feature" },          "overlay_template"],
  ["overlay mode",{ overlay_mode: "existing" },                     "overlay_mode"],
  ["audio",       { audio_choice: "none" },                         "audio_choice"],
  ["audio track", { audio_track_id: "11111111-1111-1111-1111-111111111111" }, "audio_track_id"],
  ["voice hook",  { voice_hook_id: "22222222-2222-2222-2222-222222222222" },  "voice_hook_id"],
  ["voice CTA",   { voice_cta_id: "33333333-3333-3333-3333-333333333333" },   "voice_cta_id"],
  ["source video",{ source_storage_path: "owner/content/new-footage.mov" },   "source_storage_path"],
]
for (const [label, patch, col] of changes) {
  ok(`${label} changed -> invalidates`, shouldInvalidateRender(STORED, { ...UNCHANGED_COMPOSER, ...patch }))
  ok(`${label} changed -> names '${col}' as the reason`,
    renderAffectingChanges(STORED, { ...UNCHANGED_COMPOSER, ...patch }).includes(col as never))
}

console.log("\nnull / empty / whitespace are the SAME absent value (or every empty field re-invalidates):")
ok("null -> '' is not a change", !valueChanged(null, ""))
ok("'' -> null is not a change", !valueChanged("", null))
ok("undefined -> null is not a change", !valueChanged(undefined, null))
ok("'  ' -> null is not a change", !valueChanged("  ", null))
ok("untrimmed value equal after trim is not a change", !valueChanged("ROOFTOP POOL", "  ROOFTOP POOL  "))
ok("null -> a real value IS a change", valueChanged(null, "ROOFTOP POOL"))
ok("a real value -> null IS a change", valueChanged("ROOFTOP POOL", null))
ok("different values ARE a change", valueChanged("A", "B"))
ok("a post with an empty subheadline saving again does not invalidate",
  !shouldInvalidateRender({ ...STORED, overlay_subheadline: null }, { ...UNCHANGED_COMPOSER, overlay_subheadline: "" }))

console.log("\nfail-safe: an unknown stored row falls back to presence-based (never keeps a stale artifact):")
ok("stored null + composer keys -> invalidates", shouldInvalidateRender(null, UNCHANGED_COMPOSER))
ok("stored null + no composer keys -> does not", !shouldInvalidateRender(null, { caption: "x" }))
ok("renderAffectingChanges on a null stored row reports nothing", renderAffectingChanges(null, UNCHANGED_COMPOSER).length === 0)

console.log("\nthe render-affecting list covers exactly the burned-in inputs:")
// `destination` MOVED into the render-affecting set. It was correctly excluded for as long as every
// destination resolved to Instagram's geometry; tiktok_video now resolves to the `tiktok` safe
// area, whose top-anchored family sits at y300 rather than y427, so the surface decides the pixels.
for (const c of ["overlay_headline", "overlay_subheadline", "overlay_mode", "overlay_template", "audio_choice", "voice_hook_id", "voice_cta_id", "source_storage_path", "destination"]) {
  ok(`${c} is render-affecting`, (RENDER_AFFECTING_COLUMNS as readonly string[]).includes(c))
}
for (const c of ["caption", "hashtags", "scheduled_at", "cover_thumb_offset_ms", "cover_storage_path", "social_special", "post_name", "status"]) {
  ok(`${c} is NOT render-affecting`, !(RENDER_AFFECTING_COLUMNS as readonly string[]).includes(c))
}

console.log("\nSOURCE VIDEO OVERRIDE — which file does a post render from?")
ok("no override -> the property's own video", resolveSourcePath(null, "owner/content/source.mov") === "owner/content/source.mov")
ok("override set -> the post's own video", resolveSourcePath("owner/content/take2.mov", "owner/content/source.mov") === "owner/content/take2.mov")
ok("empty override falls back rather than returning ''", resolveSourcePath("", "owner/content/source.mov") === "owner/content/source.mov")
ok("whitespace override falls back", resolveSourcePath("   ", "owner/content/source.mov") === "owner/content/source.mov")
ok("override is trimmed", resolveSourcePath("  owner/x.mov  ", "owner/content/source.mov") === "owner/x.mov")
ok("neither -> null (missing_source, not an empty path to the storage client)", resolveSourcePath(null, null) === null)
ok("override present with NO content path still resolves", resolveSourcePath("owner/x.mov", null) === "owner/x.mov")

console.log("\nthe renderer actually CONSULTS the override (not just the column existing):")
const renderPost = read("lib/social/renderPost.ts")
ok("renderPost selects source_storage_path", /select\([^)]*source_storage_path/.test(renderPost))
ok("renderPost resolves through the shared helper", /resolveSourcePath\(\s*p\.source_storage_path/.test(renderPost))
ok("renderPost no longer reads the content path directly as THE source",
  !/const sourcePath = source\?\.storage_path/.test(renderPost))

console.log("\nPUBLISHED FOOTAGE IS FROZEN — two independent guards:")
const migration = read("supabase/migrations/20261008000001_post_source_video_override.sql")
ok("a DB trigger guards it", /create trigger social_posts_freeze_published_source_trg/.test(migration))
ok("...on UPDATE, before the write", /before update on public\.social_posts/.test(migration))
ok("...keyed on published_at OR external_post_id", /old\.published_at is not null or old\.external_post_id is not null/.test(migration))
ok("...and only when the value actually differs", /is distinct from old\.source_storage_path/.test(migration))
const patchRoute = read("app/api/admin/social-autopilot/posts/[id]/route.ts")
ok("the PATCH route refuses it with an explanation", /published_source_immutable/.test(patchRoute))
ok("...as a 409, not a silent no-op", /published_source_immutable[\s\S]{0,400}status: 409/.test(patchRoute))
ok("...and points the operator at Create Variation", /Create Variation[\s\S]{0,120}new video|new video[\s\S]{0,120}Create Variation/.test(patchRoute))
ok("the column is nullable so every pre-existing row is unaffected", /add column if not exists source_storage_path text;/.test(migration))

console.log("\nthe PATCH route is change-based, not presence-based:")
ok("it reads the stored row before deciding", /\.select\("id, platform, destination, published_at, external_post_id, render_version, source_storage_path/.test(patchRoute))
ok("it uses renderAffectingChanges", /renderAffectingChanges\(stored, patch\)/.test(patchRoute))
ok("the old presence-based flag is gone", !/renderAffecting = true/.test(patchRoute))
ok("invalidation is gated on a real change", /changed\.length > 0[\s\S]{0,120}render_status = "none"/.test(patchRoute))

console.log("\nVARIATION shares the property, never copies it:")
const dup = read("app/api/admin/social-autopilot/posts/[id]/duplicate/route.ts")
ok("the clone reuses the SAME source_content_id", /source_content_id: o\.source_content_id/.test(dup))
ok("the clone copies no property metadata (no property_name / market / amenities writes)",
  !/property_name:|market:|amenities:|budget_range:/.test(dup))
ok("the clone starts unrendered", /render_status: "none"/.test(dup))
ok("the clone does not inherit the original's artifact", !/rendered_storage_path: o\./.test(dup))
ok("the clone may carry its own footage", /source_storage_path/.test(dup))

console.log(`\nRender invalidation + source override: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
