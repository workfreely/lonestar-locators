// MANUAL TIKTOK PUBLISHING — the file, the caption, and nothing pretending to be automated.
//
// TikTok's inbox upload needs the `video.upload` scope. We hold video.publish (Direct Post, still
// unapproved) and user.info.basic, so no API path is open. These three actions shorten the human
// path instead. The assertions below pin the two things that would make them harmful: inventing
// or mangling the approved caption, and implying a publish that never happened.
import { tiktokCaptionFor, tiktokDownloadName, canPublishManually, TIKTOK_UPLOAD_URL } from "@/lib/social/manualTikTok"

let pass = 0
let fail = 0
function ok(label: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`) }
}

console.log("\n1. THE CAPTION IS REUSED, NEVER REGENERATED:")
const approved = "This has too much aura 🔥\n\n🏡 Amenities\n• Floor-to-Ceiling Windows"
ok("the approved text is returned verbatim when there are no hashtags",
  tiktokCaptionFor({ caption: approved, hashtags: [] }) === approved)
ok("null caption with no tags yields empty, not 'null'",
  tiktokCaptionFor({ caption: null, hashtags: [] }) === "")
ok("emoji and newlines survive untouched",
  tiktokCaptionFor({ caption: approved, hashtags: null }).includes("🔥") &&
  tiktokCaptionFor({ caption: approved, hashtags: null }).includes("\n\n"))

console.log("\n2. HASHTAGS ARE APPENDED, AND NEVER DOUBLED:")
ok("saved tags are appended",
  tiktokCaptionFor({ caption: "Look at this", hashtags: ["sanantonio", "apartments"] })
    === "Look at this\n\n#sanantonio #apartments")
ok("a bare tag gains its #", tiktokCaptionFor({ caption: "x", hashtags: ["loft"] }).endsWith("#loft"))
ok("a tag already written with # is not doubled",
  !tiktokCaptionFor({ caption: "x", hashtags: ["#loft"] }).includes("##"))
ok("a tag ALREADY IN the caption is not appended again",
  tiktokCaptionFor({ caption: "Great loft #sanantonio", hashtags: ["sanantonio"] }) === "Great loft #sanantonio")
ok("…and a mixed set appends only what is missing",
  tiktokCaptionFor({ caption: "Great loft #sanantonio", hashtags: ["sanantonio", "tx"] })
    === "Great loft #sanantonio\n\n#tx")
ok("blank and whitespace tags are dropped",
  tiktokCaptionFor({ caption: "x", hashtags: ["", "   ", "ok"] }) === "x\n\n#ok")
ok("tags alone, with no caption, still work",
  tiktokCaptionFor({ caption: null, hashtags: ["tx"] }) === "#tx")

console.log("\n3. THE FILENAME IS FINDABLE:")
ok("property + template + version",
  tiktokDownloadName({ propertyName: "Los Cielos at Brooks", overlayTemplate: "aura", renderVersion: 3 })
    === "los-cielos-at-brooks-aura-v3.mp4")
ok("missing everything still yields a valid name",
  tiktokDownloadName({}) === "social-video-v1.mp4")
ok("punctuation is slugged, not dropped into the filename",
  !/[^a-z0-9.\-]/.test(tiktokDownloadName({ propertyName: "O'Brien & Co. #2", renderVersion: 1 })))
ok("it is always an .mp4", tiktokDownloadName({ propertyName: "x" }).endsWith(".mp4"))

console.log("\n4. THE ACTIONS APPEAR ONLY WITH A REAL RENDERED FILE:")
ok("a signed rendered URL ⇒ shown", canPublishManually({ renderedPreviewUrl: "https://x/y.mp4?token=1" }))
ok("null ⇒ hidden", !canPublishManually({ renderedPreviewUrl: null }))
ok("empty string ⇒ hidden", !canPublishManually({ renderedPreviewUrl: "" }))

console.log("\n5. NOTHING CLAIMS A PUBLISH, AND NOTHING NEEDS TIKTOK AUTH:")
{
  const src = require("node:fs").readFileSync("components/crm/social/SocialAutopilotClient.tsx", "utf8")
  const start = src.indexOf("function ManualTikTokActions")
  const body = src.slice(start, src.indexOf("\nfunction ", start + 10))
  ok("the component exists", start > 0)
  ok("it never writes a status", !/publishedAt|external_post_url|status:\s*"published"|markPublished/.test(body))
  ok("it never POSTs anything", !/method:\s*"POST"/.test(body))
  ok("it never touches a TikTok token or OAuth", !/token|oauth|access_token|video\.(upload|publish)/i.test(body))
  ok("it reuses the EXISTING signed URL rather than a new endpoint",
    /fetch\(post\.renderedPreviewUrl\)/.test(body) && !/\/api\/.*download/.test(body))
  ok("a non-OK response is handled, not saved as a video", /if \(!res\.ok\)/.test(body))
  // The expired branch is a ternary on the status code, so the literal setState("expired") never
  // appears. Assert the PROPERTY instead: 400/403 — what an expired signed URL answers with — is
  // distinguished from any other failure, and "expired" is what the operator is told.
  ok("an expired link is told apart from a generic failure",
    /res\.status === 400 \|\| res\.status === 403 \? "expired" : "error"/.test(body))
  ok("…and the expired message asks for a refresh",
    /state === "expired"/.test(body) && /expired\./.test(body))
  ok("an empty blob is rejected", /if \(!blob\.size\)/.test(body))
  ok("the upload link opens safely", /rel="noopener noreferrer"/.test(body))
  ok("the upload URL is TikTok's own", TIKTOK_UPLOAD_URL === "https://www.tiktok.com/upload")
}

console.log("\n6. NO UNFINISHED TIKTOK AUTOMATION IS TOUCHED:")
{
  const fs = require("node:fs")
  for (const f of ["lib/social/tiktokGate.ts", "lib/social/tiktokPublishSettings.ts", "lib/social/tiktokSibling.ts"]) {
    ok(`${f.split("/").pop()} is still uncommitted/untracked work, not imported here`,
      !fs.readFileSync("lib/social/manualTikTok.ts", "utf8").includes(f.replace("lib/social/", "").replace(".ts", "")))
  }
  ok("the helper calls no network at all", !/fetch\(|XMLHttpRequest/.test(fs.readFileSync("lib/social/manualTikTok.ts", "utf8")))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
