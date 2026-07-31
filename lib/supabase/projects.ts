// Which Supabase project is this app talking to?
//
// This repo can point at TWO SEPARATE Supabase projects, and connecting to the
// wrong one makes features look "broken" (missing tables/RPCs) when the code is
// fine. This module is the single source of truth for identifying the active
// project and shouting about it in development.
//
// The project refs below are the public subdomain of NEXT_PUBLIC_SUPABASE_URL
// (they ship to the browser already) — they are NOT secrets.

export type SupabaseProjectRole = "primary" | "legacy"

export type SupabaseProject = {
  ref: string
  name: string
  role: SupabaseProjectRole
  /** Frozen = never run migrations against it; not the LB dev target. */
  frozen: boolean
  note: string
}

// Known projects. Add new environments here so the guard can label them.
export const KNOWN_SUPABASE_PROJECTS: Record<string, SupabaseProject> = {
  // Locator Beast (the SaaS) — the DEFAULT target for LB development. All CRM /
  // onboarding / service-area / companion schema + migrations live here.
  onwrrajmklxtnabekzcy: {
    ref: "onwrrajmklxtnabekzcy",
    name: "Locator Beast",
    role: "primary",
    frozen: false,
    note: "Default for Locator Beast dev. Supabase CLI is linked here; migrations apply here.",
  },
  // Lone Star Locators — FROZEN legacy production DB. Only the legacy marketing
  // routes (app/(site)/*) still read from it. LB SaaS features do not exist here.
  ukkxisleiprdpptaaxcs: {
    ref: "ukkxisleiprdpptaaxcs",
    name: "Lone Star Locators",
    role: "legacy",
    frozen: true,
    note: "FROZEN legacy DB — marketing routes only. Never migrate it. LB SaaS features will look broken here.",
  },
}

/** Pull the project ref out of a Supabase URL (https://<ref>.supabase.co). */
export function supabaseRefFromUrl(url: string | undefined | null): string | null {
  if (!url) return null
  const m = url.match(/^https?:\/\/([a-z0-9]+)\.supabase\.co/i)
  return m ? m[1] : null
}

/** Resolve the active project from a URL; unknown refs still get a stub. */
export function resolveSupabaseProject(url: string | undefined | null): SupabaseProject | null {
  const ref = supabaseRefFromUrl(url)
  if (!ref) return null
  return (
    KNOWN_SUPABASE_PROJECTS[ref] ?? {
      ref,
      name: "Unknown Supabase project",
      role: "primary",
      frozen: false,
      note: "Not in KNOWN_SUPABASE_PROJECTS — add it to lib/supabase/projects.ts if this is a real environment.",
    }
  )
}

// Log the active project ONCE per runtime, in development only. Runs at module
// load for both the browser and server Supabase clients, so you always see —
// in the browser console AND the dev server terminal — exactly which DB you're
// on, with a loud warning when it's the frozen Lone Star project.
let announced = false
export function logActiveSupabaseProject(url: string | undefined | null): void {
  if (announced) return
  announced = true
  if (process.env.NODE_ENV === "production") return

  const project = resolveSupabaseProject(url)
  if (!project) {
    console.warn("[supabase] NEXT_PUBLIC_SUPABASE_URL is missing or malformed — cannot identify the project.")
    return
  }

  if (project.frozen) {
    console.warn(
      `\n⚠️  [supabase] Connected to ${project.name} (${project.ref}) — this is the FROZEN legacy DB.\n` +
        `    Locator Beast SaaS features (CRM, service areas, companion, onboarding) will look BROKEN here\n` +
        `    because their tables/RPCs don't exist on this project. Point NEXT_PUBLIC_SUPABASE_URL at the\n` +
        `    Locator Beast project (onwrrajmklxtnabekzcy) for LB dev. See docs/environments.md.\n`
    )
  } else {
    console.info(`[supabase] Connected to ${project.name} (${project.ref}).`)
  }
}
