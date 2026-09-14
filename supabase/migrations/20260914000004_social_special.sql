-- Beast Social: per-post "Social Special" — the short, public-facing promotional value chosen for
-- an individual post (e.g. "8 Weeks Free", "$500 Gift Card", "Free Movers", or a concise custom).
-- SEPARATE from the source's raw Current Special (social_content.special), which is factual
-- metadata and is never overwritten. When set, this explicit value takes precedence over the
-- deterministic normalization of the raw special for that post's generated public copy. Nullable;
-- null → fall back to the normalized raw special.
alter table public.social_posts add column if not exists social_special text;
