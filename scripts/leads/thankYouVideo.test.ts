// Thank-you video URL → YouTube embed resolution. Run:
//   npx tsx scripts/leads/thankYouVideo.test.ts
import { youtubeEmbedUrl } from "@/lib/smartForm/thankYouVideo"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }

const EMBED = "https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0"

console.log("Recognized YouTube shapes → embed URL (no autoplay, rel=0):")
ok("watch?v=", youtubeEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ") === EMBED)
ok("youtu.be/", youtubeEmbedUrl("https://youtu.be/dQw4w9WgXcQ") === EMBED)
ok("/embed/", youtubeEmbedUrl("https://www.youtube.com/embed/dQw4w9WgXcQ") === EMBED)
ok("/shorts/", youtubeEmbedUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ") === EMBED)
ok("watch with extra params", youtubeEmbedUrl("https://www.youtube.com/watch?feature=share&v=dQw4w9WgXcQ&t=10s") === EMBED)
ok("youtu.be with query", youtubeEmbedUrl("https://youtu.be/dQw4w9WgXcQ?si=abc") === EMBED)
ok("m.youtube / no scheme still matches host", youtubeEmbedUrl("youtube.com/watch?v=dQw4w9WgXcQ") === EMBED)
ok("surrounding whitespace trimmed", youtubeEmbedUrl("  https://youtu.be/dQw4w9WgXcQ  ") === EMBED)

console.log("\nNot a video → null (page shows the agent card, never a broken iframe):")
ok("empty string → null", youtubeEmbedUrl("") === null)
ok("null → null", youtubeEmbedUrl(null) === null)
ok("undefined → null", youtubeEmbedUrl(undefined) === null)
ok("non-YouTube URL → null", youtubeEmbedUrl("https://vimeo.com/12345") === null)
ok("random text → null", youtubeEmbedUrl("not a url") === null)
ok("youtube homepage (no id) → null", youtubeEmbedUrl("https://www.youtube.com") === null)

console.log("\nNo internal attribution is ever produced by this helper:")
ok("output is only a clean embed URL", (youtubeEmbedUrl("https://youtu.be/dQw4w9WgXcQ") ?? "").indexOf("utm_") === -1)

console.log(`\nThank-you video unit: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
