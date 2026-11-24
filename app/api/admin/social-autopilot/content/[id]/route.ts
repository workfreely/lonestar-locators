import { NextResponse, type NextRequest } from "next/server"
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { buildSocialDisplayName } from "@/lib/social/displayName"
import { loadAgentRoster, UNASSIGNED } from "@/lib/social/agentRoster"

/** The same shape the content routes already use for a client-supplied id. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// PATCH /api/admin/social-autopilot/content/:id → edit internal metadata / display name.
// DELETE → remove the source video (storage object + row). Platform-admin ONLY; RLS
// additionally scopes to the owner, so another user's row matches nothing.
//
// Naming rule: a manual `displayName` edit sets name_customized=true and is never auto-
// overwritten. Editing property/market while NOT customized auto-refines display_name to
// "Property - Market - YYYY-MM-DD - NN" (date from created_at, NN from batch_seq).
// PROTECTED fields (owner_user_id, storage_path, original_filename) are never mutated here.
// `district` is the FOURTH geographic layer (see migration 20261020000000). It sits beside
// areaNeighborhood rather than replacing it, so "Downtown Dallas" + "Arts District" can both be
// stored. INTERNAL, like its sibling: absent from composePost's SourceMeta, so editing it can
// never change a caption, headline or overlay.
const EDITABLE = ["propertyName", "propertyType", "market", "areaNeighborhood", "district", "special", "budgetRange", "amenities", "notes", "placeId", "overlayMode", "priceLabelMode"] as const
const COLUMN: Record<(typeof EDITABLE)[number], string> = {
  propertyName: "property_name",
  propertyType: "property_type",
  market: "market",
  areaNeighborhood: "area_neighborhood",
  district: "district",
  special: "special",
  budgetRange: "budget_range",
  amenities: "amenities",
  notes: "notes",
  placeId: "place_id",
  overlayMode: "overlay_mode",
  priceLabelMode: "price_label_mode",
}

// Per-field caps where the generic 5000 is wrong. `district` matches the 200 the intake route
// already applies to area_neighborhood — these are place names, not prose. Fields absent here keep
// the 5000 default, so no existing field's behaviour changes.
const MAX_LEN: Partial<Record<(typeof EDITABLE)[number], number>> = { district: 200 }

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requirePlatformAdmin()
  if (!guard.ok) return guard.response
  const { supabase, userId } = guard

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
    if (k in body) patch[COLUMN[k]] = typeof body[k] === "string" && (body[k] as string).trim() ? (body[k] as string).trim().slice(0, MAX_LEN[k] ?? 5000) : null
  }
  // PERSONAL — checked means NOT available to agents. Handled explicitly rather than through
  // EDITABLE, whose loop coerces every value with `typeof body[k] === "string"` and would
  // therefore store a boolean as null — silently SHARING a video the operator just marked
  // Personal. Only a real boolean is a decision.
  if ("personal" in body && typeof body.personal === "boolean") {
    patch.available_to_agents = !body.personal
  }

  // ── WHOSE PERSONAL VIDEO, AND WHOSE FIRST VIDEO ───────────────────────────────────────────
  // Both columns arrive with a prepared migration, so both are written ONLY when the request
  // actually names them. A call of today's shape — `{ personal: boolean }` and nothing else —
  // touches neither, which is what keeps this route working before the migration and keeps the
  // operator's existing checkbox behaving exactly as it does now.
  //
  // THE TARGET IS VALIDATED AGAINST THE ROSTER, not merely shaped like a uuid. An assignment is a
  // restriction: a typo'd id would reserve a video for a person who does not exist, and nothing
  // would ever publish it. Only someone who actually holds connected destinations may be named.
  const wantsOwner = "personalAgentUserId" in body
  const wantsDebut = "debutForAgentUserId" in body
  if (wantsOwner || wantsDebut) {
    const asTarget = (v: unknown): string | null | "invalid" => {
      if (v === null) return null
      if (typeof v !== "string" || !UUID_RE.test(v.trim())) return "invalid"
      return v.trim()
    }
    const owner = wantsOwner ? asTarget(body.personalAgentUserId) : undefined
    const debut = wantsDebut ? asTarget(body.debutForAgentUserId) : undefined
    if (owner === "invalid" || debut === "invalid") {
      return NextResponse.json({ error: "personalAgentUserId and debutForAgentUserId must be a uuid or null" }, { status: 400 })
    }
    const named = [owner, debut].filter((v): v is string => typeof v === "string")
    if (named.length > 0) {
      const roster = await loadAgentRoster(supabase, null)
      // Same exclusion the picker applies, for the same reason: the operator says himself with
      // "Only me", which is null. Accepting his own id here would store a second spelling of that
      // and leave two rows meaning the same thing enforced by different code paths.
      const assignable = new Set(
        roster.filter((a) => a.id !== UNASSIGNED && a.id !== userId && a.connectionIds.length > 0).map((a) => a.id),
      )
      const unknown = named.filter((id) => !assignable.has(id))
      if (unknown.length > 0) {
        return NextResponse.json({ error: "that person has no connected destinations to assign a video to" }, { status: 400 })
      }
    }
    // ASSIGNING SOMEBODY IMPLIES PERSONAL. A row that is both shared with agents and reserved for
    // one person is a contradiction, and leaving the existing column alone would create exactly
    // that. Written here rather than demanded of the client, so the two cannot disagree.
    if (owner !== undefined) {
      patch.personal_agent_user_id = owner
      if (owner !== null) patch.available_to_agents = false
      // ── NO APARTMENT OVERLAY ON SOMEBODY'S PERSONAL VIDEO, UNLESS ASKED FOR ───────────────
      // The upload route defaults every new source to overlay_mode 'generate', because a library
      // that is overwhelmingly property tours wants the headline, the price band and the
      // branding composited on. A personal video wants none of that: it is a person, and
      // stamping "Starting at $1,450" over it is the specific thing being ruled out.
      //
      // Applied only when this call does NOT name an overlay mode, so "unless explicitly
      // selected" is literally true — sending overlayMode in the same request wins, and the
      // EDITABLE loop above has already written it. Only ever applied when ASSIGNING; clearing
      // the owner leaves the mode alone rather than silently undoing a deliberate choice.
      if (owner !== null && !("overlayMode" in body)) patch.overlay_mode = "existing"
    }
    if (debut !== undefined) patch.debut_for_agent_user_id = debut
    // THE TWO MUST NAME THE SAME PERSON. The database constraint refuses an incoherent pair; this
    // says so in a sentence instead of surfacing a constraint name. Evaluated against the row as
    // it WILL be, so changing one of the two in a single call is checked against the other's new
    // value rather than its old one.
    const finalOwner = (patch.personal_agent_user_id ?? cur.personal_agent_user_id ?? null) as string | null
    const finalDebut = (patch.debut_for_agent_user_id ?? cur.debut_for_agent_user_id ?? null) as string | null
    if (finalOwner && finalDebut && finalOwner !== finalDebut) {
      return NextResponse.json(
        { error: "a video reserved for one person cannot be another person's first video — it could never publish there" },
        { status: 400 },
      )
    }
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
    .select("id, published_at, external_post_id, approved_at, status")
    .eq("source_content_id", id)
  if (depErr) return NextResponse.json({ error: "delete_failed" }, { status: 500 })
  type DepRow = { id: string; published_at: string | null; external_post_id: string | null; approved_at: string | null; status: string | null }
  const posts = (deps ?? []) as DepRow[]
  const published = posts.filter((p) => p.published_at).length

  // ── WHAT MAY GO WITH THE SOURCE, AND WHAT MAY NEVER ───────────────────────────────────────
  // This route used to refuse on ANY dependent post, which made the trash icon unusable for the
  // commonest mistake there is: uploading the wrong file. Opening a new upload in the editor
  // creates a draft post (created_via 'edit_initial') within seconds, and from that moment the
  // source could not be deleted — while the refusal's own hint said to "delete those posts first",
  // an action the library offers no way to perform. The video became permanent by accident.
  //
  // THIS IS NOT A CASCADE, and the database still forbids one: the foreign key remains ON DELETE
  // RESTRICT, exactly as 20261009000002 made it. Nothing is destroyed implicitly. A plain draft is
  // deleted by this route EXPLICITLY, counted in the refusal the operator confirms, and only when
  // every dependent is such a draft.
  //
  // A row is removable ONLY if all four hold. Each one is a different way of being real work:
  //   • not published      — a published row is the only record something reached the platform
  //   • no external_post_id — it reached a platform even if published_at was never written back
  //   • not approved        — approval is a deliberate act, not a by-product of opening an editor
  //   • status 'draft'      — 'ready' means a render exists; that is work, not a stray row
  // Anything else blocks, and the refusal names what blocked it. The protection this file exists
  // for is unchanged: a master with published history, approved posts or renders still cannot be
  // deleted here at all.
  const blocking = posts.filter(
    (p) => p.published_at || p.external_post_id || p.approved_at || (p.status ?? "") !== "draft",
  )
  const removableDrafts = posts.filter((p) => !blocking.includes(p))

  if (blocking.length > 0) {
    return NextResponse.json({
      error: "source_has_dependents",
      detail: `This source video is used by ${blocking.length} post${blocking.length === 1 ? "" : "s"} that cannot be removed with it${published ? `, ${published} of which ${published === 1 ? "is" : "are"} published` : ""}.`,
      counts: { posts: posts.length, published, blocking: blocking.length, drafts: removableDrafts.length },
      hint: "Published, approved and rendered posts are kept. Re-point or handle those posts first; unpublished drafts can be removed with the source.",
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
      // The draft count is reported so the confirmation names everything it covers. It used to be
      // hardcoded to zero, which was true only while any dependent at all was a hard refusal.
      detail: removableDrafts.length > 0
        ? `Original source videos are protected. This one also has ${removableDrafts.length} unpublished draft${removableDrafts.length === 1 ? "" : "s"}, which will be removed with it.`
        : "Original source videos are protected. Deleting one requires explicit confirmation.",
      counts: { posts: posts.length, published: 0, blocking: 0, drafts: removableDrafts.length },
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
  // THE DRAFTS FIRST, or the foreign key refuses the row below — which is the point of leaving it
  // RESTRICT. Done after the journal, so a failure here is recorded rather than silent, and on the
  // RLS client so ownership is re-checked at the moment of the write.
  if (removableDrafts.length > 0) {
    const { error: draftErr } = await supabase
      .from("social_posts")
      .delete()
      .in("id", removableDrafts.map((p) => p.id))
      .is("published_at", null)
      .is("external_post_id", null)
      .is("approved_at", null)
      .eq("status", "draft")
    // The filters are repeated on the write, not trusted from the read: a post approved between
    // the count and now must survive, and then RESTRICT stops the source delete below.
    if (draftErr) {
      await mark({ status: "aborted", failure_reason: `draft_delete_failed: ${draftErr.message}` })
      return NextResponse.json({
        error: "delete_failed",
        detail: "The unpublished drafts could not be removed, so nothing was deleted. Your video is untouched.",
      }, { status: 500 })
    }
  }

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
  return NextResponse.json({ ok: true, journalId, removedDrafts: removableDrafts.length })
}
