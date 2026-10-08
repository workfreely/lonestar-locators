// AVATAR SOURCE ASSETS — a size ceiling, and one allowlist instead of two.
//
// The homepage demo avatar was a 1254x1254 / 2.9 MB PNG for a circle rendered at 96-112px. The
// optimizer handled it, so the browser never downloaded it — but every deployment changes the
// `dpl` hash in the /_next/image URL, which invalidates the optimizer cache, so the first visitor
// after each deploy paid for a fresh transcode of a 2.9 MB file. That is the "sometimes slow on
// load" shape, and it is invisible in any warm-cache test.
//
// Run: npx tsx scripts/tests/avatarAssets.test.ts
import { readFileSync, statSync, existsSync } from "node:fs"
import path from "node:path"
import { canOptimizeImage, initialsOf } from "@/lib/images/canOptimize"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, x = "") => { if (c) { pass++; console.log(`  ✓ ${l}${x && "  " + x}`) } else { fail++; console.log(`  ✗ ${l}  ${x}`) } }
const read = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8")

console.log("demo avatar sources stay small:")
// 600 KB is generous for an avatar whose largest render box is 208px. It is a ceiling against
// another multi-megabyte original being dropped in, not a target.
const MAX = 600 * 1024
for (const f of ["public/demo/sarah-mitchell.png"]) {
  ok(`${f} exists`, existsSync(path.join(process.cwd(), f)))
  const bytes = statSync(path.join(process.cwd(), f)).size
  ok(`…and is under ${Math.round(MAX / 1024)} KB`, bytes < MAX, `${Math.round(bytes / 1024)} KB`)
}

console.log("\nthe demo avatar is a stable, same-origin, deterministic path:")
const demo = read("app/locator-beast/(site)/demo/_components/HomepageDemo.tsx")
const m = demo.match(/agentPhotoUrl:\s*"([^"]+)"/)
ok("HomepageDemo pins an explicit avatar URL", !!m, m?.[1])
ok("…which is same-origin (no cross-origin handshake on first paint)", !!m && m[1].startsWith("/"))
ok("…and therefore optimizable by next/image", canOptimizeImage(m?.[1]))
// The failure mode this guards: an avatar chosen at render time can differ between loads.
ok("…and is not generated per render", !/Math\.random|Date\.now|pravatar|randomuser|dicebear|ui-avatars/.test(demo))

console.log("\nthe avatar renders through the fixed component, not a bare <img>:")
const hero = read("app/smart-lead-form/_components/form/sections/Hero.tsx")
const agentPhoto = read("app/smart-lead-form/_components/form/sections/AgentPhoto.tsx")
ok("Hero delegates the photo to AgentPhoto", /<AgentPhoto\b/.test(hero))
ok("AgentPhoto uses next/image", /from "next\/image"/.test(agentPhoto) && /<Image\b/.test(agentPhoto))
ok("…eagerly, with an explicit high fetch priority", /priority/.test(agentPhoto) && /fetchPriority="high"/.test(agentPhoto))
ok("…with a sizes hint matching the rendered box", /sizes=\{size\.sizes\}/.test(agentPhoto))
// The grey disc that used to flash before the photo decoded.
ok("…and the photo container is UNPAINTED", !/bg-\[#[0-9a-f]{6}\][^\n]*\{agentPhotoUrl \?/.test(agentPhoto))

console.log("\nONE host allowlist, not two:")
const cfg = read("next.config.ts")
ok("next.config.ts allows res.cloudinary.com", /res\.cloudinary\.com/.test(cfg))
ok("next.config.ts allows *.supabase.co", /\*\.supabase\.co/.test(cfg))
// The drift this prevents: a host allowed in config but rejected by the code guard renders
// unoptimized forever; allowed by the guard but missing from config THROWS at render.
ok("every host the code guard accepts is in next.config.ts",
  canOptimizeImage("https://res.cloudinary.com/x/a.png") && /res\.cloudinary\.com/.test(cfg)
  && canOptimizeImage("https://abc.supabase.co/x/a.png") && /\*\.supabase\.co/.test(cfg))
ok("an unlisted host degrades instead of being optimized", !canOptimizeImage("https://p16-sign.tiktokcdn.com/a.jpeg"))
ok("a relative path is always optimizable", canOptimizeImage("/demo/sarah-mitchell.png"))
ok("null/garbage never reaches the optimizer", !canOptimizeImage(null) && !canOptimizeImage("not a url"))
ok("AgentPhoto imports the shared guard rather than redefining one",
  /canOptimizeImage/.test(agentPhoto) && !/function canOptimize\b/.test(agentPhoto))

console.log("\ninitials are a fallback, never a loading state:")
ok("initials only render when there is no url", /\{agentPhotoUrl \? \(/.test(agentPhoto))
ok("initialsOf handles a normal name", initialsOf("Sarah Mitchell") === "SM")
ok("…and an empty one without throwing", initialsOf(null) === "" && initialsOf("  ") === "")

console.log(`\nAvatar assets: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
