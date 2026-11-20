// A STATIC RENDER OF THE REAL ACCOUNTS SCREEN, for review without signing in.
//
// Run:  npx tsx scripts/social/accountsPreview.tsx
// Out:  <scratch>/accounts-preview.html  (path printed on stdout)
//
// ── WHAT IS REAL HERE, AND WHAT IS NOT ──────────────────────────────────────────────────────
// REAL: the markup is PublishingDestinations itself, server-rendered — not a transcription. The
// older capabilityPreview had to copy the row markup by hand because the component is a client
// component holding useRouter; this stubs that ONE import instead, so the thing on screen is the
// component the product ships. The substitution is printed, and it is asserted to be the only
// difference between the file on disk and the file rendered.
// REAL: every capability, label, colour and status comes from the same functions the page calls.
// REAL: the data is this workspace's live account state, passed in the same shape the page builds.
// NOT REAL: no session, no fetches. Buttons render; nothing is wired.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { tmpdir } from "node:os"
import path from "node:path"
import { renderToStaticMarkup } from "react-dom/server"
import { createElement } from "react"
import { publishingCapability, autoReplyCapability } from "@/lib/social/accountCapabilities"
import { accountAutomationGate } from "@/lib/social/commentSafety"
import type { OwnerGroup } from "@/components/crm/social/PublishingDestinations"

const SRC = "components/crm/social/PublishingDestinations.tsx"
const out = process.argv[2] ?? path.join(tmpdir(), "accounts-preview.html")

// ── THE ONE SUBSTITUTION ────────────────────────────────────────────────────────────────────
// useRouter() throws outside an app-router request. Nothing else in the component needs a Next
// runtime, so the import is swapped for a no-op and the rest is rendered verbatim.
const original = readFileSync(SRC, "utf8")
const STUB_FROM = 'import { useRouter } from "next/navigation"'
const STUB_TO = 'const useRouter = () => ({ refresh: () => {} })'
if (!original.includes(STUB_FROM)) throw new Error(`accountsPreview: ${SRC} no longer imports useRouter the expected way`)
let patched = original.replace(STUB_FROM, STUB_TO)
let substitutions = 1
// Optional: open one card's Advanced panel. A static render cannot click, and the panel is where
// several of the controls live — so its initial state is seeded instead. Declared, like the other.
const openId = process.argv.find((a) => a.startsWith("--advanced="))?.slice("--advanced=".length)
if (openId) {
  const FROM = 'const [openAdvanced, setOpenAdvanced] = useState<string | null>(null)'
  if (!patched.includes(FROM)) throw new Error("accountsPreview: openAdvanced state no longer looks as expected")
  patched = patched.replace(FROM, `const [openAdvanced, setOpenAdvanced] = useState<string | null>(${JSON.stringify(openId)})`)
  substitutions++
}
// Optional: open the add sheet for one platform. Same reason as --advanced: the sheet is now
// rendered INSIDE a platform's section rather than once at the top of the page, and a static
// render cannot click the button that opens it. Two lines, so two more declared substitutions.
const addFor = process.argv.find((a) => a.startsWith("--add="))?.slice("--add=".length)
if (addFor) {
  if (addFor !== "instagram" && addFor !== "tiktok") throw new Error(`accountsPreview: --add= must be instagram or tiktok, got ${addFor}`)
  const ADDING_FROM = "const [adding, setAdding] = useState(false)"
  const PLATFORM_FROM = "const [addPlatform, setAddPlatform] = useState<Platform | null>(null)"
  for (const f of [ADDING_FROM, PLATFORM_FROM]) {
    if (!patched.includes(f)) throw new Error(`accountsPreview: add-flow state no longer looks as expected (${f})`)
  }
  patched = patched
    .replace(ADDING_FROM, "const [adding, setAdding] = useState(true)")
    .replace(PLATFORM_FROM, `const [addPlatform, setAddPlatform] = useState<Platform | null>(${JSON.stringify(addFor)})`)
  substitutions += 2
}
const diffLines = original.split("\n").filter((l, i) => l !== patched.split("\n")[i])
if (diffLines.length !== substitutions) throw new Error(`accountsPreview: expected ${substitutions} changed line(s), got ${diffLines.length}`)
console.log(`substituted (${substitutions} line${substitutions > 1 ? "s" : ""}): ${STUB_FROM}\n            → ${STUB_TO}${openId ? `\n            + openAdvanced seeded to ${openId}` : ""}${addFor ? `\n            + add sheet seeded open for ${addFor}` : ""}`)

// Inside the project: a shim in the system temp dir cannot resolve react, because Node resolves
// node_modules by walking up from the FILE. node_modules/.cache is already ignored by git.
const cacheRoot = path.join(process.cwd(), "node_modules/.cache")
mkdirSync(cacheRoot, { recursive: true })
const work = mkdtempSync(path.join(cacheRoot, "acctpreview-"))
const shimPath = path.join(work, "Component.tsx")
// The component imports via "@/..." aliases; rewritten to absolute paths so it resolves outside
// the Next build without touching tsconfig.
// The product compiles JSX with the automatic runtime (next.js sets it); tsx here uses the
// classic one, which needs React in scope. Prepending the import is the only other change, and it
// adds a binding rather than altering any of the component's own code.
writeFileSync(
  shimPath,
  `import React from "react"\n` + patched.replace(/from "@\//g, `from "${process.cwd()}/`),
)

type Props = { configured: boolean; tiktokConfigured?: boolean; groups: OwnerGroup[] }
async function loadComponent(): Promise<(p: Props) => JSX.Element> {
  return (await import(shimPath)).default
}

// ── THE LIVE RECORDS ────────────────────────────────────────────────────────────────────────
// Verified against production on 19 Nov 2026. Three connections (two Instagram, one TikTok),
// three live invitations, one owner and one agent. Nothing invented: an account with no handle is
// given none, and every capability is computed by the same gate the page calls.
const OWNER = "c567c077-d3f4-4532-8807-a54795f753f5"
const LISETTE = "27d7bde4-00f0-433c-b32b-b243623ad20a"

const groups: OwnerGroup[] = [
  {
    key: "owner",
    kind: "mine",
    name: "Jay Morris",
    photoUrl: null,
    instagram: [{
      id: "5ea0e810-f608-404d-8277-98169af785c9",
      username: "realestatepro_tx",
      label: "Jay Morris",
      agentUserId: OWNER,
      status: "connected",
      paused: false,
      postsPerDay: null,
      marketRestriction: null,
      expired: false,
      addedAt: "2026-09-12T06:12:37.614Z",
      agentName: "Jay Morris",
      agentPhotoUrl: null,
      // The master switch is PAUSED in production, so this is what the card really says today.
      publishing: publishingCapability({ connectionStatus: "connected", expired: false, destinationPaused: false, autoPosting: "paused" }),
      autoReply: autoReplyCapability(accountAutomationGate({
        settingsReadOk: true, globalEnabled: true, accountEnabled: true,
        activatedAt: "2026-10-18T21:07:24.142Z", permissionsOk: true,
      })),
      commentsScopeGranted: true,
    }, {
      // CONNECTED 19 NOV through the admin Add-account route, which is why it holds the comments
      // scope. posting_paused is true — new destinations start paused — so this card is the one
      // that shows Auto Posting and Auto Reply disagreeing, which is worth seeing in review.
      id: "671b758b-2135-45fe-9fda-22cb3e0b815d",
      username: "locatorbeast",
      label: null,
      agentUserId: OWNER,
      status: "connected",
      paused: true,
      postsPerDay: null,
      marketRestriction: null,
      expired: false,
      addedAt: "2026-11-19T16:14:38.904Z",
      agentName: "Jay Morris",
      agentPhotoUrl: null,
      publishing: publishingCapability({ connectionStatus: "connected", expired: false, destinationPaused: true, autoPosting: "paused" }),
      autoReply: autoReplyCapability(accountAutomationGate({
        settingsReadOk: true, globalEnabled: true, accountEnabled: true,
        activatedAt: "2026-11-19T16:48:12.361Z", permissionsOk: true,
      })),
      commentsScopeGranted: true,
    }],
    tiktok: [{
      id: "ebf475cf-cb0c-4c6b-8af2-99e89c84bc65",
      label: null,
      agentUserId: null,
      paused: false,
      // ── WHY THERE IS NO @HANDLE ON A TIKTOK CARD ──────────────────────────────────────────
      // `username` holds what TikTok CALLS a display name. The connect callback writes
      // user.display_name into it, and user.display_name is the only identity string the
      // user.info.basic scope returns. TikTok's real @handle is the separate `username` FIELD of
      // its user-info API, which sits behind the user.info.profile scope this app does not hold
      // and has never requested. So a TikTok card shows a display name where an Instagram card
      // shows an @handle — not an oversight in the card, an absence in the data.
      username: "Jay | TX Apartment Locator",
      status: "connected",
      avatarUrl: null,
      postsPerDay: null,
      ownerName: "Jay Morris",
      ownerPhotoUrl: null,
      // RE-AUTHORIZED 19 Nov: token_expires_at is 2026-11-20, so the card is no longer in the
      // reconnect state the previous fixture froze.
      expired: false,
      addedAt: "2026-09-20T01:06:33.720Z",
      marketRestriction: null,
    }, {
      // CONNECTED 19 Nov 17:56, once the account was added as a TikTok sandbox target user —
      // the second TikTok account the non_sandbox_target error had been refusing. New
      // destinations start paused, so this card shows Auto Posting off while the token is good.
      id: "1b5e4878-06b7-47ea-b9e2-73a11aa44e83",
      label: null,
      agentUserId: OWNER,
      paused: true,
      username: "Jay Morris | Dallas Locator",
      status: "connected",
      avatarUrl: null,
      postsPerDay: null,
      ownerName: "Jay Morris",
      ownerPhotoUrl: null,
      expired: false,
      addedAt: "2026-11-19T17:56:40.133Z",
      marketRestriction: null,
    }],
    invites: [
      {
        id: "8222108e-1e6d-4a86-9864-cfd6c6dcfc33",
        label: "Jay Morris",
        createdAt: "2026-11-13T16:37:05.505Z",
        expiresAt: "2026-11-20T16:37:05.439Z",
        agentUserId: OWNER,
        agentName: "Jay Morris",
        agentPhotoUrl: null,
      },
      {
        // agent_user_id IS NULL — the owner's own, and no account behind it yet.
        id: "f377ceee-44c7-43b5-9999-f4085302d9cc",
        label: "Locator Beast",
        createdAt: "2026-11-13T16:03:49.554Z",
        expiresAt: "2026-11-20T16:03:57.577Z",
        agentUserId: null,
        agentName: null,
        agentPhotoUrl: null,
      },
    ],
  },
  {
    key: LISETTE,
    kind: "team",
    name: "Lisette Hernandez",
    photoUrl: null,
    instagram: [],
    tiktok: [],
    invites: [{
      id: "eda60d05-3dd4-476a-9273-19fe23a38352",
      label: "Lisette Hernandez",
      createdAt: "2026-11-14T01:59:42.430Z",
      expiresAt: "2026-11-21T01:59:50.394Z",
      agentUserId: LISETTE,
      agentName: "Lisette Hernandez",
      agentPhotoUrl: null,
    }],
  },
]

async function main() {
  const PublishingDestinations = await loadComponent()
  const body = renderToStaticMarkup(
    createElement(PublishingDestinations, { configured: true, tiktokConfigured: true, groups }),
  )

  // ── THE STYLESHEET ──────────────────────────────────────────────────────────────────────────
  // Tailwind compiled against the rendered markup plus the component source, over app/globals.css
  // verbatim — so the CRM variables resolve exactly as they do in the product.
  const htmlForScan = path.join(work, "scan.html")
  writeFileSync(htmlForScan, body)
  const twConfig = path.join(work, "tw.config.js")
  writeFileSync(twConfig, `module.exports = { content: ["${htmlForScan}", "${process.cwd()}/${SRC}"], theme: { extend: {} }, plugins: [] }`)
  const cssOut = path.join(work, "tw.css")
  execFileSync("npx", ["tailwindcss", "-c", twConfig, "-i", "app/globals.css", "-o", cssOut, "--minify"], { stdio: "pipe" })
  const css = readFileSync(cssOut, "utf8")

  writeFileSync(out, `<!doctype html>
  <html lang="en" class="dark">
  <head><meta charset="utf-8"><title>Accounts — real render</title><style>${css}</style>
  <style>body{background:var(--crm-background);padding:24px;margin:0}.wrap{max-width:1000px;margin:0 auto}
  .flag{font:600 12px system-ui;color:var(--crm-text-muted);margin:0 0 14px}</style></head>
  <body><div class="wrap">
  <p class="flag">PublishingDestinations.tsx, server-rendered with this workspace's live account records — 19 Nov 2026. Buttons are inert.</p>
  ${body}
  </div></body></html>`)
  console.log(out)

}
void main()
