# Locator Beast Control Center — Master Product Blueprint

**Document status:** CANONICAL master blueprint (sits ABOVE the individual subsystem specs). Planning/
architecture-reconstruction only — nothing was built, run, deployed, or changed to produce it.
**Date:** 2026-09-26.
**Current development freeze point:** Property Intelligence PAUSED (see `docs/PROPERTY_INTELLIGENCE_V1_SPEC.md`
§13). LB DB unchanged: 4,202 properties · 3,832 populated Primary · 370 Missing · 28 Uncertain · 27 v1.1
image writes · `change_requested` 0/0 · Fallback 190 (0 v1.1). All agents/jobs idle.

**Source documents reviewed (evidence, not assumption):**
- `docs/PROPERTY_INTELLIGENCE_V1_SPEC.md`, `docs/PROPERTY_IMAGE_INTELLIGENCE_SPEC.md`,
  `docs/PROPERTY_INTELLIGENCE_FABLE_HANDOFF.md`, `docs/location-matching-system-audit.md` (2026-06-20),
  `docs/environments.md`, `docs/workspace-foundation.md`.
- Code: `scripts/propertyIntel/*` (35 scripts incl. `enrich_job`, `qual_queue`/`qual_apply`, `floorplan`,
  `import`, `profile`, `resolve_websites`, `fingerprint_providers`, `conflict_resolve`, `v11/*`),
  `lib/{propertyEnrichment,matching,followup,security,messages,ai,analytics,meta,network,workflow,
  companion,smartForm,clientShare,google,notifications,social,leads}/*`, `apps/beast-companion/*`.
- Supabase: 179 migrations incl. `property_intel_canonical_schema` (~380 fields),
  `property_enrichment_jobs` (durable job model: Run/Pause/Resume/Stop + crash recovery),
  `property_review_queues` (`property_conflict_review` + `property_qualification_review`),
  `location_intelligence` (normalized landmark model), `image_fallback_slot`, `property_special_freshness`.
- Project memory (decision log): Follow-Up, Next Action, Beast Sync/Companion, Security Beast, Meta Sales
  Analytics, Import/verified-overlay, recommendation architecture, Beast Network, dedicated-project/infra.
- Social Beast: `lib/social/*` (25 modules — composePost, overlaySpec, hashtags, renderVideo, calendar,
  recurrence, postStatus, propertyAutoMatch, tiktokPublish, instagram, destinationInvite, socialSpecial…),
  `app/admin/social-autopilot/*` (posts · calendar · accounts · queue · history · analytics · post editor),
  `app/api/admin/social-autopilot/*` (content, bulk, voice-clips, recurring, destinations, publish, render,
  dry-run, autoschedule), migrations `social_content*`, `social_posts*`, `social_connections`,
  `publishing_destinations_*`, `instagram_publish_phase1`, `social_special`, `tiktok_connection`,
  `social_voice_clips`; `vercel.json` crons (none for social); memory `social-autopilot`,
  `tiktok-sandbox-connection`.

**Reconciliation note:** the August "Property Intelligence" algorithm doc is *historical foundation*. Where
later implementation supersedes it (canonical ~380-field schema, per-slot image locks, v1.1 recovery,
review-queue tables, durable job model, normalized location intelligence), the CURRENT rule below governs.
Foundational principles that still hold are preserved in §3.

---

## 1. What is the Locator Beast Control Center?

Three layers:

```
   LOCATOR BEAST            the locator-facing SaaS (Map, CRM/Kanban, Companion, Smart Lead Form, /r pages)
        ▲  reads
   BEAST BRAIN              intelligence + automation: Property Intelligence, Matching, Follow-Up,
   (intelligence +          messaging, discovery, enrichment/image agents, Security enforcement
    automation)
        ▲  observes / controls
   CONTROL CENTER           the PRIVATE admin operating system: observe, review, manage, and control the
                            brain and its data — the subject of this blueprint
        ▲
   INFRASTRUCTURE           Supabase (canonical durable DB) · Mac Mini (execution/control host) ·
                            Google APIs · AI providers · Beast Sync/iMessage · rendered-browser
```

The Control Center is **not** Locator Beast and **not** a new database. Supabase remains the single source
of truth; the Control Center is a visual operating layer that reads the durable state and issues authorized
actions through existing safe backends. Its job: **make the brain observable, reviewable, and controllable
without terminal reports.**

---

## 2. What systems belong inside it?

| Module | What it governs |
|---|---|
| **Overview / Command Center** | operational health + attention queue at a glance |
| **Property Intelligence** | the ~380-field property data model, enrichment, images, review, provenance |
| **Property Search / Matching** | the experienced-locator matching brain (client ↔ property) |
| **Follow-Up** | the lifecycle messaging agent + Next Action |
| **Agents / Jobs** | run/observe every intelligence + automation agent |
| **Review Center** | one human-review inbox across all subsystems |
| **Import / Export** | spreadsheet round-tripping through the safe writer |
| **Analytics** | property/agent/search/business analytics + marketing attribution |
| **Security Beast** | detection → enforcement → evidence for the private surfaces |
| **Social Beast** | content creation → reusable hooks/CTAs/voice clips/music → scheduling → connected accounts → posting/execution → history/errors → attribution |
| **System** | infrastructure, service health, cost, versions, backups |

---

## 3. Permanent foundational principles (preserved)

These survive from the original spec and are still current; later work strengthened them where noted.

| Principle | Status |
|---|---|
| Database is durable memory; research runs are transient | **Current** |
| Deterministic code owns deterministic operations; AI researches/interprets ambiguity, is not the bookkeeper | **Current** |
| Official property sources are preferred evidence; trusted/manual knowledge is protected | **Current** |
| **Unknown ≠ No**; website silence ≠ absence | **Current** |
| Provenance/evidence must survive every write | **Current** (strengthened: per-field provenance + `EnrichmentEvent`s) |
| Automation **enriches**, never blindly overwrites; conflicts are surfaced for review | **Current** (strengthened: `property_conflict_review` table) |
| Properties/markets are data, not hard-coded apps; stable identity (`place_id`) reused | **Current** |
| Expensive API work not repeated unnecessarily; discovered-candidate exclusions retained | **Current principle**; exclusion registry **PARTIAL** (job model exists, discovery registry pending) |
| No silent destructive writes; safe-writer protections | **Current** (single write path, optimistic concurrency) |
| **Commission firewall** (send/escort/bonus never writable by enrichment) | **Current** |
| **Image per-slot locks + `change_requested`**; human-reviewed data protected (195 GOOD immutable) | **Current** (strengthened: dual-slot locks, no-churn, 253 regression guard) |

**Superseded / evolved from August:** single ranking → the frozen v1.0 engine + v1.1 discovery layer;
ad-hoc image handling → dual-slot locks + visual gate + AVIF eval; flat fields → canonical ~380-field
schema; per-landmark columns → normalized `location_intelligence` model; manual runs → durable
`property_enrichment_jobs` model.

---

## 4. Control Center architecture (nav evaluation)

Proposed nav — OVERVIEW · PROPERTY INTELLIGENCE · PROPERTY SEARCH · FOLLOW-UP · AGENTS · REVIEW CENTER ·
IMPORT/EXPORT · ANALYTICS · SECURITY BEAST · SYSTEM — is **sound and scalable**, with one required
addition: **SOCIAL BEAST** as a first-class module. It is the content/marketing engine, it already has a
working platform-admin surface at `/admin/social-autopilot`, and it sits on the marketing-launch critical
path. Recommendations:

- **Keep** all ten as top-level; they map to real subsystems (no redesign of the intelligence needed).
- **Merge** Sources + History as in-context tabs (inside Property Intelligence + a global Recent-Changes
  feed), not a top-level destination.
- **Review Center is cross-cutting** (Property Data, Images, Qualification, Search, Follow-Up, Discovery,
  Security) — keep it top-level; it is the "escalate exceptions" hub.
- **Agents/Jobs vs Follow-Up/Search:** Follow-Up and Search are important enough to be their own modules
  AND appear as agents under Agents/Jobs (observe there, operate in their own module).
- The shell must accept a **new agent/module by config**, not by re-architecting — a registry-driven nav.

Recommended top nav (ordered by V1 maturity): **Overview · Property Intelligence · Social Beast · Review
Center · Agents/Jobs · Property Search · Follow-Up · Import/Export · Analytics · Security Beast · System.**
Social Beast ranks high because it is the most complete *existing* admin UI in the system; the Control
Center should **integrate** it (link/embed first, migrate progressively), never rebuild it.

---

## 5. Overview / Command Center

Answer "what needs me right now?" in seconds. **Separate operational health from business analytics.**

**Operational health (top):** active properties (4,202 + market split: Dallas 1,366 · Austin 920 ·
Houston 866 · San Antonio 585 · no-market 465); Property Intelligence health (image coverage 91%, Missing
370 / Bad ~299 / Uncertain 28); **data completeness by category** (not one score — see §6); open conflicts;
review-queue size; agents running / failed jobs; follow-ups scheduled / messaging failures; **scheduled
social posts / posting failures / expiring platform tokens (Social Beast)**; Security Beast alerts; service/API health; AI/API cost (today + trend); recent changes; **items requiring human
attention** (single number that expands to the Review Center).

**Business analytics (separate panel or the Analytics module):** searches/recommendations, leads, tours,
applications, leases, commission — never mixed with health metrics.

---

## 6. Property Intelligence (complete current model)

Full detail: `docs/PROPERTY_INTELLIGENCE_V1_SPEC.md` + `docs/PROPERTY_IMAGE_INTELLIGENCE_SPEC.md`. Domains
on `property_catalog` (schema BUILT via `property_intel_canonical_schema`), with **honest data state**:

| Domain | Schema | Data today |
|---|---|---|
| **Identity** (name, place_id, website, address, coords, Google rating/reviews, contact, aliases/lifecycle) | BUILT | **Strong** — website 98%, phone 98%, rating 99%, geo 100%; aliases/lifecycle minimal |
| **Classification** (high-rise/mid-rise/garden/BTR/townhome/loft/split-level/penthouse/rental-home, furnished, applicability) | BUILT | **~0% persisted** (type inferred at runtime, not stored) |
| **Pricing / core** (bed/bath/sqft ranges, per-plan starting rents, live-pricing flags) | BUILT | **~0%** |
| **Features/amenities** (canonical feature system; community/property/unit/layout separation; select-unit/floorplan applicability; feature governance; evidence) | BUILT | **~0%** (`amenity_keywords` 0%) |
| **Floor plans** (`floorplan.ts` exists; URLs + per-plan pricing) | BUILT | **~0%** |
| **Images** (Primary + Fallback; v1.0 frozen + v1.1; scene, quality, provenance, locks, change_requested, review, recovery, 253 regression set) | BUILT | **Primary 91%, Fallback 5%** |
| **Specials/concessions** (`current_special` + freshness) | BUILT | **~0%** (4 rows) |
| **Approval/qualification** (canonical policy model; credit/income/eviction/broken-lease/criminal; trusted-internal evidence; public-web limits; `qual_queue`/`qual_apply` + `property_qualification_review`) | BUILT | **Sparse** |
| **Pets** | BUILT | **43%** |
| **Utilities / Internet** | BUILT | ~0% |
| **Management** (company + website; `managementProfiles.ts`, `managementApprovalFilter.ts`) | BUILT | **9%** |
| **Commission** (send/escort/bonus; verified-paying / verified-no-pay / unknown; public-web firewall; effective/history) | BUILT (firewalled) | Present but never enrichment-writable |
| **Location intelligence** (normalized `location_landmarks` / `location_nearby_categories` / `property_landmark_metrics` / `property_hours`; 16 SA clusters seeded; future drive-time/Routes) | **PARTIAL** (schema built, resolver approved-only) | landmark fields ~0% persisted |
| **Keywords** (amenity + location) | BUILT | ~0% |
| **Sources/provenance + History/staleness** | BUILT | per-write events emitted; freshness stamps on specials |
| **New Property Discovery** (candidates → Review Bucket; Add/Skip/Exclude/Pending; retained identity) | **DESIGNED** (job_type `new_property_discovery` exists; registry pending) | none |
| **Completeness** | derived | computable now per §5 |

**Read this honestly:** identity + geo + Google + images are populated; deep intelligence domains are
**schema-ready, data-empty** — the enrichment *agents exist as scripts* but have not been run at scale.

---

## 7. Property Intelligence admin experience

Screens (per Fable handoff §6–8): **Overview · Property Catalog · Property Detail · Completeness · Images ·
Review · Sources · History · Jobs · Import/Export.** Property Detail organizes the ~380 fields into sections
(**Overview, Classification, Pricing, Features, Floor Plans, Images, Specials, Approval, Pets, Utilities,
Location, Management, Commission, Sources, History**) — never a raw field table. For each important fact:
**value · state · source · verified date · confidence · provenance · history.** States: **Verified ·
Missing · Unknown · Conflict · Needs Review · Stale** (Unknown ≠ No; empty categories read "not yet
enriched"). Image actions route through `change_requested` (never direct writes) — see the Fable handoff §8
for the full Image Review experience.

---

## 8. Property Search / Matching brain

Full audit: `docs/location-matching-system-audit.md`. This is an **experienced-locator matching system**,
not database filtering. **Status: PARTIAL.**

**Built:** `lib/matching/*` (approval filter, management-approval filter, property-type filter, filter
composition); 16 seeded San Antonio location clusters (core/nearby zips, aliases, landmarks, corridors,
nearby clusters); the recommendation surfaces (`/r` client pages, Send List / snapshot share); Companion
composite `evaluateMatchScore`. **Known gap (memory `beast-match-parity`):** the Map popup uses location-
only `assessLocationFit` while Companion uses a composite score — they disagree; root-caused, fix deferred
pending Explorer client/property enrichment.

**Intended full model (DESIGNED):** hard constraints vs preferences · budget/value · **approval
probability/qualification** · location (clusters/landmarks/drive-time) · property type · floorplans ·
amenities/features with **applicability** (select-unit/select-floorplan) · specials · client preferences ·
favorites · tour feedback · conversation-derived preferences · confidence/unknowns · **explainability**
("why this property") · ranking + recommendation caps.

**Current Client Context (evolving renter model)** should fuse: **Smart Lead Form + CRM profile + locator
notes + text conversation + favorites + tour feedback + AI Client Insights.** Engine built
(`lib/ai/{generateAiInsights,syncAiInsights,leadResponsiveness}`), but per memory the insights +
`companion_messages` tables are **empty (0 rows)** — the pipeline is wired, data not yet flowing;
recompute-at-send-time deferred. Property Intelligence supplies the **property side** (features/applicability/
approval/location/specials) of this match.

**Control Center needs to inspect/debug a search:** given a client, show inputs used (form/profile/notes/
insights), hard filters applied, candidate pool, per-candidate score breakdown + why, what was capped/
excluded, and unknowns that lowered confidence.

---

## 9. Follow-Up Agent

**Status: BUILT** (`lib/followup/{engine,cadence,dispatcher,gate,pacing,reconcile,sequences,copy}` +
`lib/workflow/*` + `lib/nextAction*`). Memory: `contact-follow-up-sequence`, `next-action-ranking`,
`next-action-card-model`, `workflow-auto-due-9am`, `companion-workflow-stabilization`,
`prompt-ownership-model`, `lead-timeline-history`.

Workflows implemented/designed: New Lead → initial sequence → **FU1/FU2/FU3/Final**; List Sent →
Favorites/Tour → Post Tour → Applied → Closed → Paused → Resume Search; pre-list Contact chase (FU1→3);
manual↔automated handoff; **conversation gating** (a client reply cancels stale scheduled actions); quiet
hours; **stale-action cancellation + idempotency** (16 canonical action keys, server-authoritative
timezone); Next Action integration (one canonical ranking across Board/Panel/Agenda/Companion); auto due =
9 AM local.

**Delivery (Beast Sync / iMessage): PARTIAL** — Companion extension (`apps/beast-companion`, MV3, phase-1),
transcript sync (`lib/messages/*`), SAD extraction audit. Mac/iMessage send + incoming-message sync is the
execution layer on the Mac Mini (see §15); automated texting is gated (`automated-texting-authorization`:
inert account-auth + per-lead opt-in, dual gate, Jay authorized only, all leads Off).

**Control Center exposes:** scheduled · sent · cancelled · failed · replied · human-attention-needed —
and **why** each decision was made (which trigger/gate fired).

---

## 9A. Social Beast

**Status: PARTIAL overall — and the most complete existing admin UI in the system.** Internally "Social
Autopilot" / "Beast Social": a platform-admin-gated internal beta at `/admin/social-autopilot` (tabs: Posts ·
Calendar · Accounts · Queue · History · Analytics · Post editor). Memory: `social-autopilot`,
`tiktok-sandbox-connection`. *(Distinct from **Beast Voice** — `lib/beastVoice`, the Companion voice-command
system — which is not part of Social Beast.)*

**Role:** the content/marketing engine that turns property intelligence into published social content and,
eventually, into attributed leads. It is on the marketing-launch critical path.

| Area | Status | What exists | What's missing |
|---|---|---|---|
| **Content creation / library** | BUILT | `social_content` (+naming, property_type, tags, area); multi-upload / batch / bulk (SA1 + SA1.1, shipped 2026-09-11); filename inference; **property auto-match / resolve** against the catalog; amenity/market/property-type helpers | — |
| **Post composer** | BUILT | `social_posts` (+post_type, composer); overlays (headline/subheadline `overlaySpec`); captions + hashtags (Instagram-aligned); specials-in-posts (`socialSpecial`); `composePost`; duplicate; **dry-run** | — |
| **Rendering** | PARTIAL | `renderVideo` + `/posts/[id]/render`; status `rendering` | a durable **render worker** (heavy video work → Mac Mini candidate) |
| **Reusable hooks / CTAs / voice clips** | BUILT | `social_voice_clips` (hook = start, cta = end; per-user bank in the private `social-media` bucket; no property metadata, so a clip is recorded once and reused); `/voice-clips` API; "Music \| Voice Clips" row + library UI (29622ba) | — |
| **Music** | DESIGNED | UI slot in the Music \| Voice Clips row | music library/table + licensing rules |
| **Scheduling** | BUILT (logic) / PARTIAL (execution) | `calendar.ts` (Calendar tab and ScheduleWorkspace share one model), `recurrence` + `generateRecurrence` + `/recurring` APIs, `/autoschedule`; lifecycle `draft → rendering → ready → scheduled → publishing → needs_attention → published`; Queue vs History separation | **no scheduled-post dispatcher/worker** — `postStatus.ts` states rendering/publishing workers are not built; no social cron in `vercel.json` |
| **Connected accounts / publishing destinations** | BUILT | `social_connections`; `publishing_destinations_foundation` + `_authorization`; destination **invitations** (issue/revoke); multi-account Publishing Destinations UI; **Instagram OAuth** (connection-only, `instagram_business_basic`, long-lived + refresh tokens, server-side only); **TikTok OAuth** (connect; `user.info.basic` + `video.publish`; shipped 55acdae) | Instagram publish scope (`instagram_business_content_publish`) |
| **Posting / execution** | PARTIAL | `/posts/[id]/publish` + `/publish/status`; **TikTok Direct Post** Sandbox MVP (`tiktokPublish`: creator-info → init → FILE_UPLOAD → poll; token via Vault RPC, never logged) | Instagram publishing; automated dispatch of scheduled posts; retries |
| **Posting history / errors** | PARTIAL | History tab; `published` lives in History; `needs_attention` state | per-post/per-platform error capture + surfacing |
| **Mac Mini execution** | DESIGNED | — | render + publish workers as durable jobs (same model as `property_enrichment_jobs`) |
| **Attribution (content → lead → tour/application → lease)** | FUTURE (paid side BUILT) | paid: `meta_publisher_platform` FB-vs-IG in Meta Sales Analytics + frozen closed-commission estimate | organic: per-post trackable link/UTM → Smart Lead Form lead-source → CRM → Search → Tour → Application → Lease |
| **Customer-facing Social Beast** | FUTURE | admin-only internal beta | productization decision |

**Safeguards (existing):** platform tokens server-side only (Vault RPC; never browser/URL/logs); private
storage bucket with owner-folder policy + RLS; platform-admin gating; dry-run before publish.

**Control Center needs:** content-library health · posts by status (queue) · calendar · connected accounts +
destination health (token expiry) · publish results and **why** a post failed · recurring rules · later,
attribution. Because a working admin UI already exists, the Control Center **integrates** it (link/embed →
progressive migration) rather than rebuilding it.

---

## 10. Agent architecture inventory

Status: **BUILT** (works from backend) · **PARTIAL** · **DESIGNED** · **FUTURE**. "Table exists" ≠ BUILT.

| Agent | Status | Purpose | Run today | Control-Center support needed |
|---|---|---|---|---|
| **Property Enrichment** (`enrich_job.ts`, safe writer) | BUILT | fill non-image fields from official/Google sources | CLI `tsx` | run/observe; conflict review |
| **Property Image Intelligence v1.0/v1.1** | BUILT (v1.1 committed `5183593`; v1.0 FROZEN) | Primary image recovery | CLI (paused) | job control, image review, change_requested UI |
| **Website Resolver** (`resolve_websites.ts`) | BUILT | resolve missing website via Google Places | CLI | observe |
| **Google Identity** (`profile.ts`, `lib/google`) | BUILT | place_id, rating, geo, canonical address | CLI | observe |
| **Location Intelligence** (`lib/matching` clusters, `location_intelligence` schema, landmark resolver) | PARTIAL | landmarks/corridors/drive-time | approved-only resolver | resolver control; landmark curation UI |
| **Rendered Web Recovery** (`rendered_recovery.ts`, Playwright) | BUILT | pass Cloudflare/JS galleries | CLI | observe |
| **Qualification/Approval** (`qual_queue.ts`, `qual_apply.ts`, `property_qualification_review`) | PARTIAL | structured approval policy + ambiguous-match review | CLI | qualification review queue UI |
| **New Property Discovery** (`job_type` exists) | DESIGNED | discover candidates → Review Bucket | not built | discovery review (Add/Skip/Exclude/Pending) + exclusion registry |
| **Conflict Resolver** (`conflict_resolve.ts`, `property_conflict_review`) | PARTIAL | classify + dispose write conflicts | CLI | conflict review UI |
| **Import** (`import.ts`) | PARTIAL | overlay verified data (per verified-overlay rules) | CLI | full Import wizard (§12) |
| **Property Search / Matching** | PARTIAL | client↔property recommendation | app runtime | search inspector/debugger |
| **Follow-Up Agent** | BUILT (delivery PARTIAL) | lifecycle messaging + Next Action | app + Mac Mini | activity + decision-why views |
| **Security Beast** | PARTIAL | detect→enforce→evidence | primitives only | alerts + evidence UI |
| **Social Beast — content ingest + property auto-match** | BUILT | match uploaded media to catalog properties; tag/name content | app routes (`/content`, `/content/bulk`) | content-library view |
| **Social Beast — render worker** | PARTIAL | render overlay + voice-clip video | `/posts/[id]/render` route | job observability; Mac Mini candidate |
| **Social Beast — scheduler / dispatcher** | DESIGNED | publish scheduled + recurring posts on time | not built (no worker, no cron) | Run/Pause; needs-attention queue |
| **Social Beast — publisher (TikTok / Instagram)** | PARTIAL | direct-post to connected accounts | manual route; TikTok sandbox MVP; Instagram connect-only | publish results + errors per platform |
| **Durable Job Runner** (`property_enrichment_jobs` model) | DESIGNED | always-on Mac Mini operator (Run/Pause/Resume/Stop, crash recovery, idempotency) | schema only | the Jobs module IS this UI |

---

## 11. Central Review Center

ONE human-review inbox. Philosophy: **automate the normal case, escalate exceptions; preserve history and
decisions.** Categories (backed by existing tables where noted):
- **Property Data conflicts** — `property_conflict_review` (classified + disposition). **BUILT (backend).**
- **Images** — missing/bad/uncertain/proposed replacement (file-based today; needs durable store).
- **Qualification/Approval** — `property_qualification_review` (candidate matches + confidence; identity
  never guessed). **BUILT (backend).**
- **New Property / Discovery** — Add/Skip/Exclude/Pending with **retained history + exclusion registry** so
  excluded candidates aren't reprocessed. **DESIGNED.**
- **Identity matches**, **Feature candidates**, **Search/Matching**, **Follow-Up**, **Security** — DESIGNED.

Each item keeps: what/old→new/source/agent-or-human/date + the decision + who decided.

---

## 12. Import / Export

Requirements are established (Fable handoff §11; memory `verified-overlay-rules`). **Status: DESIGNED**
(`import.ts` does PI overlay today; the product round-trip is not built).

**Import** (XLSX/CSV): Upload → Analyze → **Match Properties** (stable `place_id`) → Map Fields (→ ~380
canonical) → Validate → **Preview Changes** → Import. Preview distinguishes: matched · new · ambiguous ·
unchanged · missing-filled · **conflicts** · **protected** (commission + locked images) · rejected. Imports
**enrich, never blindly overwrite**; run **through the safe writer** as source `uploaded_spreadsheet`;
conflicts → Review. Weak matches gated (≥0.6 ratio guard, per verified-overlay rules); not-in-master →
New Property Candidate.

**Export:** scopes All / Market / Current Filter / Selected; presets Full · Core · Features · Floor Plans ·
Specials · Approval · Images · Location · Commission · Custom; XLSX/CSV; optional provenance columns
(Source · Verified Date · Confidence · Last Updated · Algorithm Version). Stable IDs enable **Export → edit
→ re-import → match → preview → approve**. Supabase stays source of truth; spreadsheets are a snapshot.

---

## 13. Analytics

Separate four planes (mark anything not previously discussed as *proposed*):
- **Property/Data analytics** — coverage, completeness, freshness, market, missing intelligence. *Computable
  now; UI FUTURE.*
- **Agent/System analytics** — runs, success/failure, cost, processing, review rates (from
  `property_enrichment_jobs` tallies + ledgers). *PARTIAL data; UI FUTURE.*
- **Search analytics** — searches, requested features, matches, recommendations, favorites, rejected recs,
  tour feedback. *DESIGNED (depends on Search data flowing).*
- **Lead/Business analytics** — leads, response time, pipeline, tours, applications, leases,
  commission/revenue. **Meta Sales Analytics BUILT/shipped** (memory `meta-sales-analytics-phase2b`: frozen
  closed-estimate, Campaign→AdSet→Ad ROAS, FB vs IG); rest PARTIAL.
- **Social / content analytics** — posts published, per-platform results, content reuse (which hooks/CTAs
  perform), schedule adherence, posting failures. `/admin/social-autopilot/analytics` tab exists (organic
  metrics PARTIAL); paid-side FB-vs-IG via `meta_publisher_platform` is BUILT. See §9A.

**Marketing attribution chain** (preserve as the target; partially built via Meta pixel + lead source +
frozen commission estimate): **Content (Social Beast post) / Ad** → Lead Source → Smart Lead Form → CRM →
Property Search → Tour → Application → Lease. Paid-ad attribution is BUILT (Meta Sales Analytics);
**organic content → lead attribution is FUTURE** — it needs a per-post trackable link/UTM into the Smart
Lead Form with lead-source capture (see §9A and Open Questions).

---

## 14. Security Beast

**Status: PARTIAL.** Primitives BUILT: `lib/security/{events,ssrfGuard,trustedDevice}`, platform-admin
gating, `automated-texting-authorization` dual gate. V1 visual/roadmap admin page (14 layers, presentational)
**awaiting approval** (memory `security-beast`); control-plane-isolation principle noted (a dashboard is not
the security system).

**Designed pipeline:** detect → score → challenge → throttle → block → preserve evidence, across account ·
session · device · browser · IP/network · behavior · extraction attempts. Content protection (watermarking,
print/copy controls, bulk-extraction detection). **Local Control Center security** (Mac Mini): localhost-only,
PIN/password, Touch ID if supported, Keychain secrets, auto-lock, secure backup/export, no unnecessary
telemetry. Enforcement engine is **DESIGNED/FUTURE**; evidence-preservation model to be defined.

---

## 15. System / Infrastructure

- **Supabase** (`onwrrajmklxtnabekzcy`) — canonical durable DB; **never** duplicated by the Control Center.
  Lone Star Supabase is separate and frozen (never write). Memory: `locator-beast-dedicated-project`,
  `local-env-targets-lonestar`, `lb-migrations-gap`.
- **Mac Mini** — the execution/control host: runs the durable job runner (`property_enrichment_jobs`),
  Playwright rendered recovery, AVIF decode (macOS `sips`), Beast Sync/iMessage delivery + incoming sync,
  and hosts the local Control Center. **Execution layer, not a database.**
- **Deploy** — LB prod = manual `vercel --prod` from a clean worktree (working-tree upload); pushes don't
  auto-deploy (memory `lb-deploy-mechanism`).
- **External** — Google Places/Maps (identity/geo; Routes future), Anthropic Haiku (visual gate, insights),
  Resend (`lib/notifications` — the one email path), Stripe (billing), Meta (pixel/analytics), TikTok
  (sandbox connect only).
- **System module surfaces:** service/API health, errors, usage/cost, versions/deployments, backups/
  recovery. **Mostly DESIGNED/FUTURE.**

---

## 16. Fable boundary

**Fable = the visual Control Center frontend design/build layer.** It does NOT replace Supabase, the
canonical model, the safe writer, enrichment/image/matching engines, Follow-Up logic, Security enforcement,
provenance, or durable jobs.

```
   FABLE-DESIGNED FRONTEND  ──HTTP──►  THIN API (Next.js route handlers / Supabase RPC + RLS)
   (screens, components,               ├─ READS: read model / views over property_catalog, review
    interactions, data-viz)            │         queues, job ledgers, followup, analytics
                                       └─ WRITES: purpose-built endpoints that call the SAFE WRITER /
                                                  change_requested flow / job-runner — never direct table writes
                                                        │
                                                  EXISTING BACKEND (unchanged): writer, engines, jobs,
                                                  Security enforcement, provenance
```

Every mutating UI action becomes an API call the backend validates and executes. Jobs are *observed* via
the API; job *control* awaits the runner service. **Establish the whole Control Center information
architecture first, then design modules into it** — don't build one isolated Property Intelligence app.

**Social Beast is the exception to "design from scratch":** it already has a working, platform-admin-gated
admin UI (`/admin/social-autopilot`: posts, calendar, accounts, queue, history, analytics). Fable should
bring that surface into the Control Center shell and visual system as a module — **link/embed first,
progressive migration later** — never redesign or rebuild it. Its render/publish workers, token handling,
and storage stay backend.

---

## 17. Product status matrix

| Capability | Status | What exists | What's missing | Dependencies | Control-Center UI needed | Priority |
|---|---|---|---|---|---|---|
| Canonical ~380-field schema | BUILT | migration + writer | data population | Supabase | Detail sections | — |
| Safe enrichment writer | BUILT | writer/policy + 84 tests | — | — | (invisible) | — |
| Identity/geo/Google enrichment | BUILT | 98–100% coverage | aliases/lifecycle | Google | Detail/Overview | V1 |
| Deep-domain data (pricing/features/floorplans/specials/classification/keywords) | PARTIAL (schema) | scripts exist | run at scale | enrichment agents | completeness views | V1.5 |
| Image Intelligence v1.0 | BUILT/FROZEN | engine+gate+tests | — | Haiku | image views | V1 |
| Image Intelligence v1.1 | BUILT (paused) | v11 engine, runners | finish prod run | Playwright/Haiku/sips | Jobs + Image Review | V1 |
| Fallback images | PARTIAL | 190 (5%) | recovery run | v1.1 | image views | V2 |
| Review queues (conflict/qualification) | BUILT (backend) | tables + writer emits | UI + dispositions | — | Review Center | V1 |
| New Property Discovery | DESIGNED | job_type | agent + exclusion registry | — | Discovery review | V1.5 |
| Durable job model | BUILT (schema) | `property_enrichment_jobs` | runner service + UI | Mac Mini | Jobs module | V1/V1.5 |
| Location Intelligence | PARTIAL | normalized schema, 16 clusters | resolver run, drive-time | Google Routes | landmark/curation | V1.5 |
| Property Search / Matching | PARTIAL | filters, clusters, `/r` | composite parity, client-context data | AI insights data | search inspector | V1.5 |
| AI Client Insights | PARTIAL | engine wired | data (0 rows) | messages/CRM | insights view | V1.5 |
| Follow-Up Agent | BUILT | full engine + Next Action | — | Beast Sync | Follow-Up module | V1.5 |
| Beast Sync / iMessage | PARTIAL | companion ext, transcripts | Mac send/incoming at scale | Mac Mini | delivery views | V1.5 |
| Import/Export | DESIGNED | overlay `import.ts` | round-trip pipeline | safe writer | Import/Export module | V1.5 |
| Analytics — Meta Sales | BUILT | shipped | — | Meta | Analytics | live |
| Analytics — property/agent/search | PARTIAL/DESIGNED | job tallies | dashboards | data flow | Analytics | V2 |
| Security Beast | PARTIAL | primitives | enforcement + evidence | Mac Mini | Security module | V2 |
| Social Beast — content library + composer + render | BUILT / PARTIAL | library, auto-match, composer, overlays, hashtags, specials, dry-run, render route | durable render worker | `social-media` bucket | existing UI, integrated | V1 (integrate) |
| Social Beast — hooks/CTAs voice clips · music | BUILT · DESIGNED | `social_voice_clips` + library UI; music UI slot | music library + licensing | — | existing UI | V1.5 (music) |
| Social Beast — scheduling + recurrence | BUILT (logic) | calendar, recurrence, autoschedule, lifecycle | dispatcher/worker | job runner | queue + calendar | V1.5 |
| Social Beast — connected accounts / destinations | BUILT | IG + TikTok OAuth, destinations, invitations | IG publish scope | platform APIs | account/destination health | V1 |
| Social Beast — posting execution + history/errors | PARTIAL | TikTok direct-post MVP, publish/status routes, History tab | IG publish, automated dispatch, retries, error surfacing | workers (Mac Mini) | publish results + why-failed | V1.5 |
| Social Beast — organic attribution | FUTURE | paid FB/IG attribution built | trackable links → lead source | Smart Lead Form | Analytics | V2 |
| Control Center shell/UI | FUTURE | — | everything | thin API | the shell itself | V1 |

---

## 18. Roadmap (incremental; must NOT block Monday's marketing launch)

Marketing/lead-gen is the immediate business priority. The Control Center is **architecture-preserved now,
built incrementally** — none of it is on the launch critical path.

- **V1 (operate what's mature, read-first):** Control Center shell/nav · Overview · Property Intelligence
  (Catalog, Detail, Completeness, Images) · Review Center (conflicts + image review + qualification, using
  existing tables) · Jobs/Activity (read-only observability from ledgers/`property_enrichment_jobs`). Thin
  API + platform-admin gating. Resume the paused Primary-image recovery *from the terminal* independently
  of the UI. **Social Beast** enters V1 by integrating the existing `/admin/social-autopilot` UI as a module
  (link/embed — it is already live and carrying the marketing launch; no rebuild).
- **V1.5:** Follow-Up module · Property Search inspector · Import/Export wizard (over the safe writer) ·
  New Property Discovery review + exclusion registry · durable job runner *control* (Run/Pause/Stop) ·
  location resolver control · deep-domain enrichment runs · **Social Beast:** scheduled-post render/publish
  **workers** (durable jobs; Mac Mini candidate), Instagram publish scope, posting history + why-failed
  surfaced in the Control Center, music library.
- **V2:** Full Analytics dashboards (property/agent/search/**social**) · Fallback image recovery · Security
  Beast enforcement + evidence · marketing attribution end-to-end, including **organic content → lead →
  tour/application → lease** (Social Beast).
- **Future:** additional agents via the module registry; drive-time/Routes; content-protection.

---

## 19. Recommended first Fable build (evaluated, not rubber-stamped)

Your hypothesis — **build the shell first, then the most mature module (Property Intelligence)** — is
**correct.** Property Intelligence is the deepest, safest-guarded, most data-complete subsystem, so it's the
best proving ground for the shell + thin API + safe-write boundary.

Recommended first Fable build:
1. **Control Center shell / navigation** (registry-driven, platform-admin gated, thin-API wired).
2. **Control Center Overview** (operational health tiles).
3. **Property Intelligence Overview** (coverage + image status + completeness-by-category + review counts).
4. **Property Catalog** (search/filter/list; no 380-column table).
5. **Property Detail** (sectioned; value/state/source/date/provenance; Images first-class).
6. **Review Center** (conflicts + image review + qualification — all backed by existing tables).
7. **Jobs / Activity** (read-only observability).

Then expand to Follow-Up, Search, Import/Export, Analytics, Security. **One caveat:** wire the read model +
one real write path (image `change_requested`) early, so the shell proves the safe-write boundary before
breadth is added.

---

## 20. The ten questions, answered

1. **What is it?** The private admin operating system (observe/review/manage/control) over the Beast Brain,
   sitting above Locator Beast; Supabase stays the source of truth.
2. **What's inside?** §2 — ten modules.
3. **Already built?** Safe writer, identity/geo/Google enrichment, Image Intelligence v1.0+v1.1, review-
   queue tables, durable job model (schema), Follow-Up engine, Meta Sales Analytics, security primitives,
   **Social Beast** content library + composer/render + voice-clip (hook/CTA) library + scheduling/recurrence
   + connected accounts (Instagram/TikTok OAuth, publishing destinations) + its admin UI.
4. **Already designed?** Import/Export round-trip, New Property Discovery + exclusion registry, full
   matching brain + client context, job-runner control, Security enforcement, location resolver/drive-time,
   Social Beast render/publish workers + Instagram publishing + music library + organic attribution.
5. **Remains to be built?** The entire Control Center UI + thin API; durable review/history stores' UIs;
   Import/Export pipeline; job-runner service; deep-domain data population.
6. **How do they communicate?** Everything reads/writes Supabase through the safe writer + agents; the UI
   talks to a thin API that reads a read model and routes writes through the safe backends (§16).
7. **Permanent principles?** §3.
8. **What should Fable design?** The visual Control Center frontend (§16, §19).
9. **What stays backend?** Supabase, safe writer, all engines/agents, matching, Follow-Up, Security
   enforcement, provenance, durable jobs (§16).
10. **V1 vs later?** §18.

---

## Open questions / owner decisions (genuine, unresolved)

1. **Control Center hosting:** local-only on the Mac Mini vs an authenticated web surface (or both)?
   Affects auth model, Security Beast local-security scope, and the thin-API deployment.
2. **Thin-API shape:** Next.js route handlers in this repo vs Supabase RPC/PostgREST with RLS — which is the
   write path Fable calls?
3. **Job-runner service:** who builds the always-on runner that turns `property_enrichment_jobs` into live
   Run/Pause/Stop (Mac Mini daemon)? Needed before UI job *control* (not before observability).
4. **Resume timing for paused image recovery:** finish the Primary pass now (terminal) or wait until the
   Jobs UI can observe it? (Recovery itself needs no UI.)
5. **Deep-domain enrichment sequencing:** which empty domains to populate first (pricing? features?
   approval?) — a data-priority call, independent of UI.
6. **AVIF decode portability:** keep macOS `sips` (Mac Mini is the host) or add a portable wasm decoder now?
7. **Client-context data flow:** what unblocks AI Client Insights / `companion_messages` (currently 0 rows)
   so the matching brain has renter context?
8. **Security Beast V1 approval:** approve the presentational V1 admin page, and decide the first real
   enforcement layer.
9. **Social Beast execution host:** do the render and publish workers run on Vercel (route/cron) or on the
   Mac Mini as durable jobs? Video rendering is heavy and publishing needs reliable retries — this also
   decides whether scheduled posts can ever dispatch unattended.
10. **First fully-automated posting channel:** TikTok (direct-post MVP exists, sandbox) or Instagram (needs
    the `instagram_business_content_publish` scope added to today's connection-only integration)?
11. **Organic attribution mechanism:** per-post trackable link/UTM captured as lead source on the Smart
    Lead Form, or another approach — this is what unlocks content → lead → tour/application → lease.

*(These are open. Already-settled decisions — commission firewall, per-slot image locks, preserve-by-
default, Supabase-as-source-of-truth, v1.0 frozen, 195-GOOD immutable — are NOT reopened.)*

---

*End of master blueprint. Points to subsystem specs rather than duplicating them:
`PROPERTY_INTELLIGENCE_V1_SPEC.md`, `PROPERTY_IMAGE_INTELLIGENCE_SPEC.md`,
`PROPERTY_INTELLIGENCE_FABLE_HANDOFF.md`, `location-matching-system-audit.md`, and the project memory
decision log. Development remains FROZEN. No build, no jobs, no data change.*
