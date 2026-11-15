// A STAND-IN FOR THE RENDERER'S LAST MILE, used only by the Phase A equivalence check.
//
// renderReel is where every decision the resolver made becomes pixels. If the old code and the
// new code hand it byte-identical arguments, they produce byte-identical video — same ffmpeg,
// same inputs, same filter graph. So the equivalence test compares ARGUMENTS at that seam
// instead of rendering two MP4s and diffing them, which would need the real footage, a working
// ffmpeg, and several minutes per clip to prove the same thing less directly.
//
// Nothing here renders. makeWorkDir returns a fixed token so captured paths are stable.
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"

export type AudioChoice = "original" | "none" | "lb_track"

export const calls: Record<string, unknown>[] = []

export function reset() {
  calls.length = 0
}

/**
 * A REAL directory, because the renderer genuinely writes the downloaded source, voice and
 * avatar files into it and a fake path would fail at the first write — which would test the
 * harness rather than the renderer. `normalize` collapses the random segment so two runs on two
 * machines still compare.
 */
export async function makeWorkDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "social-render-"))
}

export async function renderReel(ffmpegPath: string, input: Record<string, unknown>): Promise<void> {
  // ffmpegPath is the binary's location on whichever machine runs this — not an input to the
  // video, and different on CI than here. Recorded as a presence flag only.
  calls.push({ __ffmpeg: typeof ffmpegPath === "string" && ffmpegPath.length > 0, ...input })
  // The real renderer leaves an MP4 at outputPath and the caller reads it back to upload. Write
  // a placeholder so the code after this point runs for real too — the upload call and the
  // post-state transitions are part of what this check compares.
  const out = input.outputPath
  if (typeof out === "string") await fs.writeFile(out, Buffer.from([0x00]))
}
