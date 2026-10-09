-- A SOURCE VIDEO IS NEVER DELETED WITHOUT A RECORD THAT SURVIVES THE DELETION.
--
-- ── THE PROBLEM THIS SOLVES ──────────────────────────────────────────────────────────────────
-- Deleting a source is two operations against two systems — a row in social_content and an object
-- in storage — and there is no transaction spanning them. Whichever order they run in, one can
-- succeed while the other fails:
--
--   file first, row second   a failed row delete leaves a row pointing at footage that no longer
--                            exists. The card renders, the editor opens, every render 404s. This is
--                            the old behaviour and it is INVISIBLE until someone tries to use it.
--   row first, file second   a failed file removal leaves bytes in the bucket that nothing in the
--                            database references. Recoverable — but only if someone knows the path.
--
-- The second is strictly better, so that is the order. This table removes its remaining weakness:
-- the path is written down BEFORE anything is destroyed, so an original can never become untracked
-- — not if the storage call fails, not if the request is cut off mid-flight, not if the process
-- dies between the two steps.
--
-- ── HOW IT IS USED ───────────────────────────────────────────────────────────────────────────
--   1. the route verifies admin, ownership, zero dependent posts, and the confirmation token
--   2. INSERT here with status 'pending' and the path READ FROM THE DATABASE (never from the
--      client, which could otherwise name any object in the bucket)
--   3. delete the social_content row      -> failure: status 'aborted', nothing was destroyed
--   4. remove the storage object          -> success: 'completed'    failure: 'orphaned'
--
-- Any row left in 'pending' or 'row_deleted' is a deletion that did not finish, and the path is
-- right there to finish or reverse it. 'orphaned' is the explicit, queryable version of what used
-- to be a console line nobody would ever read.
--
-- ── NO FOREIGN KEY, DELIBERATELY ─────────────────────────────────────────────────────────────
-- source_content_id references a row that is about to stop existing. A FK would either block the
-- deletion or cascade away the record of it. This is an append-only audit log, not a relation.

begin;

create table if not exists public.social_source_deletions (
  id uuid primary key default gen_random_uuid(),

  -- Identity of what was deleted. Denormalised on purpose: after step 3 the social_content row is
  -- gone, so anything not copied here is unrecoverable context.
  source_content_id uuid not null,
  storage_path text not null,
  property_name text,

  -- Who asked. Taken from the verified session, never from the request body.
  requested_by uuid not null references auth.users(id),
  requested_at timestamptz not null default now(),

  row_deleted_at timestamptz,
  file_removed_at timestamptz,

  --   pending      journaled, nothing destroyed yet
  --   row_deleted  the row is gone, the file has not been confirmed removed
  --   completed    both done
  --   aborted      the row delete failed; the file was never touched
  --   orphaned     the row is gone and the file could not be removed — the file still exists at
  --                storage_path and needs a deliberate decision
  status text not null default 'pending'
    check (status in ('pending', 'row_deleted', 'completed', 'aborted', 'orphaned')),
  failure_reason text
);

comment on table public.social_source_deletions is
  'Append-only journal of ORIGINAL SOURCE VIDEO deletions. A row is written BEFORE anything is '
  'destroyed, so an original can never become an untracked file: status ''orphaned'' means the '
  'database row is gone but the object still exists at storage_path, and ''pending''/''row_deleted'' '
  'mean a deletion did not finish. Written only by the service-role delete route; clients may read '
  'their own entries and can never write here.';

create index if not exists social_source_deletions_status_idx
  on public.social_source_deletions (status, requested_at desc);
create index if not exists social_source_deletions_source_idx
  on public.social_source_deletions (source_content_id);

alter table public.social_source_deletions enable row level security;

-- READ ONLY, and only your own. Writes have NO policy at all, so no client session can insert,
-- amend or erase an entry — the route writes with the service role, which bypasses RLS. An audit
-- log the audited party can edit is not an audit log.
drop policy if exists "source deletions readable by their requester" on public.social_source_deletions;
create policy "source deletions readable by their requester"
  on public.social_source_deletions
  for select
  to public
  using (is_platform_admin() and requested_by = auth.uid());

commit;
