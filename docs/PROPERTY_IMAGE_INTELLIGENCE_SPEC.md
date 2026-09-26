# Property Image Intelligence — v1.0 (canonical specification)

**Algorithm version:** `property-image-intelligence-v1.0`
**Status:** production-validated (25-property write canary passed 2026-09-27). This is the single
canonical engine for discovering and selecting property images in Locator Beast. Do **not** build a
parallel image-selection implementation — all Property Intelligence image jobs call this engine.
Improve only via an explicit **v1.1 / v2.0**, never by silently changing v1.0.

---

## 1. Purpose
Give every active property one strong marketing-quality **Primary** image and a different-scene
**Fallback**, discovered from the property's own public gallery. **Gap-fill only:** an existing
accepted Primary or Fallback is **never** replaced (see §16). Target: 4,202 × (Primary + Fallback),
approached as close as safely possible — never lowering quality/safety thresholds to hit 100%.

## 2. Architecture (the permanent pipeline)
```
Identify Missing Slot → Discover Property Gallery → Static / Provider / Rendered Retrieval →
Collect Full Gallery → Metadata Hard Rejects → Technical Validation → Visual Property-Photo Gate →
Scene Classification → Property-Type-Aware Ranking → Primary/Fallback Selection →
Slot-Specific Safe Write → Provenance → Lock Slot
```
**Code:**
- `scripts/propertyIntel/imageEngine.ts` — canonical pure logic: `classifyScene`, `inferPropertyType`,
  `familyRank` / `PROPERTY_TYPE_PRIORITY`, `metadataReject`, `assetIdentity`, `ALGO_VERSION`. **Ranking
  is frozen for v1.0.**
- `scripts/propertyIntel/visual_gate.ts` — `classifyPropertyImage(url)` visual gate (Haiku 4.5 vision).
- `scripts/propertyIntel/rendered_recovery.ts` — durable Playwright job (Tiers 1–3); the reference
  orchestrator that ties the engine + gate + writer together.
- `lib/propertyEnrichment/` — the per-slot safe writer + provenance (the ONLY write path).

## 3. Source priority
1. Existing stored/raw first-party evidence (none cached today).
2. Official property website (static).
3. Provider-specific public gallery/CDN.
4. Rendered public gallery (Playwright) for JS/Cloudflare sites.
Google Places Photos is **not** used as persistent storage (terms + attribution; see the audit).

## 4. Static extraction
`safeFetch → collectImageCandidates → scorePropertyImage → rankPropertyImages`
(`lib/leads/detectPropertyMetadata.ts`). Works for plain-HTML sites. NOTE: static extraction alone
put branded/promo `og:image` cards live in an early canary — it must ALWAYS be followed by the
metadata rejects + technical validation + **visual gate** below. The rendered job (Playwright) can
also render static sites, so in practice the whole catalog can run through one gate-protected path.

## 5. Provider-specific extraction
Media lives on public provider CDNs even when the marketing site is blocked. Detect the provider
**after rendering**, from the media host — not from the domain/query params:
`switch_cls` / RENTCafé-looking sites are frequently **Entrata** underneath. `switch_cls[id]` and the
RentCafé CDN `/s3/2/<n>/` segment are **company/account** IDs shared across properties — not
per-property keys, so the per-property gallery must be read from the rendered page.

## 6. Rendered extraction (Playwright)
Headless Chromium passes Cloudflare on the tested provider sites. Procedure: `goto` homepage → find
the public `/photos/` (or gallery) link → **same-origin `fetch` of that page's server-rendered HTML**
from inside the browser context (the SPA route does not populate via `goto`; the fetched HTML does) →
parse `<img>` (srcset/data-src, alt/title) + regex provider-CDN URLs embedded in page-state JSON →
merge with rendered homepage imgs. A fresh page per property isolates crashes. **Never** defeat
CAPTCHAs or auth — a challenged/blocked page → `needs_manual_review`.

## 7. Actual-provider detection
`detectProvider(urls)` matches media hosts: Entrata (`medialibrarycfo.entrata.com`), Yardi/RENTCafé
(`resource.rentcafe.com`), G5/Cloudinary (`g5-assets…cloudinary`), Myrazz (`images.myrazz.com`/
`ucarecdn`), RealPage/LeaseStar (`myleasestar.com`), Duda (`irp.cdn-website.com`), Webflow
(`website-files.com`), Apartments247 (`apts247.info`), else `other/custom`.

## 8. Full-gallery collection
Scan the **entire** legitimate gallery before selecting (no 10–15 cap) — the best exterior/pool/
kitchen is often deep in the gallery. Collect alt/title/caption/path/category/JSON. Alt/title/caption
outrank opaque filenames as semantic evidence.

## 9. Metadata hard rejects (`metadataReject`, cheap, run first)
`svg`; Entrata branding path `/MLv3/9/36/`; title-card filenames (`screen_title`/`site_title`/
`separator`); floorplan; map; social/share; logo/wordmark/badge/seal/favicon/icon/emblem/monogram/
`-special`/promo/placeholder filenames; logo/badge in alt. Only survivors reach validation + the gate.

## 10. Visual quality gate (§ the piece metadata can't do)
`classifyPropertyImage(url)` (Haiku 4.5): is the candidate **predominantly a real property
photograph** vs a logo / wordmark / brand-title-card / promo / floorplan / map / placeholder / stock?
Rejects large superimposed community-name **title overlays**; **accepts** genuine photos with
incidental building signage / small watermark / residents incidentally in the real pool/clubhouse.
`error` verdict → `needs_manual_review` (never auto-accept on uncertainty). Runs only on the top
validated candidate(s), so cost stays bounded.

## 11. Known branding/provider signals (keep validating)
- **Entrata:** `/MLv3/3/27/` = real property photos; `/MLv3/9/36/` = branding/logos (0 branding
  found outside `/9/36/` on the sample — still treat as a strong-but-validated signal, not gospel).
- **Myrazz share-cards:** filenames containing `[screen_title] [separator] [site_title]` = title cards.
- WordPress `-special` / `bco` / `logo` filenames = promo/brand assets.

## 12. Technical validation (real, not URL heuristics)
Reachable (HTTP < 400), MIME `image/*`, **reject `image/svg+xml`**, decodes under `sharp`, and real
dimensions **≥ 800 (long) × 450 (short)**. This catches logo-sized assets that pass URL heuristics.

## 13. Scene classification (`classifyScene`, v1.0 — FROZEN)
Order-sensitive; encodes the v1.0 fixes: **gym/fitness checked first → `amenity_weak`** (never Pool);
`pool table`/billiards ≠ Pool; when living-area words AND `kitchen` co-occur (open-concept) → **Living**
(a living room is Kitchen only when the kitchen is the sole/dominant subject). Families: exterior,
rooftop_view, pool, kitchen, living, amenity_strong (clubhouse/lounge/courtyard), amenity_weak
(gym/mail/etc.), unknown.

## 14. Property-type-aware ranking (`PROPERTY_TYPE_PRIORITY`, FROZEN)
Type is a boost, not a rule (`inferPropertyType` from PI classification or gallery evidence — image
recovery never writes property_type). Weak amenities always rank **last**.
- High-Rise/Mid-Rise: exterior → rooftop/skyline → pool → kitchen → living → strong-amenity → weak.
- Garden/Conventional: pool → exterior → kitchen → living → strong-amenity → rooftop → weak.
- BTR/Rental Homes: home exterior → kitchen → living → pool → strong-amenity → rooftop → weak.

## 15. Primary & Fallback selection + diversity/dedup
Order survivors by `familyRank(type, fam)`; **Primary** = first survivor that passes validation **and**
the visual gate. **Fallback** = the next survivor of a **different** scene family that also passes
validation + gate, excluding the Primary's `assetIdentity` (which collapses CDN size/crop variants so
Primary and Fallback are never two crops of one photo). Prefer scene diversity; do not sacrifice
substantial quality just to force it. Both slots independently pass every quality gate.

## 16. Slot-specific locking + change_requested (PERMANENT INVARIANT)
Two independent locks: `image_selection_state` (Primary) and `image_backup_state` (Fallback), each
`keep | change_requested | missing`. **Existing Primary → never replace. Existing Fallback → never
replace. Missing Primary → may fill. Missing Fallback → may fill.** The only replacement mechanism is
an explicit, admin-authorized `change_requested` on that slot (never auto-created). Enforced at the
**writer/DB layer** (`lib/propertyEnrichment/writer.ts`): a `keep` slot rejects with
`image_locked_keep` / `image_backup_locked_keep`; a successful URL write flips that slot to `keep`.
The discovery/ranking engine cannot bypass writer protection. Proven by 6 writer tests + the canary.

## 17. Provenance
Each write records `property_image_source` = `website:gallery:<provider>`, `…_source_detail`
containing the scene label **and `algo=property-image-intelligence-v1.0`**, `…_status=valid`,
`…_verified_at`, `…_checked_at` (mirrored `property_image_backup_*` for the Fallback), plus
append-only `property_enrichment_events`. Historical records are **not** rewritten to add the version;
only new selections carry it.

## 18. Idempotency
A re-run replaces nothing: filled slots are `keep` → locked; the job also skips a property whose slot
is no longer `missing` before doing any work. Verified: rerun = 0 writes / 0 replacements.

## 19. Concurrency protection
`applyPatch` uses optimistic concurrency on `updated_at`; a stale/concurrent write is downgraded to
`concurrency_conflict` and never overwrites a populated slot.

## 20. Retry / manual-review behavior
Challenged/blocked, no-gallery, or no-gated-candidate → `needs_manual_review` (slot stays missing).
Transient fetch/render errors → `failed` and are retried on the next run. Individual difficult
properties go to manual review; they do **not** stop the job.

## 21. Durable job / resume
Per-property ledger with status (`done`/`skipped_locked`/`needs_manual_review`/`failed`), provider,
retrieval method, selected URLs, scenes. Resume continues from the last completed property; completed
properties are not reprocessed. Run in resumable batches, never one fragile catalog-wide pass.

## 22. Safety checks (every batch checkpoint)
Baseline TSV snapshot (sha256) → run → diff asserting: **pre-existing Primary changed = 0,
pre-existing Fallback changed = 0, commission changed = 0, active catalog count unchanged, Review
Candidates untouched**, accepted images reachable/valid, provenance present, no systematic
logo/stock/promo leakage (visual contact-sheet spot check). **If an accepted image is overwritten →
STOP. If systematic bad imagery appears → STOP.**

## 23. Regression fixtures (`scripts/propertyIntel/fixtures/visual_gate_fixtures.json`)
**Six known BAD (must always be REJECTED)** — the production-canary failures that motivated the gate:
1. **CITY NORTH** wordmark over a pool — logo dominates.
2. **BRIDGE AT SOCO CROSSING** — large community-name title card over a dimmed building photo.
3. **BRIDGE AT ARELLA LAKELINE** — same title-card pattern.
4. **round emblem/`bco` logo** — pure brand emblem.
5. **"R" monogram** — pure brand monogram.
6. **"$99 TOTAL MOVE-IN…" banner** — promotional text advertisement.
They must remain rejected because a marketing Primary must depict the actual community, not its
branding/marketing collateral. **Positive controls (must stay ACCEPTED):** a real building exterior,
a unit interior, a community pool, an aerial of the property, a rooftop amenity, and a real building
exterior that carries its own on-building signage. Scene-classification regressions live in
`scripts/tests/image-scene.test.ts` (gym ≠ Pool; living ≠ Kitchen unless dominant; gym ranks last).

## 24. Bulk-run procedure
Tier 1 static/provider-scriptable → Tier 2 rendered/provider-aware (Entrata, RENTCafé/Yardi,
G5/Cloudinary, Apartments247, …) → Tier 3 custom/difficult residue → Tier 4 manual review.
Command: `npx tsx scripts/propertyIntel/rendered_recovery.ts --cohort=<batch.json> --confirm
[--ledger=<path>] [--sheet]`. Snapshot → run batch → verify (§22) → next batch. Missing-Primary
cohort first; Missing-Fallback (keep-Primary rows) is a subsequent pass using the same engine.

## 25. Future Property Intelligence UI integration
The engine/job is the reusable backend for future one-click actions — the operator never needs to know
Playwright/Entrata/Cloudflare/CDN internals:
- **Find Missing Images** — scan the active catalog, process only missing slots.
- **Process New Properties** — run v1.0 against newly admitted properties.
- **Process Uploaded Properties** — after a spreadsheet import is identity-resolved, run v1.0 on the
  resolved properties that have missing slots (a spreadsheet is an input source, not a separate image
  architecture).
- **Change Image** — explicit admin replacement via `change_requested` on a specific slot.
The same canonical engine serves properties from spreadsheet import, Google Places discovery, manual
addition, or future discovery. Admission → detect missing slots → run v1.0 → populate where
confident → lock → unresolved to review.
