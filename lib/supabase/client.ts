import { createBrowserClient } from "@supabase/ssr"
import { logActiveSupabaseProject } from "./projects"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Dev-only: announce which Supabase project this build is talking to (and warn
// loudly if it's the frozen legacy DB) so "the feature is broken" is never a
// mystery about the wrong database. No-op in production.
logActiveSupabaseProject(supabaseUrl)

// Cookie-based (not localStorage) so the session is visible to both this
// client and the server-side client in lib/supabase/server.ts — required
// for /onboarding's server-side gate to see a session established here.
// Same singleton export and API as before, so no call sites change.
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey)