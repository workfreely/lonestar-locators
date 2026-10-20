-- Client recommendations: freeze the bedroom starting price into the snapshot's reasons.
--
-- ── WHY A SQL HELPER ────────────────────────────────────────────────────────────────────────
-- The internal Recommended Properties card derives "2BR from $1,679" at RENDER time
-- (lib/leads/bedroomPricing.displayReasons) and deliberately never writes it back, so a later
-- price correction cannot leave a stale bullet behind and the locator's typed reasons are never
-- overwritten. The consequence was that the client page never saw it: the snapshot freezes
-- lead_property_reasons.reasons, which contains only the typed text.
--
-- The composition has to happen in TWO places inside lb_prepare_client_share /
-- lb_create_client_share — the reuse FINGERPRINT and the snapshot INSERT. If only the insert
-- composed, a price change would not invalidate an unsent share and a re-send would hand back
-- stale composed reasons. One helper, called twice, keeps them in step.
--
-- ── IT MIRRORS displayReasons EXACTLY ───────────────────────────────────────────────────────
-- Same rules, same order: blanks dropped, bedroom parsed from the client's saved preference,
-- EXACT bedroom column only, no price when that bedroom has none, no second price when one is
-- already present, never more than the three-reason maximum, and never displacing a typed reason
-- — the price yields rather than evicting anything. Slot two, after location, before amenity.
-- A drift test runs both implementations over the same cases and requires identical output.
--
-- Pure and IMMUTABLE: no table access, no clock, no side effects. Nothing is written to
-- lead_property_reasons by this function or by its callers.

create or replace function public.lb_compose_recommendation_reasons(
  p_reasons  jsonb,     -- the SAVED reasons (lead_property_reasons.reasons)
  p_beds     text,      -- the client's saved bedroom preference (leads.beds)
  p_onebr    numeric,
  p_twobr    numeric,
  p_threebr  numeric,
  p_max      int default 3
) returns jsonb
language plpgsql
immutable
as $$
declare
  v_clean jsonb;
  v_beds  text;
  v_n     int;
  v_rent  numeric;
  v_text  text;
begin
  -- Blank entries are dropped and do not count toward the limit (mirrors the TS filter).
  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb)
    into v_clean
    from jsonb_array_elements_text(coalesce(p_reasons, '[]'::jsonb)) as t(x)
   where btrim(x) <> '';

  -- ── THE CLIENT'S BEDROOM PREFERENCE ──────────────────────────────────────────────────────
  -- Fails closed: anything not read with certainty yields no price at all. "3+" means three or
  -- more, so the 3BR starting rent IS the rent for the count they asked about. A RANGE ("1-2")
  -- is refused before any digit is read — picking either end would invent a request the client
  -- never made, and choosing the cheaper one would flatter the listing.
  v_beds := lower(btrim(coalesce(p_beds, '')));
  if v_beds = '' then return v_clean; end if;
  if v_beds ~ '\d\s*(-|–|—|to|/|,)\s*\d' then return v_clean; end if;
  if v_beds !~ '^[0-9]+\s*\+?\s*(br|bed|beds|bedroom|bedrooms)?\+?$' then return v_clean; end if;
  v_n := (substring(v_beds from '^([0-9]+)'))::int;
  if v_n not in (1, 2, 3) then return v_clean; end if;

  -- EXACT column only. There is deliberately no fallback to another bedroom count.
  v_rent := case v_n when 1 then p_onebr when 2 then p_twobr else p_threebr end;
  -- A stored 0 or negative is treated as "not entered", not as a free apartment.
  if v_rent is null or v_rent <= 0 then return v_clean; end if;

  -- Already stated — by us on a previous compose, or typed by the locator by hand. Matches the
  -- SHAPE, not our exact formatting, so "2 BR from $1400" also counts. (?s) so the class spans
  -- newlines, matching the [\s\S]* in the TypeScript.
  if exists (
    select 1 from jsonb_array_elements_text(v_clean) as t(x)
     -- \y, NOT \b: in a Postgres ARE \b is a BACKSPACE, not a word boundary — the drift test
     -- caught this by producing a duplicated price the TypeScript correctly suppressed.
     where x ~* '(?s)[0-9]\s*br\y.*\$\s*[0-9,]+'
  ) then
    return v_clean;
  end if;

  -- Full. Preserving what the locator wrote outranks adding what we derived.
  if jsonb_array_length(v_clean) >= p_max then return v_clean; end if;

  -- "2BR from $1,679" — whole dollars, thousands separated. "from" is load-bearing: it is what
  -- makes this a STARTING rent rather than a quote for the client's move-in date.
  v_text := v_n::text || 'BR from $' || to_char(round(v_rent), 'FM999,999,999');

  -- Slot two: location first, price second, amenity third. With fewer saved reasons than the
  -- slot index the price simply lands at the end rather than leaving a gap.
  if jsonb_array_length(v_clean) = 0 then
    return jsonb_build_array(v_text);
  end if;
  return jsonb_insert(v_clean, '{1}', to_jsonb(v_text));
end;
$$;

comment on function public.lb_compose_recommendation_reasons(jsonb, text, numeric, numeric, numeric, int) is
  'Saved reasons + the client''s bedroom starting price, composed for a client snapshot. Mirrors lib/leads/bedroomPricing.displayReasons; a drift test asserts the two agree. Never writes.';

revoke all on function public.lb_compose_recommendation_reasons(jsonb, text, numeric, numeric, numeric, int) from public, anon;
grant execute on function public.lb_compose_recommendation_reasons(jsonb, text, numeric, numeric, numeric, int) to authenticated, service_role;
