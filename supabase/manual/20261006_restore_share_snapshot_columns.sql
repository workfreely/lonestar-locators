-- ════════════════════════════════════════════════════════════════════════════
-- FIX A REGRESSION I INTRODUCED. Client recommendation pages minted after
-- 2026-09-30 ~20:00Z show gray placeholders instead of property photos.
--
-- WHAT HAPPENED. 20261005_lead_property_reasons.sql replaced lb_create_client_share
-- to read reasons from the canonical table. I rebuilt that body from the newest
-- version in supabase/migrations (20260910000001). That file was NOT what was
-- actually live: the live function had since gained three more snapshot columns
-- through manual SQL that was never written back into a migration file — exactly
-- the hazard of the out-of-sync ledger. My replacement silently dropped them.
--
-- PROVEN FROM THE DATA, not inferred. Every share minted BEFORE the migration has
-- place_id on every item; both minted AFTER have it on none:
--
--   2026-09-30 13:38  lead 84 list 1   6 items   place_id 6/6   rating 6/6
--   2026-09-30 15:31  lead 84 list 2   8 items   place_id 8/8   rating 8/8
--   2026-09-30 16:28  lead 84 list 3   8 items   place_id 8/8   rating 8/8
--   ── 20261005_lead_property_reasons.sql applied here ──
--   2026-09-30 20:43  lead 84 list 4   7 items   place_id 0/7   rating 0/7
--   2026-09-30 22:29  lead 84 list 5   6 items   place_id 0/6   rating 0/6
--
-- WHY THAT TURNS INTO GRAY CARDS. property_image_url was NEVER the carrier — it is
-- null on 30 of 31 lead_recommendations rows BY DESIGN ("NEVER stored on lead rows
-- — resolved here", lib/propertyExplorer/catalog.ts). The image reaches the client
-- page through lb_resolve_client_recommendations, which resolves
--   coalesce(i.property_image_url, pc.property_image_url)
-- over  left join property_catalog pc on pc.place_id = i.place_id.
-- With i.place_id null that join matches nothing, so imageUrl is null and the card
-- falls back to its .lbr-ph gradient. The INSERT ... SELECT column mapping was
-- never misaligned; the join KEY simply stopped being recorded.
--
-- The three columns and their sources were recovered by comparing a pre-regression
-- snapshot against its source rows field by field:
--   place_id        = the recommendation's own place id  (canonical_property_key
--                     is the generated column 'pid:<place id>' — verified equal on
--                     every item that still has a source row)
--   google_rating   = property_catalog.google_rating     (matched on every item)
--   current_special = property_catalog.current_special
-- starting_price is deliberately NOT restored: it is null on all 74 snapshot items
-- ever written, so nothing has ever populated it and a value here would be invented.
--
-- THIS FILE EXTENDS THE BODY THAT IS CURRENTLY LIVE (mine), rather than rebuilding
-- from a migration file. That is the whole point — rebuilding from a stale file is
-- what caused this.
--
-- Apply by hand in the SQL Editor for onwrrajmklxtnabekzcy, whole file, nothing
-- selected. Verification and rollback are at the bottom.
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- ── 1. Restore the three dropped snapshot columns ──────────────────────────
-- Identical to the live body except for the three added columns and the catalog
-- join that feeds two of them. Reasons still come from lead_property_reasons.
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

  v_secret_id := vault.create_secret(
    p_raw_token,
    'client-share:' || v_share_id::text,
    'Raw client recommendation share token (Copy Link)'
  );
  update public.client_recommendation_shares
     set token_secret_id = v_secret_id where id = v_share_id;

  insert into public.client_recommendation_share_items
    (share_id, source_recommendation_id, property_name, property_address,
     property_image_url, property_website_url, reasons, sort_order,
     -- RESTORED ↓
     place_id, google_rating, current_special)
  select v_share_id, r.id, r.property_name, r.property_address,
         r.property_image_url, r.property_website_url,
         coalesce(to_jsonb(pr.reasons), '[]'::jsonb),
         (row_number() over (order by r.created_at asc))::int,
         -- The snapshot's own copy of the routing identity. canonical_property_key
         -- is generated as 'pid:<place id>' for a Google-resolved property and
         -- 'url:<property_url>' for an unresolved one; only the former yields an id,
         -- and the latter correctly gets null (it has no catalog row either).
         nullif(substring(r.canonical_property_key from '^pid:(.*)$'), ''),
         pc.google_rating,
         pc.current_special
    from public.lead_recommendations r
    left join public.lead_property_reasons pr
           on pr.lead_id = r.lead_id
          and pr.canonical_property_key = r.canonical_property_key
    left join public.property_catalog pc
           on pc.place_id = nullif(substring(r.canonical_property_key from '^pid:(.*)$'), '')
   where r.lead_id = p_lead_id;

  select count(*)::int into v_count
    from public.client_recommendation_share_items ci where ci.share_id = v_share_id;

  update public.client_recommendation_shares s
     set item_count = v_count where s.id = v_share_id;

  return query select v_share_id, v_list_no, v_count;
end $$;

grant execute on function public.lb_create_client_share(bigint, text, text, text) to authenticated;

-- ── 2. Retire the UNSENT snapshots minted while the bug was live ───────────
-- Without this the fix is invisible: lb_prepare_client_share REUSES a matching
-- unsent snapshot, and its fingerprint covers name/address/image/website/reasons —
-- none of which changed — so the next Send List would hand back the same broken
-- list 5. Disabling it forces a fresh mint through the corrected function.
--
-- Tightly scoped, and SENT snapshots are untouched by construction (sent_at is
-- null): only unsent, not-yet-disabled shares created after the regression landed
-- whose items actually lack the join key.
update public.client_recommendation_shares s
   set disabled_at = now()
 where s.sent_at is null
   and s.disabled_at is null
   and s.revoked_at is null
   and s.created_at >= timestamptz '2026-09-30 20:00:00+00'
   and exists (
     select 1 from public.client_recommendation_share_items i
      where i.share_id = s.id and i.place_id is null
   );

commit;

-- ════════════════════════════════════════════════════════════════════════════
-- VERIFICATION — run after applying.
-- ════════════════════════════════════════════════════════════════════════════
-- a) the function now writes the join key (expect uses_place_id = true)
--    select prosrc ilike '%place_id, google_rating, current_special%' as uses_place_id
--      from pg_proc where proname = 'lb_create_client_share';
--
-- b) the broken UNSENT snapshots are retired (expect 0 rows)
--    select s.id, s.lead_id, s.list_number
--      from public.client_recommendation_shares s
--     where s.sent_at is null and s.disabled_at is null and s.revoked_at is null
--       and exists (select 1 from public.client_recommendation_share_items i
--                    where i.share_id = s.id and i.place_id is null);
--
-- c) SENT snapshots are untouched (expect the same 4 / 14 as before)
--    select count(*) as sent_snapshots, sum(item_count) as items
--      from public.client_recommendation_shares where sent_at is not null;
--
-- d) the catalog really can supply Ka'Leah's images (expect 6 of 6)
--    select count(*) filter (where pc.property_image_url is not null) as with_image,
--           count(*) as properties
--      from public.lead_recommendations r
--      left join public.property_catalog pc
--             on pc.place_id = nullif(substring(r.canonical_property_key from '^pid:(.*)$'), '')
--     where r.lead_id = 84;
--
-- Then mint a fresh preview for Ka'Leah and re-run:
--    select i.property_name, i.place_id is not null as has_key, i.google_rating
--      from public.client_recommendation_share_items i
--      join public.client_recommendation_shares s on s.id = i.share_id
--     where s.lead_id = 84 order by s.created_at desc, i.sort_order limit 8;

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK — restores the current (regressed) behaviour. Only the function needs
-- reverting; re-enabling a disabled share is a separate, deliberate act.
-- ════════════════════════════════════════════════════════════════════════════
-- begin;
--   -- Re-create lb_create_client_share from supabase/manual/20261005_lead_property_reasons.sql
--   -- (section 5) verbatim — that body is what this file extends.
--   -- To un-retire a snapshot this file disabled:
--   --   update public.client_recommendation_shares set disabled_at = null where id = '<id>';
-- commit;
