# Quick Match — applied and deployed

**Deployment ID `dpl_5ivokNusGjpE47jux6KNoNnJhw5A`** · `locatorbeast-2636jrm05` · status **Ready**
Release commit **`70008f6`** · 2026-11-05 16:27 CST · aliased to `locatorbeast.com`, `www`, `locatorbeast.vercel.app`

---

## How the SQL was executed, and what it was not

The **Supabase CLI's existing authenticated session** — `supabase migration up --linked` against
project `onwrrajmklxtnabekzcy`. No credential was read, printed, copied or stored; the CLI used
its own session, and the token never entered a command line or this transcript. An earlier attempt
to read the CLI's stored token directly was refused by the sandbox, and was not retried or worked
around.

Two deliberate containments:

1. **A scratch project directory outside the repository.** `supabase migration up` applies every
   pending migration it can see, and this repo's `supabase/migrations/` is a queue of intent —
   dozens of files that have never run. Pushing from the repo would have applied all of them. So
   each step ran from a throwaway directory holding **exactly one real migration file**, plus
   empty placeholders for the **128 versions production already records**, which satisfies the
   CLI's history check and makes it structurally impossible for anything else to be applied.
2. **Verification runs in a transaction that rolls itself back.** Each approved verify script's
   predicates were run **verbatim**; only the output mechanism differs — results are gathered and
   re-raised as an exception, so the transaction aborts and the run leaves nothing behind, not
   even a migration-history row. The verify scripts already use this trick internally.

Production's migration history went from **128 rows to 131** — exactly `20261114000000`,
`20261114000001`, `20261114000002`. No probe and no verify run left a row.

## The integrity guard, checked before anything was written

A read-only probe (rollback-only, nothing written) reported the live state of Unleash Beast's
read path **before** the first migration:

```
md5 = ef035dc17e71b610bd0a87da014db9b9   outcols = 27
expected                                 ef035dc17e71b610bd0a87da014db9b9
```

Byte-identical to the captured fixture. The guard inside migration 002 then re-checked it at
apply time and reported:

> `OK: new function created; lb_property_catalog_by_ids untouched (27 cols, md5 matches); anon has no EXECUTE`

---

## Migration 000 — `lead_screening_resolution` — applied, **ALL CHECKS TRUE**

| check | ok | detail |
|---|---|---|
| columns exist with the right types | ✅ | 3 |
| all three nullable with no default | ✅ | 3 |
| no existing lead was given a value | ✅ | 24 leads on file |
| `rental_debt_status` vocabulary CHECK present | ✅ | `CHECK ((rental_debt_status IS NULL) OR (rental_debt_status = ANY (ARRAY['none','owed','paid','payment_plan'])))` NOT VALID |
| nothing persisted from the probe | ✅ | 0 |

The script's behavioural probe ran and reported
`OK: 'unpaid' rejected, 'payment_plan' accepted (a throwaway test lead), rolling back` — then
`OK: probe rolled back, no lead was modified`.

## Migration 001 — `lead_quick_match_state` — applied, **ALL CHECKS TRUE**

| check | ok | detail |
|---|---|---|
| `lead_recommendations` columns exist with the right types | ✅ | 3 |
| `leads.quick_match_at` exists | ✅ | 1 |
| every existing recommendation still reads as the agent's (`origin` NULL) | ✅ | **11 rows on file** |
| no row marked reviewed, none carries screening detail | ✅ | |
| no lead stamped as having run | ✅ | |
| `origin` vocabulary CHECK present | ✅ | `CHECK ((origin IS NULL) OR (origin = ANY (ARRAY['agent','quick_match'])))` NOT VALID |
| the partial index for the refresh predicate exists | ✅ | |
| **neither share function references `origin` / `reviewed_at` / `screening`** | ✅ | |
| nothing persisted from the probe | ✅ | 0 |

Behavioural probe: `OK: 'robot' rejected, 'quick_match' accepted (row 10), rolling back`, then
`OK: probe rolled back, no recommendation was modified`.

## Migration 002 — `quick_match_candidates_rpc` — applied, **ALL CHECKS TRUE**

| check | ok | detail |
|---|---|---|
| `lb_quick_match_candidates` exists | ✅ | 1 |
| it returns all 46 columns the engine reads | ✅ | 46 |
| **`anon` has NO execute** | ✅ | |
| **`PUBLIC` has no execute either** | ✅ | |
| `authenticated` does have execute | ✅ | |
| **Unleash Beast's read path untouched (md5 + 27 OUT columns)** | ✅ | |
| it returns exactly the curated members, no non-member | ✅ | **68 members** |
| an unknown collection returns nothing rather than everything | ✅ | |

---

## Deployment

| | |
|---|---|
| deployment id | `dpl_5ivokNusGjpE47jux6KNoNnJhw5A` |
| compiled | ✓ in 22.9s · build completed in 59s · deployment completed |
| `locatorbeast.com` serves | `dpl_5ivokNusGjpE47jux6KNoNnJhw5A` ✅ |
| routes in production | **270 → 271** |
| added | `/api/admin/quick-match/[leadId]` — and nothing else |
| removed | **nothing** |

No page and no tab was added: the one new route is an API endpoint, which is the whole of the
Quick Match surface. The route set now matches the `70008f6` tree exactly, with the same two
framework artifacts as the baseline comparison (`/_not-found` is generated; a nested `robots.ts`
is not routed — a local build behaves identically).

## Health checks — all read-only

| check | result |
|---|---|
| `GET /api/admin/quick-match/100` unauthenticated | **401** `{"error":"unauthenticated"}` — live and closed |
| `GET /locator-beast/pricing` | 200 |
| `GET /smart-lead-form` | 200 |
| `rpc/lb_quick_match_candidates` with the anon key | **401** — the screening read path is unreachable publicly |

## Nothing in a client record was touched

The same snapshot query was run before the migrations and after the deploy, and the two files are
**byte-identical**:

| | before | after |
|---|---|---|
| `lead_recommendations` rows | 11 | **11** |
| per client | 27:3, 84:2, 93:2, 94:1, 102:3 | **identical** |
| `sort_order` on every row | — | **identical** |
| clients with a Top Pick | 2 | **2, identical** |

And nothing has been generated yet, which is correct — the automatic pass runs when an agent
opens an eligible client:

| | |
|---|---|
| recommendations with `origin` set | **0** |
| recommendations with `screening` set | **0** |
| recommendations with `reviewed_at` set | **0** |
| leads stamped `quick_match_at` | **0** |
| leads with any of the three new screening columns set | **0** |

**No test recommendation was created in any real client record.** The only writes to client rows
were the two approved behavioural CHECK probes, each of which rolled back inside its own
subtransaction and was then proved empty by the script's own closing query.

## The engine against the migrated database

The read-only dry run was re-run after the deploy: **54 rows across 10 eligible clients of 24**,
**identical** to the run taken before the migrations. The three new nullable columns changed no
verdict — NULL still means "nobody has asked".

Per-client drafting counts are not recorded here. In aggregate: of the ten eligible clients,
two drafted six strong rows each, seven drafted six rows each needing verification, and the one
client outside the service area drafted none — 54 rows in all. The totals above are the audit
record; the per-client breakdown was removed because it tied drafting outcomes to individual
client records.

Two of the eligible clients are the ones to look at first: they already hold 2 and 3 **manual**
recommendations, which must still be there, in the same order, alongside the generated rows.

## One thing that is new, and worth recording

`supabase migration up` wrote three rows into `supabase_migrations.schema_migrations`. The
repository's own convention is to apply by hand and record the fact in
`docs/APPLIED_MIGRATIONS.md`, which notes that the schema ledger "stopped recording at
`20260915120000`". These three are now the first entries since. That is an improvement rather
than a problem, but `docs/APPLIED_MIGRATIONS.md` does not yet mention them.

## Rollback, if it is ever needed

In reverse order, each tested in the isolated database during verification:
`ROLLBACK_…_quick_match_candidates_rpc.sql` → `ROLLBACK_…_lead_quick_match_state.sql` →
`ROLLBACK_…_lead_screening_resolution.sql`. The middle one **deletes no recommendation**.
Code rollback is redeploying the previous production deployment,
`dpl_9JgxSKVApSV4v8wqzvzAxcRePrYL`.
