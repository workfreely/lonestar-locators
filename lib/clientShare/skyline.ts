import { readFile } from "node:fs/promises"
import path from "node:path"

/**
 * ONE skyline photograph, shared by the recommendation page hero and the Open
 * Graph link-preview image.
 *
 * Both surfaces read the SAME file so the client sees a picture in their
 * messages, taps it, and lands on that picture. Swapping the artwork is a
 * one-file replace — there is deliberately no second copy to keep in step.
 *
 * TO CHANGE THE ARTWORK: replace the file at SKYLINE_PATH. Nothing else needs
 * editing. It should be a generic upscale city skyline — never a recommended
 * property, and not market-specific, because one image serves every agent.
 */

/** Public URL, used by the page hero. */
// JPEG, not WebP, on purpose: next/og renders through Satori, which cannot
// decode WebP — an OG image built on a .webp fails at request time with an
// opaque "failed to pipe response". One format both surfaces can read keeps
// this a single-file swap.
// Declared in ./skylinePath so client components can import it without dragging node:fs in.
// Re-exported here so every existing `from "./skyline"` import keeps working unchanged.
export { SKYLINE_PATH } from "./skylinePath"
import { SKYLINE_PATH } from "./skylinePath"

/**
 * The same file as a data URI, for the OG image.
 *
 * next/og renders on the server with no page context, so a root-relative path
 * would not resolve; reading the bytes off disk avoids depending on a network
 * fetch that could fail silently inside someone's message thread.
 */
export async function skylineDataUri(): Promise<string | null> {
  try {
    const buf = await readFile(path.join(process.cwd(), "public", SKYLINE_PATH))
    return `data:image/jpeg;base64,${buf.toString("base64")}`
  } catch {
    // A missing asset must degrade to a plain branded card, never a broken image.
    return null
  }
}
