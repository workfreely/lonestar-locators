// Liveness: Chromium must be launchable and FFmpeg must be present. A worker that cannot do both is
// not degraded, it is useless — fail the healthcheck so ECS replaces the task.
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { getBrowser, closeBrowser } from "./browser.mjs"
const run = promisify(execFile)
try {
  await run("ffmpeg", ["-hide_banner", "-version"])
  const b = await getBrowser()
  if (!b.isConnected()) throw new Error("chromium not connected")
  await closeBrowser()
  process.exit(0)
} catch (e) {
  console.error("health failed:", String(e).slice(0, 300))
  process.exit(1)
}
