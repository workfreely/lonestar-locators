-- ORIGINAL SOURCE VIDEOS CANNOT BE DELETED OR OVERWRITTEN THROUGH AN ORDINARY CLIENT SESSION.
--
-- ── WHAT WAS WRONG ───────────────────────────────────────────────────────────────────────────
-- One policy governed the entire social-media bucket:
--
--   "social-media admin all"   ALL   {public}
--     bucket_id = 'social-media' AND is_platform_admin()
--     AND (storage.foldername(name))[1] = auth.uid()::text
--
-- Correct about WHO (a platform admin, inside their own folder) and silent about WHAT. A browser
-- session with that grant could DELETE or overwrite an original master as easily as a disposable
-- render, because the bucket holds both and the policy could not tell them apart. The master is
-- irreplaceable; the render regenerates from it in minutes.
--
-- ── WHY "AS RESTRICTIVE" ─────────────────────────────────────────────────────────────────────
-- Policies for the same command are OR'd together, so an additional PERMISSIVE policy can only
-- ever widen access — there is no way to subtract with one. A RESTRICTIVE policy is AND'd, so it
-- can. This keeps "social-media admin all" exactly as it is (nothing about admin gating or
-- owner-folder scoping changes) and removes two verbs from one key shape.
--
-- Scoped per command on purpose. A single `as restrictive for all` would also AND against SELECT
-- and INSERT, which would break the two workflows that MUST keep working: uploading a source and
-- reading it back to render.
--
-- ── WHY FILENAME AND NOT PATH SHAPE ──────────────────────────────────────────────────────────
-- Sources live at {owner}/{contentId}/source.EXT today, and matching that three-segment shape
-- would protect exactly the same 76 objects (both predicates were measured and agree). Matching
-- the FILENAME instead means a source written at an unexpected depth is still protected: the
-- protection should not quietly lapse because a path convention changed. lib/social/storagePaths.ts
-- carries the TypeScript twin of this predicate.
--
-- ── MEASURED BLAST RADIUS ────────────────────────────────────────────────────────────────────
-- The bucket holds 106 objects. This predicate matches 76 — exactly the 76 rows in social_content,
-- each of which has a live file. The other 30 (25 renders, 4 voice clips, 1 e2e proof) are
-- untouched by both policies.
--
-- ── WHAT STILL WORKS, UNCHANGED ──────────────────────────────────────────────────────────────
--   source upload (Library + Bulk Review)   INSERT on source.*   — permitted. Works on INSERT alone
--                                                                  only because both uploads are
--                                                                  upsert:false; an upsert would
--                                                                  have needed UPDATE.
--   render reads the source                 SELECT / signed URL  — permitted
--   render writes its output                INSERT + upsert      — renders/ is not matched
--   Replace Video                           INSERT               — takes/ is not matched
--   Reel cover                              INSERT               — covers/ is not matched
--   voice clip upload and delete            INSERT / DELETE      — voice/ is not matched
--   publishing (Instagram, TikTok)          SELECT / download    — service role, and renders/ anyway
--   rendered-file cleanup                   DELETE on renders/   — not matched
--
-- ── THE ONE THING THAT CHANGES ───────────────────────────────────────────────────────────────
-- Confirmed source deletion. requirePlatformAdmin() hands back the caller's RLS client, so the
-- delete route's own storage.remove() would now be refused. That removal moves to the service-role
-- client in the same change — behind the dependent-post check, the explicit confirmation token, an
-- ownership assertion, and a journal row written before anything is destroyed.
--
-- service_role and postgres have rolbypassrls = true (verified); authenticated and anon do not. So
-- these policies bind client sessions and leave the server's own audited path intact.
--
-- NOTHING IS DELETED, MOVED OR MIGRATED HERE. Two policies are added; no object and no row changes.

begin;

-- A master cannot be removed by a client session. Other buckets are unaffected: a restrictive
-- policy AND's against every DELETE on storage.objects, so it must pass anything it does not govern.
drop policy if exists "social-media source is delete-protected" on storage.objects;
create policy "social-media source is delete-protected"
  on storage.objects
  as restrictive
  for delete
  to public
  using (
    bucket_id <> 'social-media'
    or storage.filename(name) not like 'source.%'
  );

-- ...nor overwritten in place. Both USING and WITH CHECK: the first stops an existing master being
-- the target of an UPDATE, the second stops any row being rewritten INTO a source.* key, which
-- would otherwise be a rename that lands on top of a master.
drop policy if exists "social-media source is update-protected" on storage.objects;
create policy "social-media source is update-protected"
  on storage.objects
  as restrictive
  for update
  to public
  using (
    bucket_id <> 'social-media'
    or storage.filename(name) not like 'source.%'
  )
  with check (
    bucket_id <> 'social-media'
    or storage.filename(name) not like 'source.%'
  );

commit;
