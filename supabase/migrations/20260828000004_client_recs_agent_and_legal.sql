-- ============================================================================
-- Client Recommendation page: agent contact + the agent's OWN legal config
-- ============================================================================
-- Replaces lb_resolve_client_recommendations to also return the locator's phone,
-- brokerage, and their saved smart_form_config.
--
-- WHY smart_form_config: the legal/disclosure block on the client page must be
-- the SAME one the agent already configured for their Smart Lead Form - Texas
-- TREC presets (IABS / Consumer Protection Notice) and any custom disclosure
-- rows. Returning the existing config lets the page render the EXISTING
-- app/smart-lead-form/.../Footer.tsx component rather than growing a second,
-- independently-maintained legal system that could silently drift out of
-- compliance. One source of truth: the agent edits it in one place.
--
-- Still never returned: lead id, workspace id, notes, credit/background,
-- commissions, CRM stage, client contact details, or property_url.
-- The return type gains columns, and CREATE OR REPLACE cannot change a function's
-- OUT parameters, so the old signature is dropped first. Safe: nothing in the
-- application calls it yet except the page shipped in this same change.
drop function if exists public.lb_resolve_client_recommendations(text);

create or replace function public.lb_resolve_client_recommendations(p_token_hash text)
returns table (
  status            text,
  agent_name        text,
  agent_photo_url   text,
  agent_title       text,
  agent_phone       text,
  agent_brokerage   text,
  smart_form_config jsonb,
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

  if v_share.id is null then
    return;   -- unknown and revoked are deliberately indistinguishable
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
    nullif(trim(p.phone_number), '')::text,
    coalesce(nullif(trim(p.brokerage), ''), nullif(trim(p.business_name), ''))::text,
    -- The legal block renders even on a paused page: a disclosure is not
    -- property data, and stripping it would be the wrong thing to withhold.
    w.smart_form_config,
    nullif(trim(l.first_name), '')::text,
    case
      when v_status <> 'active' then null::jsonb
      else coalesce((
        select jsonb_agg(jsonb_build_object(
                 'name',       r.property_name,
                 'address',    r.property_address,
                 'imageUrl',   r.property_image_url,
                 'websiteUrl', r.property_website_url,
                 'reasons',    coalesce(to_jsonb(r.reasons), '[]'::jsonb)
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
