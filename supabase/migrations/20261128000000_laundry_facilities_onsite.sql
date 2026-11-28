-- ── A THIRD CLIENT-FACING WASHER/DRYER ANSWER: LAUNDRY FACILITIES ON-SITE ───────────────────
--
-- The pair shipped in 20261031000000 describes the UNIT: a machine in the apartment, or the
-- plumbing for one. Neither can say the true thing about a great many older San Antonio and
-- Austin properties — that the laundry is a shared room in the building. A locator who had
-- verified exactly that had two bad options: leave the field unverified, so the client is told
-- nothing, or pick "Hookups", which is false. This adds the honest third answer.
--
-- ── WHAT CHANGES ────────────────────────────────────────────────────────────────────────────
-- The two CHECK constraints, and nothing else. No column is added, no row is touched, no
-- function is redefined. 'laundry_onsite' joins the list of values the columns will accept;
-- 'included' and 'hookups' keep working exactly as they do, and NULL is still "not verified".
--
-- The constraints are REPLACED rather than widened in place because Postgres has no "alter
-- check" — a drop and an add inside one transaction is the only form, and it is atomic, so no
-- window exists in which a valid status could be refused.
--
-- ── WHAT IS NOT TOUCHED ─────────────────────────────────────────────────────────────────────
-- lb_prepare_client_share, lb_create_client_share and lb_resolve_client_recommendations all
-- carry washer_dryer_status through as an opaque text value — they never enumerate it — so a
-- new member needs no change to any of the three. The reuse fingerprint already includes the
-- status on both sides, so changing a card to "Laundry Facilities On-Site" after preparing a
-- list makes the next Send freeze a NEW snapshot rather than hand back one without the pill.
-- Every existing row keeps the value it has. No backfill, and deliberately so: nobody has
-- verified a laundry room on a pair where the field is still null.

begin;

alter table public.lead_property_reasons
  drop constraint if exists lead_property_reasons_wd_status_chk;
alter table public.lead_property_reasons
  add constraint lead_property_reasons_wd_status_chk
  check (washer_dryer_status is null
         or washer_dryer_status in ('included','hookups','laundry_onsite'));

comment on column public.lead_property_reasons.washer_dryer_status is
  'Client-facing washer/dryer status the locator confirmed for THIS (client, property) pair: included | hookups | laundry_onsite. NULL = not verified, renders nothing. Never derived from property_catalog — floor plans differ, and a shared laundry room is not a unit fact at all.';

alter table public.client_recommendation_share_items
  drop constraint if exists client_rec_share_items_wd_status_chk;
alter table public.client_recommendation_share_items
  add constraint client_rec_share_items_wd_status_chk
  check (washer_dryer_status is null
         or washer_dryer_status in ('included','hookups','laundry_onsite'));

comment on column public.client_recommendation_share_items.washer_dryer_status is
  'Frozen at send time from lead_property_reasons.washer_dryer_status: included | hookups | laundry_onsite. NULL on every snapshot created before this column existed.';

commit;
