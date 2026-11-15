-- A FINISHED RENDER BECOMES A ROW.
--
-- Phase B of agent-specific rendering. Additive only: a new table, one new nullable column on
-- social_posts, and a backfill. Nothing reads either yet — rendered_storage_path stays the single
-- source every publisher, planner and UI consults, and this migration does not touch it. That is
-- what makes it safe to apply ahead of the code that writes to it.
--
-- ── WHY AN ARTIFACT NEEDS AN IDENTITY ───────────────────────────────────────────────────────
-- Reuse already exists in this codebase: storyCompanion copies a Reel's rendered_storage_path
-- verbatim — "The SAME artifact. Not a re-render: the two surfaces share geometry." Implemented
-- as column copying between two rows, which is the form that does not scale. The artifact has no
-- identity, nothing knows how many posts point at it, and no record survives of WHY the reuse was
-- legitimate. This migration gives that existing concept a name so later phases can ask questions
-- of it.

create table if not exists public.social_renders (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  source_content_id uuid not null references public.social_content(id) on delete cascade,

  -- THE ARTIFACT. One row per file; the file is what this table is about.
  storage_path text not null,
  safe_area_id text not null,

  -- ── THE CONTENT ADDRESS, AND WHY IT IS NULLABLE ───────────────────────────────────────────
  -- A fingerprint is a hash of the complete RenderSpec that produced the artifact. Renders made
  -- BEFORE Phase A have no recorded spec, and their post's columns may have been edited since —
  -- so there is no honest way to compute one for them after the fact. Claiming a fingerprint from
  -- today's columns would assert that an artifact matches a spec it may never have been rendered
  -- from, and the first thing that assertion would do is hand the wrong video to a real account.
  --
  -- So legacy rows carry NULL and can never match anything. Fail-closed: they are simply never
  -- reusable, which is the correct answer to "we do not know what this is".
  fingerprint text,
  renderer_version integer,
  spec jsonb,

  -- ── WHOSE IDENTITY IS IN THE PIXELS ───────────────────────────────────────────────────────
  --   unknown  we cannot say. The default, and the only honest value for a legacy artifact or
  --            for any render whose SOURCE FOOTAGE has not been certified by a person.
  --   owned    an AI presenter or a voice clip was composited in; it carries that owner.
  --   clean    certified to carry nobody's identity. NOTHING WRITES THIS YET — it requires the
  --            human certification Phase C introduces, because an empty presenter field does not
  --            prove the footage is free of personal identity. Measured on this database: all 15
  --            posts built from the operator's own Personal videos have presenter and voice NULL.
  --            The inference is not merely weak, it is inverted.
  identity_state text not null default 'unknown'
    check (identity_state in ('unknown', 'owned', 'clean')),
  identity_owner_user_id uuid references auth.users(id) on delete set null,

  created_at timestamptz not null default now()
);

-- ONE ROW PER ARTIFACT FILE. The file is the entity; two rows describing one file would make
-- "which render is this?" ambiguous at exactly the moment it matters.
create unique index if not exists social_renders_storage_path_uidx
  on public.social_renders (storage_path);

-- ── NOT UNIQUE, AND THAT IS DELIBERATE FOR NOW ────────────────────────────────────────────
-- Two posts rendered separately from identical specs — same source, same overlay, same
-- geometry — produce two distinct artifacts with the SAME fingerprint. That is wasteful, and it
-- is exactly what a later phase removes by reusing the first artifact instead of rendering the
-- second. But it is legal today, and a unique constraint here would turn it into a failed write
-- during a perfectly good render.
--
-- Uniqueness belongs with reuse, not before it: when a render first LOOKS UP a fingerprint
-- before rendering, the constraint becomes meaningful and can be added then.
create index if not exists social_renders_fingerprint_idx
  on public.social_renders (fingerprint) where fingerprint is not null;

create index if not exists social_renders_source_idx
  on public.social_renders (source_content_id);

comment on table public.social_renders is
  'A finished rendered MP4 as a first-class row, so several posts can reference one artifact deliberately instead of by copying a path. Nothing reads this yet: social_posts.rendered_storage_path remains the operative column.';
comment on column public.social_renders.fingerprint is
  'sha256 of the canonical RenderSpec that produced this artifact. NULL for renders made before Phase A, whose spec was never recorded — those can never match and are never reusable.';
comment on column public.social_renders.identity_state is
  'unknown | owned | clean. Nothing writes ''clean'' before Phase C: it requires a person certifying the SOURCE footage, which an empty presenter field does not establish.';

-- ── RLS: ADMIN-ONLY, THE SAME SHAPE social_posts USES ───────────────────────────────────────
-- No agent policy yet. Agents do not read renders until a later phase gives them a reason to,
-- and an unused permissive policy is a permission nobody remembers granting.
alter table public.social_renders enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'social_renders' and policyname = 'platform admin owns social_renders') then
    create policy "platform admin owns social_renders" on public.social_renders
      for all
      using (public.is_platform_admin() and owner_user_id = auth.uid())
      with check (public.is_platform_admin() and owner_user_id = auth.uid());
  end if;
end
$$;

-- ── THE POST'S POINTER ──────────────────────────────────────────────────────────────────────
-- Nullable, no default, and NOT a replacement for rendered_storage_path. Both are written from
-- here on; every reader keeps using the path. The pointer is the thing a later phase migrates
-- readers onto, one at a time, with the mirror still underneath.
alter table public.social_posts
  add column if not exists render_id uuid references public.social_renders(id) on delete set null;

create index if not exists social_posts_render_id_idx
  on public.social_posts (render_id);

comment on column public.social_posts.render_id is
  'The social_renders row for this post''s artifact. A MIRROR of rendered_storage_path during the transition — the path remains operative and nothing reads this column yet.';

-- ── BACKFILL ────────────────────────────────────────────────────────────────────────────────
-- One row per DISTINCT artifact, then point every post at the row for its path. Written as two
-- statements rather than a loop so re-running is a no-op: the insert skips what exists and the
-- update is idempotent.
--
-- safe_area_id is derived from the path suffix, which is exactly how renderPost encodes it: a
-- Reel keeps the historic un-suffixed shape and anything else carries '-<safeAreaId>'.
insert into public.social_renders
  (owner_user_id, source_content_id, storage_path, safe_area_id, identity_state, identity_owner_user_id)
select distinct on (p.rendered_storage_path)
  p.owner_user_id,
  p.source_content_id,
  p.rendered_storage_path,
  case when p.rendered_storage_path like '%-tiktok.mp4' then 'tiktok' else 'instagram' end,
  -- 'owned' only where an identity input is PRESENT, which is knowable. Its absence proves
  -- nothing about the footage, so everything else stays 'unknown'.
  case when p.presenter_id is not null or p.voice_hook_id is not null or p.voice_cta_id is not null
       then 'owned' else 'unknown' end,
  case when p.presenter_id is not null or p.voice_hook_id is not null or p.voice_cta_id is not null
       then p.owner_user_id else null end
from public.social_posts p
where p.rendered_storage_path is not null
  and p.source_content_id is not null
  and p.owner_user_id is not null
  and not exists (select 1 from public.social_renders r where r.storage_path = p.rendered_storage_path)
order by p.rendered_storage_path, p.created_at;

update public.social_posts p
   set render_id = r.id
  from public.social_renders r
 where r.storage_path = p.rendered_storage_path
   and p.render_id is distinct from r.id;
