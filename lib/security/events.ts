import { supabaseAdmin } from "@/lib/supabase/admin"
import { clientIpFromHeaders } from "@/lib/rateLimit"
import { parseUserAgent } from "@/lib/leads/parseUserAgent"

// Security Beast — the ONE way to record a server-side security event
// (table: security_events). Written ONLY here, server-side, via the service
// role — never from a browser client (RLS denies non-service writes).
//
// BEST-EFFORT + FAIL-OPEN: a logging failure must never affect the caller. This
// function never throws; it swallows and console-logs errors (message only —
// never credentials, tokens, or the row's PII) so a failure is observable in the
// server logs without leaking anything.
//
// Captures who/when/where-from and coarse device info. Stores NO passwords,
// tokens, session/auth data, or raw fingerprint — see the migration.

export type SecurityEventType = "login"
export type SecurityLoginMethod = "password" | "google_oauth"

export async function recordSecurityEvent(input: {
  userId: string
  workspaceId?: string | null
  eventType: SecurityEventType
  method?: SecurityLoginMethod | null
  // The server request's headers — the ONLY trusted source of IP / UA / country
  // (never taken from the request body, so a client can't spoof them).
  headers: Headers
  metadata?: Record<string, unknown>
}): Promise<void> {
  try {
    const ua = parseUserAgent(input.headers.get("user-agent"))
    const ip = clientIpFromHeaders(input.headers)
    const country = input.headers.get("x-vercel-ip-country") || null

    const { error } = await supabaseAdmin.from("security_events").insert({
      user_id: input.userId,
      workspace_id: input.workspaceId ?? null,
      event_type: input.eventType,
      method: input.method ?? null,
      ip: ip === "unknown" ? null : ip,
      country,
      device_type: ua.deviceType,
      browser: ua.browser,
      operating_system: ua.operatingSystem,
      metadata: input.metadata ?? {},
    })
    if (error) console.error("[security-events] insert failed:", error.message)
  } catch (e) {
    console.error("[security-events] record error:", e instanceof Error ? e.message : "unknown")
  }
}
