-- ROLLBACK 20261114000002_quick_match_candidates_rpc.
--
-- Dropping this function is safe and complete: it is additive, nothing else calls it, and the
-- application treats its absence as "the read path has not shipped" rather than as an error.
-- lb_property_catalog_by_ids is not referenced here and is untouched.
drop function if exists public.lb_quick_match_candidates(text);
