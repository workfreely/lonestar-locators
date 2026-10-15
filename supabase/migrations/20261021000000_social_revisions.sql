-- SOCIAL BEAST — revision history. Previous values, kept automatically, for the fields that
-- represent real research and real editorial work.
--
-- ── WHY ─────────────────────────────────────────────────────────────────────────────────────
-- A live draft's caption was replaced by an unrelated save, and there was no way to get it back:
-- no audit table, no versioning extension, no trigger that archived anything. The only recovery
-- path was a whole-database point-in-time restore. That is the wrong tool for one text column.
--
-- ── WHY TRIGGERS AND NOT APPLICATION CODE ───────────────────────────────────────────────────
-- social_property_research has NO application writer at all — the only route touching it runs a
-- .select(). Every one of its records was written by a service-role script. Application-level
-- snapshots would therefore have captured none of the research, which is the most expensive data
-- here. A trigger captures every writer: API routes, service-role scripts, future automations,
-- and hand-run SQL. It is also less code — no route changes at all.
--
-- ── WHAT IS STORED, AND WHAT IS NOT ─────────────────────────────────────────────────────────
-- Only the PREVIOUS value of the WATCHED columns, and only when one of them actually changed.
--
--   previous-only, not previous+new   The "new" value of a revision is the next revision's
--                                     `previous`, or the live row for the most recent one.
--                                     Storing both would double the size and create a second
--                                     copy that can disagree with reality.
--   watched columns, not whole rows   Storage paths and render state are already protected by
--                                     write-once uploads, assertDisposablePath and an ON DELETE
--                                     RESTRICT foreign key. Copying them here would add bulk and
--                                     protect nothing.
--   NO MEDIA, EVER                    Not one byte of video, thumbnail or render is duplicated.
--                                     Measured: sources are 860 MB of the 934 MB in storage; a
--                                     draft revision is ~400 bytes and a research revision ~4 KB.
--
-- ── IDENTITY: NOT EVERY TABLE IS KEYED BY A UUID CALLED id ──────────────────────────────────
-- social_property_research's canonical identity is the PAIR (owner_user_id, place_id), where
-- place_id is TEXT. social_floorplan_observations has no `id` column at all — its primary key is
-- social_content_id. social_property_observations is identified in practice by
-- (social_content_id, field).
--
-- So a revision carries `entity_key` as JSONB: whatever actually identifies that row, composite
-- or not, text or uuid. `row_id` is kept beside it only as a convenience for the simple cases.
-- Nothing here changes any table's own identity.

create table if not exists public.social_revisions (
  id             bigint generated always as identity primary key,
  -- Which table. Constrained so a typo cannot silently create a parallel history nobody reads.
  entity         text not null check (entity in (
                   'social_posts', 'social_content', 'social_property_research',
                   'social_property_observations', 'social_floorplan_observations')),
  -- The CANONICAL identity of the row, composite-safe. For research this is
  -- {"owner_user_id": "...", "place_id": "..."} — the real key, not a surrogate.
  entity_key     jsonb not null,
  -- The physical primary key rendered as text, for the tables that have a single-column one.
  row_id         text,
  -- Account scope. Read from owner_user_id, or observed_by on the observation tables.
  owner_user_id  uuid not null,
  op             text not null check (op in ('update', 'delete')),
  changed_at     timestamptz not null default now(),
  -- auth.uid() when a signed-in user made the change; NULL identifies a service-role script,
  -- which is exactly the case application-level history could never have recorded.
  changed_by     uuid,
  changed_by_role text not null default current_user,
  -- The watched columns as they were BEFORE this change, and which of them actually moved.
  previous       jsonb not null,
  changed_fields text[] not null
);

comment on table public.social_revisions is
  'Append-only previous-value history for Social Beast editorial and research fields. Written by
   triggers so service-role scripts and future automations are captured too. Stores no media.';

-- Reading history means "the last few revisions of THIS row", so the index is written for that.
create index if not exists social_revisions_entity_idx
  on public.social_revisions (entity, row_id, changed_at desc);
-- Composite-keyed lookups (research by owner+place) go through the JSONB key.
create index if not exists social_revisions_key_idx
  on public.social_revisions using gin (entity_key jsonb_path_ops);
create index if not exists social_revisions_owner_idx
  on public.social_revisions (owner_user_id, changed_at desc);

-- ── ACCESS: READ YOUR OWN, WRITE NOTHING ────────────────────────────────────────────────────
-- There is deliberately no INSERT, UPDATE or DELETE policy. Only the trigger below writes here.
alter table public.social_revisions enable row level security;
alter table public.social_revisions force row level security;

drop policy if exists "owner reads own revisions" on public.social_revisions;
create policy "owner reads own revisions" on public.social_revisions
  for select using (owner_user_id = auth.uid());

revoke insert, update, delete on public.social_revisions from anon, authenticated;

-- APPEND-ONLY, INCLUDING FOR SERVICE ROLE. RLS alone would not achieve this: service_role bypasses
-- RLS entirely, so a script could otherwise rewrite the history that exists to catch scripts. A
-- trigger cannot be bypassed that way, so the guarantee holds for every caller.
create or replace function public.social_revisions_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'social_revisions is append-only: % is not permitted on revision %',
    tg_op, coalesce(old.id, -1)
    using errcode = '42501',
          hint = 'History exists to be read, not edited. Correct the live row instead; that write is itself recorded.';
end;
$$;

drop trigger if exists social_revisions_no_update on public.social_revisions;
create trigger social_revisions_no_update
  before update on public.social_revisions
  for each row execute function public.social_revisions_append_only();

drop trigger if exists social_revisions_no_delete on public.social_revisions;
create trigger social_revisions_no_delete
  before delete on public.social_revisions
  for each row execute function public.social_revisions_append_only();

-- ── THE CAPTURE TRIGGER ─────────────────────────────────────────────────────────────────────
-- ONE function for all five tables. The watched columns arrive as trigger arguments, so adding a
-- field to a table's history is a one-line trigger change and no new code.
--
-- SECURITY DEFINER is required and is kept as narrow as it can be: this is a trigger function, so
-- it cannot be CALLed directly; it performs exactly one INSERT into one table; it takes no caller
-- input beyond the row being written; and search_path is empty with every name schema-qualified,
-- so nothing can be shadowed. It grants no other access to anything.
-- jsonb_build_object with a NULL value must store JSON null, not drop the key — otherwise a field
-- cleared to NULL would vanish from `previous` and the restore would have nothing to put back.
create or replace function public.jsonb_build_object_safe(k text, v jsonb)
returns jsonb
language sql
immutable
as $$ select jsonb_build_object(k, coalesce(v, 'null'::jsonb)) $$;

create or replace function public.social_capture_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_j   jsonb := to_jsonb(old);
  new_j   jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  prev    jsonb := '{}'::jsonb;
  moved   text[] := array[]::text[];
  col     text;
  owner   uuid;
  key     jsonb;
  rid     text;
begin
  -- MEANINGFUL CHANGES ONLY. A re-save that alters nothing writes no revision. The comparison is
  -- on the JSONB rendering, so a jsonb column whose keys were merely reordered also counts as
  -- unchanged — which is what makes a no-op save genuinely free.
  foreach col in array tg_argv loop
    if tg_op = 'DELETE' or (old_j -> col) is distinct from (new_j -> col) then
      prev := prev || public.jsonb_build_object_safe(col, old_j -> col);
      moved := moved || col;
    end if;
  end loop;

  if array_length(moved, 1) is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  -- IDENTITY PER TABLE. Each entry names the row the way that table actually identifies it.
  if tg_table_name = 'social_posts' then
    owner := (old_j ->> 'owner_user_id')::uuid;
    rid   := old_j ->> 'id';
    key   := jsonb_build_object('id', old_j ->> 'id');
  elsif tg_table_name = 'social_content' then
    owner := (old_j ->> 'owner_user_id')::uuid;
    rid   := old_j ->> 'id';
    key   := jsonb_build_object('id', old_j ->> 'id');
  elsif tg_table_name = 'social_property_research' then
    owner := (old_j ->> 'owner_user_id')::uuid;
    rid   := old_j ->> 'id';
    -- THE COMPOSITE KEY, recorded as the canonical identity. A research row deleted and recreated
    -- for the same property keeps a findable history, because this is what identifies it.
    key   := jsonb_build_object('owner_user_id', old_j ->> 'owner_user_id',
                                'place_id',      old_j ->> 'place_id');
  elsif tg_table_name = 'social_property_observations' then
    owner := (old_j ->> 'observed_by')::uuid;
    rid   := old_j ->> 'id';
    key   := jsonb_build_object('social_content_id', old_j ->> 'social_content_id',
                                'field',             old_j ->> 'field');
  elsif tg_table_name = 'social_floorplan_observations' then
    owner := (old_j ->> 'observed_by')::uuid;
    -- NO `id` COLUMN ON THIS TABLE — its primary key is social_content_id.
    rid   := old_j ->> 'social_content_id';
    key   := jsonb_build_object('social_content_id', old_j ->> 'social_content_id');
  else
    -- A trigger added to a table this function does not know would otherwise record a row with no
    -- owner, readable by nobody. Fail loudly instead.
    raise exception 'social_capture_revision has no identity rule for table %', tg_table_name
      using errcode = '42P01';
  end if;

  insert into public.social_revisions
    (entity, entity_key, row_id, owner_user_id, op, changed_by, changed_by_role, previous, changed_fields)
  values
    (tg_table_name, key, rid, owner,
     case when tg_op = 'DELETE' then 'delete' else 'update' end,
     -- NULL for a service-role script. That is information, not a gap: it marks the writes an
     -- application-level history would have missed entirely. auth.uid() is schema-qualified, so it
     -- resolves under the empty search_path above.
     auth.uid(),
     current_user, prev, moved);

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke execute on function public.social_capture_revision() from anon, authenticated;

-- ── THE TRIGGERS ────────────────────────────────────────────────────────────────────────────
-- BEFORE on updates so the revision and the change land in the same transaction and roll back
-- together. AFTER on deletes for the observation tables, where clearing a form field DELETEs the
-- row outright — without this, that value would be gone with no trace.

drop trigger if exists social_posts_capture_revision on public.social_posts;
create trigger social_posts_capture_revision
  before update on public.social_posts
  for each row execute function public.social_capture_revision(
    'caption', 'hashtags', 'overlay_headline', 'overlay_subheadline',
    'overlay_template', 'overlay_mode', 'cover_thumb_offset_ms', 'cover_storage_path');

drop trigger if exists social_content_capture_revision on public.social_content;
create trigger social_content_capture_revision
  before update on public.social_content
  for each row execute function public.social_capture_revision(
    'property_type', 'amenities', 'special', 'budget_range', 'price_label_mode',
    'area_neighborhood', 'district', 'notes', 'details');

drop trigger if exists social_property_research_capture_revision on public.social_property_research;
create trigger social_property_research_capture_revision
  before update on public.social_property_research
  for each row execute function public.social_capture_revision(
    'property_name', 'stable', 'pricing', 'sources', 'unresolved');

drop trigger if exists social_property_observations_capture_revision on public.social_property_observations;
create trigger social_property_observations_capture_revision
  before update on public.social_property_observations
  for each row execute function public.social_capture_revision(
    'field', 'value', 'source_url', 'observed_at', 'status');

drop trigger if exists social_property_observations_capture_delete on public.social_property_observations;
create trigger social_property_observations_capture_delete
  after delete on public.social_property_observations
  for each row execute function public.social_capture_revision(
    'field', 'value', 'source_url', 'observed_at', 'status');

drop trigger if exists social_floorplan_observations_capture_revision on public.social_floorplan_observations;
create trigger social_floorplan_observations_capture_revision
  before update on public.social_floorplan_observations
  for each row execute function public.social_capture_revision(
    'plan_name', 'beds', 'baths', 'sqft', 'observed_price', 'price_context',
    'source_url', 'observed_at', 'status');

drop trigger if exists social_floorplan_observations_capture_delete on public.social_floorplan_observations;
create trigger social_floorplan_observations_capture_delete
  after delete on public.social_floorplan_observations
  for each row execute function public.social_capture_revision(
    'plan_name', 'beds', 'baths', 'sqft', 'observed_price', 'price_context',
    'source_url', 'observed_at', 'status');
