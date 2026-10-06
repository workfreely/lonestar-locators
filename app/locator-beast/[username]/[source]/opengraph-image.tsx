// Link-preview image for the CLEAN BRANDED SOURCE URL (locatorbeast.com/{username}/tt).
//
// opengraph-image is a FILE-BASED metadata convention, not part of generateMetadata, and Next binds
// it to the segment it sits in — a nested segment does NOT inherit its parent's image. So when the
// branded /{source} route was added it resolved the shared publicFormMetadata() for title/og:title
// but emitted no og:image or twitter:image at all, and the iMessage preview degraded to a text-only
// card. (/{username}/opengraph-image served 200; /{username}/tt/opengraph-image 404'd.)
//
// THE IMPLEMENTATION IS NOT DUPLICATED — `default` is the parent generator, so the branded link
// renders the same per-agent image as the base link and the two cannot drift. The generator reads
// only `username` from params, which this nested segment also provides; the extra `source` param is
// unused.
//
// `runtime` and `dynamic` are declared LITERALLY rather than re-exported: Next statically parses
// route-segment config at compile time and rejects a re-export outright
// ("Next.js can't recognize the exported `dynamic` field in route. It mustn't be reexported."),
// which is why the one-line re-export form does not work here. They are kept identical to the
// parent's values on purpose — nodejs because the shared renderer uses sharp, force-dynamic so the
// preview reflects the agent's current theme/photo rather than a stale cached image.
//
// Deliberately nothing is changed in lib/og/previewImage (shared with the /r Recommendations
// preview) or in the Recommendations route itself.
import OgImage, { alt as parentAlt, contentType as parentContentType, size as parentSize } from "../opengraph-image"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const size = parentSize
export const contentType = parentContentType
export const alt = parentAlt
export default OgImage
