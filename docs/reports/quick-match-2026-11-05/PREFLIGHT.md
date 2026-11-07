# Quick Match release — deployment preflight

Release commit **`70008f6`** · branch `feature/quick-match-complete` · baseline `4cae1a4`
Run 2026-11-05. **Nothing was applied. Nothing was deployed. Every check below is read-only.**

---

## Step 1 — the current production baseline is `4cae1a4` — **PASSED**

### 1a. The live database is exactly at the baseline

Probed through the REST API with the service role: `select … limit=0`, which returns `42703`
for a column that does not exist. No row was read and nothing was written.

| what the baseline shipped — must be PRESENT | |
|---|---|
| `leads.destination_zip` | ✅ present |
| `leads.commute_anchor_place_id` | ✅ present |
| `leads.top_pick_favorite_id` | ✅ present |
| `property_catalog.quick_match_collection` | ✅ present |
| `property_catalog.credit_minimum_score` | ✅ present |
| `lead_recommendations.canonical_property_key` | ✅ present |
| `lead_recommendations.sort_order` | ✅ present |

| the release's own objects — must be ABSENT | |
|---|---|
| `leads.broken_lease_paid` / `eviction_paid` / `rental_debt_status` | ✅ absent (`42703`) |
| `lead_recommendations.origin` / `reviewed_at` / `screening` | ✅ absent (`42703`) |
| `leads.quick_match_at` | ✅ absent (`42703`) |
| `lb_quick_match_candidates` | ✅ absent (`404 PGRST202`) |

| Unleash Beast's read path — must be live and intact | |
|---|---|
| `lb_property_catalog_by_ids(text[])` callable | ✅ `200` |
| its OUT columns | ✅ **27**, the number migration 002's guard expects |

So none of the three migrations is partly applied, and the one function this release must not
touch is live and the right shape.

### 1b. The deployed code is the baseline tree

Production is served by deployment **`dpl_9JgxSKVApSV4v8wqzvzAxcRePrYL`**
(`locatorbeast-rbownl7o4`), created **2026-11-04 14:11:26 CST** — 76 seconds after `4cae1a4`
was committed at 14:10:10. `locatorbeast.com` serves assets stamped with that same deployment
id, so that deployment is what is live.

Deployments here are made from the CLI, so Vercel holds no commit SHA for them. Instead the
deployment's own build log route table was compared against the route set derivable from the
`4cae1a4` tree:

| | |
|---|---|
| routes in the production build | **270** |
| routes derived from the `4cae1a4` tree | **270** |
| in production, not in the baseline tree | `/_not-found` — framework-generated |
| in the baseline tree, not in production | `/locator-beast/robots.txt` — a nested `robots.ts`, which Next does not route |

Both differences were confirmed to be Next.js behaviour, not drift: a local build of `70008f6`
also emits `/_not-found` and also does not emit `/locator-beast/robots.txt`.

Against the release tree the same derivation adds **exactly one route and removes none**:

```
/api/admin/quick-match/[leadId]
```

`/api/admin/quick-match/100` on production returns **404** today, and no `quick-match` route
appears anywhere in the production build log.

**This is a structural match, not a cryptographic one** — a CLI deploy records no commit, so the
evidence is the route set, the schema state and the 76-second gap, not a SHA.

### 1c. What production holds right now (the "before" snapshot)

Captured read-only so the same query can be re-run after the deploy and compared:

| | |
|---|---|
| `lead_recommendations` rows | **11**, across 5 clients — 27:3, 84:2, 93:2, 94:1, 102:3 |
| clients with a Top Pick | **2** |

Two of those clients are also Quick Match candidates, holding 2 and 3 manual rows
respectively, which makes them the real test of "manual recommendations and
their ordering are preserved".

### 1d. The live dry run is unchanged

Re-run read-only against production: **54 rows across 10 eligible clients of 24**, byte-identical
to the run taken when the release was cut. Nothing was written.

Per-client expectations are not recorded here, for the same reason. In aggregate: ten of the
twenty-four clients were eligible — two expected six strong rows each, seven expected six rows
each needing verification, and the one client outside the service area expected none, for the
54 rows counted above.

---

## Steps 2–4 — BLOCKED, not failed

The three migrations cannot be applied from this session. There is no Postgres connection string
and no database password in the environment, the Supabase CLI is not linked to
`onwrrajmklxtnabekzcy`, and the CLI offers no command that runs arbitrary SQL over its API token.

This is also the documented procedure for this repository. `docs/APPLIED_MIGRATIONS.md` records
every hand-applied migration as *"Applied by Jay Morris, Supabase SQL Editor, project
`onwrrajmklxtnabekzcy`"* — SQL has always been applied by hand here, on a separate track from
Vercel deploys.

**Apply in this order, one at a time, each followed by its verify script, which must return
`true` on every row before the next file is run.** Stop at the first `false` or error.

| # | apply | then verify |
|---|---|---|
| 2 | `supabase/prepared/20261114000000_lead_screening_resolution.sql` | `…_lead_screening_resolution.verify.sql` |
| 3 | `supabase/prepared/20261114000001_lead_quick_match_state.sql` | `…_lead_quick_match_state.verify.sql` |
| 4 | `supabase/prepared/20261114000002_quick_match_candidates_rpc.sql` | `…_quick_match_candidates_rpc.verify.sql` |

Migration 002 begins by comparing the md5 of Unleash Beast's `lb_property_catalog_by_ids`
against the captured fixture and **raises an exception** if it differs. That guard cannot be
pre-checked read-only — `pg_proc` is not reachable through the REST API — so it runs for the
first time when the file does. **If it aborts, that is the guard working: stop, and do not work
around it.** Its other half is already confirmed above: the live function returns 27 columns.

## Steps 5–6 — ready, and waiting on 2–4

Deploying is possible from here (the Vercel CLI is authenticated for `locatorbeast`), but the
approved sequence puts the schema first, so nothing has been deployed.

After the deploy, these are the read-only checks, and no test recommendation is created in any
real client record:

* re-run the snapshot query and diff it against the before-snapshot — the 2 and 3 manual rows
  held by those two clients must be present, in the same order, with the same `sort_order`, and both Top
  Picks unchanged;
* `screening`, `origin` and `reviewed_at` must be absent from both share functions' column lists
  (the verify script for migration 001 asserts this; it is re-checked live);
* open one strong-match client (six blue *Quick Match*), one verify-match client holding manual
  rows (six amber *Quick Match · Verify* **plus** its two manual rows), and the out-of-area
  client (none);
* confirm no Quick Match panel and no Map Explorer tab exist — the release adds one API route and
  no page, which the route-set comparison above already shows.
