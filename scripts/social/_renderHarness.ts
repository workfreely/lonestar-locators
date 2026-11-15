// THE FAKE WORLD the renderer runs in for the Phase A equivalence check.
//
// A Supabase stand-in that answers from JSON fixtures taken from production (anonymised), and a
// fetch stand-in that returns a few bytes for any signed URL. Between them the renderer can be
// driven end to end without touching the network, the database, or a single stored file — which
// is what makes it safe to run this against the real post shapes.
//
// WRITES ARE RECORDED, NEVER PERFORMED. The renderer updates social_posts four times and uploads
// an artifact; here each of those lands in `writes` so the test can assert the post-state
// transitions are unchanged too, not just the render arguments.
import { readFileSync } from "node:fs"
import path from "node:path"

export type FixturePost = Record<string, unknown> & { id: string; content_storage_path: string | null }
export type FixtureVoice = { id: string; storage_path: string | null; normalized_storage_path: string | null }

const FIX = path.join(process.cwd(), "scripts/social/fixtures")
export const posts = JSON.parse(readFileSync(path.join(FIX, "renderPosts.fixture.json"), "utf8")) as FixturePost[]
export const voiceClips = JSON.parse(readFileSync(path.join(FIX, "renderVoiceClips.fixture.json"), "utf8")) as FixtureVoice[]

export type Write = { table: string; op: string; patch?: Record<string, unknown>; eq: Record<string, unknown> }

/**
 * The renderer reads a post with a join, reads voice clips by id, signs storage paths, uploads
 * one artifact and updates the post. This answers all of it from the fixtures.
 *
 * Deliberately NOT a general Supabase mock — it implements exactly the call shapes renderPost
 * uses. A call shape it does not know throws rather than returning empty, so a refactor that
 * starts querying something new fails loudly here instead of silently reading null.
 */
export function makeFakeSupabase(post: FixturePost, writes: Write[], signed: string[]) {
  const voiceById = new Map(voiceClips.map((v) => [v.id, v]))

  const builder = (table: string) => {
    const state: { op: string; patch?: Record<string, unknown>; eq: Record<string, unknown> } = { op: "select", eq: {} }
    const q: Record<string, unknown> = {
      select: () => q,
      update: (patch: Record<string, unknown>) => {
        state.op = "update"
        state.patch = patch
        return q
      },
      // Phase B: the renderer records each artifact as a social_renders row. Terminal on its own
      // — there is no .eq() after it — so the write is recorded here.
      upsert: (patch: Record<string, unknown>, opts?: Record<string, unknown>) => {
        state.op = "upsert"
        state.patch = patch
        writes.push({ table, op: "upsert", patch: { ...patch, __onConflict: opts?.onConflict ?? null }, eq: {} })
        return q
      },
      eq: (col: string, val: unknown) => {
        state.eq[col] = val
        // An update is terminal on its last .eq() — the renderer never awaits a separate step.
        if (state.op === "update") writes.push({ table, op: "update", patch: state.patch, eq: { ...state.eq } })
        return q
      },
      maybeSingle: async () => {
        if (table === "social_renders") {
          // A stable id, so the captured post update compares across runs.
          return { data: { id: "00000000-0000-4000-8000-00000000render" }, error: null }
        }
        if (table === "social_posts") {
          // The join the renderer asks for, assembled the way PostgREST would return it.
          return { data: { ...post, source: post.content_storage_path ? { storage_path: post.content_storage_path } : null }, error: null }
        }
        if (table === "social_voice_clips") {
          const v = voiceById.get(String(state.eq.id))
          return { data: v ? { storage_path: v.storage_path, normalized_storage_path: v.normalized_storage_path } : null, error: null }
        }
        throw new Error(`fake supabase: unexpected maybeSingle on ${table}`)
      },
      // An update with .eq() is awaited directly rather than via maybeSingle.
      then: (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null }),
    }
    return q
  }

  return {
    from: (table: string) => builder(table),
    storage: {
      from: () => ({
        createSignedUrl: async (p: string) => {
          signed.push(p)
          return { data: { signedUrl: `https://fake.invalid/${encodeURIComponent(p)}` }, error: null }
        },
        upload: async (p: string, _bytes: unknown, opts: Record<string, unknown>) => {
          writes.push({ table: "storage", op: "upload", patch: { path: p, ...opts }, eq: {} })
          return { error: null }
        },
      }),
    },
  }
}

/** Every signed URL resolves to the same few bytes. Content never reaches renderReel — only paths do. */
export function installFakeFetch() {
  ;(globalThis as unknown as { fetch: unknown }).fetch = async (url: string) => ({
    ok: true,
    status: 200,
    arrayBuffer: async () => new Uint8Array([0x00, 0x01, 0x02, 0x03]).buffer,
    url,
  })
}

/** Work-dir prefixes differ per run and per machine; collapse them so two captures compare. */
export function normalize(v: unknown): unknown {
  if (typeof v === "string") {
    // The work dir appears both as a prefix on downloaded files AND bare, as renderReel's
    // workDir argument. Collapse both, or every row differs on a temp path that says nothing.
    return v
      .replace(/^.*\/social-render-[^/]+\//, "<WORK>/")
      .replace(/^.*\/social-render-[^/]+$/, "<WORK>")
  }
  if (Array.isArray(v)) return v.map(normalize)
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(v as Record<string, unknown>).sort()) out[k] = normalize((v as Record<string, unknown>)[k])
    return out
  }
  return v
}

/** Timestamps move every run and say nothing about the render. */
export function stripVolatile(w: Write): Write {
  if (!w.patch) return w
  const patch = { ...w.patch }
  delete patch.updated_at
  return { ...w, patch }
}
