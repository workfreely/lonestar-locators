-- CP2 fix: lb_create_client_share had an ambiguous column reference.
-- The function RETURNS TABLE (share_id …), so the OUT column `share_id` is an
-- in-scope PL/pgSQL variable; the item-count query `… where share_id = v_share_id`
-- then couldn't tell the OUT variable from client_recommendation_share_items.share_id
-- and raised "column reference share_id is ambiguous" as soon as an authorized
-- caller got past the membership guard. Fix: alias the table in that one query.
-- Behavior is otherwise identical to the CP1 definition.
create or replace function public.lb_create_client_share(
  p_lead_id      bigint,
  p_token_hash   text,
  p_token_prefix text
) returns table (share_id uuid, list_number integer, item_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ws       uuid;
  v_share_id uuid;
  v_list_no  integer;
  v_count    integer;
begin
  select l.workspace_id into v_ws from public.leads l where l.id = p_lead_id;
  if v_ws is null then
    raise exception 'lb_create_client_share: lead % has no workspace', p_lead_id;
  end if;
  if not public.is_active_workspace_member(v_ws) then
    raise exception 'lb_create_client_share: not a member of this lead''s workspace';
  end if;

  select coalesce(max(s.list_number), 0) + 1 into v_list_no
    from public.client_recommendation_shares s where s.lead_id = p_lead_id;

  insert into public.client_recommendation_shares (lead_id, token_hash, token_prefix, list_number)
  values (p_lead_id, p_token_hash, p_token_prefix, v_list_no)
  returning id into v_share_id;

  insert into public.client_recommendation_share_items
    (share_id, source_recommendation_id, property_name, property_address,
     property_image_url, property_website_url, reasons, sort_order)
  select v_share_id, r.id, r.property_name, r.property_address,
         r.property_image_url, r.property_website_url,
         coalesce(to_jsonb(r.reasons), '[]'::jsonb),
         (row_number() over (order by r.created_at asc))::int
    from public.lead_recommendations r
   where r.lead_id = p_lead_id;

  -- FIX: alias the table so `share_id` is unambiguous vs the OUT column.
  select count(*)::int into v_count
    from public.client_recommendation_share_items ci where ci.share_id = v_share_id;

  update public.client_recommendation_shares s
     set item_count = v_count where s.id = v_share_id;

  return query select v_share_id, v_list_no, v_count;
end $$;

grant execute on function public.lb_create_client_share(bigint, text, text) to authenticated;
