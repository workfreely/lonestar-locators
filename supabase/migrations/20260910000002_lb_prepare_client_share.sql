-- CP4 — reuse-or-mint for the Send List share flow.
--
-- Clicking Send List should NOT blindly mint a new snapshot every time. This RPC
-- decides, atomically and server-side:
--   • If the lead already has an UNSENT, non-disabled, non-revoked snapshot whose
--     items still match the current working Recommendations exactly → reuse it
--     (no duplicate orphan shares from repeated clicks before confirming sent).
--   • Otherwise (no such snapshot, or the Recommendations changed since it was
--     taken) → mint a NEW immutable snapshot via lb_create_client_share.
-- Previously SENT snapshots (sent_at is not null) are never considered for reuse
-- and never altered — a new send cycle always gets its own snapshot.
--
-- "Match" = same property rows, same order, same content: name, address, image,
-- website, and reasons. The reasons normalization mirrors how lb_create_client_share
-- stored them (coalesce(to_jsonb(text[]), '[]')), so an unchanged list fingerprints
-- identically and reuses; any add / remove / edit changes the fingerprint → new snapshot.

drop function if exists public.lb_prepare_client_share(bigint, text, text, text);

create or replace function public.lb_prepare_client_share(
  p_lead_id      bigint,
  p_token_hash   text,   -- used ONLY if a new snapshot is minted
  p_token_prefix text,   --   "
  p_raw_token    text    --   "  (encrypted into Vault by lb_create_client_share)
) returns table (share_id uuid, list_number integer, item_count integer, reused boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ws         uuid;
  v_existing   uuid;
  v_list_no    integer;
  v_count      integer;
  v_cur_fp     text;
  v_snap_fp    text;
begin
  select l.workspace_id into v_ws from public.leads l where l.id = p_lead_id;
  if v_ws is null then
    raise exception 'lb_prepare_client_share: lead % has no workspace', p_lead_id;
  end if;
  if not public.is_active_workspace_member(v_ws) then
    raise exception 'lb_prepare_client_share: not a member of this lead''s workspace';
  end if;

  -- Fingerprint of the CURRENT working Recommendations (ordered as the mint snapshots
  -- them: created_at asc). Unit separators avoid field/row collisions.
  select string_agg(
           coalesce(r.property_name,'')       || E'\x1f' ||
           coalesce(r.property_address,'')     || E'\x1f' ||
           coalesce(r.property_image_url,'')   || E'\x1f' ||
           coalesce(r.property_website_url,'') || E'\x1f' ||
           coalesce(to_jsonb(r.reasons), '[]'::jsonb)::text,
           E'\x1e' order by r.created_at asc)
    into v_cur_fp
    from public.lead_recommendations r
   where r.lead_id = p_lead_id;

  -- Latest reusable snapshot: unsent, not disabled, not revoked.
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
             coalesce(ci.reasons, '[]'::jsonb)::text,
             E'\x1e' order by ci.sort_order asc)
      into v_snap_fp
      from public.client_recommendation_share_items ci
     where ci.share_id = v_existing;

    -- Unchanged Recommendations → reuse the existing unsent snapshot (idempotent).
    if v_cur_fp is not distinct from v_snap_fp then
      select s.item_count into v_count
        from public.client_recommendation_shares s where s.id = v_existing;
      return query select v_existing, v_list_no, coalesce(v_count, 0), true;
      return;
    end if;
  end if;

  -- No reusable snapshot, or the Recommendations changed → mint a fresh one.
  return query
    select c.share_id, c.list_number, c.item_count, false
      from public.lb_create_client_share(p_lead_id, p_token_hash, p_token_prefix, p_raw_token) c;
end $$;

grant execute on function public.lb_prepare_client_share(bigint, text, text, text) to authenticated;
