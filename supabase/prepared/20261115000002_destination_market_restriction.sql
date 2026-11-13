-- Social Beast — PER-DESTINATION MARKET RESTRICTION.
--
-- One nullable column on social_connections, plus one ownership-verified RPC to set it. Nothing
-- else changes: no RLS change, no index, no trigger, no backfill, no touch of any token, scope,
-- cadence or pause column.
--
-- ── WHY A COLUMN ON THE CONNECTION, NOT A SETTING PER PLATFORM ───────────────────────────────
-- A publishing destination is a social_connections ROW — one per account, carrying its own
-- provider, its own Vault token, its own pause flag and its own cadence. Instagram and TikTok are
-- already two rows of the same shape, so a restriction stored HERE is shared by both platforms by
-- construction rather than by a branch that has to be written twice and kept in agreement. A
-- second TikTok account becomes a second row and inherits this column with no further schema work.
--
-- ── WHY text[] AND NOT text ──────────────────────────────────────────────────────────────────
-- Social Beast's market labels are free text stored verbatim (lib/social/markets.ts), and it lists
-- Dallas and DFW as DISTINCT markets that are never merged into each other. A single-value column
-- would force a migration the first time one brand should carry both. Production today holds no
-- DFW content at all — 138 Dallas, 66 San Antonio, 38 Houston, 18 Austin — so ARRAY['Dallas'] is
-- the whole restriction for now, and adding 'DFW' later is an UPDATE rather than a release.
--
-- ── WHAT NULL MEANS ──────────────────────────────────────────────────────────────────────────
-- NULL is UNRESTRICTED: draw from every market, exactly as the planner behaves today. The column
-- is added with no default, so every existing row — the live @realestatepro_tx Instagram
-- destination and the live TikTok destination — reads NULL and keeps its current behaviour
-- byte-for-byte. Restriction is opt-in per destination and can never arrive by accident.

alter table public.social_connections
  add column if not exists market_restriction text[];

comment on column public.social_connections.market_restriction is
  'Per-destination market restriction. NULL = unrestricted (draw from every market), which is the
   behaviour of every row that predates this column. A non-empty array means this destination may
   only ever be offered, and may only ever publish, content whose social_content.market matches one
   of these labels (compared case-insensitively after trimming; Dallas and DFW are DISTINCT labels
   and are never merged). Enforced in TWO places: the autopilot planner filters the pool per
   destination BEFORE selection, so a restricted destination has no other-market candidate to pick;
   and both publish workers re-check the row''s market against this column immediately before
   publishing. Set only through sa_update_destination_markets.';

-- Shape guard. The RPC below is the sanctioned writer and it trims, de-duplicates and sorts, so
-- whitespace-only entries cannot reach the column through it. This constraint is the backstop for
-- anything else: it rejects an EMPTY array (which would otherwise read as "no market is allowed"
-- and silently stop the destination), a NULL member, and an empty-string member. A whitespace-only
-- member is deliberately NOT expressible as a CHECK here (it needs a per-element transform, which
-- a CHECK cannot do without an immutable helper function), and it is handled in the RPC instead.
-- "Unrestricted" is spelled NULL, never ARRAY[]::text[].
alter table public.social_connections
  drop constraint if exists social_connections_market_restriction_shape;
alter table public.social_connections
  add constraint social_connections_market_restriction_shape check (
    market_restriction is null
    or (
      cardinality(market_restriction) between 1 and 12
      and array_position(market_restriction, null) is null
      and cardinality(array_remove(market_restriction, '')) = cardinality(market_restriction)
    )
  );

-- ── The one writer: connection-ID-scoped, ownership-verified ─────────────────────────────────
-- Same shape as sa_update_destination_cadence (20260913000002): _sa_require_owned_connection
-- raises unless the caller is a platform admin who owns this exact connection, so setting one
-- destination's markets can never reach another's. Passing NULL — or an array that is empty once
-- blanks are dropped — CLEARS the restriction, which is how a destination is returned to
-- unrestricted without a second function.
create or replace function public.sa_update_destination_markets(
  p_connection_id uuid, p_markets text[])
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := public._sa_require_owned_connection(p_connection_id);
  v_clean text[];
begin
  if p_markets is null then
    v_clean := null;
  else
    select array(select distinct btrim(m)
                   from unnest(p_markets) as m
                  where btrim(m) <> ''
                  order by 1)
      into v_clean;
    if v_clean is null or cardinality(v_clean) = 0 then
      v_clean := null;             -- an all-blank list means "unrestricted", not "nothing allowed"
    end if;
  end if;

  update public.social_connections
     set market_restriction = v_clean, updated_at = now()
   where id = p_connection_id and owner_user_id = v_uid;
end $$;

revoke all on function public.sa_update_destination_markets(uuid, text[]) from public, anon;
grant execute on function public.sa_update_destination_markets(uuid, text[]) to authenticated;
