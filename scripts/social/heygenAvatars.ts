// FREE. Lists HeyGen stock avatar looks so a real shortlist can be made from the account's own
// library rather than guessed from a marketing gallery. Spends nothing — listing is not billed.
//
// Writes an HTML contact sheet of the previews, because the one property that decides whether an
// avatar is usable here — waist-up vs head-and-shoulders framing — is reported by NO API field.
// It has to be looked at.
//
// Run: HEYGEN_API_KEY=... node --import tsx scripts/social/heygenAvatars.ts [outDir]
import { writeFileSync } from "node:fs"
import path from "node:path"
import { listAvatarLooks, type HeyGenAvatarLook } from "@/lib/social/heygen"

const outDir = process.argv[2] ?? process.cwd()

async function main() {
  const all: HeyGenAvatarLook[] = []
  let token: string | null = null
  // Cap the paging: a shortlist needs a few screens, not the entire library.
  for (let page = 0; page < 6; page++) {
    const res: { looks: HeyGenAvatarLook[]; nextToken: string | null } =
      await listAvatarLooks({ avatarType: "studio_avatar", ownership: "public", limit: 50, token: token ?? undefined })
    all.push(...res.looks)
    token = res.nextToken
    if (!token) break
  }
  const usable = all.filter((a) => a.status === null || a.status === "completed")
  console.log(`fetched ${all.length} public studio avatar looks (${usable.length} usable)`)
  const portrait = usable.filter((a) => a.preferredOrientation === "portrait")
  console.log(`  portrait-oriented: ${portrait.length}`)
  console.log(`  with an Avatar IV engine: ${usable.filter((a) => a.supportedEngines.includes("avatar_iv")).length}`)

  writeFileSync(path.join(outDir, "heygen-avatars.json"), JSON.stringify(usable, null, 2))

  // Contact sheet — framing is only judgeable by eye.
  const cards = usable.map((a) => `
    <figure>
      ${a.previewImageUrl ? `<img src="${a.previewImageUrl}" loading="lazy" alt="">` : `<div class="noimg">no preview</div>`}
      <figcaption>
        <b>${escapeHtml(a.name)}</b>
        <span>${a.gender ?? "—"} · ${a.preferredOrientation ?? "—"}</span>
        <span>${a.supportedEngines.join(", ") || "no engines listed"}</span>
        <code>${a.id}</code>
      </figcaption>
    </figure>`).join("")
  writeFileSync(path.join(outDir, "heygen-avatars.html"), `<!doctype html><meta charset="utf-8">
<title>HeyGen public studio avatars</title>
<style>
 body{background:#11131a;color:#e7eaf0;font:13px/1.4 system-ui,sans-serif;margin:0;padding:20px}
 h1{font-size:15px;font-weight:600;margin:0 0 14px}
 .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:14px}
 figure{margin:0;background:#1a1d26;border:1px solid #2a2f3b;border-radius:10px;overflow:hidden}
 img{width:100%;aspect-ratio:3/4;object-fit:cover;display:block;background:#0c0e13}
 .noimg{aspect-ratio:3/4;display:grid;place-items:center;color:#6b7280}
 figcaption{padding:8px 9px;display:flex;flex-direction:column;gap:2px}
 figcaption b{font-size:12.5px}
 figcaption span{color:#9aa4b2;font-size:11px}
 code{color:#7dd3a8;font-size:9.5px;word-break:break-all}
</style>
<h1>HeyGen public studio avatars — ${usable.length} looks. Pick by FRAMING: waist-up, natural clothing.</h1>
<div class="grid">${cards}</div>`)
  console.log(`\nwrote heygen-avatars.html and .json to ${outDir}`)
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!))
}

main().catch((e) => { console.error("FAILED:", e instanceof Error ? e.message : e); process.exit(1) })
