// A single Chromium kept WARM across jobs, with a hard guarantee that no page outlives its render.
//
// Reuse is worth ~3.3s of extraction + ~0.1s of launch per job, but a leaked page or a leaked
// browser-side cache is exactly what degraded the Vercel containers. So: the BROWSER is reused, the
// CONTEXT never is — each render gets a fresh context that is closed in a finally, which discards
// that render's cache, storage and any page state with it.
import { chromium } from "playwright-core"

let browser = null

export async function getBrowser() {
  if (browser?.isConnected()) return browser
  browser = await chromium.launch({
    headless: true,
    // --disable-dev-shm-usage is deliberate: the default /dev/shm in a container is small, and
    // Chromium silently falls back to disk when it overflows. Pointing it at a real temp dir is
    // what the Vercel failure taught us to be explicit about.
    args: ["--disable-dev-shm-usage", "--no-sandbox", "--disable-gpu", "--force-color-profile=srgb"],
  })
  browser.on("disconnected", () => { browser = null })
  return browser
}

/** Run `fn` with a throwaway context. The context is ALWAYS closed, success or failure. */
export async function withContext(viewport, fn) {
  const b = await getBrowser()
  const ctx = await b.newContext({ viewport, deviceScaleFactor: 1 })
  try {
    return await fn(ctx)
  } finally {
    await ctx.close().catch(() => {})
  }
}

export async function closeBrowser() {
  const b = browser
  browser = null
  await b?.close().catch(() => {})
}
