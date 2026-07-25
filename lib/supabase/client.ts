import { createBrowserClient } from "@supabase/ssr"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Cookie-based (not localStorage) so the session is visible to both this
// client and the server-side client in lib/supabase/server.ts — required
// for /onboarding's server-side gate to see a session established here.
// Same singleton export and API as before, so no call sites change.
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey)