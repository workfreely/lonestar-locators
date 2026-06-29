# Location Matching System — State Audit

**Date:** 2026-06-20
**Purpose:** Document everything currently built before starting a fresh, simplified recommendation engine. The existing system below is NOT being deleted — it stays in place, untouched, while a new isolated version is built alongside it.

**Source of this document:** Read from `supabase/seed/location_clusters_san_antonio.json` (the local seed file), the migration files in `supabase/migrations/`, and the application source files listed below. This document was **not** generated from a live database query — I have no live Supabase connection in this environment. If the live `location_clusters` table has drifted from the seed file (e.g. manual edits made directly in the Supabase dashboard), this document will be stale in those specifics. Treat it as "what the code says should be true," not verified ground truth.

---

## 1. All location clusters currently defined

16 clusters, per the seed file.

### stone_oak
- **cluster_name:** Stone Oak
- **core_zips:** 78258, 78259, 78260
- **nearby_zips:** 78248, 78247, 78261, 78266
- **aliases:** *(none)*
- **landmarks:** Camp Bullis, Camp Bullis Training Site
- **corridor_keywords:** Bulverde Rd, Bulverde Road, Inside Loop 1604
- **nearby_clusters:** la_cantera_the_rim, utsa

### la_cantera_the_rim
- **cluster_name:** La Cantera / The Rim
- **core_zips:** 78256, 78257
- **nearby_zips:** 78258, 78230, 78249
- **aliases:** La Cantera, The Rim
- **landmarks:** Six Flags Fiesta Texas, The Shops at La Cantera
- **corridor_keywords:** Loop 1604 West
- **nearby_clusters:** stone_oak, utsa, helotes

### medical_center
- **cluster_name:** Medical Center
- **core_zips:** 78229, 78240, 78230
- **nearby_zips:** 78213, 78231, 78249, 78228
- **aliases:** *(none)*
- **landmarks:** USAA, USAA Headquarters, Medical Center, South Texas Medical Center, UT Health, University Hospital, Methodist Hospital, CHRISTUS Santa Rosa
- **corridor_keywords:** Inside Loop 1604
- **nearby_clusters:** utsa, alamo_heights

### alamo_heights
- **cluster_name:** Alamo Heights
- **core_zips:** 78209
- **nearby_zips:** 78212, 78215, 78218, 78217
- **aliases:** *(none)*
- **landmarks:** Fort Sam, Fort Sam Houston, BAMC, Brooke Army Medical Center
- **corridor_keywords:** Inside Loop 1604
- **nearby_clusters:** medical_center, downtown_pearl, southtown

### westover_hills
- **cluster_name:** Westover Hills
- **core_zips:** 78251, 78253
- **nearby_zips:** 78245, 78250, 78227
- **aliases:** *(none)*
- **landmarks:** SeaWorld San Antonio, Ingram Park Mall, Lackland, Lackland AFB, JBSA Lackland, Joint Base San Antonio Lackland
- **corridor_keywords:** Culebra Rd, Culebra Road, Potranco Rd, Potranco Road
- **nearby_clusters:** alamo_ranch, southside_brooks

### alamo_ranch
- **cluster_name:** Alamo Ranch
- **core_zips:** 78253, 78250
- **nearby_zips:** 78251, 78254, 78245
- **aliases:** *(none)*
- **landmarks:** *(none)*
- **corridor_keywords:** Culebra Rd, Culebra Road, Loop 1604 West, Outside Loop 1604
- **nearby_clusters:** westover_hills, helotes

### utsa
- **cluster_name:** UTSA
- **core_zips:** 78249
- **nearby_zips:** 78230, 78257, 78251, 78240
- **aliases:** *(none)*
- **landmarks:** USAA, USAA Headquarters
- **corridor_keywords:** Loop 1604 West
- **nearby_clusters:** la_cantera_the_rim, medical_center, stone_oak

### helotes
- **cluster_name:** Helotes
- **core_zips:** 78023
- **nearby_zips:** 78254, 78256, 78250
- **aliases:** *(none)*
- **landmarks:** Camp Bullis, Camp Bullis Training Site
- **corridor_keywords:** Loop 1604 West, Outside Loop 1604
- **nearby_clusters:** la_cantera_the_rim, alamo_ranch, boerne

### boerne
- **cluster_name:** Boerne
- **core_zips:** 78006, 78015
- **nearby_zips:** 78023, 78163
- **aliases:** *(none)*
- **landmarks:** *(none)*
- **corridor_keywords:** Outside Loop 1604
- **nearby_clusters:** helotes, stone_oak

### converse_live_oak_universal_city
- **cluster_name:** Converse / Live Oak / Universal City
- **core_zips:** 78109, 78148, 78233
- **nearby_zips:** 78244, 78263, 78108
- **aliases:** Converse, Live Oak, Universal City
- **landmarks:** Fort Sam, Fort Sam Houston, BAMC, Brooke Army Medical Center, Randolph, Randolph AFB, JBSA Randolph
- **corridor_keywords:** Loop 1604 East
- **nearby_clusters:** schertz_cibolo, downtown_pearl

### schertz_cibolo
- **cluster_name:** Schertz / Cibolo
- **core_zips:** 78108, 78154
- **nearby_zips:** 78109, 78233, 78130
- **aliases:** *(none)*
- **landmarks:** Randolph, Randolph AFB, JBSA Randolph
- **corridor_keywords:** Loop 1604 East, IH-35, I-35, Interstate 35, Outside Loop 1604
- **nearby_clusters:** converse_live_oak_universal_city, new_braunfels

### new_braunfels
- **cluster_name:** New Braunfels (city_slug: `new-braunfels`, not `san-antonio`)
- **core_zips:** 78130, 78132
- **nearby_zips:** 78133, 78266, 78108
- **aliases:** *(none)*
- **landmarks:** *(none)*
- **corridor_keywords:** IH-35, I-35, Interstate 35, Outside Loop 1604
- **nearby_clusters:** schertz_cibolo, san_marcos

### san_marcos
- **cluster_name:** San Marcos (city_slug: `san-marcos`, not `san-antonio`)
- **core_zips:** 78666
- **nearby_zips:** 78667, 78130
- **aliases:** *(none)*
- **landmarks:** *(none)*
- **corridor_keywords:** IH-35, I-35, Interstate 35
- **nearby_clusters:** new_braunfels

### downtown_pearl
- **cluster_name:** Downtown / Pearl
- **core_zips:** 78205, 78215
- **nearby_zips:** 78212, 78202, 78207
- **aliases:** Downtown, Pearl, Pearl District, Tobin Hill
- **landmarks:** River Walk, Tower of the Americas, Riverwalk, San Antonio River Walk, Pearl, Pearl District, The Pearl, Pearl Brewery, Hemisfair, Downtown, Downtown San Antonio
- **corridor_keywords:** IH-35, I-35, Interstate 35, Inside Loop 1604
- **nearby_clusters:** southtown, alamo_heights, converse_live_oak_universal_city

### southtown
- **cluster_name:** Southtown
- **core_zips:** 78204
- **nearby_zips:** 78210, 78211, 78205
- **aliases:** *(none)*
- **landmarks:** *(none)*
- **corridor_keywords:** *(none)*
- **nearby_clusters:** downtown_pearl, southside_brooks

### southside_brooks
- **cluster_name:** Southside / Brooks City Base
- **core_zips:** 78211, 78223, 78214
- **nearby_zips:** 78221, 78242, 78210
- **aliases:** Brooks, Brooks City Base, Southside
- **landmarks:** Lackland, Lackland AFB, JBSA Lackland, Joint Base San Antonio Lackland, Toyota, Toyota Plant, Toyota Manufacturing, Toyota Motor Manufacturing Texas, TMMTX, Brooks, Brooks City Base, Brooks City-Base
- **corridor_keywords:** Potranco Rd, Potranco Road
- **nearby_clusters:** southtown, westover_hills

### north_central_airport
- **cluster_name:** North Central / Airport
- **core_zips:** 78216
- **nearby_zips:** 78209, 78212, 78213, 78217
- **aliases:** North Central, Airport
- **landmarks:** North Star Mall, Airport, SAT Airport, San Antonio Airport, San Antonio International Airport
- **corridor_keywords:** *(none)*
- **nearby_clusters:** alamo_heights, medical_center

**Known overlap/boundary ZIPs worth flagging:** `78230` appears as `nearby_zips` on 3 different clusters (la_cantera_the_rim, medical_center, utsa). `78249` appears on 3 (la_cantera_the_rim's nearby, utsa's core, medical_center's nearby). `78250` appears on 3 (westover_hills core, alamo_ranch core, helotes nearby). This is the structural reason ZIP-only matching has been unreliable — several boundary ZIPs are deliberately shared.

---

## 2. Files that currently control matching/scoring

| File | Role | Wired into production? |
|---|---|---|
| `lib/matching/calculateMatchScore.ts` | The full per-property scoring engine — city, credit, broken lease, eviction, criminal background, bedrooms, property type, legacy free-text location keywords, cluster-based location score (`scoreLocationMatch`), budget, management flexibility. Returns a single clamped 0-100 `matchScore`, with optional `debugCapture` instrumentation. | **Yes** — called directly from `LeadInsights.tsx`'s `fetchProperties`. |
| `lib/matching/locationIntelligence.ts` | All location-cluster logic: `getClusterByZip`, `getClusterByPropertyName`, `getClusterByNeighborhood`, `getPropertyLocationSignals` (priority-tiered property resolution), `resolveLeadLocationClusters`, `scoreLocationMatch`, `countExactClusterMatches`, `selectLocationCandidates` (candidate-pool filter, multiple rewrites), `explainPropertyClusterMatch` (debug), `matchesStrict`, `resolveLeadPrimaryCluster`, `resolvePropertyPrimaryCluster` (latest single-winner primary-cluster rewrite). | **Partially** — only `resolveLeadLocationClusters` and `getPropertyLocationSignals` are called from production (`fetchProperties`), to build the `locationContext` passed into `calculateMatchScore`. `selectLocationCandidates`, `resolveLeadPrimaryCluster`, `resolvePropertyPrimaryCluster` are **not** wired into production — built and iterated on across several rounds, verified only via debug routes, never flipped on. |
| `components/crm/LeadInsights.tsx` | Hosts `fetchProperties` (the orchestration: Supabase fetch → second-chance injection → location resolution → scoring → raw-score sort → truncate to top 3 / top 6 → render). This is the only place that actually executes a result the user sees. | **Yes** — this is production. |
| `lib/managementProfiles.ts` | Static `MANAGEMENT_PROFILES` map (company name → flexibility flags), consumed by `calculateMatchScore`'s management-flexibility block. | Yes, via `calculateMatchScore`. |

**Net effect:** today's live ranking is governed entirely by `calculateMatchScore` (additive scoring, including a +30/+20 location bonus) operating over the **full, unfiltered city-wide property list** — none of the candidate-pool filtering work (`selectLocationCandidates` and its several iterations) has ever been wired in. Location has only ever been a score bonus in production, never a filter, despite multiple rounds of filter-logic being built.

---

## 3. Debug routes that currently exist

All under `app/api/admin/debug/`, all temporary/inspection-only, none touch production behavior:

| Route | Purpose |
|---|---|
| `location-signals/route.ts` | POST `{ name, postal_code, neighborhood }` → raw `getPropertyLocationSignals`-style output for an arbitrary, non-DB property object. Earliest debug route, predates leadId-based lookups. |
| `match-breakdown/route.ts` | POST `{ leadId, propertyNames[] }` → full per-factor score breakdown (city/budget/bedroom/property-type/management/location) for named properties against a real lead, using the real `calculateMatchScore` via `debugCapture`. |
| `top-matches/route.ts` | GET `?leadId=&limit=` → mirrors production's exact fetch+score+sort pipeline, returns the ranked top N with full per-factor breakdown, including `rawScoreBeforeNormalization` (the pre-clamp score) vs. `normalizedMatchScore`. |
| `candidate-pool/route.ts` | GET `?leadId=&minCandidates=` → exercises `selectLocationCandidates` (currently wired to the single-winner `resolveLeadPrimaryCluster`/`resolvePropertyPrimaryCluster` functions) against the real citywide fetch. Not connected to production. |
| `location-candidates/route.ts` | GET `?leadId=` → a **separate, self-contained, first-principles** re-implementation (does not import `locationIntelligence.ts` at all) using plain substring checks only. Steps 4 (nearby expansion) and 5 (citywide fallback) are currently hard-disabled, so it only ever returns Steps 1-3 exact matches. |
| `raw-pipeline-check/route.ts` | GET `?leadId=` → pure raw-data verification, zero matching logic: total city-wide property count, presence/position of a named property inside vs. outside the `.limit(50)` cap, and literal DB-equality lookups for `neighborhood = 'La Cantera/The Rim'` / ZIP-in-list. |

**Observation supporting the "too many layers" diagnosis:** there are now 6 separate debug routes, 2 of which (`candidate-pool` and `location-candidates`) independently re-implement overlapping candidate-filtering logic with different rules, and `location-candidates` was deliberately built to NOT use the shared library at all — a tacit acknowledgment that trust in the shared library's correctness had already broken down before this reset.

---

## 4. Recommendation reflected in this reset

Everything above stays in place, unmodified. The new `lib/matching/simpleLocationMatch.ts` (see implementation) is intentionally disconnected from all of it — no shared imports from `locationIntelligence.ts`, `calculateMatchScore.ts`, or any debug route — so it can be reasoned about and verified in complete isolation before any of the old layers are reconsidered, trimmed, or replaced.
