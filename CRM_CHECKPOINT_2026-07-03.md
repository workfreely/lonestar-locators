# CRM Checkpoint – July 3, 2026

## Current Project Status

Lone Star Locators' CRM ("Locator Beast AI") is a working Next.js + Supabase
application handling lead intake, a Kanban lead pipeline, AI-assisted client
insights, and property matching for apartment locating across four Texas
metros. The system is functional end-to-end for daily locator use, but several
forensic audits this session (matching engine, database schema, dashboard
metrics, and two full lead-level traces on a real lead, "Frank Winters")
surfaced concrete, verified defects in the property-matching pipeline, the
dashboard KPI layer, and lead-intake deduplication. This checkpoint exists to
freeze an accurate record of what's confirmed-working and confirmed-broken
before CRM V2 Foundation work begins.

## Confirmed Working

- CRM is operational.
- Lead pipeline is functioning.
- AI Insights are functioning.
- Property matching is partially functioning.
- LeadPanel's "Desired Areas" display and the Location Filter's scoring both
  read the same lead field (`lead.neighborhoods`) — verified by tracing both
  consumers directly; there is no field-mapping divergence between them.

> **Correction note:** The original checkpoint draft for this session listed
> "Dashboard monthly metrics are functioning correctly" under Confirmed
> Working. That claim is contradicted by a live-data trace performed this
> session (see Confirmed Issues below) and has been moved there instead, so
> this document doesn't misstate a bug as working behavior.

## Confirmed Issues

- Duplicate lead detection can fail when phone numbers differ slightly.
  Verified live: lead "Frank Winters" exists as two separate rows (id 146 and
  id 149), submitted ~90 minutes apart with different neighborhood answers.
  `dedupeLeads()` in `app/admin/leads/page.tsx` keys on
  `lead.phone || lead.email || ...` — since both rows have a non-empty
  (but differently malformed) phone value, `email` — identical on both rows
  and would have caught the duplicate — is never consulted.
- Production currently evaluates only the first 50 matching properties.
  `LeadInsights.tsx`'s `fetchProperties` calls
  `.eq("city_slug", citySlug).limit(50)` with no `ORDER BY`, out of a true
  citywide inventory of 177 properties (San Antonio). Verified this
  session: real La Cantera/The Rim and Leon Springs properties were excluded
  by this cap alone, not by any relevance judgment.
- Bedroom range parsing needs improvement. `parseBeds()` extracts only the
  *first* number in a range string (e.g. `"0 - 3"` parses as 0, `"1 - 3"`
  parses as 1), so two properties offering the identical unit mix can receive
  different bedroom-match scores (and therefore different overall rankings)
  purely due to how their bed-range string happens to be formatted.
- Location Filter needs refinement after the candidate pool issue is
  resolved. The cluster-based location system (`location_clusters` table,
  `locationIntelligence.ts`) is fully built but not wired into production;
  the live scoring path uses a standalone keyword-overlap check in
  `LeadInsights.tsx` that contributes at most 25 of 100 points and has known
  false-positive cases (e.g. "Live Oak" matching a lead who selected "Stone
  Oak" on the shared token "oak").
- Approval Filter has not yet been completed. `lib/matching/approvalFilter.ts`
  exists and is more disciplined than the live scoring logic, but is wired
  only into debug routes, not production.
- **Dashboard monthly metrics are not functioning correctly** (moved here
  from the original Confirmed Working draft — see correction note above).
  "Leads This Month" and "Closed This Month" both incorrectly compute to 0
  because `DashboardStats.tsx` filters on `created_at` as a proxy for a
  close-date event; `leads` has no `closed_at` or `updated_at` column, so any
  lead created in an earlier month and closed in the current one is invisible
  to these KPIs even though the Kanban board correctly shows it as closed.

## Architectural Decisions

- Complete the duplicate detection redesign first.
- Remove the 50-property evaluation limit.
- Finish the Location Filter before beginning the Approval Filter.
- The Recommendation Engine will come after the Location and Approval
  Filters are complete.
- No additional features will be added until these two filters are
  production-ready.

## Development Roadmap

**Priority 1:**
Duplicate Detection

**Priority 2:**
Property Candidate Pool

**Priority 3:**
Location Filter

**Priority 4:**
Approval Filter

**Priority 5:**
Recommendation Engine
