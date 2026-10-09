import { NextResponse } from "next/server"
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin"

/**
 * GET /api/admin/social-autopilot/presenters
 *
 * The AI Presenters this agent may use: their OWN, plus the shared samples.
 *
 * ── OWNERSHIP IS ENFORCED BY THE DATABASE, NOT BY THIS QUERY ────────────────────────────────
 * The select below has no owner filter, and that is deliberate. It runs on the CALLER'S RLS
 * client, and the policy on social_presenters is `is_platform_admin() AND (is_sample OR
 * owner_user_id = auth.uid())`. So another agent's presenter is not merely hidden by a WHERE
 * clause this route could forget — it does not exist as far as this connection is concerned.
 * Filtering here as well would read as the protection and invite someone to "optimise" the policy
 * away later.
 *
 * NO CREDENTIAL IS RETURNED OR STORED. heygen_avatar_id is an identifier, useless without the
 * server-side account key, which lives in an environment variable and never in a row. The column
 * list below is explicit so a future column cannot be exposed by a `select *`.
 */
export async function GET() {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response
  const { supabase } = guard

  const { data, error } = await supabase
    .from("social_presenters")
    .select("id, label, is_sample, enabled, default_intro_seconds, clip_storage_path, voice_kind")
    .eq("enabled", true)
    // Samples last: an agent's own presenter is the one they almost always want.
    .order("is_sample", { ascending: true })
    .order("label", { ascending: true })

  if (error) return NextResponse.json({ error: "presenters_unavailable" }, { status: 500 })

  const presenters = (data ?? []).map((p) => {
    const r = p as Record<string, unknown>
    return {
      id: r.id as string,
      label: r.label as string,
      isSample: r.is_sample === true,
      defaultIntroSeconds: typeof r.default_intro_seconds === "string" ? Number(r.default_intro_seconds) : (r.default_intro_seconds as number),
      // Whether a usable clip exists at all — the editor greys out a presenter that has none
      // rather than letting an operator select something that cannot render.
      hasClip: !!r.clip_storage_path,
      voiceKind: (r.voice_kind as string) ?? "upload",
    }
  })

  return NextResponse.json({ presenters })
}
