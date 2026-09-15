-- Remove the form_variant concept.
--
-- Product clarification: Locator Beast has ONE Smart Lead Form. Question
-- configuration does not create different "form types", so there is no short vs
-- full distinction to store. form_variant (added in 20260915100000) and its
-- CHECK were only there to preserve the legacy Lone Star short/full concept;
-- no current Locator Beast feature consumes it.
--
-- Applied AFTER the code that stopped writing/reading form_variant is deployed,
-- so no live insert references a dropped column.
--
-- lead_type stays the canonical CLIENT TYPE (renter/buyer/seller, default
-- 'renter') with its CHECK constraint — that is future-safe and correct.

alter table public.leads drop constraint if exists leads_form_variant_check;
alter table public.leads drop column if exists form_variant;
