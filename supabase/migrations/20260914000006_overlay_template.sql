-- Social Beast: per-post Overlay Template (which of the 5 overlay layouts a post uses). Additive,
-- nullable-with-default; existing posts default to the current Market + Type (Template 1).
alter table public.social_posts add column if not exists overlay_template text not null default 'market_type';
