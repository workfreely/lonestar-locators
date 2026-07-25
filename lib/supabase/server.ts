import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Cookie-based Supabase client for Server Components and Route Handlers —
// used only by /onboarding and /auth/callback. The existing browser client
// in lib/supabase/client.ts (localStorage session) is untouched and still
// used everywhere else, including /admin.
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {
          // Called from a Server Component render — safe to ignore since
          // the session is already established by the time this happens.
        }
      },
    },
  })
}
