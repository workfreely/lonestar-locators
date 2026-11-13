-- Social Beast — ALIGN social_posts.platform WITH THE DESTINATION IT POINTS AT.
--
-- ── WHAT WENT WRONG ─────────────────────────────────────────────────────────────────────────
-- The editor's destination control wrote `destination` and deliberately left `platform` alone, on
-- the stated grounds that every GEOMETRY path reads the destination once one exists. That was
-- true. The conclusion was still wrong, because the PLANNER is not a geometry path: it grouped by
-- `platform`, so a post pointed at TikTok stayed in the Instagram rotation, was assigned to an
-- Instagram connection, and was then refused by the Instagram worker at its publishability gate
-- (tiktok_video is `awaiting_approval`) and failed to needs_attention.
--
-- Production carries six such rows, created between 2026-10-12 and 2026-11-09 — the MAJORITY of
-- TikTok-destined posts (six against four consistent ones), so this is the shape the destination
-- control produces, not a one-off.
--
-- The code half is fixed in two places and neither needs this migration: the planner now derives
-- the network from the destination (autopilotEligibility.providerOf), which makes the mismatch
-- harmless, and the destination PATCH now writes the provider alongside the destination, which
-- makes it impossible. THIS repairs the rows that already exist.
--
-- ── WHAT IT WRITES, AND WHAT IT REFUSES TO TOUCH ────────────────────────────────────────────
-- One column: `platform`, set to the provider its own destination already declares. Nothing else.
-- Not the caption, the hashtags, the overlay, the render pointers, the schedule, the approval, the
-- connection — and not a single published row.
--
-- PUBLISHED ROWS ARE EXCLUDED, deliberately. A published post's `platform` is part of the record
-- of what happened, and the row is terminal for every automation: the eligibility predicate stops
-- at `already_published` and both workers' due queries require an unpublished row. So rewriting it
-- would change history to fix nothing. All six rows in scope are unpublished (five drafts and one
-- rendered-and-ready), and the ten published TikTok-destination rows are left exactly as they are.
--
-- IDEMPOTENT: the WHERE clause is the condition being corrected, so a second run matches nothing.
-- REVERSIBLE: ROLLBACK_20261115000004 restores `platform` from the destination's OTHER provider,
-- which is only meaningful because this migration is the thing that made the two agree.

begin;

-- The destination → provider mapping, transcribed from lib/social/destinations.ts. Held in a CTE
-- rather than written as a CASE per statement so the verification can read the same table, and so
-- a destination added later is one row to add in one place.
-- scripts/social/postProviderRepair.test.ts asserts this table matches DESTINATIONS exactly.
create temporary table _dest_provider(destination text primary key, provider text not null) on commit drop;
insert into _dest_provider(destination, provider) values
  ('instagram_reel',  'instagram'),
  ('instagram_story', 'instagram'),
  ('tiktok_video',    'tiktok'),
  ('tiktok_story',    'tiktok');

-- The rows about to change, recorded before the update so the run can be audited afterwards.
create temporary table _repaired as
select p.id, p.platform as platform_before, d.provider as platform_after, p.destination, p.status
  from public.social_posts p
  join _dest_provider d on d.destination = p.destination
 where p.platform is distinct from d.provider
   and p.published_at is null
   and p.external_post_id is null;

update public.social_posts p
   set platform = d.provider,
       updated_at = now()
  from _dest_provider d
 where d.destination = p.destination
   and p.platform is distinct from d.provider
   and p.published_at is null
   and p.external_post_id is null;

select id, destination, platform_before, platform_after, status from _repaired order by status, id;
select count(*) as rows_repaired from _repaired;

commit;
