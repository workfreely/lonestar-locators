// TikTok Content Posting API — Direct Post (video.publish), SERVER-SIDE ONLY.
//
// Minimal Sandbox MVP: Query Creator Info → Direct Post via FILE_UPLOAD → poll status.
// Follows TikTok's current official Content Posting API (verified against developers.tiktok.com):
//   creator info  POST https://open.tiktokapis.com/v2/post/publish/creator_info/query/   (empty body)
//   init          POST https://open.tiktokapis.com/v2/post/publish/video/init/           (post_info + source_info)
//   upload        PUT  {upload_url from init}                                             (raw bytes, Content-Range)
//   status        POST https://open.tiktokapis.com/v2/post/publish/status/fetch/          ({ publish_id })
//
// Transfer method is FILE_UPLOAD (not PULL_FROM_URL): the rendered MP4 lives in a PRIVATE
// Supabase bucket reachable only via a short-lived *.supabase.co signed URL — a domain we can't
// verify with TikTok — so we upload the bytes directly. No new public route / storage / infra.
//
// Every function takes the access token as an argument and NEVER logs it. Callers resolve the
// token server-side via the Vault service-role RPC; the token never reaches the browser/URLs/logs.

const CREATOR_INFO_URL = "https://open.tiktokapis.com/v2/post/publish/creator_info/query/"
const INIT_URL = "https://open.tiktokapis.com/v2/post/publish/video/init/"
const STATUS_URL = "https://open.tiktokapis.com/v2/post/publish/status/fetch/"

const JSON_HEADERS = (accessToken: string) => ({
  Authorization: `Bearer ${accessToken}`,
  "Content-Type": "application/json; charset=UTF-8",
})

// TikTok privacy levels. Unaudited clients may ONLY post SELF_ONLY (private) — enforced by TikTok
// with error `unaudited_client_can_only_post_to_private_accounts`. We surface all options TikTok
// returns but validate the chosen one against creator_info + this restriction.
export type TikTokPrivacyLevel =
  | "PUBLIC_TO_EVERYONE"
  | "MUTUAL_FOLLOW_FRIENDS"
  | "FOLLOWER_OF_CREATOR"
  | "SELF_ONLY"

export type TikTokCreatorInfo = {
  creator_username: string
  creator_nickname: string
  creator_avatar_url: string
  privacy_level_options: TikTokPrivacyLevel[]
  comment_disabled: boolean
  duet_disabled: boolean
  stitch_disabled: boolean
  max_video_post_duration_sec: number
}

type TikTokEnvelope<T> = { data?: T; error?: { code?: string; message?: string; log_id?: string } }

// TikTok signals success with error.code === "ok". Throw a coarse, token-free error otherwise.
function assertOk(envelope: { error?: { code?: string; message?: string } } | null, res: Response, label: string) {
  const code = envelope?.error?.code
  if (!res.ok || (code && code !== "ok")) {
    throw new Error(`tiktok ${label} failed: ${res.status} ${code ?? ""}`.trim())
  }
}

/** Query Creator Info immediately before presenting/submitting the post. Empty POST body. */
export async function fetchTikTokCreatorInfo(accessToken: string): Promise<TikTokCreatorInfo> {
  const res = await fetch(CREATOR_INFO_URL, { method: "POST", headers: JSON_HEADERS(accessToken) })
  const json = (await res.json()) as TikTokEnvelope<TikTokCreatorInfo>
  assertOk(json, res, "creator_info")
  if (!json.data) throw new Error("tiktok creator_info: empty data")
  return json.data
}

// TikTok FILE_UPLOAD chunking: a whole video ≤ 64MB may be sent as a SINGLE chunk
// (chunk_size = video_size, total_chunk_count = 1). Multi-chunk (5MB–64MB per non-final chunk)
// is only needed above that. The MVP demo uses short 9:16 renders that are comfortably < 64MB,
// so we support the single-chunk case and fail loudly (rather than silently) above it.
const SINGLE_CHUNK_MAX_BYTES = 64 * 1024 * 1024

export function planSingleChunk(videoSize: number): { chunkSize: number; totalChunkCount: number } {
  if (!Number.isInteger(videoSize) || videoSize <= 0) throw new Error("tiktok upload: invalid video size")
  if (videoSize > SINGLE_CHUNK_MAX_BYTES) {
    throw new Error(`tiktok upload: video ${videoSize}B exceeds single-chunk MVP limit (${SINGLE_CHUNK_MAX_BYTES}B)`)
  }
  return { chunkSize: videoSize, totalChunkCount: 1 }
}

export type DirectPostInitParams = {
  title: string
  privacyLevel: TikTokPrivacyLevel
  disableComment: boolean
  disableDuet: boolean
  disableStitch: boolean
  videoSize: number
  chunkSize: number
  totalChunkCount: number
}

/** Initialize a Direct Post via FILE_UPLOAD. Returns the publish_id (to check status) and the
 *  upload_url (valid 1h) to PUT the bytes to. Does NOT upload — the caller uploads next. */
export async function initTikTokDirectPost(
  accessToken: string,
  p: DirectPostInitParams,
): Promise<{ publishId: string; uploadUrl: string }> {
  const body = {
    post_info: {
      title: p.title,
      privacy_level: p.privacyLevel,
      disable_comment: p.disableComment,
      disable_duet: p.disableDuet,
      disable_stitch: p.disableStitch,
    },
    source_info: {
      source: "FILE_UPLOAD",
      video_size: p.videoSize,
      chunk_size: p.chunkSize,
      total_chunk_count: p.totalChunkCount,
    },
  }
  const res = await fetch(INIT_URL, { method: "POST", headers: JSON_HEADERS(accessToken), body: JSON.stringify(body) })
  const json = (await res.json()) as TikTokEnvelope<{ publish_id?: string; upload_url?: string }>
  assertOk(json, res, "init")
  const publishId = json.data?.publish_id
  const uploadUrl = json.data?.upload_url
  if (!publishId || !uploadUrl) throw new Error("tiktok init: missing publish_id/upload_url")
  return { publishId, uploadUrl }
}

/** Upload the whole video as a single chunk to the init-provided upload_url. TikTok requires the
 *  byte-range headers even for a single chunk. The upload_url is pre-authorized — no Bearer here. */
export async function uploadTikTokVideoSingleChunk(uploadUrl: string, bytes: ArrayBuffer): Promise<void> {
  const size = bytes.byteLength
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(size),
      "Content-Range": `bytes 0-${size - 1}/${size}`,
    },
    body: bytes,
  })
  if (!res.ok && res.status !== 201) {
    throw new Error(`tiktok upload failed: ${res.status}`)
  }
}

export type TikTokPostStatus = {
  status: "PROCESSING_UPLOAD" | "PROCESSING_DOWNLOAD" | "SEND_TO_USER_INBOX" | "PUBLISH_COMPLETE" | "FAILED" | string
  fail_reason?: string
  publicaly_available_post_id?: number[]
  uploaded_bytes?: number
}

/** Fetch the status of a Direct Post by publish_id. Used sparingly (a couple of checks), never a
 *  tight loop. */
export async function fetchTikTokPostStatus(accessToken: string, publishId: string): Promise<TikTokPostStatus> {
  const res = await fetch(STATUS_URL, {
    method: "POST",
    headers: JSON_HEADERS(accessToken),
    body: JSON.stringify({ publish_id: publishId }),
  })
  const json = (await res.json()) as TikTokEnvelope<TikTokPostStatus>
  assertOk(json, res, "status")
  if (!json.data) throw new Error("tiktok status: empty data")
  return json.data
}

/**
 * Validate a requested privacy/interaction selection against Creator Info + the unaudited-client
 * restriction. Returns the SAFE values to send to init, or throws with a clear reason. Pure so it
 * can be unit-tested without any network. `unaudited` forces SELF_ONLY (the only value TikTok will
 * accept from an unaudited Sandbox client).
 */
export function resolveDirectPostSelection(
  info: TikTokCreatorInfo,
  requested: { privacyLevel: TikTokPrivacyLevel; disableComment?: boolean; disableDuet?: boolean; disableStitch?: boolean },
  opts: { unaudited: boolean },
): { privacyLevel: TikTokPrivacyLevel; disableComment: boolean; disableDuet: boolean; disableStitch: boolean } {
  // Privacy must be one TikTok actually offered this creator.
  if (!info.privacy_level_options?.includes(requested.privacyLevel)) {
    throw new Error("privacy_level not offered by creator_info")
  }
  // Unaudited Sandbox clients can only post SELF_ONLY. Refuse anything else rather than let TikTok
  // reject it after the upload.
  if (opts.unaudited && requested.privacyLevel !== "SELF_ONLY") {
    throw new Error("unaudited_client_can_only_post_to_private_accounts")
  }
  // An interaction can only be ENABLED if the creator allows it (TikTok reports *_disabled). We can
  // always DISABLE. So a requested enable (disable=false) is invalid when the creator has it off.
  const disableComment = info.comment_disabled ? true : !!requested.disableComment
  const disableDuet = info.duet_disabled ? true : !!requested.disableDuet
  const disableStitch = info.stitch_disabled ? true : !!requested.disableStitch
  return { privacyLevel: requested.privacyLevel, disableComment, disableDuet, disableStitch }
}
