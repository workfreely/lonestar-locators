-- Renter-facing favorites for Client Recommendation lists (launch polish).
--
-- The renter has no account; the share TOKEN is the credential. A favorite is a
-- boolean on the snapshot item (favorited_at), toggled through a token-scoped
-- SECURITY DEFINER RPC — no login, no duplicate rows (a per-item timestamp can't
-- duplicate), and nothing internal is exposed (the caller references the item by
-- its public sort_order, never a database id). A denormalized favorited_count on
-- the share gives the agent an at-a-glance engagement signal in Sent Lists.

alter table public.client_recommendation_share_items
  add column if not exists favorited_at timestamptz;

alter table public.client_recommendation_shares
  add column if not exists favorited_count integer not null default 0;

comment on column public.client_recommendation_share_items.favorited_at is
  'When the renter hearted this recommendation (null = not favorited). Set via lb_set_client_favorite.';
comment on column public.client_recommendation_shares.favorited_count is
  'Denormalized count of favorited items on this share, maintained by lb_set_client_favorite.';

-- Toggle a favorite on ONE item of an active, non-revoked share, identified only
-- by the public share token + the item's sort_order. Idempotent: re-setting the
-- same state is a no-op and never double-counts. A paused (disabled) or revoked
-- list accepts no changes.
create or replace function public.lb_set_client_favorite(
  p_token_hash text,
  p_sort_order integer,
  p_favorited  boolean
)
returns table(favorited boolean, favorited_count integer)
language plpgsql
volatile
security definer
set search_path to 'public'
as $function$
declare
  v_share record;
  v_item  record;
begin
  select s.id, s.disabled_at, s.revoked_at
    into v_share
    from public.client_recommendation_shares s
   where s.token_hash = p_token_hash
     and s.revoked_at is null
   limit 1;
  if v_share.id is null then return; end if;            -- unknown/revoked → silent no-op
  if v_share.disabled_at is not null then return; end if; -- paused → no favoriting

  select i.id, (i.favorited_at is not null) as was
    into v_item
    from public.client_recommendation_share_items i
   where i.share_id = v_share.id
     and i.sort_order = p_sort_order
   limit 1;
  if v_item.id is null then return; end if;

  -- Table column qualified on the right-hand side so it is never confused with the
  -- OUT column of the same name (favorited_count) that this function returns.
  if p_favorited and not v_item.was then
    update public.client_recommendation_share_items set favorited_at = now() where id = v_item.id;
    update public.client_recommendation_shares
       set favorited_count = client_recommendation_shares.favorited_count + 1
     where id = v_share.id;
  elsif (not p_favorited) and v_item.was then
    update public.client_recommendation_share_items set favorited_at = null where id = v_item.id;
    update public.client_recommendation_shares
       set favorited_count = greatest(client_recommendation_shares.favorited_count - 1, 0)
     where id = v_share.id;
  end if;

  return query
    select p_favorited,
           (select s.favorited_count from public.client_recommendation_shares s where s.id = v_share.id);
end
$function$;

grant execute on function public.lb_set_client_favorite(text, integer, boolean) to anon, authenticated;
