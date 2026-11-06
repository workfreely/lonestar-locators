# Quick Match deployment records

What was checked before and after the Quick Match release of 2026-11-05, kept so
the deployment has a written record. A snapshot of what was true when written,
not living documentation.

| File | What it records |
| --- | --- |
| `quick-match-2026-11-05/DEPLOYED.md` | The deployment record for `b71e420` → `dpl_EwFUJTBMM81ZZAdSbVFXT9s2rMVg`, and the three migrations applied with it |
| `quick-match-2026-11-05/PREFLIGHT.md` | Pre-deployment checks, and the steps that were deliberately blocked |
| `quick-match-2026-11-05/zip-78240-simulation.txt` | A ZIP-anchored search simulation, with no client identifiers |
| `quick-match-2026-11-04/quick-match-chips.png` | The three Quick Match chip states, rendered |

## What is deliberately not here

These reports originally included per-client drafting runs and verification
tables. Those files recorded credit scores, broken-lease and felony flags,
budgets and requested areas against internal lead IDs — client screening data,
pseudonymous but re-identifiable by anyone with CRM access. They were removed
rather than redacted, and the commit that briefly contained them was replaced.

What survives carries no client names, no lead IDs and no screening attributes.
Aggregate counts were kept where they are the audit record; per-client
breakdowns were not. Property names, addresses and ZIPs are public business data
and remain intact.

Client data belongs in the CRM, which has access control. It does not belong in
this repository.
