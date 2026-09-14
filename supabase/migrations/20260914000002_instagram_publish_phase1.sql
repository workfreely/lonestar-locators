-- Beast Social — Instagram Publishing Worker PHASE 1 (single post → single selected destination).
--
-- Adds the minimal state to track an async Instagram Reels publish (container → status → publish),
-- plus a CONNECTION-ID-scoped server-only token getter so we publish to the EXACT selected
-- destination. No 2/day automation, no fan-out, no scheduling worker. RLS unchanged.

-- 1. Publish-attempt tracking on the post. external_post_id / external_post_url / published_at /
--    error_message / status already exist; add the container id, the attempt timestamp, and which
--    render version was published (stale-publish protection + audit). Nullable, additive only.
alter table public.social_posts
  add column if not exists ig_container_id text,             -- Instagram creation_id (container)
  add column if not exists publish_attempted_at timestamptz,
  add column if not exists published_render_version integer; -- render_version that was published

-- 2. Connection-ID-scoped token getter. SERVER-ONLY (service_role) — never granted to authenticated,
--    so the token can never reach a browser. Returns the decrypted token PLUS the destination state
--    the publisher must re-check (status/paused/expiry/owner) so it can reject paused/disconnected/
--    reconnect-needed destinations and confirm ownership. SECURITY DEFINER to read vault + row.
create or replace function public.sa_get_instagram_token_by_connection(p_connection_id uuid)
returns table (
  token               text,
  token_expires_at    timestamptz,
  external_account_id text,
  username            text,
  status              text,
  posting_paused      boolean,
  owner_user_id       uuid
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    select ds.decrypted_secret, sc.token_expires_at, sc.external_account_id, sc.username,
           sc.status, sc.posting_paused, sc.owner_user_id
      from public.social_connections sc
      join vault.decrypted_secrets ds on ds.id = sc.token_secret_id
     where sc.id = p_connection_id and sc.provider = 'instagram'
     limit 1;
end $$;

revoke all on function public.sa_get_instagram_token_by_connection(uuid) from public, anon, authenticated;
grant execute on function public.sa_get_instagram_token_by_connection(uuid) to service_role;
