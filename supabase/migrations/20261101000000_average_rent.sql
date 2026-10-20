-- Average rent: what a concession is actually worth, spread over the lease.
--
-- A client reading "$1,725/month" beside "Up to 10 Weeks Free" cannot tell what they would
-- really pay. This computes it from figures a PERSON confirmed, and shows both numbers so the
-- discount reads as a discount rather than as a lower rent.
--
-- ── EVERY INPUT IS CONFIRMED, NEVER PARSED ──────────────────────────────────────────────────
-- Nothing here reads property_catalog.current_special. "Up to 10 Weeks Free on Select Homes" is
-- a ceiling on an offer that may not apply to this client's floor plan, move-in or term, so the
-- weeks used are the weeks the locator verified for THIS client. The quoted rent is the rent
-- quoted for the qualifying unit; it is a display substitution on the bedroom line and is never
-- written back over the catalog's general starting price.
--
-- ── THE CONVENTION ──────────────────────────────────────────────────────────────────────────
--     months_free = weeks * 12 / 52          (a 52-week year)
--     average     = (term - months_free) * rent / term
-- The "4 weeks = 1 month" alternative is wrong by real money: 10 weeks free at $1,725 over 15
-- months gives $1,438 instead of $1,460 — $22 a month, $332 across the lease. Mirrored exactly
-- in lib/leads/averageRent.ts, with a drift test running both over the same cases.
-- Rounding happens ONCE, at the end, to whole dollars — the same treatment the bedroom line gets.
--
-- ── IT FAILS CLOSED ─────────────────────────────────────────────────────────────────────────
-- Missing rent or term, a concession stated in both units at once, a concession that meets or
-- exceeds the lease, or the toggle off — every one returns NULL and renders nothing. Showing no
-- average costs a client nothing; showing a wrong one costs them a lease.
--
-- ── /month ──────────────────────────────────────────────────────────────────────────────────
-- The composed bedroom line now states its unit: "2BR from $1,595/month". Existing snapshots
-- keep the text they froze; only a NEWLY generated list carries the new wording, and because the
-- composed text is part of the reuse fingerprint, a prepared-but-unsent list cannot be silently
-- reused with the old formatting.
--
-- Existing snapshots gain five columns that are NULL/false, and render exactly as they do today.

-- ── THE CONFIRMED FIGURES, on the (client, property) pair ───────────────────────────────────
alter table public.lead_property_reasons
  add column if not exists avg_rent_quoted_rent       numeric,
  add column if not exists avg_rent_concession_weeks  numeric,
  add column if not exists avg_rent_concession_months numeric,
  add column if not exists avg_rent_lease_months      integer,
  add column if not exists avg_rent_show              boolean not null default false;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'lead_property_reasons_avg_rent_chk') then
    alter table public.lead_property_reasons
      add constraint lead_property_reasons_avg_rent_chk check (
        (avg_rent_quoted_rent       is null or avg_rent_quoted_rent       > 0) and
        (avg_rent_concession_weeks  is null or avg_rent_concession_weeks  > 0) and
        (avg_rent_concession_months is null or avg_rent_concession_months > 0) and
        (avg_rent_lease_months      is null or avg_rent_lease_months      > 0) and
        -- One unit or the other, never both: two statements of one concession is ambiguous.
        not (avg_rent_concession_weeks is not null and avg_rent_concession_months is not null)
      );
  end if;
end $$;

comment on column public.lead_property_reasons.avg_rent_quoted_rent is
  'The rent QUOTED for the qualifying unit, confirmed for this client. Never property_catalog''s general starting price, and never written back to it.';
comment on column public.lead_property_reasons.avg_rent_show is
  'The locator''s decision that THIS client sees the average. Necessary but not sufficient — the four figures must also be present and coherent.';

-- ── THE FROZEN COPY ─────────────────────────────────────────────────────────────────────────
alter table public.client_recommendation_share_items
  add column if not exists avg_rent_quoted_rent       numeric,
  add column if not exists avg_rent_concession_weeks  numeric,
  add column if not exists avg_rent_concession_months numeric,
  add column if not exists avg_rent_lease_months      integer,
  add column if not exists avg_rent_show              boolean not null default false;

comment on column public.client_recommendation_share_items.avg_rent_show is
  'Frozen at send time. false on every snapshot created before this column existed, so an older list shows no average.';

-- ── THE CALCULATION ─────────────────────────────────────────────────────────────────────────
-- Pure and IMMUTABLE: no table access, no clock, no side effects.
create or replace function public.lb_average_rent_months_free(
  p_weeks numeric, p_months numeric
) returns numeric
language sql
immutable
as $fn$
  -- Exactly one unit, or nothing. 12/52 is the whole convention, stated once.
  select case
           when p_weeks is not null and p_months is not null then null
           when p_weeks  is not null and p_weeks  > 0 then p_weeks * 12.0 / 52.0
           when p_months is not null and p_months > 0 then p_months
           else null
         end;
$fn$;

-- The computed average, or NULL when it must not be shown.
create or replace function public.lb_compose_average_rent(
  p_rent numeric, p_weeks numeric, p_months numeric, p_term integer, p_show boolean
) returns jsonb
language plpgsql
immutable
as $fn$
declare
  v_free numeric;
  v_avg  numeric;
begin
  if coalesce(p_show, false) is not true then return null; end if;
  if p_rent is null or p_rent <= 0 then return null; end if;
  if p_term is null or p_term <= 0 then return null; end if;

  v_free := public.lb_average_rent_months_free(p_weeks, p_months);
  if v_free is null then return null; end if;
  -- A concession that meets or exceeds the lease is a mistyped figure, not a discount.
  if v_free >= p_term then return null; end if;

  v_avg := round(((p_term - v_free) * p_rent) / p_term);
  if v_avg is null or v_avg <= 0 then return null; end if;

  return jsonb_build_object(
    'average', v_avg::int,
    'quotedRent', round(p_rent)::int,
    'concessionWeeks', p_weeks,
    'concessionMonths', p_months,
    'leaseMonths', p_term
  );
end;
$fn$;

-- The quote to substitute on the bedroom line — only when the average will actually show.
create or replace function public.lb_average_rent_quote(
  p_rent numeric, p_weeks numeric, p_months numeric, p_term integer, p_show boolean
) returns numeric
language sql
immutable
as $fn$
  select (public.lb_compose_average_rent(p_rent, p_weeks, p_months, p_term, p_show) ->> 'quotedRent')::numeric;
$fn$;

comment on function public.lb_compose_average_rent(numeric, numeric, numeric, integer, boolean) is
  'Effective monthly base rent after a confirmed concession, on a 52-week year. NULL unless the toggle is on AND all four figures are present and coherent. Mirrors lib/leads/averageRent.ts; a drift test asserts they agree.';

revoke all on function public.lb_average_rent_months_free(numeric, numeric) from public, anon;
revoke all on function public.lb_compose_average_rent(numeric, numeric, numeric, integer, boolean) from public, anon;
revoke all on function public.lb_average_rent_quote(numeric, numeric, numeric, integer, boolean) from public, anon;
grant execute on function public.lb_average_rent_months_free(numeric, numeric) to authenticated, service_role;
grant execute on function public.lb_compose_average_rent(numeric, numeric, numeric, integer, boolean) to authenticated, service_role;
grant execute on function public.lb_average_rent_quote(numeric, numeric, numeric, integer, boolean) to authenticated, service_role;

-- ── THE COMPOSER GAINS A PARAMETER ──────────────────────────────────────────────────────────
-- A DEFAULTED parameter creates an OVERLOAD, not a replacement, and a six-argument call would
-- then be ambiguous between the two — "function is not unique" at runtime, on every list sent.
-- The old signature is dropped in the same transaction and recreated with seven.
drop function if exists public.lb_compose_recommendation_reasons(jsonb, text, numeric, numeric, numeric, int);

-- ── lb_compose_recommendation_reasons — verbatim, plus /month and the quote override ────
CREATE OR REPLACE FUNCTION public.lb_compose_recommendation_reasons(p_reasons jsonb, p_beds text, p_onebr numeric, p_twobr numeric, p_threebr numeric, p_max integer DEFAULT 3, p_quoted_rent numeric DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
declare
  v_clean jsonb;
  v_beds  text;
  v_n     int;
  v_rent  numeric;
  v_text  text;
begin
  -- Blank entries are dropped and do not count toward the limit (mirrors the TS filter).
  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
    into v_clean
    from jsonb_array_elements_text(coalesce(p_reasons, '[]'::jsonb)) as t(x)
   where btrim(x) <> '';

  -- ── THE CLIENT'S BEDROOM PREFERENCE ──────────────────────────────────────────────────────
  -- Fails closed: anything not read with certainty yields no price at all. "3+" means three or
  -- more, so the 3BR starting rent IS the rent for the count they asked about. A RANGE ("1-2")
  -- is refused before any digit is read — picking either end would invent a request the client
  -- never made, and choosing the cheaper one would flatter the listing.
  v_beds := lower(btrim(coalesce(p_beds, '')));
  if v_beds = '' then return v_clean; end if;
  if v_beds ~ '\d\s*(-|–|—|to|/|,)\s*\d' then return v_clean; end if;
  if v_beds !~ '^[0-9]+\s*\+?\s*(br|bed|beds|bedroom|bedrooms)?\+?$' then return v_clean; end if;
  v_n := (substring(v_beds from '^([0-9]+)'))::int;
  if v_n not in (1, 2, 3) then return v_clean; end if;

  -- EXACT column only. There is deliberately no fallback to another bedroom count.
  -- A CONFIRMED quote stands in for the catalog figure on this line, so the rent and the
  -- average beneath it describe the SAME apartment. The catalog is never written to.
  v_rent := case when p_quoted_rent is not null and p_quoted_rent > 0 then p_quoted_rent
                 else case v_n when 1 then p_onebr when 2 then p_twobr else p_threebr end end;
  -- A stored 0 or negative is treated as "not entered", not as a free apartment.
  if v_rent is null or v_rent <= 0 then return v_clean; end if;

  -- Already stated — by us on a previous compose, or typed by the locator by hand. Matches the
  -- SHAPE, not our exact formatting, so "2 BR from $1400" also counts. (?s) so the class spans
  -- newlines, matching the [\s\S]* in the TypeScript.
  if exists (
    select 1 from jsonb_array_elements_text(v_clean) as t(x)
     -- \y, NOT \b: in a Postgres ARE \b is a BACKSPACE, not a word boundary — the drift test
     -- caught this by producing a duplicated price the TypeScript correctly suppressed.
     where x ~* '(?s)[0-9]\s*br\y.*\$\s*[0-9,]+'
  ) then
    return v_clean;
  end if;

  -- Full. Preserving what the locator wrote outranks adding what we derived.
  if jsonb_array_length(v_clean) >= p_max then return v_clean; end if;

  -- "2BR from $1,679" — whole dollars, thousands separated. "from" is load-bearing: it is what
  -- makes this a STARTING rent rather than a quote for the client's move-in date.
  v_text := v_n::text || 'BR from $' || to_char(round(v_rent), 'FM999,999,999') || '/month';

  -- Slot two: location first, price second, amenity third. With fewer saved reasons than the
  -- slot index the price simply lands at the end rather than leaving a gap.
  if jsonb_array_length(v_clean) = 0 then
    return jsonb_build_array(v_text);
  end if;
  return jsonb_insert(v_clean, '{1}', to_jsonb(v_text));
end;
$function$;

revoke all on function public.lb_compose_recommendation_reasons(jsonb, text, numeric, numeric, numeric, int, numeric) from public, anon;
grant execute on function public.lb_compose_recommendation_reasons(jsonb, text, numeric, numeric, numeric, int, numeric) to authenticated, service_role;

-- ── lb_create_client_share — verbatim, plus the five frozen figures ─────────────────────
CREATE OR REPLACE FUNCTION public.lb_create_client_share(p_lead_id bigint, p_token_hash text, p_token_prefix text, p_raw_token text)
 RETURNS TABLE(share_id uuid, list_number integer, item_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ws        uuid;
  v_share_id  uuid;
  v_list_no   integer;
  v_count     integer;
  v_secret_id uuid;
begin
  select l.workspace_id
  into v_ws
  from public.leads l
  where l.id = p_lead_id;

  if v_ws is null then
    raise exception 'lb_create_client_share: lead % has no workspace', p_lead_id;
  end if;

  if not public.is_active_workspace_member(v_ws) then
    raise exception 'lb_create_client_share: not a member of this lead''s workspace';
  end if;

  select coalesce(max(s.list_number), 0) + 1
  into v_list_no
  from public.client_recommendation_shares s
  where s.lead_id = p_lead_id;

  insert into public.client_recommendation_shares (
    lead_id,
    token_hash,
    token_prefix,
    list_number
  )
  values (
    p_lead_id,
    p_token_hash,
    p_token_prefix,
    v_list_no
  )
  returning id into v_share_id;

  v_secret_id := vault.create_secret(
    p_raw_token,
    'client-share:' || v_share_id::text,
    'Raw client recommendation share token (Copy Link)'
  );

  update public.client_recommendation_shares
  set token_secret_id = v_secret_id
  where id = v_share_id;

  insert into public.client_recommendation_share_items (
    share_id,
    source_recommendation_id,
    property_name,
    property_address,
    property_image_url,
    property_website_url,
    reasons,
    sort_order,
    place_id,
    google_rating,
    current_special,
    washer_dryer_status,
    avg_rent_quoted_rent,
    avg_rent_concession_weeks,
    avg_rent_concession_months,
    avg_rent_lease_months,
    avg_rent_show
  )
  select
    v_share_id,
    r.id,
    r.property_name,
    r.property_address,
    r.property_image_url,
    r.property_website_url,
    public.lb_compose_recommendation_reasons(
      to_jsonb(pr.reasons), l.beds,
      pc.onebr_starting_rent, pc.twobr_starting_rent, pc.threebr_starting_rent,
      3,
      public.lb_average_rent_quote(pr.avg_rent_quoted_rent, pr.avg_rent_concession_weeks,
                                   pr.avg_rent_concession_months, pr.avg_rent_lease_months,
                                   pr.avg_rent_show)
    ),
    (row_number() over (order by r.sort_order asc nulls last, r.created_at asc, r.id asc))::int,

    -- The snapshot's own copy of the routing identity.
    -- canonical_property_key is generated as 'pid:<place id>'
    -- for a Google-resolved property and 'url:<property_url>'
    -- for an unresolved one.
    nullif(
      substring(r.canonical_property_key from '^pid:(.*)$'),
      ''
    ),

    pc.google_rating,
    pc.current_special,

    -- The CLIENT-SPECIFIC status the locator confirmed for THIS pair. It comes from
    -- lead_property_reasons (already joined for the reasons), never from
    -- property_catalog.washer_dryer_included — a property-level 'Yes' is not a promise
    -- about the floor plan this client would lease.
    pr.washer_dryer_status,

    -- The four CONFIRMED figures and the locator's decision, frozen as they were. The
    -- average itself is NOT stored: it is derived from these, so a corrected input can
    -- never leave a stale number behind it.
    pr.avg_rent_quoted_rent,
    pr.avg_rent_concession_weeks,
    pr.avg_rent_concession_months,
    pr.avg_rent_lease_months,
    coalesce(pr.avg_rent_show, false)

  from public.lead_recommendations r

  left join public.lead_property_reasons pr
    on pr.lead_id = r.lead_id
    and pr.canonical_property_key = r.canonical_property_key

  left join public.property_catalog pc
    on pc.place_id = nullif(
      substring(r.canonical_property_key from '^pid:(.*)$'),
      ''
    )

  left join public.leads l on l.id = r.lead_id

  where r.lead_id = p_lead_id;

  select count(*)::int
  into v_count
  from public.client_recommendation_share_items ci
  where ci.share_id = v_share_id;

  update public.client_recommendation_shares s
  set item_count = v_count
  where s.id = v_share_id;

  return query
  select v_share_id, v_list_no, v_count;
end
$function$;

-- ── lb_prepare_client_share — verbatim, plus all five on both sides of the hash ─────────
CREATE OR REPLACE FUNCTION public.lb_prepare_client_share(p_lead_id bigint, p_token_hash text, p_token_prefix text, p_raw_token text)
 RETURNS TABLE(share_id uuid, list_number integer, item_count integer, reused boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_ws       uuid;
  v_existing uuid;
  v_list_no  integer;
  v_count    integer;
  v_cur_fp   text;
  v_snap_fp  text;
begin
  select l.workspace_id into v_ws from public.leads l where l.id = p_lead_id;
  if v_ws is null then
    raise exception 'lb_prepare_client_share: lead % has no workspace', p_lead_id;
  end if;
  if not public.is_active_workspace_member(v_ws) then
    raise exception 'lb_prepare_client_share: not a member of this lead''s workspace';
  end if;

  select string_agg(
           coalesce(r.property_name,'')       || E'\x1f' ||
           coalesce(r.property_address,'')     || E'\x1f' ||
           coalesce(r.property_image_url,'')   || E'\x1f' ||
           coalesce(r.property_website_url,'') || E'\x1f' ||
           public.lb_compose_recommendation_reasons(
             to_jsonb(pr.reasons), l.beds,
             pc.onebr_starting_rent, pc.twobr_starting_rent, pc.threebr_starting_rent,
             3,
             public.lb_average_rent_quote(pr.avg_rent_quoted_rent, pr.avg_rent_concession_weeks,
                                          pr.avg_rent_concession_months, pr.avg_rent_lease_months,
                                          pr.avg_rent_show)
           )::text || E'\x1f' ||
           coalesce(pr.washer_dryer_status, '') || E'\x1f' ||
           coalesce(pr.avg_rent_quoted_rent::text, '') || '~' ||
           coalesce(pr.avg_rent_concession_weeks::text, '') || '~' ||
           coalesce(pr.avg_rent_concession_months::text, '') || '~' ||
           coalesce(pr.avg_rent_lease_months::text, '') || '~' ||
           coalesce(pr.avg_rent_show::text, 'false'),
           E'\x1e' order by r.sort_order asc nulls last, r.created_at asc, r.id asc)
    into v_cur_fp
    from public.lead_recommendations r
    left join public.lead_property_reasons pr
           on pr.lead_id = r.lead_id
          and pr.canonical_property_key = r.canonical_property_key
    left join public.property_catalog pc
           on pc.place_id = nullif(substring(r.canonical_property_key from '^pid:(.*)$'), '')
    left join public.leads l on l.id = r.lead_id
   where r.lead_id = p_lead_id;

  select s.id, s.list_number
    into v_existing, v_list_no
    from public.client_recommendation_shares s
   where s.lead_id = p_lead_id
     and s.sent_at is null
     and s.disabled_at is null
     and s.revoked_at is null
   order by s.list_number desc
   limit 1;

  if v_existing is not null then
    select string_agg(
             coalesce(ci.property_name,'')       || E'\x1f' ||
             coalesce(ci.property_address,'')     || E'\x1f' ||
             coalesce(ci.property_image_url,'')   || E'\x1f' ||
             coalesce(ci.property_website_url,'') || E'\x1f' ||
             coalesce(ci.reasons, '[]'::jsonb)::text || E'\x1f' ||
             coalesce(ci.washer_dryer_status, '') || E'\x1f' ||
             coalesce(ci.avg_rent_quoted_rent::text, '') || '~' ||
             coalesce(ci.avg_rent_concession_weeks::text, '') || '~' ||
             coalesce(ci.avg_rent_concession_months::text, '') || '~' ||
             coalesce(ci.avg_rent_lease_months::text, '') || '~' ||
             coalesce(ci.avg_rent_show::text, 'false'),
             E'\x1e' order by ci.sort_order asc)
      into v_snap_fp
      from public.client_recommendation_share_items ci
     where ci.share_id = v_existing;

    if v_cur_fp is not distinct from v_snap_fp then
      select s.item_count into v_count
        from public.client_recommendation_shares s where s.id = v_existing;
      return query select v_existing, v_list_no, coalesce(v_count, 0), true;
      return;
    end if;
  end if;

  return query
    select c.share_id, c.list_number, c.item_count, false
      from public.lb_create_client_share(p_lead_id, p_token_hash, p_token_prefix, p_raw_token) c;
end $function$;

-- ── lb_resolve_client_recommendations — verbatim, plus one averageRent object ───────────
CREATE OR REPLACE FUNCTION public.lb_resolve_client_recommendations(p_token_hash text)
 RETURNS TABLE(status text, agent_name text, agent_photo_url text, agent_title text, agent_phone text, agent_email text, agent_brokerage text, smart_form_config jsonb, client_first_name text, client_city text, properties jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_share record; v_status text;
begin
  select s.id, s.lead_id, s.disabled_at, s.revoked_at into v_share
    from public.client_recommendation_shares s
   where s.token_hash = p_token_hash and s.revoked_at is null limit 1;
  if v_share.id is null then return; end if;
  v_status := case when v_share.disabled_at is not null then 'disabled' else 'active' end;
  return query
  select
    v_status,
    coalesce(nullif(trim(concat_ws(' ', nullif(trim(p.preferred_first_name), ''), nullif(trim(p.preferred_last_name), ''))), ''),
      nullif(trim(p.preferred_name), ''), nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), 'Your Locator')::text,
    p.profile_photo_url::text,
    'Licensed Apartment Locator'::text,
    nullif(trim(p.phone_number), '')::text,
    nullif(trim(p.email), '')::text,
    coalesce(nullif(trim(p.brokerage), ''), nullif(trim(p.business_name), ''))::text,
    w.smart_form_config,
    nullif(trim(l.first_name), '')::text,
    nullif(trim(l.city), '')::text,
    case when v_status <> 'active' then null::jsonb
      else coalesce((
        select jsonb_agg(jsonb_build_object(
                 'name', i.property_name, 'address', i.property_address,
                 'imageUrl', coalesce(i.property_image_url, pc.property_image_url),
                 'backupImageUrl', pc.property_image_url_backup,
                 'websiteUrl', coalesce(i.property_website_url, pc.website_url),
                 'reasons', coalesce(i.reasons, '[]'::jsonb),
                 'startingPrice', i.starting_price,
                 -- Snapshot-first; fall back to a FRESH canonical special only when the
                 -- snapshot has none. Stale/absent canonical special → nothing shown.
                 'currentSpecial', coalesce(
                   nullif(btrim(i.current_special), ''),
                   case when coalesce(pc.current_special_checked_at, pc.verified_at)
                             > now() - interval '45 days' then pc.current_special end),
                 'googleRating', i.google_rating,
                 'washerDryer', i.washer_dryer_status,
                 'averageRent', public.lb_compose_average_rent(
                                  i.avg_rent_quoted_rent, i.avg_rent_concession_weeks,
                                  i.avg_rent_concession_months, i.avg_rent_lease_months,
                                  i.avg_rent_show),
                 'index', i.sort_order, 'favorited', (i.favorited_at is not null)
               ) order by i.sort_order asc)
          from public.client_recommendation_share_items i
          left join public.property_catalog pc on pc.place_id = i.place_id
         where i.share_id = v_share.id
      ), '[]'::jsonb)
    end
  from public.leads l
  join public.workspaces w on w.id = l.workspace_id
  join public.profiles p on p.id = w.created_by
  where l.id = v_share.lead_id limit 1;
end $function$;
