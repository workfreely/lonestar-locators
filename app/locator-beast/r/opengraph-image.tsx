import { ImageResponse } from "next/og"
import { skylineDataUri } from "@/lib/clientShare/skyline"

/**
 * The link preview for a texted recommendation link.
 *
 * SAME ARTWORK AS THE PAGE HERO — imported from one module, not redrawn — so the
 * client sees a picture in their messages, taps it, and lands on that same
 * picture. Two hand-maintained copies would drift the first time either moved.
 *
 * DELIBERATELY IDENTICAL FOR EVERY SHARE. The route is dynamic, but this ignores
 * params entirely: a preview is unfurled and cached by the messaging platform on
 * infrastructure we do not control, so nothing client-specific may appear — no
 * client name, no property names or photos, no token. It carries no agent name
 * and no product wordmark either; the attribution is the metadata description,
 * which each recipient's client renders fresh rather than caching into an image.
 *
 * It lives in the PARENT `r/` segment on purpose: a metadata file inside
 * `[token]/` produces a URL containing the share token, and that URL is emitted
 * in a public og:image tag.
 */

export const alt = "Your Apartment Recommendations"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default async function Image() {
  const skyline = await skylineDataUri()

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", position: "relative",
          backgroundColor: "#f7f4ef",
        }}
      >
        {skyline ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={skyline}
            alt=""
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : null}
        {/* Scrim. A flat colour rather than a gradient: Satori collapses an
            empty gradient-only box, which left the headline sitting on bare
            photograph and unreadable against lit windows. */}
        <div
          style={{
            position: "absolute", top: 0, left: 0, width: "1200px", height: "630px",
            backgroundColor: "rgba(10,20,40,0.58)",
          }}
        />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}>
          <div
            style={{
              fontSize: 26, fontWeight: 700, letterSpacing: 9, color: "#e8bf68",
              textTransform: "uppercase", display: "flex",
            }}
          >
            Your Apartment
          </div>
          <div
            style={{
              fontSize: 92, fontWeight: 700, color: "#ffffff", textAlign: "center",
              lineHeight: 1.05, marginTop: 10, display: "flex",
            }}
          >
            Recommendations
          </div>
          <div style={{ marginTop: 30, width: 130, height: 5, backgroundColor: "#e8bf68", borderRadius: 3 }} />
        </div>
      </div>
    ),
    { ...size },
  )
}
