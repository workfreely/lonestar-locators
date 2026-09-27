# Property Intelligence v1 — Canonical Specification (FROZEN)

**Status:** Development PAUSED at this freeze point. This document is the single source of truth for
architecture, data model, rules, image intelligence v1.0/v1.1, review workflows, completed/unfinished
work, and the exact restart point. Nothing below is aspirational unless a section is explicitly marked
**OPEN / NOT BUILT**.

**Frozen:** 2026-09-26 (session end). **Project:** Locator Beast (Supabase `onwrrajmklxtnabekzcy`,
Vercel `locatorbeast`). Lone Star Supabase is separate and frozen — never write it.

---

## 0. Freeze-point state (live, verified)

| Metric | Value |
|---|---|
| Total active properties | **4,202** |
| Populated Primary | **3,832** |
| Missing Primary | **370** |
| Good Primary (derived accounting) | ~**3,505** |
| Bad Primary (derived accounting) | ~**299** |
| Uncertain Primary | **28** |
| Fallback populated | **190** (all v1.0/legacy; **0** from v1.1) |
| `change_requested` (primary/backup) | **0 / 0** |
| v1.1 Primary writes to date | **27** (8 Missing recovered + 19 Bad upgraded) |

Good/Bad/Uncertain are an **accounting reconciliation** (audit + human review + recovery outcomes), not
live DB columns. Live columns are: populated/missing (by `property_image_url`) and
`image_selection_state` / `image_backup_state`.

Baseline before any v1.1 production writes was Good 3,478 / Bad 318 / Missing 378 / Uncertain 28.
v1.1 has since recovered 8 Missing and upgraded 19 Bad (13 via the two canaries, 14 via a partial
production checkpoint that was intentionally halted at ~10–14/25 for this freeze).

---

## 1. Purpose & scope

**Objective:** every active property should have ONE strong, verified official **Primary** photo where a
reasonable official source exists; the remainder go to a `SECONDARY_SOURCE_REQUIRED` queue for later
review. Fallback (secondary image) population is a **later** phase and is NOT started.

Property Intelligence has two intertwined tracks:
1. **Field enrichment** — identity/geo/contact/pricing/policy fields on `property_catalog`, governed by a
   safe patch-only writer with a commission firewall and preserve-by-default semantics.
2. **Image Intelligence** — Primary (and later Fallback) image selection via a frozen v1.0 engine plus a
   v1.1 discovery/recovery layer.

---

## 2. Architecture overview

```
                    ┌─────────────────────────── property_catalog (Supabase) ───────────────────────────┐
                    │  identity/geo/contact  │  pricing/policy (~380 fields)  │  image slots + provenance │
                    └───────────────▲───────────────────────────────────────────────▲───────────────────┘
                                    │ ONLY write path                                │
                    ┌───────────────┴────────────────┐               ┌───────────────┴───────────────────┐
                    │  Enrichment Writer (safe patch) │               │  Image Intelligence               │
                    │  lib/propertyEnrichment/*       │               │  scripts/propertyIntel/*          │
                    │  • commission firewall          │               │  v1.0 FROZEN engine + visual gate │
                    │  • preserve-by-default          │               │  v1.1 discovery/recovery + runners│
                    │  • per-slot image locks         │◄──────────────┤  writes images THROUGH the writer │
                    └─────────────────────────────────┘               └───────────────────────────────────┘
```

- **The enrichment writer (`lib/propertyEnrichment/writer.ts`) is the ONLY code that writes
  `property_catalog`.** Image jobs build `EnrichmentInput.fields` and call `enrichProperty(store, input)`.
- **Store-injected**: `SupabaseEnrichmentStore` (prod) and `inMemoryStore` (tests) implement the same
  `EnrichmentStore` interface, so identical writer logic runs in prod and in 84 unit tests.
- **Image jobs** run locally via `npx tsx` (Playwright + Anthropic Haiku vision). They are NOT part of the
  Next.js app build/deploy; the app only READS `property_catalog` (Map / Companion / /r).
- **Optimistic concurrency**: every patch is guarded on the row's `updated_at`; a concurrent change
  downgrades the write to `skipped` (no clobber).

---

## 3. Database model

### 3.1 Image slots (two independent slots, each self-locking)

| Concern | PRIMARY | FALLBACK |
|---|---|---|
| URL | `property_image_url` | `property_image_url_backup` |
| Source tag | `property_image_source` | `property_image_backup_source` |
| Source detail (scene/mechanism/algo) | `property_image_source_detail` | `property_image_backup_source_detail` |
| Status | `property_image_status` | `property_image_backup_status` |
| Checked at | `property_image_checked_at` | `property_image_backup_checked_at` |
| Verified at | `property_image_verified_at` | `property_image_backup_verified_at` |
| **State lock** | `image_selection_state` | `image_backup_state` |

**State values:** `missing` | `change_requested` | `keep`.
- A slot is **writable only** while its state is `missing` or `change_requested`.
- A successful URL write flips that slot to `keep` (locks it).
- A `keep` slot is **never** searched, re-scored, or replaced during routine processing. The ONLY way to
  replace a populated/keep image is to explicitly set that slot to `change_requested` immediately before an
  authorized replacement write, reverting to `keep` if nothing better is written.

Migration: `supabase/migrations/20260927000000_image_fallback_slot.sql` added `image_backup_state` + the
backup provenance columns. `20260926000003` added `google_display_name` (landmark work).

### 3.2 Commission (structurally firewalled)

`send_commission`, `escort_commission`, `bonus_flat` — **NOT writable by any enrichment source** in this
checkpoint (no authoritative commission provider approved). The writer rejects commission writes before any
other logic.

### 3.3 Enrichment-writable fields

~380 canonical fields across identity, geo, contact, ratings, pricing, deposits, lease terms, pets,
utilities, internet, hours, furnished/corporate, affordable programs, escort, location intelligence, and
classification. Full list: `lib/propertyEnrichment/policy.ts` → `ENRICHMENT_WRITABLE_FIELDS` +
`CANONICAL_SCALAR_FIELDS` (reconciliation migration `20260925000008`). Commission + image + provenance
columns are deliberately excluded from this allowlist (images use the per-slot lock instead).

---

## 4. Enrichment rules (writer + policy)

Canonical: `lib/propertyEnrichment/{writer,policy,ownership,types,store}.ts`.

1. **Commission firewall** (highest priority): any commission field → reject
   (`commission_firewall_public_web` / `commission_provider_not_approved`).
2. **Provenance validity**: candidate must carry a known `sourceType` + `verificationStatus` else reject
   (`invalid_provenance`).
3. **Image fields** → governed by per-slot state (see §3.1), not the allowlist. Locked slot →
   `image_locked_keep` / `image_backup_locked_keep`. Writable slot + verified value → write, then lock.
4. **Allowlist**: non-image, non-commission field must be in `ENRICHMENT_WRITABLE_FIELDS` else `not_writable`.
5. **Preserve-by-default** (`decideFieldWrite`): only an EMPTY field is eligible for verified enrichment;
   any populated value (legacy/tracked/verified) is preserved. A verified+authoritative candidate that
   DISAGREES with a populated value is surfaced as a **conflict** (skip + report), never auto-applied.
   Missing research never nulls an existing value. Unverified/unknown candidates never fill.
6. **Narrow refresh exceptions**: (a) Google-owned data (rating, reviews, geo, canonical address) refreshed
   from `google_places` verified; (b) a demonstrably malformed existing value replaced by a verified
   authoritative candidate. Idempotent + numeric-epsilon no-ops.
7. **Writer-derived metadata**: a `current_special` write stamps `current_special_checked_at`/`_source`;
   any successful patch stamps `intel_enriched_at`.

---

## 5. Source & provenance rules

Source types: `official_property_site`, `official_management_site`, `google_places`,
`trusted_locator_source`, `trusted_brokerage_source`, `manual_verified`, `public_web`, `unknown`.
Verification: `verified` | `inferred` | `unverified` | `unknown`.

Field-authority (`isAuthoritative`): trusted internal sources are authoritative for any non-commission
field; `google_places` only for rating/reviews/geo/canonical address; official property/management site
only for identity/contact/specials/address set; `public_web`/`unknown` for nothing.

**Image provenance format (v1.1 writes):**
- `property_image_source` = `website:v1.1:<provider>:<mechanism>`
- `property_image_source_detail` = `primary=<scene>; mechanism=<mechanism>; sourcePage=<url>; algo=property-image-intelligence-v1.1`
- v1.0 writes use `algo=property-image-intelligence-v1.0` and `website:gallery:<provider>`.
- The `algo=…v1.1` tag is the **no-churn key**: a property already carrying it is never re-selected.

---

## 6. Image Intelligence v1.0 (FROZEN — do not modify)

Canonical: `scripts/propertyIntel/imageEngine.ts` (`ALGO_VERSION = "property-image-intelligence-v1.0"`),
`scripts/propertyIntel/visual_gate.ts`, `scripts/propertyIntel/rendered_recovery.ts`. Spec:
`docs/PROPERTY_IMAGE_INTELLIGENCE_SPEC.md`.

Pipeline: identify missing slot → discover gallery → static/provider/rendered retrieval → full gallery
collect → metadata hard rejects → technical validation (≥800×450, MIME, non-SVG, decodable) → **visual
property-photo gate (Haiku 4.5)** → scene classification → property-type-aware ranking → Primary/Fallback
selection → per-slot safe write → provenance → lock.

- `classifyScene()` order-sensitive fixes (gym/fitness first → `amenity_weak`; "pool table" ≠ Pool;
  open-concept living+kitchen → Living). `inferPropertyType()` + `PROPERTY_TYPE_PRIORITY` + `familyRank()`.
- `metadataReject()` (svg / Entrata `/MLv3/9/36/` branding / titlecard / floorplan / map / social / logo).
- `assetIdentity()` collapses CDN size/crop variants.
- Visual gate rejects logos/wordmarks/brand-title-cards/promo/floorplan/map/placeholder/stock-lifestyle;
  accepts genuine photos with incidental signage/people. Gate `error` → treated as needs-review, never
  auto-accept.
- **FROZEN. Improve only via an explicit vNext, never by editing v1.0.** Regression: `image-scene.test.ts`
  (21) + `property-enrichment.test.ts` (84).

---

## 7. Image Intelligence v1.1 (discovery/recovery — committed `5183593`)

v1.1 improves ONLY **how official candidates are discovered/resolved**. It reuses v1.0’s
`metadataReject`/`classifyScene`/`familyRank`/`assetIdentity`, the visual gate, and the safe writer
**byte-unchanged**. Modules: `scripts/propertyIntel/v11/`.

### 7.1 Capabilities (all validated across two canaries)
- **Structured discovery** (`structured.ts`): Sitecore embedded metadata (`search:data` in
  `__NEXT_DATA__`), Next.js page-state, **JSON-LD (schema `@type` nodes only)**, inline gallery-JSON,
  `srcset`/`imagesrcset`, `<img>`/lazy, a broad **html-scan** for photos outside `<img>` (CSS
  background-image, lightbox, Webflow galleries). HTML-entity decode + relative-URL resolution.
- **Alternate-page discovery ladder** (same verified official host only, whitelist + deny-list): gallery →
  photos → homepage → amenities → features → residences/apartments/community → floorplans (property PHOTOS
  only) → other relevant. Excludes blog/**neighborhood**/careers/legal/social/corporate/external.
- **Full-resolution CDN normalizer** (`normalize.ts`, deterministic, same-asset larger rendition, never
  pixel-enlarge): RENTCafe/Yardi, LeaseStar/RealPage (canonical `dimg-crop/<id>/1920x1080` + dedupe by id),
  Myrazz (uploadcare id, images.+assets.), Apartments247 (underlying original), Cloudinary/G5, Bynder,
  Duda, Webflow, Sitecore, **ZRS/cachefly** (`thumbnail.aspx?p=…` → original, dedupe by UUID). `dedupeKey`
  collapses renditions BEFORE any vision.
- **Rendered recovery** (`discover.ts`, Playwright): used when static is blocked/thin or provider requires
  it (Entrata `switch_cls` 403 → render, then re-parse structured data). Passes Cloudflare.
- **AVIF evaluation** (`avif.ts`, production-safe, encapsulated): fetch official AVIF → transcode a
  TEMPORARY high-quality JPEG evaluation copy (capability-probed **sharp → macOS `sips`**, fail-safe
  `null`) delivered to the UNMODIFIED gate as a `data:` URL. Official AVIF stays the source; the ≥800×450
  rule is enforced on decoded pixels; decode never implies acceptance; corrupt AVIF fails safely.
- **Independent per-candidate validation**: one broken/rejected/undecodable candidate never aborts the
  gallery.
- **No-churn protection** (`isAlreadyV11`): a property already resolved by v1.1 is skipped (verify-only);
  the frozen keep-lock is the second, independent guarantee. Regression-tested.

### 7.2 Selection flow (engine.ts `recoverPrimary`)
discover (ladder) → normalize full-res → dedupe → **per-candidate**: metadata reject → technical validation
(≥800×450, MIME, decode; AVIF transcode for gate) → **frozen visual gate** → scene classification →
property-aware ranking → first candidate clearing every check wins → **frozen safe writer** with v1.1
provenance. Gate budget capped (18) per property.

### 7.3 Runners
- `canary_v11.ts` — the 16-property canary (both rounds complete). Verify-only for already-v1.1 rows.
- `primary_recovery_v11.ts` — **production cohort runner** (Missing → Bad → Uncertain). Missing → missing-
  slot writer; Bad → authorized `change_requested` (preserve if nothing better); Uncertain → re-gate the
  CURRENT image (AVIF-aware): accept → resolved GOOD (no write), reject → treat as Bad. No usable official
  image → `SECONDARY_SOURCE_REQUIRED` queue (no write, no guess, no cross-property image). Resumable ledger.
  Flags: `--cohort=missing|bad|uncertain|checkpoint|all [--limit=N] [--confirm]`.

### 7.4 Known pre-production considerations (documented, not blocking)
- **AVIF decode portability**: works on this macOS host (sips) and any sharp build with AVIF; a Linux host
  without either would SKIP AVIF candidates safely. A bundled wasm AV1 decoder is the portable upgrade if
  Image Intelligence ever moves off local macOS execution.
- CDN adapters and the alternate-page ladder generalize well but were validated on canary samples; the
  first large production batch should be spot-checked for provider drift.

---

## 8. Review workflows

- **Read-only Primary audit** (`primary_audit.ts`): deterministic metadata + reachability + real dims
  first, then a richer Haiku audit classifier only for survivors. Resumable ledger; JSON dataset only, no
  catalog mutation. Produced the Good/Bad/Uncertain baseline.
- **Human review of held Primaries**: 253 images reviewed via numbered contact sheets + manifest → **195
  GOOD / 58 BAD** decisions (file-based in `human_review_manifest.{csv,json}`). Lessons: the `brand_card`
  classifier is heavily false-positive (humans overrode); incidental signage/residents = still GOOD.
- **Uncertain (28) second review**: all were audit **decode** failures (AVIF/partial fetch), not visual
  ambiguity. Re-materialized contact sheets built; 19 marked GOOD, 9 pending user decision (file-based in
  `uncertain_primary_manifest.{csv,json}`). v1.1’s AVIF path now decodes these.
- **253 regression guard** (`regression_253.ts`): PERMANENT protection. Verifies the frozen classifier is
  unchanged and that no v1.1 write alters the **195 human-GOOD**. Run before/after every image job.
  (Upgrading a human-**BAD** image to a verified good one via `change_requested` is the desired direction,
  not a violation; only the 195 GOOD are immutable.)

---

## 9. Import / Export requirements — **OPEN / NOT BUILT**

Referenced by the user as part of Property Intelligence v1 but **not specified or implemented in captured
context.** Do not invent. To resume, the following must be defined with the user before building:
- **Import**: source format(s) (CSV/XLSX/JSON), the canonical column→field mapping onto the ~380-field
  model, dedupe/merge key (place_id vs name+address), conflict handling (must honor preserve-by-default +
  commission firewall + image per-slot locks), New Property Candidate flagging for not-in-master rows,
  and a manual-review gate for weak matches. (Compare to the existing "verified overlay" rules for cleaned
  masters: conservative enrich, ≥0.6 match-ratio guard, preserve applicability, new CLEANED+VERIFIED file
  per city, no Supabase write yet.)
- **Export**: selected field set, format, redaction rules (commission/internal), and whether exports are
  snapshots or live.
- **Status:** design pending user requirements. No code exists for a Property Intelligence import/export
  pipeline in this repo beyond the enrichment writer itself.

---

## 10. Control Center requirements — **OPEN / NOT BUILT**

Referenced by the user but **not specified or implemented in captured context.** A "Property Intelligence
Control Center" would presumably be an admin surface to run/monitor enrichment + image jobs, review the
Good/Bad/Missing/Uncertain queues, action the `SECONDARY_SOURCE_REQUIRED` queue, and approve
`change_requested` replacements. To resume, define with the user: scope (read-only dashboard vs job
control), which jobs it triggers, role-gating (platform-admin), and how it surfaces provenance/safety
counters. **No code exists for this yet.** (Note the existing architectural principle from Security Beast:
a dashboard is not the system — control-plane isolation.)

---

## 11. Completed work

- v1.0 engine + visual gate + rendered recovery: **frozen, shipped, regression-tested**.
- Read-only Primary audit across all populated Primaries → Good/Bad/Uncertain baseline.
- Bulk recovery (prior sessions): Missing-Primary rendered run + `--replace` upgrades of too-small/content
  Bad → GOOD climbed 43.6% → 82.8%.
- Human review of 253 held Primaries (195 GOOD / 58 BAD) + replacement queue.
- Residual diagnostic of the 724 not-confirmed-GOOD (Path A/B/C/D classification) + Path-A pattern audit.
- **v1.1 implementation** (commit `5183593`): all §7 capabilities, both canaries, tests green
  (v1.1 52, scene 21, writer 84, 253-guard PASS), v1.0 untouched.
- **Partial production checkpoint**: 8 of ~14 processed logged; 14 Bad **upgraded** to verified good photos
  via authorized `change_requested`, 2 preserved. Halted for this freeze; one interrupted `change_requested`
  cleanly reverted to `keep` (image preserved).
- Unrelated side-task shipped separately: Smart Lead Form copy/typography polish (commit `60a0424`,
  deployed to LB prod).

---

## 12. Unfinished work

1. **Finish the 25-property production safety checkpoint** (was interrupted at ~10–14/25) and verify:
   image quality, provenance, safe-writer behavior, no churn, no unauthorized changes.
2. **Run the full official-site Primary recovery pass** over the remaining cohorts: **Missing 370 → Bad
   ~299 → Uncertain 28**, using `primary_recovery_v11.ts`.
3. **Build the `SECONDARY_SOURCE_REQUIRED` queue** and review its size/composition with the user (no
   secondary-source writes in the first pass).
4. **Uncertain resolution**: re-gate the 28 via the AVIF path; apply the 9 pending human decisions.
5. **Reconcile & report** the ending Good/Bad/Missing/Uncertain/Secondary + how many still lack a good
   Primary and why.
6. **Fallback (secondary-image) recovery** — the ~4,000+ population — **explicitly deferred** until Primary
   is substantially complete.
7. **Import/Export** (§9) and **Control Center** (§10) — design pending user requirements.
8. Optional: portable AVIF decoder if execution moves off macOS.

---

## 13. Exact restart point

**To resume image recovery** (after the freeze is lifted):
1. `git` is on branch `feature/companion-lead-panel-refactor` at commit **`5183593`** (v1.1 committed &
   pushed). No uncommitted Property Intelligence code except this spec.
2. Confirm freeze state unchanged: total 4,202, missing 370, `change_requested` 0/0, v1.1 rows 27,
   fallback 190. Run `regression_253.ts` (must PASS).
3. Finish the checkpoint: `npx tsx scripts/propertyIntel/primary_recovery_v11.ts --cohort=checkpoint
   --confirm` (it resumes from `primary_recovery_v11_ledger.json`, skipping already-v1.1 rows). Verify
   safety.
4. If clean, run the full pass by cohort: `--cohort=missing --confirm`, then `--cohort=bad --confirm`, then
   `--cohort=uncertain --confirm` (or `--cohort=all`). Ledger is resumable; runs in batches.
5. Hard-STOP conditions (abort immediately): unauthorized Primary changes; any of the 195 human-GOOD
   changed; wrong-property images; Fallback changes; commission changes; stranded `change_requested`;
   systematic quality failures; or a new blocker affecting a meaningful cohort.
6. Cohort sources: Missing = live `property_image_url` null/empty; Bad = `diag_sets.json.bad`; Uncertain =
   `diag_sets.json.uncertain` — both in the session scratchpad (regenerate from `primary_audit_ledger.json`
   + recovery ledgers if absent).

**Scratchpad evidence (session-local, regenerable):** `primary_audit_ledger.json`, `diag_sets.json`,
`residual_primary_diagnostic.csv`, `pathA_*.{json,csv}`, `human_review_manifest.{csv,json}`,
`uncertain_primary_manifest.{csv,json}`, `canary_v11_*.json`, `primary_recovery_v11_ledger.json`,
`secondary_source_required.json`.

---

## 14. Permanent safety invariants (never violate)

- Existing accepted/keep GOOD Primaries are LOCKED; replace ONLY via authorized per-slot `change_requested`.
- The 195 human-approved GOOD held images are immutable.
- Fallback slot (`property_image_url_backup`) is untouched during Primary work; correct field name is
  `property_image_url_backup`.
- Commission, property identity, catalog membership, attributes, specials-freshness, approval flags,
  location intelligence, review-candidate data are never modified by image work.
- The v1.0 engine (ranking/scene/gate/thresholds/extraction/writer) is NEVER changed — improve via vNext.
- No global `change_requested`; never leave a `change_requested` stranded (revert to `keep` on any
  non-write).
- No secondary-source images, no cross-property images, no guessed/invented images.
- Catalog stays 4,202 active properties; every write is authorized (Missing/Bad/Uncertain cohort) and
  provenance-stamped `algo=property-image-intelligence-v1.1`.

---

## 15. Key file inventory

| Area | Path |
|---|---|
| v1.0 engine (frozen) | `scripts/propertyIntel/imageEngine.ts` |
| Visual gate (frozen) | `scripts/propertyIntel/visual_gate.ts` |
| v1.0 rendered recovery | `scripts/propertyIntel/rendered_recovery.ts` |
| Read-only audit | `scripts/propertyIntel/primary_audit.ts` |
| v1.1 engine | `scripts/propertyIntel/v11/{normalize,structured,discover,engine,avif}.ts` |
| v1.1 canary runner | `scripts/propertyIntel/canary_v11.ts` |
| v1.1 production runner | `scripts/propertyIntel/primary_recovery_v11.ts` |
| 253 regression guard | `scripts/propertyIntel/regression_253.ts` |
| Diagnostic tooling | `scripts/propertyIntel/{pathA_breakdown,pathA_probe,residual_diagnostic,uncertain_sheet,uncertain_sheet9}.ts` |
| Tests | `scripts/tests/{image-v11,image-scene,property-enrichment}.test.ts` |
| Safe writer + policy | `lib/propertyEnrichment/{writer,policy,ownership,types,store}.ts` |
| Stores | `lib/propertyEnrichment/stores/supabaseStore.ts`, `sim/inMemoryStore.ts` |
| v1.0 spec | `docs/PROPERTY_IMAGE_INTELLIGENCE_SPEC.md` |
| This spec | `docs/PROPERTY_INTELLIGENCE_V1_SPEC.md` |

---

*End of canonical specification. Property Intelligence development is PAUSED as of this freeze. Resume from
§13.*
