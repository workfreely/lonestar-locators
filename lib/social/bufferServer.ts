// SERVER-SIDE BUFFER CREDENTIAL RESOLUTION, PER DESTINATION.
//
// Reuses the EXISTING Vault architecture rather than inventing storage: the API key is held as a
// Vault secret and read through a service-role-only RPC, exactly as Instagram and TikTok OAuth
// tokens are. The key NEVER leaves the server — it is returned to other server code and never to
// a browser, a URL, a log line or an error message.
//
// ── WHY THE CREDENTIAL UNIT IS A BUFFER ACCOUNT, NOT AN OWNER AND NOT A CONNECTION ──────────
// This is the one modelling decision in the feature, and both obvious answers are wrong.
//
//   PER OWNER would be wrong because social_connections.owner_user_id is always the PLATFORM
//   ADMIN. Jay owns every row, including Lisette's — agent_user_id is what records whose brand a
//   destination carries. Keying the credential on owner would therefore give Jay's key to
//   Lisette's channels, which is precisely the separation being asked for in reverse.
//
//   PER CONNECTION would be wrong in the other direction: Jay's two TikTok destinations live in
//   ONE Buffer account and share ONE key. Storing it twice means rotating it twice, and a rotation
//   that updates one row and not the other leaves a destination authenticating with a dead key.
//
// So a Buffer ACCOUNT is its own row — social_buffer_accounts — holding exactly one Vault secret,
// and a destination points at it. N channels per account, one key per account, one key per
// rotation. Separation is then structural rather than procedural: Lisette's channels point at a
// different row holding a different secret, and no code path can reach across.
//
// ── FAIL CLOSED, AND SAY WHICH FAILURE ──────────────────────────────────────────────────────
// Resolution returns a discriminated result rather than null-or-value, because the worker must
// treat the cases differently and the TikTok worker's experience is that collapsing them into
// null loses exactly the distinction that matters: a MISCONFIGURED destination needs a human and
// should fail its post, whereas an UNREADABLE one is transient and must leave the post alone.
import "server-only"
import { supabaseAdmin } from "@/lib/supabase/admin"
import { parseMarketRestriction } from "@/lib/social/marketRestriction"

/** What one Buffer-routed destination's row says about itself, alongside its usable API key. */
export type BufferDestination = {
  connectionId: string
  /** The resolved Buffer API key. Server-side only; never logged, never returned to a client. */
  apiKey: string
  /** Buffer's channel id for this destination. */
  channelId: string
  /** social_buffer_accounts.id — which Buffer account this key belongs to. Carried for reporting. */
  bufferAccountId: string
  /** A human label for the Buffer account, e.g. "Lisette". Safe to log; never the key. */
  bufferAccountLabel: string | null
  provider: string | null
  username: string | null
  /** The destination's own pause switch, returned so a caller need not read the row twice. */
  postingPaused: boolean
  /** The destination's market restriction, already normalised. NULL ⇒ unrestricted. */
  marketRestriction: string[] | null
  ownerUserId: string | null
  agentUserId: string | null
}

export type BufferDestinationResult =
  | { ok: true; destination: BufferDestination }
  /** The row is not Buffer-routed, or its Buffer account has no stored key. A human must fix it;
   *  the caller FAILS the post with `reason`, because nothing will change on its own. */
  | { ok: false; kind: "misconfigured"; reason: string }
  /** The read itself failed. Transient; the caller leaves the post exactly as it is. */
  | { ok: false; kind: "unreadable"; reason: string }

/**
 * The narrow slice of the service-role client this uses.
 *
 * Declared so a caller can INJECT one, which is the only way the properties that matter here are
 * testable without a database: that a connection resolves to ITS OWN Buffer account's key, and
 * that two destinations in different accounts never resolve to the same credential. The same shape
 * tiktokServer and loadPostingHistory already use. Production passes nothing and gets supabaseAdmin.
 */
export type BufferClient = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string } | null }>
}

type RpcRow = {
  api_key?: unknown
  buffer_channel_id?: unknown
  buffer_account_id?: unknown
  buffer_account_label?: unknown
  provider?: unknown
  username?: unknown
  posting_paused?: unknown
  market_restriction?: unknown
  owner_user_id?: unknown
  agent_user_id?: unknown
}

const str = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : ""
  return s ? s : null
}

/**
 * Resolve ONE destination's Buffer credential and settings.
 *
 * The RPC is route-scoped: it returns nothing unless the connection carries BOTH a buffer_account_id
 * and a buffer_channel_id, so a natively-published destination cannot be resolved here even by a
 * caller that asks for it. That is the same defence sa_get_instagram_token_by_connection uses when
 * it filters on provider = 'instagram' — the guard lives in the database, not only in the worker.
 */
export async function resolveBufferDestination(
  connectionId: string,
  client: BufferClient = supabaseAdmin as unknown as BufferClient,
): Promise<BufferDestinationResult> {
  if (!connectionId) {
    return { ok: false, kind: "misconfigured", reason: "no publishing destination selected for this post" }
  }

  const { data, error } = await client.rpc("sa_get_buffer_destination", { p_connection_id: connectionId })
  if (error) {
    // Transient by assumption, which is the safe direction: the caller leaves the post scheduled
    // and tries again in five minutes rather than failing an approved post over a database hiccup.
    return {
      ok: false,
      kind: "unreadable",
      reason: `could not read Buffer destination: ${(error.message ?? "unknown error").slice(0, 160)}`,
    }
  }

  const row = (Array.isArray(data) ? data[0] : data) as RpcRow | null | undefined
  if (!row) {
    return {
      ok: false,
      kind: "misconfigured",
      reason:
        "this destination is not configured for Buffer publishing — it needs a Buffer account and a " +
        "channel mapping before it can publish through Buffer",
    }
  }

  const apiKey = str(row.api_key)
  const channelId = str(row.buffer_channel_id)
  const bufferAccountId = str(row.buffer_account_id)
  if (!bufferAccountId || !channelId) {
    return {
      ok: false,
      kind: "misconfigured",
      reason: "this destination is missing its Buffer account or channel mapping",
    }
  }
  if (!apiKey) {
    // The account row exists but its Vault secret is absent or unreadable. Named explicitly
    // because the fix is specific and nothing else produces this.
    return {
      ok: false,
      kind: "misconfigured",
      reason: `the Buffer account for this destination has no stored API key — re-save it before publishing`,
    }
  }

  return {
    ok: true,
    destination: {
      connectionId,
      apiKey,
      channelId,
      bufferAccountId,
      bufferAccountLabel: str(row.buffer_account_label),
      provider: str(row.provider),
      username: str(row.username),
      postingPaused: row.posting_paused === true,
      marketRestriction: parseMarketRestriction(row.market_restriction),
      ownerUserId: str(row.owner_user_id),
      agentUserId: str(row.agent_user_id),
    },
  }
}

/**
 * A per-run memo around the resolver.
 *
 * MAX_PER_RUN is small, so several rows in one invocation commonly share a destination; resolving
 * once per destination keeps the Vault reads down without holding a credential any longer than the
 * invocation itself. The cache is a local object handed back to the caller rather than module
 * state, so a key cannot outlive the request that needed it or leak into another invocation on a
 * warm Lambda.
 */
export function bufferDestinationCache(client?: BufferClient) {
  const cache = new Map<string, BufferDestinationResult>()
  return {
    async get(connectionId: string | null): Promise<BufferDestinationResult> {
      if (!connectionId) {
        return { ok: false, kind: "misconfigured", reason: "no publishing destination selected for this post" }
      }
      const hit = cache.get(connectionId)
      if (hit) return hit
      const res = await resolveBufferDestination(connectionId, client)
      // An UNREADABLE result is deliberately NOT cached: it is transient, and a second row in the
      // same run deserves its own attempt rather than inheriting a hiccup.
      if (res.ok || res.kind === "misconfigured") cache.set(connectionId, res)
      return res
    },
    size: () => cache.size,
  }
}
