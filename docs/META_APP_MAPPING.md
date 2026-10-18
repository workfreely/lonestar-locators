# Meta / Instagram app and asset mapping

Verified 2026-10-18. **Reference only** — nothing here is a credential, and nothing in this
document should be changed without re-verifying against the live integrations.

## The mapping

| What | ID | Notes |
|---|---|---|
| **Locator Beast** Meta developer app | `1007011731962878` | Owns BOTH live integrations |
| **Locator Beast** Instagram App ID | `1377047461152538` | The value in `INSTAGRAM_APP_ID` |
| Real Estate Pro TX — Instagram account | `17841436885324014` | `@realestatepro_tx`, BUSINESS |
| Real Estate Pro TX — Meta Ads account | `act_683647705979397` | Page `104154438261056`, "Jay Morris - Real Estate Pro TX" |
| **Legacy** Lone Star Locators CRM app | `5313609062197685` | No identified Locator Beast dependency. **NOT approved for deletion.** |

## The thing that causes the confusion

**Meta shows TWO different numbers for the same app.** The dashboard's main page shows the *Meta
App ID*; under **Instagram → API setup with Instagram login** there is a separate *Instagram App
ID*. They are not interchangeable:

```
Meta App ID        1007011731962878   ← what the app list shows
Instagram App ID   1377047461152538   ← what INSTAGRAM_APP_ID must contain
```

An Instagram App ID that does not appear in your app list is **expected**, not a misconfiguration.
This cost real time once; it should not cost it twice.

## Which app owns what, and how that was established

| Integration | Owning app | How it was proven |
|---|---|---|
| Instagram publishing + comments | Locator Beast | `INSTAGRAM_APP_ID` = `1377047461152538` produces working tokens for `@realestatepro_tx` — an invalid client_id cannot |
| Meta Ads insights | Locator Beast `1007011731962878` | `debug_token` run against the **actual stored Ads token**: `app_id 1007011731962878, valid=true, type=USER` |

The Ads finding is the authoritative one: it introspects the live token rather than inferring from
configuration.

## Configure webhooks and OAuth in the Locator Beast app ONLY

The webhook signature is an HMAC over the raw body using the **app secret**. Configure a webhook in
the wrong app and every delivery fails verification with 403 — a silent non-delivery that looks
like Meta never sent anything. The Instagram App ID and the app secret must come from the same app.

## On the legacy app

No reference to `5313609062197685` exists in:

- `INSTAGRAM_APP_ID` or `META_APP_ID` (both resolve to Locator Beast)
- this repository, across all branches
- the Lone Star routes under `app/(site)/`, which contain **zero** Meta references

**That is not the same as "safe to delete."** Three things were NOT auditable from here, and the
third is the one that could hurt:

1. The app's own Meta-side configuration — webhooks, roles, permissions, live/dev mode. Reading an
   app's config needs its app secret.
2. Use by anything outside this codebase — another tool, an automation, a saved Graph API token.
3. **Business Manager asset ownership.** If that app was ever used to claim or connect the Page or
   the ad account, deleting it can revoke those links and invalidate tokens issued through it —
   inside the Real Estate Pro TX portfolio.

Deleting a Meta app is irreversible. Renaming it achieves the same clarity at no risk:

> `Lone Star Locators CRM — UNUSED, do not configure (retired 2026-10-18)`

Before any future deletion, confirm all three are empty: Business Settings → Accounts → Apps;
the app's own App Roles and Webhooks; Ads Manager → ad account → Settings → Connected apps.

## Related

- The two Supabase projects are also easy to confuse: Locator Beast is `onwrrajmklxtnabekzcy`;
  Lone Star is `ukkxisleiprdpptaaxcs` and is frozen. See `.env.example`.
