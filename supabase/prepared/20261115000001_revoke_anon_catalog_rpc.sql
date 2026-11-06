-- PERMISSIONS ONLY. Closes anonymous execution of lb_property_catalog_by_ids.
--
-- ── WHAT IS WRONG TODAY ─────────────────────────────────────────────────────────────────────
-- 20260922000002_property_catalog_rpc.sql removed the broad `select to authenticated using
-- (true)` policy on property_catalog and made this SECURITY DEFINER function the only read
-- path, revoked from public and anon and granted to authenticated. That held until
-- 20261106000000_property_gift_card.sql, which had to DROP and recreate the function because
-- its return type changed — resetting privileges — and restored them with
--
--     grant execute on function public.lb_property_catalog_by_ids(text[]) to anon, authenticated;
--
-- The `anon` there is almost certainly carried over from the grant on
-- lb_resolve_client_recommendations in the same file, which genuinely needs it for the renter's
-- shared page. The consequence, verified against production with the public anon key: an
-- ANONYMOUS caller who knows a Google Place ID reads all 27 columns for that property,
-- including send_commission and escort_commission — locator pay, which no client surface is
-- ever meant to see.
--
-- ── WHY NO CALLER BREAKS ────────────────────────────────────────────────────────────────────
-- Every caller was traced before this was written. The function is reached from exactly two
-- places in the codebase:
--   lib/propertyExplorer/catalog.ts:107        fetchCatalog — the only RPC call site
--   app/api/admin/social-autopilot/property-research/route.ts:179
-- and fetchCatalog is reached only from attachCatalogRatings (app/admin/leads server page and
-- the authenticated DashboardClient), propertySearch (CanonicalPropertySearchField, used by
-- four /admin components) and resolveExternalCatalog (DashboardClient). All sit behind
-- middleware.ts's /admin authentication; the API route uses the caller's own session under
-- /api/admin. No file under app/locator-beast/r (the anonymous renter page) references it —
-- that page reads lb_resolve_client_recommendations, whose anon grant is untouched here.
--
-- ── WHAT THIS DOES NOT DO ───────────────────────────────────────────────────────────────────
-- It does not create, replace, drop or alter the function. The body, the signature and all 27
-- return columns are untouched, so no search, map, ranking or recommendation behaviour can
-- change — only who may call it. It adds and removes no table, column, policy or row.
--
-- Reverting is one statement:
--     grant execute on function public.lb_property_catalog_by_ids(text[]) to anon;

revoke execute on function public.lb_property_catalog_by_ids(text[]) from anon;

-- Stated again rather than assumed: PUBLIC must not hold it either, or `anon` inherits it back.
revoke execute on function public.lb_property_catalog_by_ids(text[]) from public;

-- Unchanged, restated so the end state of this file is the whole intended grant.
grant execute on function public.lb_property_catalog_by_ids(text[]) to authenticated;
