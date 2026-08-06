import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { rateLimit as memRateLimit, clientIpFromHeaders } from "@/lib/rateLimit";

// Two-layer rate limiting for the extension auth routes (safeguard #2):
//   1. an in-memory fixed-window limiter (fast, per-serverless-instance)
//   2. the DURABLE Supabase-backed companion_rate_limit counter (cross-instance)
// A request must pass BOTH. Buckets are keyed by NON-SECRET identifiers only
// (ip / user / extension id / connection id / refresh family) — never a raw
// token or token hash. The durable layer fails OPEN on an infra error so a
// transient DB hiccup can't lock everyone out (the in-memory layer still bounds
// abuse in that window).

export type RateBucket = { key: string; limit: number; windowSeconds: number };

export { clientIpFromHeaders };

function tooMany(retryAfter: number) {
  return {
    ok: false as const,
    retryAfter,
    response: NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    ),
  };
}

export async function enforceRateLimit(
  buckets: RateBucket[],
): Promise<{ ok: true } | { ok: false; retryAfter: number; response: NextResponse }> {
  // 1) in-memory first layer — reject cheaply before any DB round-trip.
  for (const b of buckets) {
    const mem = memRateLimit(`ext:mem:${b.key}`, b.limit, b.windowSeconds * 1000);
    if (!mem.allowed) return tooMany(mem.retryAfterSeconds);
  }

  // 2) durable distributed layer.
  for (const b of buckets) {
    const { data, error } = await supabaseAdmin.rpc("companion_rate_limit", {
      p_key: b.key,
      p_limit: b.limit,
      p_window_seconds: b.windowSeconds,
    });
    if (error) {
      console.error("[ext-ratelimit] durable check error:", error.message);
      continue; // fail open on infra error; in-memory layer already applied
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (row && row.allowed === false) {
      const reset = row.reset_at
        ? Math.max(1, Math.ceil((new Date(row.reset_at).getTime() - Date.now()) / 1000))
        : b.windowSeconds;
      return tooMany(reset);
    }
  }

  return { ok: true };
}
