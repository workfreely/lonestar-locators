// Drive a renderPost implementation over every fixture and print what reached renderReel,
// what was signed, and what would have been written. Used twice: once against the committed
// renderer to make the golden file, once against the refactored one to prove they agree.
//
//   npx tsx scripts/social/_captureRenderArgs.ts <module-specifier> > out.json
import { calls, reset } from "@/scripts/social/_renderReelSpy"
import { posts, makeFakeSupabase, installFakeFetch, normalize, stripVolatile, type Write } from "@/scripts/social/_renderHarness"

async function main() {
  const spec = process.argv[2]
  if (!spec) throw new Error("usage: _captureRenderArgs <module-specifier>")
  const mod = (await import(spec)) as { renderPostToStorage: (a: Record<string, unknown>) => Promise<unknown> }
  installFakeFetch()

  const out: unknown[] = []
  for (const post of posts) {
    reset()
    const writes: Write[] = []
    const signed: string[] = []
    const supabase = makeFakeSupabase(post, writes, signed)
    let result: unknown
    try {
      result = await mod.renderPostToStorage({ supabase, id: post.id, userId: "00000000-0000-4000-8000-000000000001" })
    } catch (e) {
      result = { threw: (e as Error).message }
    }
    out.push({
      id: post.id,
      why: post.__why,
      result: normalize(result),
      renderReel: normalize(calls),
      signed: signed.map((s) => normalize(s)),
      writes: writes.map((w) => normalize(stripVolatile(w))),
    })
  }
  process.stdout.write(JSON.stringify(out, null, 1))
}

void main()
