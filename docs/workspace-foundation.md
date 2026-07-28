# Locator Beast — Workspace Foundation (Phase 0)

Architecture-only multi-tenant foundation for the **dedicated Locator Beast Supabase project**.
The Lone Star Locators Supabase/Vercel/CRM stay 100% untouched. Nothing in here has been
applied to any database. User-facing CRM/Smart Form/onboarding UX is unchanged.

## Two independent systems (approved topology — Option B)

| | Lone Star Locators | Locator Beast |
|---|---|---|
| Vercel | existing project (untouched) | **new, separate project** |
| Supabase | existing project `ukkxisleiprdpptaaxcs` (untouched) | **new, separate, clean project** |
| Data | real production CRM | fresh SaaS data (starts empty) |
| Auth users | existing | new (you = first customer) |

No env var, domain, deployment, or DB connection belonging to Lone Star changes.

## Model

Every account belongs to exactly one **workspace** (`solo` today, `brokerage` later).
Each CRM row is owned by **both** a workspace (tenant boundary) and an owner user (agent).

```
workspace (solo | brokerage)
├── workspace_members (broker | manager | agent)
├── workspace_invitations   (data model only — no UI)
├── smart_forms (slug → workspace + owner)   (ownership backbone; no SLF UI change)
├── subscription/seat config (max_agent_seats, stripe_* mirrored onto workspace)
└── owned CRM rows: leads, lead_next_actions, lead_favorites, lead_timeline,
     lead_properties, ai_client_briefs, beast_milestones  (+ workspace_id, owner_user_id)
```

## Single-user assumptions found (audit)

1. `leads` has **no owner column** — shared pool (29 rows), read via the **service-role** client with no filter.
2. RLS on CRM tables is permissive (`auth.role()='authenticated'`), not per-tenant.
3. Many writes/inserts happen via **service role with no auth context** (public form `/api/leads/submit`, edge functions, `update-stage` route, workflow engine).
4. Billing lives only on `profiles`.
5. Middleware does **host rewrites only — no auth**.
6. `leads` and `lead_properties` exist in the DB but have **no create-table migration** (drift).
7. Smart Lead Form has **no persistence/publish**; landing pages are static; no per-agent slug/analytics.

## Migrations (this repo — unapplied; for the NEW project only)

| File | Purpose |
|---|---|
| `…04_workspaces_foundation.sql` | `workspaces`, `workspace_members`, `workspace_invitations` + `is_active_workspace_member()` + RLS on the new tables |
| `…05_add_workspace_ownership_columns.sql` | additive nullable `workspace_id` + `owner_user_id` on all CRM tables + indexes |
| `…06_workspace_backfill.sql` | **repurposed** → `ensure_solo_workspace()` + signup trigger + `reconcile_missing_workspaces()` (no Lone Star backfill) |
| `…07_crm_ownership_triggers.sql` | auto-own new rows; explicit-context path preferred; sole-workspace fallback is **customer-#1 bootstrap only** |
| `…08_workspace_rls_enforcement.sql` | replace permissive CRM policies with workspace-scoped ones |
| `…09_smart_forms_ownership.sql` | `smart_forms` (slug→workspace/owner) + `resolve_smart_form()` + `leads.source_smart_form_id`; secure public-submission resolution |

> These build **on top of** a clean baseline schema (see below); they do not create `leads`/`profiles`/etc.

## Reproducible baseline (required before applying to the new project)

Goal: a new dev can create an empty Supabase project, run migrations in order, and get the full
schema **without the Lone Star DB**. Because `leads`/`lead_properties` are untracked drift, they must
be reconstructed as an explicit early baseline migration.

Steps (need Docker or the DB connection string — not available in the agent env):
1. Produce the read-only structure dump (`supabase/reference/lonestar_public_schema.sql` — see that file for commands).
2. Audit it; **include** only what Locator Beast needs; **exclude** Lone Star-specific/obsolete objects, permissive RLS, hardcoded values, disabled features.
3. Write clean create-table migrations for the untracked tables (`leads`, `lead_properties`), dated **before** the earliest `ALTER` that references them, so ordering holds.
4. Establish the full chain: baseline → existing feature migrations → `…04`–`…09`.
5. Verify a second empty project can be built from migrations alone.

## Edge functions — audit result: **exclude all three**

`new-lead`, `new-home-lead`, `new-lease-report` are **not invoked by the app** (it uses `/api/leads/submit`),
hardcode Lone Star sender/recipient (`Jay@LoneStarLocators` → `workingfreely@gmail.com`), and insert leads
**without workspace/owner context** (would break tenant isolation). None migrate as-is. If a server-side
intake webhook is later needed, build a Locator Beast one that resolves the form slug → workspace/owner via
`resolve_smart_form()` and uses Locator Beast secrets — not a redeploy of these.

## Environment variables (new Vercel project)

- **New (Locator Beast Supabase):** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- **Locator Beast-specific configs:** Stripe (own products/prices/portal/**webhook secret**), Google OAuth (own client id/secret + redirect URIs; **per-user** OAuth — see risk), Meta (own app/pixel; per-workspace customer pixels later), Resend (own sending domain/sender/templates), `NEXT_PUBLIC_SITE_URL` → locatorbeast domain.
- **Reusable but isolated via the new project:** `ANTHROPIC_API_KEY`, `VAPI_*`, `RESEND_API_KEY` (account), `CRON_SECRET`.

## Known gaps / risks before a 2nd real customer

- **Service-role reads bypass RLS** (`getLeads`/`getFavorites`/…): fine for customer #1, but must be scoped to the workspace before customer #2 (Phase 1).
- **Public-form → owner resolution** must move to `resolve_smart_form(slug)` in `/api/leads/submit`; the sole-workspace fallback is a bootstrap only and self-disables at 2 workspaces.
- **Google OAuth** is currently a single Lone Star token — not a per-user SaaS integration; per-user OAuth is required.
- **Meta pixel** must not be a single hardcoded pixel; store per workspace/member.

## Cannot be done in the agent environment (needs you)

- Create the Locator Beast **Supabase project** and **Vercel project** (account/billing/dashboard actions).
- Produce the schema dump (needs Docker or the DB connection string).
- Apply migrations to / configure the new project (needs its credentials).
- Two-account isolation + preview tests (need the live new project).
