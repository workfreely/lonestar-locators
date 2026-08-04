-- ============================================================================
-- Username suggestion ranking: brand-friendly first, numeric last
-- ============================================================================
-- Reorders lb_suggest_usernames() so natural, brand-friendly suffixes are tried
-- before numeric fallbacks:
--   1. geographic  (tx, sa, dfw, hou, atx)
--   2. industry    (realty, locates, apartments, leasing, homes, rentals, locator)
--   3. numeric     (-1, -2, -3) only if the above are unavailable
-- The suffix ARRAY ORDER is the priority — the loop returns the first available
-- matches up to p_limit. Availability + reservation filtering is unchanged
-- (every candidate still passes through lb_username_available).
--
-- DEPLOYMENT: apply to the Locator Beast Supabase project. create-or-replace
-- only — safe whether or not 20260730000004 has been applied.

create or replace function public.lb_suggest_usernames(p_base text, p_limit int default 6)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_root     text := public.slugify(p_base);
  v_suffixes text[] := array[
    -- 1) geographic (natural, brand-friendly) — highest priority
    'tx', 'sa', 'dfw', 'hou', 'atx',
    -- 2) industry
    'realty', 'locates', 'apartments', 'leasing', 'homes', 'rentals', 'locator',
    -- 3) numeric — only if the above are unavailable
    '1', '2', '3'
  ];
  v_cand text;
  v_out  text[] := '{}';
  s      text;
begin
  if v_root is null or v_root = '' then
    return v_out;
  end if;

  foreach s in array v_suffixes loop
    exit when coalesce(array_length(v_out, 1), 0) >= p_limit;
    v_cand := public.slugify(v_root || '-' || s);
    if length(v_cand) between 3 and 30
       and not (v_cand = any(v_out))
       and public.lb_username_available(v_cand) then
      v_out := array_append(v_out, v_cand);
    end if;
  end loop;

  return v_out;
end $$;

grant execute on function public.lb_suggest_usernames(text, integer) to authenticated;
