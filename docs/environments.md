# Environments & Supabase projects

This repo can connect to **two separate Supabase projects**. Pointing local
development at the wrong one is the single most common cause of a feature that
looks "broken" while the code is actually fine — so choose deliberately.

## The two projects

| Project | Ref | Role | Migrations |
|---|---|---|---|
| **Locator Beast** (the SaaS) | `onwrrajmklxtnabekzcy` | **Primary — default for LB dev** | Applied here; Supabase CLI is linked to it |
| **Lone Star Locators** | `ukkxisleiprdpptaaxcs` | **Frozen legacy** — marketing routes only | **Never** run migrations against it |

- **Locator Beast** holds all the SaaS schema: workspaces, the CRM tables,
  onboarding, `workspaces.service_areas` + its RPCs, the companion tables, etc.
  This is what you want for developing Locator Beast features.
- **Lone Star Locators** is the original production database. Only the legacy
  marketing/SEO routes under `app/(site)/*` still read from it. It is **frozen**:
  do not push migrations or run SQL against it. The LB SaaS tables/RPCs do not
  exist here, so LB features will error or fall back to defaults.

## Which one is local dev on?

Local dev uses whatever `NEXT_PUBLIC_SUPABASE_URL` in your `.env.local` points
at. The **default for this repo is Locator Beast** (see `.env.example`).

To make it obvious at runtime, both Supabase clients call
`logActiveSupabaseProject()` on load (dev only). On every `pnpm dev` you'll see,
in the browser console and the dev-server terminal, one of:

```
[supabase] Connected to Locator Beast (onwrrajmklxtnabekzcy).
```

or, if you're on the frozen DB, a loud warning:

```
⚠️  [supabase] Connected to Lone Star Locators (ukkxisleiprdpptaaxcs) — this is the FROZEN legacy DB.
    Locator Beast SaaS features (CRM, service areas, companion, onboarding) will look BROKEN here …
```

The registry lives in [`lib/supabase/projects.ts`](../lib/supabase/projects.ts);
add new environments there.

## Setup

1. `cp .env.example .env.local`
2. Fill in the Locator Beast anon + service-role keys (Supabase dashboard →
   Project Settings → API for project `onwrrajmklxtnabekzcy`) plus the other
   service keys.
3. `pnpm dev` and confirm the console says **Connected to Locator Beast**.

## Working on the legacy marketing routes

Those pages (`app/(site)/*`) need Lone Star data. If you specifically need to run
them against real data, temporarily point `NEXT_PUBLIC_SUPABASE_URL` at
`ukkxisleiprdpptaaxcs` — and expect the LB SaaS screens to be non-functional
while you do. Switch back to Locator Beast for SaaS work. Never migrate the
Lone Star project.

## Production

Production env vars live in the Vercel `locatorbeast` project and point at
Locator Beast. Deploy with `vercel --prod`. The dev-only project warning is a
no-op in production builds.
