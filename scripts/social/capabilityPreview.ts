// Generates a STATIC visual preview of the two capability lines, for review without signing in.
//
// Run:  npx tsx scripts/social/capabilityPreview.ts
// Out:  /tmp/social-beast-accounts-preview.html
//
// ── WHAT IS REAL HERE, AND WHAT IS NOT ──────────────────────────────────────────────────────
// REAL: every label, detail sentence, pill colour and state comes from publishingCapability /
// autoReplyCapability / accountAutomationGate — the same functions the page calls. Change the
// logic and this preview changes with it.
// REAL: the stylesheet is app/globals.css verbatim, so the CRM colour variables resolve exactly as
// they do in the product.
// A COPY: the surrounding row markup is transcribed from PublishingDestinations.tsx rather than
// rendered by React, because that component is a client component holding useRouter and cannot be
// server-rendered outside a Next request. So this previews the STATES and the COPY faithfully; it
// is not a screenshot of the live page.
import { readFileSync, writeFileSync } from "node:fs"
import { publishingCapability, autoReplyCapability, CAPABILITY_TONE, CAPABILITY_DOT, REAUTHORIZE_COMMENTS_LABEL, REAUTHORIZE_COMMENTS_TITLE, type Capability, type CapabilityState } from "@/lib/social/accountCapabilities"
import { accountAutomationGate } from "@/lib/social/commentSafety"

const css = readFileSync("app/globals.css", "utf8")

// Tailwind's own palette values, keyed by the class the component actually renders. The mapping
// below is a RENDERING of CAPABILITY_TONE / CAPABILITY_DOT, not a second opinion about colour: if
// a state's class changes and this table has no entry for it, the preview fails loudly rather than
// quietly showing the wrong swatch.
const HEX: Record<string, string> = {
  "emerald-600": "#059669", "emerald-500": "#10b981",
  "sky-600": "#0284c7",     "sky-500": "#0ea5e9",
  "yellow-600": "#ca8a04",  "yellow-500": "#eab308",
  "orange-600": "#ea580c",  "orange-500": "#f97316",
  "amber-600": "#d97706",   "amber-500": "#f59e0b",
}
const shade = (cls: string, prefix: string): string => {
  const m = cls.match(new RegExp(`${prefix}-([a-z]+-\\d{3})`))
  const hex = m ? HEX[m[1]] : undefined
  if (!hex) throw new Error(`capabilityPreview: no hex for "${cls}" — add it to HEX so the preview stays truthful`)
  return hex
}
const tone = (s: CapabilityState) => shade(CAPABILITY_TONE[s], "text")
const dotBg = (s: CapabilityState) => shade(CAPABILITY_DOT[s], "bg")

const capRow = (name: string, cap: Capability, actions = "") => `
  <div class="cap">
    <div class="caphead">
      <div style="min-width:0">
        <div class="capname">${name}</div>
        <div class="capdetail">${cap.detail}</div>
      </div>
      <span class="badge" style="color:${tone(cap.state)}">
        <i class="dot" style="background:${dotBg(cap.state)}"></i> ${cap.badge}
      </span>
    </div>
    ${actions ? `<div class="capactions">${actions}</div>` : ""}
  </div>`

const gate = (over: Partial<Parameters<typeof accountAutomationGate>[0]> = {}) =>
  accountAutomationGate({
    settingsReadOk: true, globalEnabled: true, accountEnabled: true,
    activatedAt: "2026-10-18T00:00:00Z", permissionsOk: true, ...over,
  })

const reauth = `<a class="btn grow" title="${REAUTHORIZE_COMMENTS_TITLE}">${REAUTHORIZE_COMMENTS_LABEL}</a>`
const manage = `<a class="btn grow">Manage in Comments</a>`

/** One account row, exactly as the component lays it out. */
const row = (caption: string, publishing: Capability, autoReply: Capability, scopeGranted: boolean) => `
<section class="panel">
  <div class="caption">${caption}</div>
  <div class="dest">
    <div class="destmain">
      <div class="av">JM</div>
      <div style="min-width:0">
        <div class="idline">
          <span class="who">Jay Morris</span>
          <span class="ig">IG</span>
          <span class="pill ${publishing.state === "attention" ? "amber" : "green"}">
            <i class="dot" style="background:${publishing.state === "attention" ? "#f59e0b" : "#10b981"}"></i>
            ${publishing.state === "attention" ? "Reconnect needed" : "Connected"}
          </span>
        </div>
        <div class="sub">@realestatepro_tx · Added 12 Sep 2026</div>
      </div>
    </div>
    <div class="destbtns">
      <a class="btn" title="${REAUTHORIZE_COMMENTS_TITLE}">Reconnect</a>
      <button class="btn">Pause</button>
      <button class="btn">Rename</button>
      <button class="btn">Disconnect</button>
    </div>
    <div class="caps">
      ${capRow("Instagram Publishing", publishing)}
      ${capRow("Instagram Auto Reply", autoReply, `${scopeGranted && autoReply.state !== "attention" ? "" : reauth}${manage}`)}
    </div>
  </div>
</section>`

const LIVE_PUBLISHING = publishingCapability({
  connectionStatus: "connected", expired: false, destinationPaused: false, autoPosting: "paused",
})

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Accounts Capability Preview</title>
<style>${css}</style>
<style>
  body { background: var(--crm-bg, #f6f7f9); font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; margin:0; padding:28px 18px 56px; }
  .wrap { max-width: 860px; margin: 0 auto; }
  h1 { font-size:17px; margin:0 0 4px; color:var(--crm-text-primary,#111); }
  .lede { font-size:12.5px; color:var(--crm-text-muted,#6b7280); margin:0 0 22px; }
  .caption { font-size:11px; font-weight:700; letter-spacing:.04em; text-transform:uppercase; color:var(--crm-text-muted,#6b7280); margin-bottom:8px; }
  .panel { background:var(--crm-panel,#fff); border:1px solid var(--crm-border,#e5e7eb); border-radius:16px; padding:16px; margin-bottom:14px; }
  .dest { background:var(--crm-card,#fff); border:1px solid var(--crm-border,#e5e7eb); border-radius:12px; padding:10px 12px; display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:12px; }
  .destmain { display:flex; align-items:center; gap:10px; min-width:0; }
  .av { width:32px;height:32px;border-radius:999px;background:#111;color:#fff;display:grid;place-items:center;font-size:11px;font-weight:700;flex:none; }
  .idline { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
  .who { font-size:13.5px; font-weight:600; color:var(--crm-text-primary,#111); }
  .ig { font-size:9px; font-weight:700; border:1px solid var(--crm-border,#e5e7eb); border-radius:4px; padding:1px 3px; color:var(--crm-text-muted,#6b7280); }
  .sub { font-size:11.5px; color:var(--crm-text-muted,#6b7280); margin-top:2px; }
  .pill { font-size:11.5px; font-weight:600; display:inline-flex; align-items:center; gap:6px; }
  .pill.green { color:#059669; } .pill.amber { color:#d97706; }
  .dot { width:6px;height:6px;border-radius:999px;display:inline-block; }
  .destbtns { display:flex; gap:6px; flex-wrap:wrap; }
  .btn { font-size:12.5px; font-weight:600; padding:5px 10px; border-radius:8px; border:1px solid var(--crm-border,#e5e7eb); background:var(--crm-panel,#fff); color:var(--crm-text-primary,#111); cursor:pointer; text-decoration:none; }
  .caps { flex-basis:100%; width:100%; margin-top:4px; }
  .cap { padding:9px 0; border-top:1px solid var(--crm-border,#e5e7eb); }
  .caphead { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
  .capname { font-size:12.5px; font-weight:600; color:var(--crm-text-primary,#111); }
  .capdetail { font-size:11.5px; color:var(--crm-text-muted,#6b7280); margin-top:2px; }
  .badge { flex:none; font-size:11px; font-weight:600; display:inline-flex; align-items:center; gap:6px; border:1px solid var(--crm-border,#e5e7eb); border-radius:999px; padding:3px 8px; }
  .capactions { display:flex; gap:8px; flex-wrap:wrap; margin-top:8px; }
  .btn.grow { flex:1 1 0; text-align:center; }
  .legend { display:flex; gap:14px; flex-wrap:wrap; margin:0 0 18px; padding:10px 12px; background:var(--crm-panel,#fff); border:1px solid var(--crm-border,#e5e7eb); border-radius:10px; }
  .swatch { font-size:11.5px; font-weight:600; display:inline-flex; align-items:center; gap:6px; }
  .note { font-size:12px; color:var(--crm-text-secondary,#4b5563); background:var(--crm-panel,#fff); border:1px solid var(--crm-border,#e5e7eb); border-left:3px solid #f59e0b; border-radius:8px; padding:10px 12px; margin:0 0 22px; }
</style></head>
<body><div class="wrap">
<h1>Social Beast → Accounts: the two capability lines</h1>
<div class="legend">
  ${(["active","paused","disabled","permission_needed","attention"] as CapabilityState[]).map((st) => `
    <span class="swatch" style="color:${tone(st)}"><i class="dot" style="background:${dotBg(st)}"></i> ${st.replace(/_/g," ")}</span>`).join("")}
</div>
<p class="lede">Every label, sentence and colour below is produced by the real
<code>publishingCapability</code> / <code>autoReplyCapability</code> / <code>accountAutomationGate</code>
functions. The surrounding row markup is transcribed from the component.</p>

<p class="note"><strong>This is today's actual production state.</strong> The account is connected,
but <code>auto_posting</code> is <code>paused</code> and the comments scope is not granted — so
neither capability reads as active, which is the point of the change.</p>

${row("① Today: connected, publishing paused, permission missing",
  LIVE_PUBLISHING,
  autoReplyCapability(gate({ permissionsOk: false })),
  false)}

${row("② After you authorize: permission granted, auto reply still off",
  LIVE_PUBLISHING,
  autoReplyCapability(gate({ globalEnabled: false, accountEnabled: false })),
  true)}

${row("③ Auto reply enabled, publishing still paused",
  LIVE_PUBLISHING,
  autoReplyCapability(gate()),
  true)}

${row("④ Everything on",
  publishingCapability({ connectionStatus: "connected", expired: false, destinationPaused: false, autoPosting: "on" }),
  autoReplyCapability(gate()),
  true)}

${row("⑤ This destination paused, while the master switch is on",
  publishingCapability({ connectionStatus: "connected", expired: false, destinationPaused: true, autoPosting: "on" }),
  autoReplyCapability(gate()),
  true)}

${row("⑥ Attention: unconfirmed sends and a stuck message claim",
  LIVE_PUBLISHING,
  autoReplyCapability(gate(), { unresolvedActions: 2, danglingClaims: 1 }),
  true)}

${row("⑦ Attention: the automation settings could not be read",
  LIVE_PUBLISHING,
  autoReplyCapability(gate({ settingsReadOk: false })),
  true)}

${row("⑧ Token expired — publishing blocked, Reconnect needed",
  publishingCapability({ connectionStatus: "connected", expired: true, destinationPaused: false, autoPosting: "on" }),
  autoReplyCapability(gate({ permissionsOk: false })),
  false)}
</div></body></html>`

const out = "/tmp/social-beast-accounts-preview.html"
writeFileSync(out, html)
console.log(`wrote ${out}`)
console.log("\nThe states, as the real functions report them:")
for (const [n, c] of [
  ["① publishing", LIVE_PUBLISHING],
  ["① auto reply", autoReplyCapability(gate({ permissionsOk: false }))],
  ["② auto reply", autoReplyCapability(gate({ globalEnabled: false, accountEnabled: false }))],
  ["③ auto reply", autoReplyCapability(gate())],
  ["⑥ auto reply", autoReplyCapability(gate(), { unresolvedActions: 2, danglingClaims: 1 })],
  ["⑦ auto reply", autoReplyCapability(gate({ settingsReadOk: false }))],
] as [string, Capability][]) {
  console.log(`  ${n.padEnd(14)} ${c.state.padEnd(18)} ${c.badge.padEnd(20)} ${c.detail}`)
}
