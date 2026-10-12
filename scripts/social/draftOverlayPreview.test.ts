/**
 * VIDEO LIBRARY — saved-draft overlay on the card.
 *
 * A card shows the raw source video until that source has a saved draft; then it
 * shows the same source video with the draft's overlay layered on top, using the
 * SHARED PreviewOverlay + computeOverlayLayout the editor and lightbox use.
 *
 * The risks worth testing are not "does it look right" — they are:
 *   • a SECOND rendering implementation appearing (this codebase lost a release
 *     to exactly that: BulkReview's hand-rolled overlay silently defeated a
 *     correct fix, which is why there is now one geometry path);
 *   • the library quietly triggering render jobs or touching the source video;
 *   • "existing" mode double-drawing text onto a video that already has it;
 *   • a re-saved draft not showing up.
 *
 * Run: npx tsx scripts/social/draftOverlayPreview.test.ts
 */
import { readFileSync } from "node:fs"
import path from "node:path"
import { computeOverlayLayout } from "@/lib/social/overlaySpec"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}${d ? `\n      ${d}` : ""}`) }
}
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")
const strip = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")

async function main() {
  console.log("\nVIDEO LIBRARY — SAVED DRAFT OVERLAY\n")

  const client = strip(read("components/crm/social/SocialAutopilotClient.tsx"))
  const route = strip(read("app/api/admin/social-autopilot/posts/route.ts"))
  const editor = strip(read("components/crm/social/PostEditor.tsx"))

  // Scope the negatives to the code under test. The library legitimately uploads
  // videos and legitimately carries budgetRange in its batch-metadata form, so a
  // file-wide "never uploads" / "never mentions budgetRange" assertion fails for
  // the wrong reason — it tests the whole screen, not this feature.
  const slice = (src: string, start: string, end: string) => {
    const i = src.indexOf(start)
    if (i < 0) return ""
    const j = src.indexOf(end, i + start.length)
    return j > i ? src.slice(i, j) : src.slice(i)
  }
  const derivation = slice(client, "function draftOverlayFor", "\nexport default function")
  const thumb = slice(client, "function Thumb(", "\nfunction ")

  console.log("THE DATA THE CARD NEEDS IS NOW ON /posts:")
  {
    ok("the list SELECT carries overlay_mode and overlay_template",
      /overlay_mode, overlay_template/.test(route))
    ok("…and they are returned to the client",
      /overlayMode: r\.overlay_mode/.test(route) && /overlayTemplate: r\.overlay_template/.test(route))
    ok("headline + subheadline were already returned",
      /overlayHeadline: r\.overlay_headline/.test(route) && /overlaySubheadline: r\.overlay_subheadline/.test(route))
    // Two /posts calls pre-existed this change (the rollup on load, and post
    // creation). The claim is that the overlay added NEITHER a third nor any
    // fetch of its own — it reads the rollup it is handed.
    ok("no fetch was added — there are still exactly 2 /posts calls",
      (client.match(/fetch\("\/api\/admin\/social-autopilot\/posts"/g) ?? []).length === 2)
    ok("…and the overlay derivation fetches nothing",
      derivation.length > 0 && !/fetch\(/.test(derivation))
    ok("…nor does the card component", thumb.length > 0 && !/fetch\(/.test(thumb))
    ok("…and no per-card request of any kind",
      !/fetch\([^)]*\$\{[^)]*\}\/render/.test(client))
  }

  console.log("\nONE RENDERING PATH — no second implementation:")
  {
    ok("the card uses the SHARED PreviewOverlay component",
      /import PreviewOverlay from "@\/components\/crm\/social\/PreviewOverlay"/.test(client) &&
      /<PreviewOverlay layout=\{card\.draftOverlay\} \/>/.test(client))
    ok("…and the SHARED geometry function",
      /import \{ computeOverlayLayout/.test(client) && /computeOverlayLayout\(tpl, headline/.test(client))
    // The decisive negative: no hand-rolled geometry like the one that cost a release.
    ok("it hand-rolls no geometry of its own",
      !/wrapHeadline|overlayPreviewStyle|fontSize: 66|canvas|getContext/.test(client))
    ok("the derivation mirrors the editor's expression",
      /overlayMode === "existing"/.test(client) && /overlayMode === "existing"/.test(editor))
  }

  console.log("\nNO RENDERING WORK IS TRIGGERED BY THE LIBRARY:")
  {
    ok("the library never calls the render route", !/\/render/.test(client))
    // RELAXED 2026-10-08. This asserted the library never so much as mentions renderedPreviewUrl.
    // The Rendered/Ready tab legitimately DISPLAYS the finished video via the signed URL the posts
    // API already returns — that is showing an existing artifact, not doing rendering work, which
    // is what this block is actually about. The real invariants (no render route call, no ffmpeg,
    // no client-side frame grabbing) are asserted on either side of this and still hold.
    ok("…never TRIGGERS a render to get one", !/\/render/.test(client))
    ok("…and never mentions ffmpeg or thumbnails",
      !/ffmpeg|thumbnail|poster|toDataURL/.test(client))
    // The render route must still have exactly ONE caller: the Preview Video button.
    const callers = ["components/crm/social/PostEditor.tsx", "components/crm/social/SocialAutopilotClient.tsx",
      "components/crm/social/QueueClient.tsx", "components/crm/social/BulkReview.tsx"]
      .filter((f) => /\/render"|\/render`/.test(strip(read(f))))
    ok("the render route still has exactly one caller (PostEditor's Preview Video)",
      callers.length === 1 && callers[0]!.endsWith("PostEditor.tsx"),
      `callers: ${JSON.stringify(callers)}`)
  }

  console.log("\nTHE SOURCE VIDEO IS UNTOUCHED:")
  {
    ok("the card still plays the source previewUrl",
      /src=\{card\.previewUrl\}/.test(client))
    ok("the overlay is a sibling element, not a video transform",
      /<PreviewOverlay/.test(client) && !/filter:|drawImage|MediaRecorder/.test(client))
    // The library's own Upload Videos flow still uploads, untouched — and since 2026-10-12 the
    // library thumbnail writes a second object beside it. NAMING the two permitted writes is
    // stronger than counting them: a third one, or either of these being repointed, fails here.
    // Neither has anything to do with the draft-overlay preview, which still writes nothing.
    {
      const writes = [...client.matchAll(/\.from\("social-media"\)\.upload\(([\s\S]*?),\s*[\w.]+\s*,\s*\{/g)].map((m) => m[1].trim())
      ok(`exactly three storage writes, all named: ${JSON.stringify(writes)}`,
        writes.length === 3
        && writes.some((w) => w === "path")                                        // the source master
        && writes.some((w) => /thumbStoragePath\(userId, uf\.contentId\)/.test(w)) // thumbnail, at upload
        && writes.some((w) => /thumbStoragePath\(user\.id, it\.id\)/.test(w)))     // thumbnail, recovery pass
    }
    ok("…the overlay derivation writes nothing", !/\.upload\(|storage\./.test(derivation))
    ok("…and the card component writes nothing", !/\.upload\(|storage\./.test(thumb))
    ok("no snake_case overlay column is written from the client",
      !/overlay_headline|overlay_template|overlay_mode/.test(client))
  }

  console.log("\nWHEN THE OVERLAY IS AND IS NOT DRAWN:")
  {
    ok("no draft → null (raw video, exactly as before)",
      /if \(!posts \|\| posts\.length === 0\) return null/.test(client))
    ok("'existing' mode → null (the video already has burned-in text)",
      /if \(newest\.overlayMode === "existing"\) return null/.test(client))
    ok("a draft with no headline yet → null",
      /if \(!headline\) return null/.test(client))
    ok("demo cards never get an overlay", /draftOverlay: null/.test(client))
    ok("an unknown template falls back to the default, like the editor does",
      /OVERLAY_TEMPLATES as readonly string\[\]\)\.includes/.test(client) &&
      /OVERLAY_TEMPLATES as readonly string\[\]\)\.includes/.test(editor))
  }

  console.log("\nRE-SAVING A DRAFT UPDATES THE CARD:")
  {
    ok("the newest draft by updated_at wins",
      /sort\(\s*\(a, b\) => \(Date\.parse\(b\.updatedAt \?\? ""\) \|\| 0\) - \(Date\.parse\(a\.updatedAt \?\? ""\) \|\| 0\)/.test(client))
    // Without postsBySource in the deps the card model would keep a stale overlay.
    ok("the card memo recomputes when the post rollup changes",
      /\}, \[items, usingDemo, postsBySource\]\)/.test(client))
  }

  console.log("\nPRICING COMES FROM THE PERSISTED DETAIL LINE:")
  {
    // Save Draft composes the detail (market/type/special/budget) and stores it in
    // overlay_subheadline, so the card needs no access to budget_range.
    ok("the editor persists the composed detail into overlaySubheadline",
      /overlaySubheadline: overlayMode === "generate" \? buildTemplateDetail\(/.test(editor))
    ok("…and the card passes that stored value straight through",
      /newest\.overlaySubheadline \?\? ""/.test(client))
    ok("the derivation never recomputes the detail line",
      derivation.length > 0 && !/buildTemplateDetail|budgetRange/.test(derivation))
    ok("…and the client never imports the detail builder",
      !/import[^\n]*buildTemplateDetail/.test(client))
  }

  console.log("\nTHE SHARED GEOMETRY ACTUALLY PRODUCES AN OVERLAY (real call):")
  {
    const layout = computeOverlayLayout("market_type", "SAN ANTONIO APARTMENTS", "Starting at $1,200")
    ok("a headline block is produced", !!layout?.headline && layout.headline.lines.length > 0)
    ok("…and the detail line survives into it",
      JSON.stringify(layout.detail ?? {}).includes("1,200"))
    const empty = computeOverlayLayout("market_type", "HEADLINE ONLY", "")
    ok("an empty detail still yields a valid headline-only layout",
      !!empty?.headline && empty.headline.lines.length > 0)
  }

  console.log("\nPERFORMANCE — nothing new per card:")
  {
    ok("no new video element is introduced", (client.match(/<video/g) ?? []).length === 1)
    ok("the overlay is pointer-events-none so controls stay clickable",
      /pointer-events-none/.test(read("components/crm/social/PreviewOverlay.tsx")))
    ok("no new signed-URL call in the client", !/createSignedUrl/.test(client))
    ok("the overlay is computed in the existing card memo, not per render",
      /draftOverlay: draftOverlayFor\(postsBySource\[it\.id\]\)/.test(client))
  }

  console.log(`\n${pass} passed, ${fail} failed\n`)
  if (fail > 0) process.exit(1)
}

void main()
