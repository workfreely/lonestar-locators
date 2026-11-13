import { ImageResponse } from "next/og"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { skylineDataUri } from "@/lib/clientShare/skyline"

// Link-preview image for the Social Beast authorization link (/authorize/instagram/*).
//
// WHY THIS FILE EXISTS. The subtree previously advertised og:image = the Locator Beast
// wordmark PNG — 1821×343, transparent, essentially a letterbox strip. It resolves 200, but a
// preview card wants something near 1.91:1 to fill, so iMessage rendered the bubble as plain
// grey text. The recommendation links look right because they ship a real 1200×630 image route;
// this is the same approach, in the same design family: the shared skyline, a dark scrim, and
// the product's own words.
//
// WHERE IT SITS, AND WHY THAT IS THE SECURITY PROPERTY. It is at the SUBTREE root, one level
// ABOVE [token]. A Next.js image route only receives the params of the segment it lives in, so
// this function is handed NOTHING — no token, no invitation id, no label, no owner. It cannot
// leak them because it never sees them, and there is no database read here to find them with.
// Every invitation link therefore unfurls to the same generic card.
//
// Node runtime: skylineDataUri() reads the bundled JPEG off disk. JPEG, not WebP, because
// Satori cannot decode WebP — see lib/clientShare/skyline.ts.
export const runtime = "nodejs"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"
export const alt = "Social Beast Auto Posting"

const WORDMARK = "public/locator-beast/locator-beast-white-logo-transparent.png"
// Native 1794×329; drawn at a third of that so it stays crisp in a ~300px-wide bubble.
const WORDMARK_W = 598
const WORDMARK_H = 110

async function wordmarkDataUri(): Promise<string | null> {
  try {
    const buf = await readFile(path.join(process.cwd(), WORDMARK))
    return `data:image/png;base64,${buf.toString("base64")}`
  } catch {
    // A missing asset must degrade to a readable card, never a broken image.
    return null
  }
}

export default async function OgImage() {
  const [bg, wordmark] = await Promise.all([skylineDataUri(), wordmarkDataUri()])
  return new ImageResponse(
    (
      <div style={{ position: "relative", display: "flex", width: "100%", height: "100%", background: "#061226" }}>
        {bg ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={bg} width={size.width} height={size.height} style={{ position: "absolute", top: 0, left: 0, objectFit: "cover" }} alt="" />
        ) : null}
        {/* Satori ignores the `inset` shorthand — the scrim MUST carry explicit width/height or
            it renders zero-sized and darkens nothing. */}
        <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", display: "flex", background: "rgba(6,18,38,0.74)" }} />

        <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: "100%", height: "100%", padding: "0 80px" }}>
          {wordmark ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={wordmark} width={WORDMARK_W} height={WORDMARK_H} alt="" />
          ) : (
            <div style={{ display: "flex", fontSize: 54, fontWeight: 700, color: "#fff" }}>Locator Beast</div>
          )}

          <div style={{ display: "flex", whiteSpace: "nowrap", marginTop: 42, fontSize: 76, fontWeight: 800, color: "#ffffff", letterSpacing: -1.5 }}>
            Social Beast Auto Posting
          </div>
          {/* The page's gold rule, as a plain block — Satori has no pseudo-elements. */}
          <div style={{ display: "flex", width: 104, height: 6, marginTop: 30, borderRadius: 6, background: "#f5a524" }} />
          <div style={{ display: "flex", whiteSpace: "nowrap", marginTop: 30, fontSize: 36, fontWeight: 500, color: "rgba(255,255,255,0.86)" }}>
            Connect your Instagram account to get started.
          </div>
        </div>
      </div>
    ),
    { ...size },
  )
}
