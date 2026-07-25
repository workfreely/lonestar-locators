import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Landing point for both Google OAuth and email-confirmation links — both
// arrive with a `code` param that gets exchanged for a session here, then
// we hand off to `next` (defaults to /onboarding, which does its own
// completed-vs-not gate).
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/onboarding";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login`);
}
