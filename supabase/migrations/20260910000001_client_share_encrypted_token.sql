-- Encrypted-token prerequisite (before CP4 Send List UI).
--
-- Goal: one sent list = one STABLE client URL that Copy Link can return later,
-- WITHOUT storing the raw token in plaintext. The raw token is stored in Supabase
-- VAULT (encrypted at rest with a key held in Supabase infra, never in a project
-- table). The row keeps only token_hash (public resolution) + a Vault pointer.
-- The public /r/<token> resolver is unchanged (still keyed on token_hash).

alter table public.client_recommendation_shares
  add column if not exists token_secret_id uuid;

comment on column public.client_recommendation_shares.token_secret_id is
  'Vault secret id holding the raw share token (encrypted). Used only by the
   SECURITY DEFINER lb_get_client_share_url for authenticated Copy Link — never by
   the public resolver, which keys on token_hash. A DB-only leak yields only this
   pointer + the hash, not a usable URL.';

-- ── mint: now also stashes the RAW token in Vault ───────────────────────────
-- New 4-arg signature (drops the old 3-arg; there are 0 shares and the mint route
-- is the only caller). The raw arrives as an RPC bind parameter (not inlined SQL),
-- so it does not appear in statement logs; it is handed straight to Vault and only
-- its ciphertext + the pointer persist.
drop function if exists public.lb_create_client_share(bigint, text, text);

create or replace function public.lb_create_client_share(
  p_lead_id      bigint,
  p_token_hash   text,
  p_token_prefix text,
  p_raw_token    text
) returns table (share_id uuid, list_number integer, item_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ws        uuid;
  v_share_id  uuid;
  v_list_no   integer;
  v_count     integer;
  v_secret_id uuid;
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

  -- Encrypt-and-store the raw token in Vault; keep only the pointer on the row.
  v_secret_id := vault.create_secret(
    p_raw_token,
    'client-share:' || v_share_id::text,
    'Raw client recommendation share token (Copy Link)'
  );
  update public.client_recommendation_shares
     set token_secret_id = v_secret_id where id = v_share_id;

  insert into public.client_recommendation_share_items
    (share_id, source_recommendation_id, property_name, property_address,
     property_image_url, property_website_url, reasons, sort_order)
  select v_share_id, r.id, r.property_name, r.property_address,
         r.property_image_url, r.property_website_url,
         coalesce(to_jsonb(r.reasons), '[]'::jsonb),
         (row_number() over (order by r.created_at asc))::int
    from public.lead_recommendations r
   where r.lead_id = p_lead_id;

  select count(*)::int into v_count
    from public.client_recommendation_share_items ci where ci.share_id = v_share_id;

  update public.client_recommendation_shares s
     set item_count = v_count where s.id = v_share_id;

  return query select v_share_id, v_list_no, v_count;
end $$;

grant execute on function public.lb_create_client_share(bigint, text, text, text) to authenticated;

-- ── Copy Link: return the EXACT original raw token, server-side, workspace-gated ─
-- SECURITY DEFINER so it (and ONLY it) can read vault.decrypted_secrets; the caller
-- must be an active member of the share's workspace or it raises. Returns the raw
-- token; the API route builds /r/<raw>. anon/authenticated cannot read Vault directly.
create or replace function public.lb_get_client_share_url(p_share_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ws     uuid;
  v_secret uuid;
  v_raw    text;
begin
  select workspace_id, token_secret_id into v_ws, v_secret
    from public.client_recommendation_shares where id = p_share_id;
  if v_ws is null then
    return null;   -- unknown share (caller surfaces 404)
  end if;
  if not public.is_active_workspace_member(v_ws) then
    raise exception 'lb_get_client_share_url: not a member of this share''s workspace';
  end if;
  if v_secret is null then
    return null;   -- share minted before this migration (no stored token)
  end if;
  select decrypted_secret into v_raw from vault.decrypted_secrets where id = v_secret limit 1;
  return v_raw;
end $$;

grant execute on function public.lb_get_client_share_url(uuid) to authenticated;
