// HEYGEN — AI Presenter clip generation.
//
// Scope is deliberately narrow: list avatar looks, upload an audio asset, create ONE transparent
// video, poll it, download it. No account management, no batch, no scheduling.
//
// ── MONEY ───────────────────────────────────────────────────────────────────────────────────
// createAvatarVideo SPENDS REAL CREDIT on every successful call. Listing and polling do not.
// The spend is therefore isolated in one function, and every caller has to pass an explicit
// `confirmSpend` token — not a boolean, which is too easy to leave set to true in a config.
//
// ── CREDENTIALS ─────────────────────────────────────────────────────────────────────────────
// The key is read from the environment at CALL time, never stored in a row, never logged, never
// returned. There is no NEXT_PUBLIC form of it and this module must never be imported by a client
// component.
const BASE = "https://api.heygen.com"

export type HeyGenAvatarLook = {
  id: string
  name: string
  avatarType: string | null
  gender: string | null
  previewImageUrl: string | null
  previewVideoUrl: string | null
  preferredOrientation: string | null
  supportedEngines: string[]
  status: string | null
}

function apiKey(): string {
  const k = process.env.HEYGEN_API_KEY
  if (!k) throw new Error("HEYGEN_API_KEY is not set. Export it in the environment; never commit it or paste it into a file.")
  return k
}

async function call(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "X-Api-Key": apiKey(), ...(init?.headers ?? {}) },
  })
  const text = await res.text()
  let body: unknown
  try { body = JSON.parse(text) } catch { body = text }
  if (!res.ok) {
    // The message may quote HeyGen's own error — useful, and it contains no credential.
    throw new Error(`HeyGen ${path} -> ${res.status}: ${typeof body === "string" ? body.slice(0, 300) : JSON.stringify(body).slice(0, 300)}`)
  }
  return body
}

/** FREE. Lists avatar looks. `ownership: "public"` returns HeyGen's stock library. */
export async function listAvatarLooks(opts: { avatarType?: string; ownership?: "public" | "private"; limit?: number; token?: string } = {}) {
  const q = new URLSearchParams()
  if (opts.avatarType) q.set("avatar_type", opts.avatarType)
  if (opts.ownership) q.set("ownership", opts.ownership)
  q.set("limit", String(Math.min(50, Math.max(1, opts.limit ?? 50))))
  if (opts.token) q.set("token", opts.token)
  const raw = (await call(`/v3/avatars/looks?${q.toString()}`)) as { data?: { looks?: unknown[]; avatars?: unknown[]; token?: string } }
  const rows = (raw.data?.looks ?? raw.data?.avatars ?? []) as Record<string, unknown>[]
  const looks: HeyGenAvatarLook[] = rows.map((r) => ({
    id: String(r.id ?? r.avatar_id ?? ""),
    name: String(r.name ?? r.avatar_name ?? "(unnamed)"),
    avatarType: (r.avatar_type as string) ?? null,
    gender: (r.gender as string) ?? null,
    previewImageUrl: (r.preview_image_url as string) ?? null,
    previewVideoUrl: (r.preview_video_url as string) ?? null,
    preferredOrientation: (r.preferred_orientation as string) ?? null,
    supportedEngines: Array.isArray(r.supported_api_engines) ? (r.supported_api_engines as string[]) : [],
    status: (r.status as string) ?? null,
  }))
  return { looks, nextToken: raw.data?.token ?? null }
}

/** FREE. Uploads an audio file and returns its asset id. */
export async function uploadAudioAsset(bytes: Buffer, filename: string, mime: string): Promise<string> {
  const form = new FormData()
  form.append("file", new Blob([new Uint8Array(bytes)], { type: mime }), filename)
  const raw = (await call("/v3/assets", { method: "POST", body: form })) as { data?: { asset_id?: string } }
  const id = raw.data?.asset_id
  if (!id) throw new Error("HeyGen returned no asset_id")
  return id
}

/**
 * ⚠️ SPENDS CREDIT. One transparent avatar clip, lip-synced to an uploaded audio asset.
 *
 * `confirmSpend` must be the exact string "yes-spend-heygen-credit". A boolean would be too easy
 * to set once and forget; a token has to be typed deliberately at the call site each time.
 *
 * Deliberately omitted from the body, each for a documented reason:
 *   script / voice_id   mutually exclusive with audio — sending both is rejected
 *   background          rejected outright when output_format is "webm"
 *   remove_background   redundant; webm applies background removal automatically
 *   engine              omitted so the default (Avatar IV) applies, the only engine documented
 *                       for studio-avatar audio input
 */
export async function createAvatarVideo(input: {
  avatarId: string
  audioAssetId: string
  aspectRatio?: "9:16" | "1:1" | "4:5" | "16:9"
  resolution?: "720p" | "1080p" | "4k"
  title?: string
  confirmSpend: string
}): Promise<{ videoId: string; status: string }> {
  if (input.confirmSpend !== "yes-spend-heygen-credit") {
    throw new Error("createAvatarVideo refused: this call spends real credit and requires an explicit confirmSpend token.")
  }
  const body = {
    type: "avatar",
    avatar_id: input.avatarId,
    audio_asset_id: input.audioAssetId,
    output_format: "webm",          // the ONLY transparent path HeyGen offers
    aspect_ratio: input.aspectRatio ?? "9:16",
    resolution: input.resolution ?? "1080p",
    title: input.title ?? "Social Beast AI Presenter test",
  }
  const raw = (await call("/v3/videos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })) as { data?: { video_id?: string; status?: string } }
  const videoId = raw.data?.video_id
  if (!videoId) throw new Error("HeyGen returned no video_id")
  return { videoId, status: raw.data?.status ?? "unknown" }
}

/** FREE. One status read. */
export async function getVideo(videoId: string): Promise<{ status: string; videoUrl: string | null; duration: number | null; error: string | null }> {
  const raw = (await call(`/v3/videos/${encodeURIComponent(videoId)}`)) as {
    data?: { status?: string; video_url?: string; duration?: number; failure_message?: string; error?: unknown }
  }
  const d = raw.data ?? {}
  return {
    status: d.status ?? "unknown",
    videoUrl: d.video_url ?? null,
    duration: typeof d.duration === "number" ? d.duration : null,
    error: d.failure_message ?? (d.error ? JSON.stringify(d.error).slice(0, 200) : null),
  }
}

/** FREE. Polls until terminal. The docs recommend 10-30s intervals; media URLs are presigned and
 *  expire, so the caller should download immediately rather than storing the URL. */
export async function waitForVideo(videoId: string, opts: { intervalMs?: number; timeoutMs?: number; onTick?: (s: string) => void } = {}) {
  const interval = opts.intervalMs ?? 10_000
  const deadline = Date.now() + (opts.timeoutMs ?? 10 * 60_000)
  for (;;) {
    const v = await getVideo(videoId)
    opts.onTick?.(v.status)
    if (v.status === "completed") return v
    if (v.status === "failed") throw new Error(`HeyGen render failed: ${v.error ?? "no reason given"}`)
    if (Date.now() > deadline) throw new Error(`HeyGen render timed out after ${Math.round((opts.timeoutMs ?? 600000) / 1000)}s (last status: ${v.status})`)
    await new Promise((r) => setTimeout(r, interval))
  }
}
