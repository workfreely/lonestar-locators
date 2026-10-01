-- ─────────────────────────────────────────────────────────────────────────────
-- TIER 1 AREA-KEYWORD ENRICHMENT — 22 properties
--
-- Appends ONE canonical area label to property_catalog.location_keywords on the
-- 22 properties that a CURRENT live lead's search can actually reach.
--
-- WHAT IS NOT TOUCHED: neighborhood, location, submarket, and every existing
-- location_keywords value. No matching code changes; no commute change. The
-- append lands each newly qualified property at rank 2, where exact and aliased
-- keyword matches already sit, so no property moves between tiers.
--
-- THE EVIDENCE — three gates, all required, all from data already in the row:
--   1. the property NAME contains the canonical area label, as a whole word;
--   2. the property's OWN latitude/longitude is within 3 km (the Unleash search
--      radius) of that area's catalogued centroid;
--   3. the property does NOT already qualify for the area via the rank-4 address
--      fallback — enriching one that does would promote it rank 4 -> rank 2 and
--      reorder results. 3 such rows were excluded for this reason.
-- Gate 2 is what rejects a marketing name: 38 name claims were refused, including
-- a Dallas "Midtown Park" cluster claiming Midtown from 6.3-7.1 km away.
-- 3 rows with a conflicting existing keyword are EXCLUDED, pending review.
--
-- PROVENANCE. Written to property_enrichment_events, the table built for exactly
-- this (migration 20260925000000) and already holding 112,295 rows. Deliberately
-- NOT to property_catalog.source or .verification_notes: `source` is row-level
-- ("lb_master_verified+web_research" on the 5 rows that use it), not per-field, and
-- `verification_notes` is an ENRICHMENT-WRITABLE property attribute
-- (lib/propertyEnrichment/policy.ts), not a provenance sink — writing a note into
-- either would overload a field whose meaning is already defined.
--
--   source_type         = 'google_places'  (the name and coordinates this inference
--                         rests on both originate from Google Places)
--   source_reference    = the place_id
--   verification_status = 'inferred'  — NOT 'verified'. This is a derivation from
--                         two facts in the row, not something read off the
--                         property's own website.
--
-- ⚠ ONE PROVENANCE SIDE EFFECT, SURFACED RATHER THAN HIDDEN. The
-- property_field_provenance view reports the LATEST written event per
-- (place_id, field_name). 13 of these 22 rows already have
-- location_keywords provenance of official_property_site / verified, so after this
-- runs that view will report those fields as google_places / inferred. That is
-- arguably the honest reading — the field then holds a mix — and NOTHING is lost:
-- property_enrichment_events is append-only, so the earlier verified event remains
-- in full history. Flagged because it changes what the view says for those rows.
--
-- ROLLBACK-SAFE BY DESIGN:
--   • one transaction — either all 22 land or none do;
--   • every UPDATE is guarded on the row's EXACT expected current array, so a row
--     edited since measurement (2026-10-01) is skipped silently rather than
--     clobbered, and the verification queries below will show it as missed;
--   • the provenance INSERT is driven by the UPDATE's RETURNING, so an event is
--     recorded only for a row that actually changed — provenance can never claim
--     a write that did not happen;
--   • append-only: the new value is always the old array || one element, so no
--     existing keyword can be dropped;
--   • idempotent: re-running changes nothing, because the guard no longer matches
--     once the keyword is present.
--
-- EXPECTED SIMULATION RESULTS to re-check after applying (simulated, not
-- guaranteed — Places results shift over time):
--   Ka'Leah (lead 84)        0 -> 3 qualified
--   total qualified          53 -> 97
--   total Beast Matches      46 -> 82
--   leads reaching 6-8       1 -> 10
--   leads at zero            1 -> 0
-- Re-run: npx tsx scripts/matching/auditQualifiedPools.ts
-- ─────────────────────────────────────────────────────────────────────────────

-- ═══ THE 22 ROWS ═══
--
-- market       area             property                                     dist  current location_keywords
-- Houston      Medical Center   Stella at The Medical Center                1788m  (EMPTY — fill)
--   place_id ChIJM6gYnfG_QIYRBBko09u1PYE  ·  append "Medical Center"  ·  FILLING EMPTY FIELD  ·  no prior provenance
-- Houston      Medical Center   Weston Medical Center Apartments            2771m  ["Rice University proximity","Texas Medical Center access","Rice Village shopping and dining"]
--   place_id ChIJg7QlPzjAQIYR6XdntnTKbps  ·  append "Medical Center"  ·  APPENDING to 3  ·  existing provenance: official_property_site/verified
-- Houston      Midtown          Calais Midtown                               465m  ["cosmopolitan Midtown Houston","vibrant urban neighborhood","near downtown"]
--   place_id ChIJF3-o2G6_QIYRt-AnfTQVIwY  ·  append "Midtown"  ·  APPENDING to 3  ·  existing provenance: official_property_site/verified
-- Houston      Montrose         The Susanne - Montrose Apartments           1308m  ["Montrose District near Museum District","3 miles from Texas Medical Center","steps from H-E-B and Hermann Park"]
--   place_id ChIJBVpL2JrAQIYRBxHUg-IKGWk  ·  append "Montrose"  ·  APPENDING to 3  ·  existing provenance: official_property_site/verified
-- Houston      Museum District  Fairmont Museum District                    1557m  ["Montrose neighborhood","walkable","adjacent to River Oaks and Medical Center"]
--   place_id ChIJDcmvvIXAQIYRwIW2r_ZuZn8  ·  append "Museum District"  ·  APPENDING to 3  ·  existing provenance: official_property_site/verified
-- Houston      River Oaks       Hanover River Oaks                          1849m  ["Inner Loop West & Greenway","Houston"]
--   place_id ChIJVWguJ-zAQIYR130g0mpT0sE  ·  append "River Oaks"  ·  APPENDING to 2  ·  existing provenance: trusted_locator_source/verified
-- Houston      River Oaks       The Driscoll at River Oaks                   947m  ["Montrose & Museum District","Houston"]
--   place_id ChIJbcU9UnDBQIYRKDqRSeRAxkI  ·  append "River Oaks"  ·  APPENDING to 2  ·  existing provenance: trusted_locator_source/verified
-- San Antonio  Alamo Heights    Alcove at Alamo Heights                     2272m  ["Northeast San Antonio","convenient highway access","near San Antonio Botanical Garden"]
--   place_id ChIJSxs5ER31XIYRJVc2xDZornA  ·  append "Alamo Heights"  ·  APPENDING to 3  ·  existing provenance: official_property_site/verified
-- San Antonio  Alamo Heights    Avita Alamo Heights Apartments              2697m  ["near The Quarry and Alamo Heights","close to San Antonio International Airport","quick access to I-410 and I-281"]
--   place_id ChIJTZ7r9E_1XIYRYXmppAaz30c  ·  append "Alamo Heights"  ·  APPENDING to 3  ·  existing provenance: official_property_site/verified
-- San Antonio  Alamo Heights    Republic at Alamo Heights                   1596m  (EMPTY — fill)
--   place_id ChIJP04m3Rr1XIYRY-ob0EoLfkM  ·  append "Alamo Heights"  ·  FILLING EMPTY FIELD  ·  no prior provenance
-- San Antonio  Southtown        Southtown Flats                              525m  (EMPTY — fill)
--   place_id ChIJO4vfKJFYXIYRJ6_wvG2EvXQ  ·  append "Southtown"  ·  FILLING EMPTY FIELD  ·  no prior provenance
-- San Antonio  Southtown        The Levee At Southtown                       669m  ["San Antonio River Walk","Blue Star Arts Complex","Hemisfair Park"]
--   place_id ChIJV7mrqaNYXIYRDcjkD1w87xQ  ·  append "Southtown"  ·  APPENDING to 3  ·  existing provenance: official_property_site/verified
-- San Antonio  Southtown        Trove Southtown                              531m  (EMPTY — fill)
--   place_id ChIJtaEWhbtYXIYRTLF3T-PbT_k  ·  append "Southtown"  ·  FILLING EMPTY FIELD  ·  no prior provenance
-- San Antonio  Stone Oak        Club at Stone Oak Apartments                2269m  (EMPTY — fill)
--   place_id ChIJX437hnBiXIYRTYhI3ocF3Ak  ·  append "Stone Oak"  ·  FILLING EMPTY FIELD  ·  no prior provenance
-- San Antonio  Stone Oak        Oro Stone Oak                               2440m  (EMPTY — fill)
--   place_id ChIJj8eENcaJXIYRAEp-BjnRyHI  ·  append "Stone Oak"  ·  FILLING EMPTY FIELD  ·  no prior provenance
-- San Antonio  Stone Oak        The Montecristo Apartments in Stone Oak,Sa  1418m  ["Stone Oak neighborhood","North Central San Antonio","Major highway access"]
--   place_id ChIJ8Z3pHQBiXIYRBzedlJl7P7M  ·  append "Stone Oak"  ·  APPENDING to 3  ·  existing provenance: official_property_site/verified
-- San Antonio  Westover Hills   Paragon Westover Hills Apartments           2534m  ["San Antonio, TX","Escala Pkwy"]
--   place_id ChIJQ6S94eVDXIYREmK8X0P_4Zc  ·  append "Westover Hills"  ·  APPENDING to 2  ·  existing provenance: official_property_site/verified
-- San Antonio  Westover Hills   Tacara at Westover Hills                    2478m  (EMPTY — fill)
--   place_id ChIJy4Ff5slcXIYRZbZj9JXTrMM  ·  append "Westover Hills"  ·  FILLING EMPTY FIELD  ·  no prior provenance
-- San Antonio  Westover Hills   The Haven at Westover Hills                 1837m  (EMPTY — fill)
--   place_id ChIJI3DXiSJDXIYR9gaO_SK7z_4  ·  append "Westover Hills"  ·  FILLING EMPTY FIELD  ·  no prior provenance
-- San Antonio  Westover Hills   The Lodge at Westover Hills                 2227m  ["West San Antonio","near Highway 151","Northside Independent School District"]
--   place_id ChIJ2cSfiuFCXIYR47qvvRcdqXo  ·  append "Westover Hills"  ·  APPENDING to 3  ·  existing provenance: official_property_site/verified
-- San Antonio  Westover Hills   Vara Westover Hills                         2113m  (EMPTY — fill)
--   place_id ChIJp3HkmyZdXIYRYBYN8gEBlc8  ·  append "Westover Hills"  ·  FILLING EMPTY FIELD  ·  no prior provenance
-- San Antonio  Westover Hills   Villas in Westover Hills                    1597m  ["overlooks Hyatt Hill Country Golf Course","close to Highway 151","near San Antonio River Walk"]
--   place_id ChIJbwtSSiJDXIYRh-zSb6Dehko  ·  append "Westover Hills"  ·  APPENDING to 3  ·  existing provenance: official_property_site/verified

-- ═══ PRE-FLIGHT (read-only — run this FIRST and confirm 22 rows come back) ═══
--
-- select c.place_id, c.property_name, c.city, c.location_keywords
--   from public.property_catalog c
--  where c.place_id in (
--        'ChIJM6gYnfG_QIYRBBko09u1PYE',
--        'ChIJg7QlPzjAQIYR6XdntnTKbps',
--        'ChIJF3-o2G6_QIYRt-AnfTQVIwY',
--        'ChIJBVpL2JrAQIYRBxHUg-IKGWk',
--        'ChIJDcmvvIXAQIYRwIW2r_ZuZn8',
--        'ChIJVWguJ-zAQIYR130g0mpT0sE',
--        'ChIJbcU9UnDBQIYRKDqRSeRAxkI',
--        'ChIJSxs5ER31XIYRJVc2xDZornA',
--        'ChIJTZ7r9E_1XIYRYXmppAaz30c',
--        'ChIJP04m3Rr1XIYRY-ob0EoLfkM',
--        'ChIJO4vfKJFYXIYRJ6_wvG2EvXQ',
--        'ChIJV7mrqaNYXIYRDcjkD1w87xQ',
--        'ChIJtaEWhbtYXIYRTLF3T-PbT_k',
--        'ChIJX437hnBiXIYRTYhI3ocF3Ak',
--        'ChIJj8eENcaJXIYRAEp-BjnRyHI',
--        'ChIJ8Z3pHQBiXIYRBzedlJl7P7M',
--        'ChIJQ6S94eVDXIYREmK8X0P_4Zc',
--        'ChIJy4Ff5slcXIYRZbZj9JXTrMM',
--        'ChIJI3DXiSJDXIYR9gaO_SK7z_4',
--        'ChIJ2cSfiuFCXIYR47qvvRcdqXo',
--        'ChIJp3HkmyZdXIYRYBYN8gEBlc8',
--        'ChIJbwtSSiJDXIYRh-zSb6Dehko'
--        )
--  order by c.city, c.property_name;

begin;

-- The proposal as data: place_id, the keyword to append, and the EXACT array the
-- row is expected to hold right now (the guard).
with proposed(place_id, add_kw, expected, dist_m) as (
  values
    ('ChIJM6gYnfG_QIYRBBko09u1PYE', 'Medical Center', '{}'::text[], 1788),
    ('ChIJg7QlPzjAQIYR6XdntnTKbps', 'Medical Center', array['Rice University proximity','Texas Medical Center access','Rice Village shopping and dining']::text[], 2771),
    ('ChIJF3-o2G6_QIYRt-AnfTQVIwY', 'Midtown', array['cosmopolitan Midtown Houston','vibrant urban neighborhood','near downtown']::text[], 465),
    ('ChIJBVpL2JrAQIYRBxHUg-IKGWk', 'Montrose', array['Montrose District near Museum District','3 miles from Texas Medical Center','steps from H-E-B and Hermann Park']::text[], 1308),
    ('ChIJDcmvvIXAQIYRwIW2r_ZuZn8', 'Museum District', array['Montrose neighborhood','walkable','adjacent to River Oaks and Medical Center']::text[], 1557),
    ('ChIJVWguJ-zAQIYR130g0mpT0sE', 'River Oaks', array['Inner Loop West & Greenway','Houston']::text[], 1849),
    ('ChIJbcU9UnDBQIYRKDqRSeRAxkI', 'River Oaks', array['Montrose & Museum District','Houston']::text[], 947),
    ('ChIJSxs5ER31XIYRJVc2xDZornA', 'Alamo Heights', array['Northeast San Antonio','convenient highway access','near San Antonio Botanical Garden']::text[], 2272),
    ('ChIJTZ7r9E_1XIYRYXmppAaz30c', 'Alamo Heights', array['near The Quarry and Alamo Heights','close to San Antonio International Airport','quick access to I-410 and I-281']::text[], 2697),
    ('ChIJP04m3Rr1XIYRY-ob0EoLfkM', 'Alamo Heights', '{}'::text[], 1596),
    ('ChIJO4vfKJFYXIYRJ6_wvG2EvXQ', 'Southtown', '{}'::text[], 525),
    ('ChIJV7mrqaNYXIYRDcjkD1w87xQ', 'Southtown', array['San Antonio River Walk','Blue Star Arts Complex','Hemisfair Park']::text[], 669),
    ('ChIJtaEWhbtYXIYRTLF3T-PbT_k', 'Southtown', '{}'::text[], 531),
    ('ChIJX437hnBiXIYRTYhI3ocF3Ak', 'Stone Oak', '{}'::text[], 2269),
    ('ChIJj8eENcaJXIYRAEp-BjnRyHI', 'Stone Oak', '{}'::text[], 2440),
    ('ChIJ8Z3pHQBiXIYRBzedlJl7P7M', 'Stone Oak', array['Stone Oak neighborhood','North Central San Antonio','Major highway access']::text[], 1418),
    ('ChIJQ6S94eVDXIYREmK8X0P_4Zc', 'Westover Hills', array['San Antonio, TX','Escala Pkwy']::text[], 2534),
    ('ChIJy4Ff5slcXIYRZbZj9JXTrMM', 'Westover Hills', '{}'::text[], 2478),
    ('ChIJI3DXiSJDXIYR9gaO_SK7z_4', 'Westover Hills', '{}'::text[], 1837),
    ('ChIJ2cSfiuFCXIYR47qvvRcdqXo', 'Westover Hills', array['West San Antonio','near Highway 151','Northside Independent School District']::text[], 2227),
    ('ChIJp3HkmyZdXIYRYBYN8gEBlc8', 'Westover Hills', '{}'::text[], 2113),
    ('ChIJbwtSSiJDXIYRh-zSb6Dehko', 'Westover Hills', array['overlooks Hyatt Hill Country Golf Course','close to Highway 151','near San Antonio River Walk']::text[], 1597)
),
-- Guarded append. A row whose keywords have changed since measurement fails the
-- `is not distinct from` test and is left exactly as it is.
upd as (
  update public.property_catalog c
     set location_keywords = c.location_keywords || array[p.add_kw]
    from proposed p
   where c.place_id = p.place_id
     and c.location_keywords is not distinct from p.expected
     and not (c.location_keywords @> array[p.add_kw])
  returning c.place_id, p.add_kw, p.expected as old_kw,
            c.location_keywords as new_kw, p.dist_m
)
-- One provenance event per row that ACTUALLY changed.
insert into public.property_enrichment_events
  (job_id, place_id, field_name, action, old_value, new_value,
   source_type, source_reference, verification_status, reason, checked_at)
select 'area_keyword_tier1_2026_10_01',
       u.place_id,
       'location_keywords',
       'written',
       to_jsonb(u.old_kw)::text,
       to_jsonb(u.new_kw)::text,
       'google_places',
       u.place_id,
       'inferred',
       format(
         'area keyword %L added: property name contains canonical area label + property coordinates fall within the canonical area''s 3 km centroid radius (measured %s m). Appended only; no existing keyword altered; neighborhood/location/submarket untouched.',
         u.add_kw, u.dist_m
       ),
       now()
  from upd u;

commit;

-- ═══ VERIFICATION (read-only; run after the transaction) ═══
--
-- 1. All 22 rows now carry their keyword, and NOTHING was lost.
--    Expect 22 rows, every `kept_all_old` true and every `added` true.
--
-- with expected(place_id, add_kw, old_kw) as (
--   values
--     ('ChIJM6gYnfG_QIYRBBko09u1PYE', 'Medical Center', '{}'::text[]),
--     ('ChIJg7QlPzjAQIYR6XdntnTKbps', 'Medical Center', array['Rice University proximity','Texas Medical Center access','Rice Village shopping and dining']::text[]),
--     ('ChIJF3-o2G6_QIYRt-AnfTQVIwY', 'Midtown', array['cosmopolitan Midtown Houston','vibrant urban neighborhood','near downtown']::text[]),
--     ('ChIJBVpL2JrAQIYRBxHUg-IKGWk', 'Montrose', array['Montrose District near Museum District','3 miles from Texas Medical Center','steps from H-E-B and Hermann Park']::text[]),
--     ('ChIJDcmvvIXAQIYRwIW2r_ZuZn8', 'Museum District', array['Montrose neighborhood','walkable','adjacent to River Oaks and Medical Center']::text[]),
--     ('ChIJVWguJ-zAQIYR130g0mpT0sE', 'River Oaks', array['Inner Loop West & Greenway','Houston']::text[]),
--     ('ChIJbcU9UnDBQIYRKDqRSeRAxkI', 'River Oaks', array['Montrose & Museum District','Houston']::text[]),
--     ('ChIJSxs5ER31XIYRJVc2xDZornA', 'Alamo Heights', array['Northeast San Antonio','convenient highway access','near San Antonio Botanical Garden']::text[]),
--     ('ChIJTZ7r9E_1XIYRYXmppAaz30c', 'Alamo Heights', array['near The Quarry and Alamo Heights','close to San Antonio International Airport','quick access to I-410 and I-281']::text[]),
--     ('ChIJP04m3Rr1XIYRY-ob0EoLfkM', 'Alamo Heights', '{}'::text[]),
--     ('ChIJO4vfKJFYXIYRJ6_wvG2EvXQ', 'Southtown', '{}'::text[]),
--     ('ChIJV7mrqaNYXIYRDcjkD1w87xQ', 'Southtown', array['San Antonio River Walk','Blue Star Arts Complex','Hemisfair Park']::text[]),
--     ('ChIJtaEWhbtYXIYRTLF3T-PbT_k', 'Southtown', '{}'::text[]),
--     ('ChIJX437hnBiXIYRTYhI3ocF3Ak', 'Stone Oak', '{}'::text[]),
--     ('ChIJj8eENcaJXIYRAEp-BjnRyHI', 'Stone Oak', '{}'::text[]),
--     ('ChIJ8Z3pHQBiXIYRBzedlJl7P7M', 'Stone Oak', array['Stone Oak neighborhood','North Central San Antonio','Major highway access']::text[]),
--     ('ChIJQ6S94eVDXIYREmK8X0P_4Zc', 'Westover Hills', array['San Antonio, TX','Escala Pkwy']::text[]),
--     ('ChIJy4Ff5slcXIYRZbZj9JXTrMM', 'Westover Hills', '{}'::text[]),
--     ('ChIJI3DXiSJDXIYR9gaO_SK7z_4', 'Westover Hills', '{}'::text[]),
--     ('ChIJ2cSfiuFCXIYR47qvvRcdqXo', 'Westover Hills', array['West San Antonio','near Highway 151','Northside Independent School District']::text[]),
--     ('ChIJp3HkmyZdXIYRYBYN8gEBlc8', 'Westover Hills', '{}'::text[]),
--     ('ChIJbwtSSiJDXIYRh-zSb6Dehko', 'Westover Hills', array['overlooks Hyatt Hill Country Golf Course','close to Highway 151','near San Antonio River Walk']::text[])
-- )
-- select c.property_name, c.city, e.add_kw,
--        c.location_keywords @> array[e.add_kw]      as added,
--        c.location_keywords @> e.old_kw             as kept_all_old,
--        cardinality(c.location_keywords) - cardinality(e.old_kw) as grew_by
--   from expected e join public.property_catalog c using (place_id)
--  order by added, c.city, c.property_name;
--
-- 2. Exactly 22 provenance events, all 'written' and 'inferred':
--
-- select action, source_type, verification_status, count(*)
--   from public.property_enrichment_events
--  where job_id = 'area_keyword_tier1_2026_10_01'
--  group by 1,2,3;
--
-- 3. The fields this must NOT touch are unchanged
--    (expect neighborhood 7, location 10, submarket 706 — the pre-existing counts):
--
-- select count(neighborhood) as neighborhood, count(location) as location,
--        count(submarket)    as submarket
--   from public.property_catalog;
--
-- 4. No row lost a keyword anywhere in the table
--    (expect 2482 + 9 = 2491 non-empty, since 9 empty fields were filled):
--
-- select count(*) filter (where cardinality(location_keywords) > 0) as non_empty,
--        count(*) filter (where cardinality(location_keywords) = 0) as empty
--   from public.property_catalog;
--
-- 5. If a row was SKIPPED by its guard it appears here (expect 0 rows):
--
-- with expected(place_id, add_kw) as (
--   values
--     ('ChIJM6gYnfG_QIYRBBko09u1PYE', 'Medical Center'),
--     ('ChIJg7QlPzjAQIYR6XdntnTKbps', 'Medical Center'),
--     ('ChIJF3-o2G6_QIYRt-AnfTQVIwY', 'Midtown'),
--     ('ChIJBVpL2JrAQIYRBxHUg-IKGWk', 'Montrose'),
--     ('ChIJDcmvvIXAQIYRwIW2r_ZuZn8', 'Museum District'),
--     ('ChIJVWguJ-zAQIYR130g0mpT0sE', 'River Oaks'),
--     ('ChIJbcU9UnDBQIYRKDqRSeRAxkI', 'River Oaks'),
--     ('ChIJSxs5ER31XIYRJVc2xDZornA', 'Alamo Heights'),
--     ('ChIJTZ7r9E_1XIYRYXmppAaz30c', 'Alamo Heights'),
--     ('ChIJP04m3Rr1XIYRY-ob0EoLfkM', 'Alamo Heights'),
--     ('ChIJO4vfKJFYXIYRJ6_wvG2EvXQ', 'Southtown'),
--     ('ChIJV7mrqaNYXIYRDcjkD1w87xQ', 'Southtown'),
--     ('ChIJtaEWhbtYXIYRTLF3T-PbT_k', 'Southtown'),
--     ('ChIJX437hnBiXIYRTYhI3ocF3Ak', 'Stone Oak'),
--     ('ChIJj8eENcaJXIYRAEp-BjnRyHI', 'Stone Oak'),
--     ('ChIJ8Z3pHQBiXIYRBzedlJl7P7M', 'Stone Oak'),
--     ('ChIJQ6S94eVDXIYREmK8X0P_4Zc', 'Westover Hills'),
--     ('ChIJy4Ff5slcXIYRZbZj9JXTrMM', 'Westover Hills'),
--     ('ChIJI3DXiSJDXIYR9gaO_SK7z_4', 'Westover Hills'),
--     ('ChIJ2cSfiuFCXIYR47qvvRcdqXo', 'Westover Hills'),
--     ('ChIJp3HkmyZdXIYRYBYN8gEBlc8', 'Westover Hills'),
--     ('ChIJbwtSSiJDXIYRh-zSb6Dehko', 'Westover Hills')
-- )
-- select c.place_id, c.property_name, c.location_keywords
--   from expected e join public.property_catalog c using (place_id)
--  where not (c.location_keywords @> array[e.add_kw]);
--
-- ═══ UNDO (only if needed — removes the keyword and logs the reversal) ═══
--
-- begin;
--   with expected(place_id, add_kw) as (
--     values
--       ('ChIJM6gYnfG_QIYRBBko09u1PYE', 'Medical Center'),
--       ('ChIJg7QlPzjAQIYR6XdntnTKbps', 'Medical Center'),
--       ('ChIJF3-o2G6_QIYRt-AnfTQVIwY', 'Midtown'),
--       ('ChIJBVpL2JrAQIYRBxHUg-IKGWk', 'Montrose'),
--       ('ChIJDcmvvIXAQIYRwIW2r_ZuZn8', 'Museum District'),
--       ('ChIJVWguJ-zAQIYR130g0mpT0sE', 'River Oaks'),
--       ('ChIJbcU9UnDBQIYRKDqRSeRAxkI', 'River Oaks'),
--       ('ChIJSxs5ER31XIYRJVc2xDZornA', 'Alamo Heights'),
--       ('ChIJTZ7r9E_1XIYRYXmppAaz30c', 'Alamo Heights'),
--       ('ChIJP04m3Rr1XIYRY-ob0EoLfkM', 'Alamo Heights'),
--       ('ChIJO4vfKJFYXIYRJ6_wvG2EvXQ', 'Southtown'),
--       ('ChIJV7mrqaNYXIYRDcjkD1w87xQ', 'Southtown'),
--       ('ChIJtaEWhbtYXIYRTLF3T-PbT_k', 'Southtown'),
--       ('ChIJX437hnBiXIYRTYhI3ocF3Ak', 'Stone Oak'),
--       ('ChIJj8eENcaJXIYRAEp-BjnRyHI', 'Stone Oak'),
--       ('ChIJ8Z3pHQBiXIYRBzedlJl7P7M', 'Stone Oak'),
--       ('ChIJQ6S94eVDXIYREmK8X0P_4Zc', 'Westover Hills'),
--       ('ChIJy4Ff5slcXIYRZbZj9JXTrMM', 'Westover Hills'),
--       ('ChIJI3DXiSJDXIYR9gaO_SK7z_4', 'Westover Hills'),
--       ('ChIJ2cSfiuFCXIYR47qvvRcdqXo', 'Westover Hills'),
--       ('ChIJp3HkmyZdXIYRYBYN8gEBlc8', 'Westover Hills'),
--       ('ChIJbwtSSiJDXIYRh-zSb6Dehko', 'Westover Hills')
--   ),
--   rev as (
--     update public.property_catalog c
--        set location_keywords = array_remove(c.location_keywords, e.add_kw)
--       from expected e
--      where c.place_id = e.place_id
--        and c.location_keywords @> array[e.add_kw]
--     returning c.place_id, e.add_kw, c.location_keywords as new_kw
--   )
--   insert into public.property_enrichment_events
--     (job_id, place_id, field_name, action, old_value, new_value,
--      source_type, source_reference, verification_status, reason, checked_at)
--   select 'area_keyword_tier1_2026_10_01_undo', r.place_id, 'location_keywords', 'written',
--          null, to_jsonb(r.new_kw)::text, 'google_places', r.place_id, 'inferred',
--          format('reverted area keyword %L', r.add_kw), now()
--     from rev r;
-- commit;
--
-- array_remove drops only the appended label, so a property that legitimately
-- carried that keyword BEFORE this job would lose it. None of these 22 did —
-- the proposal skipped any row already naming its area — so the reversal is exact.
