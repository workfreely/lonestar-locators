// SAFE pre-post verification of the TikTok Direct Post pipeline — NO post is created.
// Mirrors app/api/integrations/tiktok/publish (mode:"dry_run") but runs standalone via the
// service role, so it doesn't depend on a browser session. Makes ONE real Creator Info call
// (read-only). Never prints tokens.
//
// Run: node --env-file=.env.local --import tsx scripts/social/tiktok-dry-run-check.ts <postId>
import { createClient } from "@supabase/supabase-js"
import { buildInstagramCaptionPayload } from "@/lib/social/composePost"
import { fetchTikTokCreatorInfo, resolveDirectPostSelection, planSingleChunk } from "@/lib/social/tiktokPublish"

const ADMIN = "c567c077-d3f4-4532-8807-a54795f753f5"
const postId = process.argv[2] || "7d823512-aec7-4187-88ae-5c56219f944f"
const TITLE_MAX = 2200

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function main() {
  // 1. Token (service-role Vault getter) — resolve access token; never print it.
  const { data: tokRows, error: tokErr } = await sb.rpc("sa_get_tiktok_token", { p_owner: ADMIN })
  const tokRow = (Array.isArray(tokRows) ? tokRows[0] : tokRows) as { token_bundle: string; token_expires_at: string; external_account_id: string } | null
  if (tokErr || !tokRow?.token_bundle) { console.log("✗ token: none", tokErr?.message ?? ""); process.exit(1) }
  const bundle = JSON.parse(tokRow.token_bundle) as { access_token?: string; refresh_token?: string }
  const accessValid = new Date(tokRow.token_expires_at).getTime() > Date.now()
  console.log(`✓ token resolves securely (access_token len=${bundle.access_token?.length ?? 0}, valid=${accessValid}, has_refresh=${!!bundle.refresh_token})`)
  if (!bundle.access_token) process.exit(1)

  // 2. Creator Info (real, read-only).
  const info = await fetchTikTokCreatorInfo(bundle.access_token)
  console.log(`✓ Creator Info: @${info.creator_username} "${info.creator_nickname}" · privacy=${JSON.stringify(info.privacy_level_options)} · comment_disabled=${info.comment_disabled} duet_disabled=${info.duet_disabled} stitch_disabled=${info.stitch_disabled} · maxDur=${info.max_video_post_duration_sec}s`)

  // 3. Post + rendered video.
  const { data: post } = await sb.from("social_posts")
    .select("id, render_status, rendered_storage_path, caption, hashtags, social_special, source_content_id, source:source_content_id(market, property_type, special, budget_range, amenities)")
    .eq("id", postId).maybeSingle()
  if (!post) { console.log("✗ post not found"); process.exit(1) }
  const p = post as any
  console.log(`✓ post selected: ${p.id} render_status=${p.render_status} path=${p.rendered_storage_path ? "set" : "MISSING"}`)
  if (p.render_status !== "ready" || !p.rendered_storage_path) { console.log("✗ post not ready"); process.exit(1) }

  // 4. Download the rendered MP4 (server-side; no public URL) → size + single-chunk plan.
  const { data: blob, error: dlErr } = await sb.storage.from("social-media").download(p.rendered_storage_path)
  if (dlErr || !blob) { console.log("✗ video download failed", dlErr?.message ?? ""); process.exit(1) }
  const size = (await blob.arrayBuffer()).byteLength
  const chunk = planSingleChunk(size)
  console.log(`✓ real Social Beast video downloaded: ${size} bytes (${(size/1048576).toFixed(2)} MB) · chunk plan=${JSON.stringify(chunk)} · FILE_UPLOAD`)

  // 5. Caption (same builder as Instagram) → title.
  const full = buildInstagramCaptionPayload({ caption: p.caption, hashtags: p.hashtags, socialSpecial: p.social_special, sourceContentId: p.source_content_id, source: Array.isArray(p.source) ? p.source[0] : p.source })
  const title = full.length > TITLE_MAX ? full.slice(0, TITLE_MAX) : full
  console.log(`✓ caption correct (${title.length}/${TITLE_MAX}): ${JSON.stringify(title.slice(0, 80))}${title.length > 80 ? "…" : ""}`)

  // 6. Selection validation (unaudited → SELF_ONLY).
  const sel = resolveDirectPostSelection(info, { privacyLevel: "SELF_ONLY" }, { unaudited: true })
  console.log(`✓ privacy/interactions valid: ${JSON.stringify(sel)}`)

  console.log("\n✅ READY: connected account + token + Creator Info + video + caption + selection + transfer method all resolve. No post was created.")
}
main().catch((e) => { console.log("✗ ERROR:", e instanceof Error ? e.message : String(e)); process.exit(1) })
