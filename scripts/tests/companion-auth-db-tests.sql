\set ON_ERROR_STOP on
insert into auth.users (id) values ('11111111-1111-1111-1111-111111111111');
insert into public.workspaces (id) values ('22222222-2222-2222-2222-222222222222');

-- ═══ Atomic authorization-code EXCHANGE (consume + create in one transaction) ═══
insert into companion_auth_codes (code_hash,user_id,workspace_id,extension_id,scopes,code_challenge,state,expires_at)
  values ('code1','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','extA',array['lead:read'],'challX','stateX', now()+interval '60 seconds');

do $$ declare s text; c uuid; nconn int; nref int; nacc int; begin
  select status,connection_id into s,c from companion_exchange_auth_code(
    'code1','challX','extA','stateX','rh1', now()+interval '30 days','ah1', now()+interval '15 minutes','dev');
  select count(*) into nconn from companion_connections where id=c;
  select count(*) into nref  from companion_refresh_tokens where connection_id=c and token_hash='rh1';
  select count(*) into nacc  from companion_access_tokens where connection_id=c and token_hash='ah1';
  if s='ok' and nconn=1 and nref=1 and nacc=1 then raise notice 'EXCHANGE PASS: code consumed + connection + refresh + access created atomically';
  else raise exception 'EXCHANGE FAIL s=% nconn=% nref=% nacc=%',s,nconn,nref,nacc; end if;
end $$;
-- single-use: second exchange of same code → invalid + NO new connection
do $$ declare s text; before int; after int; begin
  select count(*) into before from companion_connections;
  select status into s from companion_exchange_auth_code('code1','challX','extA','stateX','rhZ', now()+interval '30 days','ahZ', now()+interval '15 minutes','dev');
  select count(*) into after from companion_connections;
  if s='invalid' and before=after then raise notice 'EXCHANGE-SINGLEUSE PASS: replayed code → invalid, no partial connection';
  else raise exception 'EXCHANGE-SINGLEUSE FAIL s=% before=% after=%',s,before,after; end if;
end $$;
-- wrong PKCE challenge → invalid + code NOT burned + no connection
insert into companion_auth_codes (code_hash,user_id,workspace_id,extension_id,scopes,code_challenge,state,expires_at)
  values ('code2','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','extA',array['lead:read'],'challY','stateY', now()+interval '60 seconds');
do $$ declare s text; c uuid; before int; after int; begin
  select count(*) into before from companion_connections;
  select status into s from companion_exchange_auth_code('code2','WRONG','extA','stateY','rhW', now()+interval '30 days','ahW', now()+interval '15 minutes','dev');
  select count(*) into after from companion_connections;
  if s='invalid' and before=after then raise notice 'EXCHANGE-PKCE PASS: wrong challenge → invalid, no connection, code preserved';
  else raise exception 'EXCHANGE-PKCE FAIL s=% before=% after=%',s,before,after; end if;
  -- code2 still usable with correct challenge
  select status,connection_id into s,c from companion_exchange_auth_code('code2','challY','extA','stateY','rh2b', now()+interval '30 days','ah2b', now()+interval '15 minutes','dev');
  if s='ok' then raise notice 'EXCHANGE-PKCE-PRESERVE PASS: wrong verifier did not burn the code'; else raise exception 'EXCHANGE-PKCE-PRESERVE FAIL s=%',s; end if;
end $$;
-- null input → invalid
do $$ declare s text; begin
  select status into s from companion_exchange_auth_code('code2','challY','extA','stateY',null, now(),'ahN', now(),'dev');
  if s='invalid' then raise notice 'EXCHANGE-VALIDATE PASS: null refresh hash → invalid'; else raise exception 'EXCHANGE-VALIDATE FAIL s=%',s; end if;
end $$;

-- ═══ Atomic rotating-refresh with reuse detection ═══
-- fresh connection + refresh for rotation tests
insert into companion_connections (id,user_id,workspace_id,extension_id,scopes)
  values ('33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','extA',array['lead:read']);
insert into companion_refresh_tokens (connection_id,family_id,token_hash,expires_at)
  values ('33333333-3333-3333-3333-333333333333','44444444-4444-4444-4444-444444444444','RH1', now()+interval '30 days');

do $$ declare s text; begin
  select status into s from companion_rotate_refresh('RH1','RH2', now()+interval '30 days','AH2', now()+interval '15 minutes');
  if s='rotated' then raise notice 'ROTATE PASS: valid refresh rotated'; else raise exception 'ROTATE FAIL s=%',s; end if;
end $$;
do $$ declare s text; begin
  select status into s from companion_rotate_refresh('RH1','RHX', now()+interval '30 days','AHX', now()+interval '15 minutes');
  if s='reuse_detected' then raise notice 'REUSE PASS: replay of rotated token → reuse_detected'; else raise exception 'REUSE FAIL s=%',s; end if;
end $$;
do $$ declare nf int; na int; nc int; begin
  select count(*) into nf from companion_refresh_tokens where family_id='44444444-4444-4444-4444-444444444444' and revoked_at is null;
  select count(*) into na from companion_access_tokens where connection_id='33333333-3333-3333-3333-333333333333' and revoked_at is null;
  select count(*) into nc from companion_connections where id='33333333-3333-3333-3333-333333333333' and revoked_at is null;
  if nf=0 and na=0 and nc=0 then raise notice 'REUSE-REVOKE PASS: whole family + access + connection revoked'; else raise exception 'REUSE-REVOKE FAIL nf=% na=% nc=%',nf,na,nc; end if;
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

-- ═══ SECURITY DEFINER: unauthorized direct RPC calls must fail ═══
-- service_role IS granted (positive control)
set role service_role;
do $$ declare a bool; begin
  select allowed into a from public.companion_rate_limit('svc', 5, 60);
  raise notice 'DENY-CONTROL PASS: service_role can call companion_rate_limit';
exception when insufficient_privilege then raise exception 'DENY-CONTROL FAIL: service_role was denied';
end $$;
reset role;

-- anon + authenticated must be denied EXECUTE on all three
set role anon;
do $$ begin
  begin perform public.companion_rate_limit('x',1,60); raise exception 'DENY FAIL: anon called rate_limit';
  exception when insufficient_privilege then raise notice 'DENY PASS: anon cannot call companion_rate_limit'; end;
  begin perform public.companion_exchange_auth_code('a','b','c','d','e',now(),'f',now(),'g'); raise exception 'DENY FAIL: anon called exchange';
  exception when insufficient_privilege then raise notice 'DENY PASS: anon cannot call companion_exchange_auth_code'; end;
  begin perform public.companion_rotate_refresh('a','b',now(),'c',now()); raise exception 'DENY FAIL: anon called rotate';
  exception when insufficient_privilege then raise notice 'DENY PASS: anon cannot call companion_rotate_refresh'; end;
end $$;
reset role;
set role authenticated;
do $$ begin
  begin perform public.companion_exchange_auth_code('a','b','c','d','e',now(),'f',now(),'g'); raise exception 'DENY FAIL: authenticated called exchange';
  exception when insufficient_privilege then raise notice 'DENY PASS: authenticated cannot call companion_exchange_auth_code'; end;
end $$;
reset role;
