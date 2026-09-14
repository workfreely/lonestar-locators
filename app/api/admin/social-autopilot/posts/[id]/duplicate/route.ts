import { NextResponse, type NextRequest } from "next/server"
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin"

// POST /posts/[id]/duplicate — clone an existing post into a NEW draft. Platform-admin +
// RLS scoped. The clone references the SAME immutable social_content source (the media is
// never duplicated or modified). Copies the editable POST-LEVEL state (caption, hashtags,
// overlay mode + headline/detail, Social Special, on-video text/config, audio, platform,
// type); names it "<name> (Copy)"; forces status='draft', render_status='none'; and does NOT
// copy scheduled_at, publish/external/error fields, or recurrence identity (recurring_rule_id /
// recurrence_index / recurrence_slot stay null). Returns the new id so the editor can open it.
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response
  const { supabase, userId } = guard

  const { id } = await ctx.params
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  // Read the original under RLS (so only the caller's own post can be duplicated).
  const { data: orig, error: readErr } = await supabase
    .from("social_posts")
    .select("source_content_id, platform, post_type, post_name, caption, on_video_text, on_video_config, overlay_mode, overlay_headline, overlay_subheadline, hashtags, social_special, audio_choice, audio_track_id")
    .eq("id", id)
    .maybeSingle()
  if (readErr) return NextResponse.json({ error: "duplicate_failed" }, { status: 500 })
  if (!orig) return NextResponse.json({ error: "not_found" }, { status: 404 })
  const o = orig as Record<string, unknown>

  const baseName = typeof o.post_name === "string" && o.post_name.trim() ? o.post_name.trim() : "Post"
  const copyName = `${baseName} (Copy)`.slice(0, 300)

  const { data, error } = await supabase
    .from("social_posts")
    .insert({
      owner_user_id: userId, // from session, never copied from the original row
      source_content_id: o.source_content_id, // same immutable source
      platform: o.platform ?? "instagram",
      post_type: o.post_type ?? "reel",
      post_name: copyName,
      caption: o.caption ?? null,
      on_video_text: o.on_video_text ?? null,
      on_video_config: o.on_video_config ?? {},
      // Post-level content/settings ARE copied so the clone is an independent, editable duplicate.
      overlay_mode: o.overlay_mode === "existing" ? "existing" : "generate",
      overlay_headline: o.overlay_headline ?? null,
      overlay_subheadline: o.overlay_subheadline ?? null,
      hashtags: Array.isArray(o.hashtags) ? o.hashtags : [],
      social_special: o.social_special ?? null,
      audio_choice: o.audio_choice ?? "original",
      audio_track_id: o.audio_track_id ?? null,
      status: "draft", // always a fresh draft
      render_status: "none", // the clone must render itself — never reuse the original's derivative
      scheduled_at: null, // cleared
      // NOT copied: published_at / external_post_id / external_post_url / error_message / ig_container_id
      // / publish_attempted_at / published_render_version / rendered_storage_path (all default null),
      // and recurring_rule_id / recurrence_index / recurrence_slot (default null — never a clone).
    })
    .select("id")
    .single()
  if (error) return NextResponse.json({ error: "duplicate_failed" }, { status: 500 })
  return NextResponse.json({ id: (data as { id: string }).id })
}
