-- ============================================================================
-- Phase 3a - client-facing fields on lead_recommendations + the public resolver
-- ============================================================================
-- Adds the columns the client Recommendation page renders, and ONE SECURITY
-- DEFINER function for the public route. No Favorite writes (phase 5), no Send
-- List integration (phase 6).
--
-- Every column is NULLABLE and additive: existing recommendations stay valid and
-- simply render without the fields they lack. Nothing is ever fabricated - a
-- property with no website shows no website button, a property with no rent
-- shows no price.
--
-- property_url is DELIBERATELY untouched. It remains the source/identity/
-- provenance URL (the SAD ViewProperty page, or the Google Maps place URL) and
-- is what dedupe and the Recommendation <-> Favorite move match on. It is NEVER
-- shown to the client: the page must not send a renter to a locator-only listing.

alter table public.lead_recommendations
  -- The OFFICIAL property website. Client-facing destination, never guessed or
  -- constructed - only stored when a provider actually supplies one.
  add column if not exists property_website_url text,
  -- Up to 3 concise, factual reasons, captured as a SNAPSHOT when the property
  -- was recommended. Never regenerated at render time, so what the client sees
  -- cannot silently change between one visit and the next.
  add column if not exists reasons text[],
  -- Rent range, when known. Two integers rather than a formatted string so the
  -- page controls presentation.
  add column if not exists rent_min integer,
  add column if not exists rent_max integer,
  -- Current concession/special, verbatim from the provider when present.
  add column if not exists special text;

-- At most 3 reasons. Enforced in the database because this is a client-facing
-- promise about how much the page can show, not a UI preference.
alter table public.lead_recommendations
  drop constraint if exists lead_recommendations_reasons_max3;
alter table public.lead_recommendations
  add constraint lead_recommendations_reasons_max3
  check (reasons is null or array_length(reasons, 1) <= 3);

comment on column public.lead_recommendations.property_website_url is
  'Official client-facing property website. NULL when unknown - never derived from property_url, which is a locator-only source URL.';
comment on column public.lead_recommendations.reasons is
  '<=3 factual reasons, snapshotted at recommend time. Not regenerated on render.';

-- ── Public resolver ─────────────────────────────────────────────────────────
-- The ONLY way the public page reads data. Takes the sha256 of the raw token
-- (hashed in Node, so the raw secret never enters Postgres logs) and returns an
-- explicit, client-safe column list.
--
-- ACCESS STATE IS DECIDED HERE, NOT IN THE PAGE. A paused list returns its
-- status with NO property payload at all: returning rows and hiding them in the
-- UI would still ship the properties in the page's data payload, which is not
-- "hidden" in any meaningful sense.
--
--   unknown / revoked -> no row      -> the page 404s (a dead token must not
--                                       confirm it ever existed)
--   paused            -> status only -> neutral message
--   active            -> status + properties
--
-- NEVER returned: lead id, workspace id, notes, credit/background, commissions,
-- CRM stage, brokerage internals, phone, email, move date, or property_url.
create or replace function public.lb_resolve_client_recommendations(p_token_hash text)
returns table (
  status            text,
  agent_name        text,
  agent_photo_url   text,
  agent_title       text,
  client_first_name text,
  properties        jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_share  record;
  v_status text;
begin
  select s.id, s.lead_id, s.paused_at, s.revoked_at
    into v_share
    from public.client_recommendation_shares s
   where s.token_hash = p_token_hash
     and s.revoked_at is null
   limit 1;

  -- No usable share: return nothing. Revoked and unknown are indistinguishable
  -- on purpose.
  if v_share.id is null then
    return;
  end if;

  v_status := case when v_share.paused_at is not null then 'paused' else 'active' end;

  return query
  select
    v_status,
    coalesce(
      nullif(trim(p.preferred_name), ''),
      nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
      'Your Locator'
    )::text,
    p.profile_photo_url::text,
    'Licensed Apartment Locator'::text,
    nullif(trim(l.first_name), '')::text,
    case
      when v_status <> 'active' then null::jsonb
      else coalesce((
        select jsonb_agg(jsonb_build_object(
                 'name',       r.property_name,
                 'address',    r.property_address,
                 'imageUrl',   r.property_image_url,
                 'websiteUrl', r.property_website_url,
                 'reasons',    coalesce(to_jsonb(r.reasons), '[]'::jsonb),
                 'rentMin',    r.rent_min,
                 'rentMax',    r.rent_max,
                 'special',    r.special
               ) order by r.created_at asc)
          from public.lead_recommendations r
         where r.lead_id = v_share.lead_id
      ), '[]'::jsonb)
    end
  from public.leads l
  join public.workspaces w on w.id = l.workspace_id
  join public.profiles   p on p.id = w.created_by
  where l.id = v_share.lead_id
  limit 1;
end $$;

grant execute on function public.lb_resolve_client_recommendations(text) to anon, authenticated;

-- Record that a link was opened. Separate from the resolver so the resolver can
-- stay STABLE. Deliberately also records a view of a PAUSED list - knowing a
-- client tried to open one is useful signal, and it is not property data.
create or replace function public.lb_touch_client_share(p_token_hash text)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.client_recommendation_shares
     set last_viewed_at = now()
   where token_hash = p_token_hash
     and revoked_at is null;
$$;

grant execute on function public.lb_touch_client_share(text) to anon, authenticated;
