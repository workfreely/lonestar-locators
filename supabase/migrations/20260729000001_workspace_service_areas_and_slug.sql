-- Workspace service areas + permanent public slug.
--
-- Service areas: the ONLY market data stored in the DB — an array of market
-- SLUGS from lib/markets/catalog.ts (the markets/neighborhoods catalog itself
-- lives in code). Drives which cities the Smart Lead Form shows. Read live, so
-- changing it is reflected on the form immediately (no republish).
--
-- Slug: the workspace's PERMANENT public identifier (locatorbeast.com/{slug}).
-- Generated once from the business name (else the owner's first+last), locked
-- forever after. Independent of service areas — adding/removing markets never
-- changes the slug.

alter table public.workspaces
  add column if not exists service_areas text[] not null default '{}';

-- ── slugify: lowercase, non-alphanumerics -> single hyphens, trimmed ─────────
create or replace function public.slugify(p_input text)
returns text
language sql immutable set search_path = public as $$
  select trim(both '-' from
           regexp_replace(
             regexp_replace(lower(coalesce(p_input, '')), '[^a-z0-9]+', '-', 'g'),
             '-{2,}', '-', 'g'
           )
         );
$$;

-- ── Resolve the caller's active (solo) workspace id ─────────────────────────
create or replace function public.current_workspace_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select workspace_id
  from public.workspace_members
  where user_id = auth.uid() and status = 'active'
  order by joined_at asc
  limit 1;
$$;

-- ── Set the caller's workspace service areas (array of catalog slugs) ────────
create or replace function public.set_workspace_service_areas(p_areas text[])
returns void
language plpgsql security definer set search_path = public as $$
declare v_ws uuid;
begin
  v_ws := public.current_workspace_id();
  if v_ws is null then
    raise exception 'no active workspace for current user';
  end if;

  update public.workspaces
  set service_areas = coalesce(p_areas, '{}'),
      updated_at = now()
  where id = v_ws;
end;
$$;

-- ── Generate the permanent slug ONCE (idempotent; never overwrites) ──────────
-- p_base is the raw text to slugify (business name, or "First Last"). On
-- collision, appends -2, -3, … Returns the workspace's slug (existing or new).
create or replace function public.ensure_workspace_slug(p_base text)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_ws       uuid;
  v_existing text;
  v_root     text;
  v_candidate text;
  v_n        int := 1;
begin
  v_ws := public.current_workspace_id();
  if v_ws is null then
    raise exception 'no active workspace for current user';
  end if;

  select slug into v_existing from public.workspaces where id = v_ws;
  if v_existing is not null and v_existing <> '' then
    return v_existing;  -- already generated; permanent.
  end if;

  v_root := public.slugify(p_base);
  if v_root is null or v_root = '' then
    v_root := 'workspace';
  end if;

  v_candidate := v_root;
  while exists (select 1 from public.workspaces where slug = v_candidate) loop
    v_n := v_n + 1;
    v_candidate := v_root || '-' || v_n;
  end loop;

  update public.workspaces set slug = v_candidate, updated_at = now() where id = v_ws;
  return v_candidate;
end;
$$;

-- ── Read the caller's workspace slug + service areas (for Settings + form) ───
create or replace function public.get_current_workspace()
returns table (slug text, service_areas text[])
language sql stable security definer set search_path = public as $$
  select w.slug, w.service_areas
  from public.workspaces w
  where w.id = public.current_workspace_id();
$$;

comment on column public.workspaces.service_areas is
  'Array of market slugs from lib/markets/catalog.ts. Only market data stored in the DB; drives the Smart Lead Form live.';
