-- BEHAVIOURAL PROOF: refreshing one Instagram account never touches the other.
--
-- The suite in instagramTokenIsolation.test.ts asserts what the SQL SAYS. This runs it. Two real
-- Instagram rows, the real functions from the migration, and a full-row fingerprint comparison on
-- the account that was NOT refreshed.
--
-- It needs a local Postgres (16+) and never contacts production. Set up and run:
--
--   PG=/tmp/igpg && rm -rf $PG && mkdir -p $PG
--   initdb -D $PG/data -U postgres --auth=trust
--   LC_ALL=C pg_ctl -D $PG/data -o "-p 55433 -c listen_addresses=127.0.0.1 -c unix_socket_directories=''" -l $PG/log start
--   psql -h 127.0.0.1 -p 55433 -U postgres -c "create database igtest"
--   psql -h 127.0.0.1 -p 55433 -U postgres -d igtest -c \
--     "do \$\$ begin create role anon; create role authenticated; create role service_role; end \$\$;"
--   sed "s#MIGRATION_PATH#$PWD/supabase/migrations/20261119000000_instagram_connection_scoped_tokens.sql#" \
--     scripts/social/instagramTokenIsolation.pg.sql | psql -h 127.0.0.1 -p 55433 -U postgres -d igtest -q -f -
--   pg_ctl -D $PG/data stop
--
-- Expected: 27 passed, 0 failed.
--
-- ── WHY THIS IS WORTH A LOCAL CLUSTER ───────────────────────────────────────────────────────
-- The old owner-scoped writer was run against the same two rows before the fix. It gave the
-- SECOND account the FIRST account's refreshed token and overwrote its expiry. A string
-- assertion about a WHERE clause would not have shown that, and would not have proved the
-- replacement actually behaves.
\set ON_ERROR_STOP on
\pset pager off

-- ── MINIMAL STAND-INS ───────────────────────────────────────────────────────────────────────
create schema if not exists vault;
create table vault.secrets (
  id uuid primary key default gen_random_uuid(),
  name text unique,
  description text,
  secret text
);
create view vault.decrypted_secrets as select id, name, secret as decrypted_secret from vault.secrets;
create function vault.create_secret(p_secret text, p_name text, p_description text default null)
returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into vault.secrets (name, description, secret) values (p_name, p_description, p_secret) returning id into v;
  return v;
end $$;

create table public.social_connections (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  provider text not null,
  external_account_id text,
  username text,
  account_type text,
  status text not null default 'connected',
  scopes text[],
  token_secret_id uuid,
  token_expires_at timestamptz,
  posting_paused boolean not null default true,
  posts_per_day integer,
  stagger_offset_minutes integer not null default 0,
  market_restriction text[],
  label text,
  agent_user_id uuid,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A tiny harness so each claim prints as a line.
create table t (n int generated always as identity, what text, ok boolean, detail text);
create function chk(p_what text, p_ok boolean, p_detail text default '') returns void
language sql as $$ insert into t (what, ok, detail) values (p_what, p_ok, p_detail) $$;

-- ── THE FUNCTIONS UNDER TEST ────────────────────────────────────────────────────────────────
\i MIGRATION_PATH

-- ── TWO INSTAGRAM ACCOUNTS FOR ONE OWNER, PLUS A TIKTOK ROW ─────────────────────────────────
-- Shaped like production: one account carrying every per-account setting, so "preserved" can be
-- checked against values that are actually set rather than against a row of nulls.
insert into public.social_connections
  (id, owner_user_id, provider, external_account_id, username, account_type, status, scopes,
   token_secret_id, token_expires_at, posting_paused, posts_per_day, stagger_offset_minutes,
   market_restriction, label, agent_user_id, created_at)
values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'instagram',
   '17841436885324014', 'realestatepro_tx', 'BUSINESS', 'connected',
   array['instagram_business_basic','instagram_business_content_publish','instagram_business_manage_comments'],
   vault.create_secret('TOKEN_A_ORIGINAL', 'social:instagram:a:orig', null),
   '2026-12-22 10:23:30+00', false, 2, 7, array['Dallas'], 'Jay Morris',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-09-12 06:12:37+00'),
  ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'instagram',
   '17841400000000002', 'locatorbeast', 'BUSINESS', 'connected',
   array['instagram_business_basic','instagram_business_content_publish'],
   vault.create_secret('TOKEN_B_ORIGINAL', 'social:instagram:b:orig', null),
   '2027-01-15 00:00:00+00', true, 1, 19, null, 'Locator Beast',
   'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-11-19 00:00:00+00'),
  ('33333333-3333-3333-3333-333333333333', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'tiktok',
   'tt-open-id', 'Jay | TX Apartment Locator', null, 'connected', array['video.publish'],
   vault.create_secret('TOKEN_TT_ORIGINAL', 'social:tiktok:orig', null),
   '2026-11-10 21:35:22+00', false, null, 0, null, null, null, '2026-09-20 01:06:33+00');

-- Snapshot B and the TikTok row in full, so "unchanged" means every column.
create table snap as
  select id, md5(row(c.*)::text) as fp, token_secret_id from public.social_connections c
   where id in ('22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333');

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- 1. REFRESHING ONE ACCOUNT TOUCHES ONLY THAT ACCOUNT
-- ══════════════════════════════════════════════════════════════════════════════════════════
do $$
declare
  v_old_a uuid;
  v_new_a uuid;
begin
  select token_secret_id into v_old_a from public.social_connections where id = '11111111-1111-1111-1111-111111111111';

  perform public.sa_update_instagram_token_by_connection(
    '11111111-1111-1111-1111-111111111111', 'TOKEN_A_REFRESHED', '2027-02-20 00:00:00+00');

  select token_secret_id into v_new_a from public.social_connections where id = '11111111-1111-1111-1111-111111111111';

  perform chk('A gets a NEW vault secret', v_new_a is distinct from v_old_a);
  perform chk('…whose contents are the refreshed token',
    (select decrypted_secret from vault.decrypted_secrets where id = v_new_a) = 'TOKEN_A_REFRESHED');
  perform chk('…and A''s expiry moved to the new one',
    (select token_expires_at from public.social_connections where id = '11111111-1111-1111-1111-111111111111')
      = '2027-02-20 00:00:00+00'::timestamptz);
  perform chk('A''s superseded secret is deleted from the vault',
    not exists (select 1 from vault.secrets where id = v_old_a));
end $$;

-- THE CLAIM THAT MATTERS: the other Instagram account is byte-identical.
select chk('the OTHER Instagram account is unchanged, every column',
  (select md5(row(c.*)::text) from public.social_connections c where c.id = '22222222-2222-2222-2222-222222222222')
   = (select fp from snap where id = '22222222-2222-2222-2222-222222222222'));
select chk('…and still holds its own vault secret',
  (select decrypted_secret from vault.decrypted_secrets
    where id = (select token_secret_id from public.social_connections where id = '22222222-2222-2222-2222-222222222222'))
   = 'TOKEN_B_ORIGINAL');
select chk('the TikTok row is unchanged too',
  (select md5(row(c.*)::text) from public.social_connections c where c.id = '33333333-3333-3333-3333-333333333333')
   = (select fp from snap where id = '33333333-3333-3333-3333-333333333333'));

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- 2. A REFRESH RENEWS A CREDENTIAL AND NOTHING ELSE
-- ══════════════════════════════════════════════════════════════════════════════════════════
select chk('A keeps its granted permissions',
  (select scopes from public.social_connections where id = '11111111-1111-1111-1111-111111111111')
   = array['instagram_business_basic','instagram_business_content_publish','instagram_business_manage_comments']);
select chk('A keeps its pause state', (select posting_paused from public.social_connections where id = '11111111-1111-1111-1111-111111111111') = false);
select chk('A keeps its posting cadence', (select posts_per_day from public.social_connections where id = '11111111-1111-1111-1111-111111111111') = 2);
select chk('A keeps its schedule stagger', (select stagger_offset_minutes from public.social_connections where id = '11111111-1111-1111-1111-111111111111') = 7);
select chk('A keeps its market restriction', (select market_restriction from public.social_connections where id = '11111111-1111-1111-1111-111111111111') = array['Dallas']);
select chk('A keeps its label', (select label from public.social_connections where id = '11111111-1111-1111-1111-111111111111') = 'Jay Morris');
select chk('A keeps its agent', (select agent_user_id from public.social_connections where id = '11111111-1111-1111-1111-111111111111') = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select chk('A keeps its account identity', (select external_account_id || '/' || username from public.social_connections where id = '11111111-1111-1111-1111-111111111111') = '17841436885324014/realestatepro_tx');
-- A refresh is not a reconnection: it must not clear a status somebody needs to see.
update public.social_connections set status = 'error' where id = '11111111-1111-1111-1111-111111111111';
select public.sa_update_instagram_token_by_connection('11111111-1111-1111-1111-111111111111', 'TOKEN_A_AGAIN', '2027-03-01 00:00:00+00');
select chk('a refresh does NOT silently clear an error status',
  (select status from public.social_connections where id = '11111111-1111-1111-1111-111111111111') = 'error');
update public.social_connections set status = 'connected' where id = '11111111-1111-1111-1111-111111111111';

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- 3. THE OWNER-SCOPED PAIR REFUSES INSTEAD OF GUESSING
-- ══════════════════════════════════════════════════════════════════════════════════════════
do $$
declare v_fp_a text; v_fp_b text; v_raised boolean := false;
begin
  select md5(row(c.*)::text) into v_fp_a from public.social_connections c where c.id = '11111111-1111-1111-1111-111111111111';
  select md5(row(c.*)::text) into v_fp_b from public.social_connections c where c.id = '22222222-2222-2222-2222-222222222222';
  begin
    perform public.sa_update_instagram_token('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'SHOULD_NEVER_LAND', now());
  exception when others then
    v_raised := true;
  end;
  perform chk('the owner-scoped WRITER raises with two accounts', v_raised);
  perform chk('…and wrote to neither of them',
    v_fp_a = (select md5(row(c.*)::text) from public.social_connections c where c.id = '11111111-1111-1111-1111-111111111111')
    and v_fp_b = (select md5(row(c.*)::text) from public.social_connections c where c.id = '22222222-2222-2222-2222-222222222222'));
  perform chk('…and the token it was handed is nowhere in the vault',
    not exists (select 1 from vault.decrypted_secrets where decrypted_secret = 'SHOULD_NEVER_LAND'));
end $$;

select chk('the owner-scoped READER returns nothing with two accounts',
  (select count(*) from public.sa_get_instagram_token('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')) = 0);

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- 4. WRONG TARGETS ARE REFUSED
-- ══════════════════════════════════════════════════════════════════════════════════════════
do $$
declare v_raised boolean := false; v_fp text;
begin
  select md5(row(c.*)::text) into v_fp from public.social_connections c where c.id = '33333333-3333-3333-3333-333333333333';
  begin
    perform public.sa_update_instagram_token_by_connection('33333333-3333-3333-3333-333333333333', 'WRONG_BRAND', now());
  exception when others then v_raised := true;
  end;
  perform chk('the connection-scoped writer refuses a TikTok row', v_raised);
  perform chk('…leaving it untouched',
    v_fp = (select md5(row(c.*)::text) from public.social_connections c where c.id = '33333333-3333-3333-3333-333333333333'));
end $$;

do $$
declare v_raised boolean := false;
begin
  begin
    perform public.sa_update_instagram_token_by_connection('99999999-9999-9999-9999-999999999999', 'NO_SUCH', now());
  exception when others then v_raised := true;
  end;
  perform chk('…and refuses an unknown connection id', v_raised);
end $$;

-- ══════════════════════════════════════════════════════════════════════════════════════════
-- 5. THE SINGLE-ACCOUNT CASE STILL WORKS (today's production shape)
-- ══════════════════════════════════════════════════════════════════════════════════════════
delete from public.social_connections where id = '22222222-2222-2222-2222-222222222222';
select chk('with ONE account the reader returns it',
  (select count(*) from public.sa_get_instagram_token('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')) = 1);
select chk('…and the token it returns is that account''s current one',
  (select token from public.sa_get_instagram_token('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')) = 'TOKEN_A_AGAIN');
do $$
declare v_ok boolean := true;
begin
  begin
    perform public.sa_update_instagram_token('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'TOKEN_A_VIA_OWNER', '2027-04-01 00:00:00+00');
  exception when others then v_ok := false;
  end;
  perform chk('the owner-scoped writer still works with one account', v_ok);
  perform chk('…and wrote that token', (select token from public.sa_get_instagram_token('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')) = 'TOKEN_A_VIA_OWNER');
end $$;

-- ── RESULTS ─────────────────────────────────────────────────────────────────────────────────
select case when ok then '  PASS  ' else '  FAIL  ' end || what as result from t order by n;
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from t;
