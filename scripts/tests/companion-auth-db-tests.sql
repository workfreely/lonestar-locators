\set ON_ERROR_STOP on
insert into auth.users (id) values ('11111111-1111-1111-1111-111111111111');
insert into public.workspaces (id) values ('22222222-2222-2222-2222-222222222222');

-- ═══ Atomic single-use authorization-code consume ═══
insert into companion_auth_codes (code_hash,user_id,workspace_id,extension_id,scopes,code_challenge,state,expires_at)
  values ('code1','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','extA',array['lead:read'],'challX','stateX', now()+interval '60 seconds');

do $$ declare n int; begin
  select count(*) into n from companion_consume_auth_code('code1','challX','extA','stateX');
  if n=1 then raise notice 'CONSUME1 PASS: valid code consumed once'; else raise exception 'CONSUME1 FAIL n=%',n; end if;
end $$;
do $$ declare n int; begin
  select count(*) into n from companion_consume_auth_code('code1','challX','extA','stateX');
  if n=0 then raise notice 'CONSUME2 PASS: second consume of same code returns nothing (single-use)'; else raise exception 'CONSUME2 FAIL n=%',n; end if;
end $$;
-- wrong PKCE challenge
insert into companion_auth_codes (code_hash,user_id,workspace_id,extension_id,scopes,code_challenge,state,expires_at)
  values ('code2','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','extA',array['lead:read'],'challY','stateY', now()+interval '60 seconds');
do $$ declare n int; begin
  select count(*) into n from companion_consume_auth_code('code2','WRONG','extA','stateY');
  if n=0 then raise notice 'PKCE PASS: wrong challenge does not consume'; else raise exception 'PKCE FAIL'; end if;
  -- code2 still consumable with correct challenge (not burned)
  select count(*) into n from companion_consume_auth_code('code2','challY','extA','stateY');
  if n=1 then raise notice 'PKCE-PRESERVE PASS: wrong verifier did not burn the code'; else raise exception 'PKCE-PRESERVE FAIL n=%',n; end if;
end $$;
-- expired
insert into companion_auth_codes (code_hash,user_id,workspace_id,extension_id,scopes,code_challenge,state,expires_at)
  values ('code3','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','extA',array['lead:read'],'challZ','stateZ', now()-interval '1 second');
do $$ declare n int; begin
  select count(*) into n from companion_consume_auth_code('code3','challZ','extA','stateZ');
  if n=0 then raise notice 'EXPIRED PASS: expired code not consumed'; else raise exception 'EXPIRED FAIL'; end if;
end $$;

-- ═══ Atomic rotating-refresh with reuse detection ═══
insert into companion_connections (id,user_id,workspace_id,extension_id,scopes)
  values ('33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','extA',array['lead:read']);
insert into companion_refresh_tokens (connection_id,family_id,token_hash,expires_at)
  values ('33333333-3333-3333-3333-333333333333','44444444-4444-4444-4444-444444444444','rh1', now()+interval '30 days');

do $$ declare s text; begin
  select status into s from companion_rotate_refresh('rh1','rh2', now()+interval '30 days','ah2', now()+interval '15 minutes');
  if s='rotated' then raise notice 'ROTATE PASS: valid refresh rotated'; else raise exception 'ROTATE FAIL s=%',s; end if;
end $$;
-- old rh1 now rotated; a NEW rh2 + access token exist
do $$ declare n int; begin
  select count(*) into n from companion_refresh_tokens where token_hash='rh2' and rotated_at is null and revoked_at is null;
  if n=1 then raise notice 'ROTATE-NEW PASS: new refresh minted, active'; else raise exception 'ROTATE-NEW FAIL'; end if;
  select count(*) into n from companion_access_tokens where token_hash='ah2' and revoked_at is null;
  if n=1 then raise notice 'ROTATE-ACCESS PASS: new access minted'; else raise exception 'ROTATE-ACCESS FAIL'; end if;
end $$;
-- REUSE the old rh1 → family + access + connection revoked
do $$ declare s text; begin
  select status into s from companion_rotate_refresh('rh1','rhX', now()+interval '30 days','ahX', now()+interval '15 minutes');
  if s='reuse_detected' then raise notice 'REUSE PASS: replay of rotated token → reuse_detected'; else raise exception 'REUSE FAIL s=%',s; end if;
end $$;
do $$ declare nf int; na int; nc int; begin
  select count(*) into nf from companion_refresh_tokens where family_id='44444444-4444-4444-4444-444444444444' and revoked_at is null;
  select count(*) into na from companion_access_tokens where connection_id='33333333-3333-3333-3333-333333333333' and revoked_at is null;
  select count(*) into nc from companion_connections where id='33333333-3333-3333-3333-333333333333' and revoked_at is null;
  if nf=0 and na=0 and nc=0 then raise notice 'REUSE-REVOKE PASS: whole family + access + connection revoked'; else raise exception 'REUSE-REVOKE FAIL nf=% na=% nc=%',nf,na,nc; end if;
end $$;
-- the previously-good rh2 is now invalid (family burned)
do $$ declare s text; begin
  select status into s from companion_rotate_refresh('rh2','rhZ', now()+interval '30 days','ahZ', now()+interval '15 minutes');
  if s='invalid' then raise notice 'POST-REUSE PASS: sibling refresh invalidated by family burn'; else raise exception 'POST-REUSE FAIL s=%',s; end if;
end $$;

-- ═══ Durable rate limiter ═══
do $$ declare a1 bool; a2 bool; a3 bool; a4 bool; ao bool; begin
  select allowed into a1 from companion_rate_limit('rl:test', 3, 60);
  select allowed into a2 from companion_rate_limit('rl:test', 3, 60);
  select allowed into a3 from companion_rate_limit('rl:test', 3, 60);
  select allowed into a4 from companion_rate_limit('rl:test', 3, 60);
  select allowed into ao from companion_rate_limit('rl:other', 3, 60);
  if a1 and a2 and a3 and not a4 and ao then raise notice 'RATELIMIT PASS: 3 allowed, 4th blocked, other key independent';
  else raise exception 'RATELIMIT FAIL a1=% a2=% a3=% a4=% ao=%',a1,a2,a3,a4,ao; end if;
end $$;
