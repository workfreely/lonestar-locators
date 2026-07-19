-- Supporting index for possible_duplicate_of (20260718000000). Partial —
-- only rows actually flagged need to be indexed, and most rows never will
-- be. Split into its own migration because the column migration had
-- already been applied before this index was added; keeping each
-- migration file an honest record of what it actually ran.

create index if not exists leads_possible_duplicate_of_idx
  on public.leads (possible_duplicate_of)
  where possible_duplicate_of is not null;
