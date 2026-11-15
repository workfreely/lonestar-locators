-- Verification for 20261115000000_social_renders. Read-only; every row should come back true.
select 'table exists' as check, count(*) = 1 as ok
  from information_schema.tables where table_schema='public' and table_name='social_renders'
union all
select 'post pointer exists', count(*) = 1
  from information_schema.columns where table_schema='public' and table_name='social_posts' and column_name='render_id'
union all
select 'every artifact has a render row', count(*) = 0
  from social_posts where rendered_storage_path is not null and render_id is null
union all
select 'every render row is pointed at', count(*) = 0
  from social_renders r where not exists (select 1 from social_posts p where p.render_id = r.id)
union all
select 'legacy renders carry no fingerprint', count(*) = 0
  from social_renders where fingerprint is null and spec is not null
union all
-- Nothing may claim 'clean' before a person certifies the SOURCE footage.
select 'nothing is clean yet', count(*) = 0 from social_renders where identity_state = 'clean'
union all
select 'one row per artifact', count(*) = 0 from (
  select storage_path from social_renders group by storage_path having count(*) > 1
) d
union all
-- The mirror must agree: a post's pointer and its path describe the same file.
select 'pointer and path agree', count(*) = 0
  from social_posts p join social_renders r on r.id = p.render_id
 where p.rendered_storage_path is distinct from r.storage_path;
