import { NextResponse, type NextRequest } from "next/server"
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { buildSocialDisplayName } from "@/lib/social/displayName"

// PATCH /api/admin/social-autopilot/content/:id → edit internal metadata / display name.
// DELETE → remove the source video (storage object + row). Platform-admin ONLY; RLS
// additionally scopes to the owner, so another user's row matches nothing.
//
// Naming rule: a manual `displayName` edit sets name_customized=true and is never auto-
// overwritten. Editing property/market while NOT customized auto-refines display_name to
// "Property - Market - YYYY-MM-DD - NN" (date from created_at, NN from batch_seq).
// PROTECTED fields (owner_user_id, storage_path, original_filename) are never mutated here.
const EDITABLE = ["propertyName", "propertyType", "market", "areaNeighborhood", "special", "budgetRange", "amenities", "notes", "placeId", "overlayMode", "priceLabelMode"] as const
const COLUMN: Record<(typeof EDITABLE)[number], string> = {
  propertyName: "property_name",
  propertyType: "property_type",
  market: "market",
  areaNeighborhood: "area_neighborhood",
  special: "special",
  budgetRange: "budget_range",
  amenities: "amenities",
  notes: "notes",
  placeId: "place_id",
  overlayMode: "overlay_mode",
  priceLabelMode: "price_label_mode",
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response
  const { supabase } = guard

  const { id } = await ctx.params
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    body = {}
  }

  const { data: current, error: readErr } = await supabase
    .from("social_content")
    .select("id, created_at, batch_seq, name_customized, property_name, market, original_filename, details")
    .eq("id", id)
    .maybeSingle()
  if (readErr) return NextResponse.json({ error: "update_failed" }, { status: 500 })
  if (!current) return NextResponse.json({ error: "not_found" }, { status: 404 })
  const cur = current as Record<string, unknown>

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if ("tags" in body && Array.isArray(body.tags)) {
    patch.tags = (body.tags as unknown[]).filter((t): t is string => typeof t === "string" && t.trim().length > 0).map((t) => t.trim().slice(0, 60)).slice(0, 40)
  }
  for (const k of EDITABLE) {
    if (k in body) patch[COLUMN[k]] = typeof body[k] === "string" && (body[k] as string).trim() ? (body[k] as string).trim().slice(0, 5000) : null
  }

  // Prepared PUBLIC post (overlay/caption/hashtags) — SA-only overrides stored inside the
  // existing details jsonb (no schema change). Merged so other details keys are preserved. An
  // all-empty prepared post clears the override (falls back to auto-preparation at post time).
  if ("preparedPost" in body && body.preparedPost && typeof body.preparedPost === "object") {
    const pp = body.preparedPost as Record<string, unknown>
    const s = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "")
    const overlayHeadline = s(pp.overlayHeadline, 200)
    const overlaySubheadline = s(pp.overlaySubheadline, 200)
    const caption = s(pp.caption, 2200)
    const hashtags = Array.isArray(pp.hashtags)
      ? (pp.hashtags as unknown[]).filter((t): t is string => typeof t === "string" && t.trim().length > 0).map((t) => t.trim().slice(0, 60)).slice(0, 30)
      : []
    const prepared = overlayHeadline || overlaySubheadline || caption || hashtags.length ? { overlayHeadline, overlaySubheadline, caption, hashtags } : null
    const details = cur.details && typeof cur.details === "object" && !Array.isArray(cur.details) ? { ...(cur.details as Record<string, unknown>) } : {}
    if (prepared) details.preparedPost = prepared
    else delete details.preparedPost
    patch.details = details
  }

  const displayNameEdited = typeof body.displayName === "string"
  if (displayNameEdited) {
    patch.display_name = (body.displayName as string).trim().slice(0, 300) || null
    patch.name_customized = true
  } else if (cur.name_customized !== true && ("propertyName" in body || "market" in body)) {
    patch.display_name = buildSocialDisplayName({
      propertyName: "propertyName" in body ? (patch.property_name as string | null) : (cur.property_name as string | null),
      market: "market" in body ? (patch.market as string | null) : (cur.market as string | null),
      dateISO: typeof cur.created_at === "string" ? cur.created_at : new Date().toISOString(),
      seq: typeof cur.batch_seq === "number" ? cur.batch_seq : 1,
      fallbackFilename: typeof cur.original_filename === "string" ? cur.original_filename : null,
    })
  }

  const { data, error } = await supabase
    .from("social_content")
    .update(patch)
    .eq("id", id)
    .select("id, display_name, name_customized")
    .maybeSingle()
  if (error) return NextResponse.json({ error: "update_failed" }, { status: 500 })
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const out = data as { id: string; display_name: string | null; name_customized: boolean }
  return NextResponse.json({ id: out.id, displayName: out.display_name, nameCustomized: out.name_customized })
}

/**
 * DELETE a source video.
 *
 * THE ORIGINAL UPLOAD IS A PROTECTED MASTER — it is reused indefinitely to produce new Reels with
 * different templates, overlays, pricing, narration and later AI-presenter versions, so it must
 * outlive every post, render and variation built from it. This route is therefore deliberately
 * hard to use, in two escalating steps:
 *
 *   dependent posts exist  -> 409, ALWAYS. No token, no override, no cascade. The database agrees
 *                             (the FK is ON DELETE RESTRICT), so this is a readable explanation of
 *                             a refusal that would happen anyway rather than the protection itself.
 *   no dependents          -> still refused unless the caller passes an explicit confirmation
 *                             token. Protected BY DEFAULT: an unused upload is still footage the
 *                             operator may want months from now, and "it has no posts yet" is a
 *                             statement about today.
 *
 * NOTHING HERE TOUCHES RENDERED FILES. Disposable renders under renders/ are a separate cleanup
 * concern with a separate path; conflating them is how a master gets swept up in a bulk tidy.
 */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response
  const { supabase } = guard

  const { id } = await ctx.params
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  // ── THE PATH COMES FROM THE DATABASE, NEVER FROM THE CALLER ───────────────────────────────
  // Read through the RLS client, so another admin's row matches nothing here before the
  // service-role client is involved at all. storage_path is then whatever the database says it is:
  // the request body contributes only a confirmation token, and cannot name an object to delete.
  const { data: row, error: readErr } = await supabase
    .from("social_content")
    .select("id, storage_path, property_name, owner_user_id")
    .eq("id", id)
    .maybeSingle()
  if (readErr) return NextResponse.json({ error: "delete_failed" }, { status: 500 })
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 })
  const src = row as { id: string; storage_path?: string | null; property_name?: string | null; owner_user_id?: string | null }

  // ── OWNERSHIP, ASSERTED EXPLICITLY ────────────────────────────────────────────────────────
  // RLS already scoped the read above, and the storage policy scoped by owner folder. Neither
  // protects what comes next: the service-role client bypasses RLS entirely, so every assumption
  // RLS was making has to be re-established in code before it is used. Checked against the session
  // identity from requirePlatformAdmin, never the body.
  if (src.owner_user_id && src.owner_user_id !== guard.userId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  // ── DEPENDENCY CHECK ──────────────────────────────────────────────────────────────────────
  // Counted, not merely detected: "3 posts, 2 of them published" tells the operator what they
  // would be destroying. `published` is called out separately because those rows carry
  // external_post_id — the only record that something actually reached Instagram.
  const { data: deps, error: depErr } = await supabase
    .from("social_posts")
    .select("id, published_at")
    .eq("source_content_id", id)
  if (depErr) return NextResponse.json({ error: "delete_failed" }, { status: 500 })
  const posts = deps ?? []
  const published = posts.filter((p) => (p as { published_at: string | null }).published_at).length

  if (posts.length > 0) {
    return NextResponse.json({
      error: "source_has_dependents",
      detail: `This source video is used by ${posts.length} post${posts.length === 1 ? "" : "s"}${published ? `, ${published} of which ${published === 1 ? "is" : "are"} published` : ""}.`,
      counts: { posts: posts.length, published },
      hint: "Delete or re-point those posts first. Published posts are historical records and are never deleted automatically.",
    }, { status: 409 })
  }

  // ── EXPLICIT CONFIRMATION, even with no dependents ────────────────────────────────────────
  // Deliberately NOT a cascade token: there is nothing to cascade here, by definition. It exists
  // so deleting original footage can never be a stray click or an accidental bulk selection.
  let body: Record<string, unknown> = {}
  try { body = (await req.json()) as Record<string, unknown> } catch { body = {} }
  if (body.confirm !== "delete-source-video") {
    return NextResponse.json({
      error: "confirmation_required",
      detail: "Original source videos are protected. Deleting one requires explicit confirmation.",
      counts: { posts: 0, published: 0 },
      hint: 'Resend with {"confirm":"delete-source-video"}. An Archive Source option is planned so originals need not be destroyed at all.',
    }, { status: 409 })
  }

  // ── JOURNAL BEFORE DESTROY ────────────────────────────────────────────────────────────────
  // Deleting a source is two operations against two systems with no transaction spanning them, so
  // either half can fail alone. Writing the path down FIRST is what guarantees an original can
  // never become an untracked file — not on a failed storage call, not on a cut-off request, not if
  // the process dies between the two steps. Any row left 'pending' or 'row_deleted' is a deletion
  // that did not finish, with the path right there to finish or reverse it.
  //
  // Service role because the journal has no client write policy at all: an audit log the audited
  // party can amend is not an audit log.
  const journalPath = src.storage_path ?? ""
  const { data: journal, error: journalErr } = await supabaseAdmin
    .from("social_source_deletions")
    .insert({
      source_content_id: id,
      storage_path: journalPath,
      property_name: src.property_name ?? null,
      requested_by: guard.userId,
      status: "pending",
    })
    .select("id")
    .maybeSingle()
  // A journal failure ABORTS the deletion. Proceeding would be the exact untracked-original case
  // this whole mechanism exists to make impossible.
  if (journalErr || !journal) {
    console.error("[social-autopilot] refusing to delete a source without a journal entry:", id, journalErr?.message)
    return NextResponse.json({
      error: "delete_failed",
      detail: "The deletion could not be recorded, so nothing was deleted. Your video is untouched.",
    }, { status: 500 })
  }
  const journalId = (journal as { id: string }).id
  const mark = (patch: Record<string, unknown>) =>
    supabaseAdmin.from("social_source_deletions").update(patch).eq("id", journalId)

  // ── ORDERING ──────────────────────────────────────────────────────────────────────────────
  // ROW FIRST, FILE SECOND — the reverse of what this used to do.
  //
  // Removing the file first meant a failed row delete left a row pointing at footage that no
  // longer existed: the library would show the card, the editor would open, and every render and
  // preview would fail on a 404 with nothing to recover. That state is invisible until used.
  //
  // This way the two failure modes are not symmetrical, and the surviving one is recoverable: the
  // bytes are still there and the journal names the exact path.
  //
  // The row delete stays on the RLS client — least privilege, and RLS re-checks ownership at the
  // moment of the write rather than trusting the read above.
  const { error: delErr } = await supabase.from("social_content").delete().eq("id", id)
  if (delErr) {
    // RESTRICT may still fire here if a post was created between the count above and now — the
    // check is a courtesy, the constraint is the guarantee.
    const racedDependents = (delErr as { code?: string }).code === "23503"
    await mark({ status: "aborted", failure_reason: `row_delete_failed: ${delErr.message}` })
    return NextResponse.json({
      error: racedDependents ? "source_has_dependents" : "delete_failed",
      detail: racedDependents
        ? "A post was created for this source while the delete was in flight. Nothing was removed."
        : "The source could not be deleted. Its video was not touched.",
    }, { status: racedDependents ? 409 : 500 })
  }
  await mark({ status: "row_deleted", row_deleted_at: new Date().toISOString() })

  if (src.storage_path) {
    // ── SERVICE ROLE, AND ONLY HERE ─────────────────────────────────────────────────────────
    // source.* objects are DELETE-protected against ordinary client sessions by a restrictive RLS
    // policy on storage.objects, so the caller's own client cannot do this — by design. This is the
    // single audited path that can, and it is reached only after: platform-admin verification,
    // an ownership assertion, a zero-dependent-post count, an explicit confirmation token, and a
    // journal entry. The path is the one read from the database.
    const { error: rmErr } = await supabaseAdmin.storage.from("social-media").remove([src.storage_path])
    if (rmErr) {
      await mark({ status: "orphaned", failure_reason: `file_remove_failed: ${rmErr.message}` })
      console.error("[social-autopilot] source row deleted but its file remains:", src.storage_path, rmErr.message)
      return NextResponse.json({
        ok: true,
        warning: "file_not_removed",
        detail: "The record was deleted but its video file could not be removed. The file is still in storage and has been recorded for recovery.",
        orphanedPath: src.storage_path,
        journalId,
      })
    }
  }
  await mark({ status: "completed", file_removed_at: new Date().toISOString() })
  return NextResponse.json({ ok: true, journalId })
}
