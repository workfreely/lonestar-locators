// Social Beast — THE TWO CAPABILITY LINES on the Accounts page.
//
// The regression this file mainly exists to prevent is a UI that implies publishing is happening
// because an account is connected. That was the old behaviour: one "Connected" pill, while the
// master Auto Posting switch was paused and nothing had published for days. So the central
// assertion here is negative — NO combination of inputs may produce an "active" publishing state
// unless all three preconditions are genuinely true.
//
// It also asserts that Auto Reply is a RENDERER for accountAutomationGate rather than a second
// opinion, by driving it with real gate outputs rather than hand-written states.
// Run: npx tsx scripts/social/accountCapabilities.test.ts
import {
  publishingCapability, autoReplyCapability,
  CAPABILITY_TONE, CAPABILITY_DOT, type CapabilityState,
  REAUTHORIZE_COMMENTS_LABEL, REAUTHORIZE_COMMENTS_TITLE,
} from "@/lib/social/accountCapabilities"
import { accountAutomationGate } from "@/lib/social/commentSafety"
import { INSTAGRAM_COMMENTS_SCOPE } from "@/lib/social/commentScope"
import { INSTAGRAM_ADMIN_SCOPES } from "@/lib/social/instagram"
import { readFileSync } from "node:fs"

let pass = 0, fail = 0
const ok = (l: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}${d ? ` — ${d}` : ""}`) }
}
const read = (p: string) => readFileSync(p, "utf8")

const HEALTHY = { connectionStatus: "connected", expired: false, destinationPaused: false }

console.log("1. PUBLISHING — a connected account must NOT read as publishing:")
{
  // The live production state as of this change: connected, master switch paused.
  const live = publishingCapability({ ...HEALTHY, autoPosting: "paused" })
  ok("connected + Auto Posting paused is NOT active", live.state !== "active")
  ok("…it is reported as paused", live.state === "paused")
  ok("…the badge reads Paused, not Connected", live.badge === "Paused", live.badge)
  ok("…and the detail names Auto Posting as the reason",
    /auto posting paused/i.test(live.detail), live.detail)
  ok("…so \"Connected\" never appears without a qualifier",
    !/^connected$/i.test(live.detail.trim()))

  const perAccount = publishingCapability({ ...HEALTHY, destinationPaused: true, autoPosting: "on" })
  ok("Auto Posting on but THIS destination paused is not active", perAccount.state === "paused")
  ok("…and the detail distinguishes it from the master switch",
    /this account paused/i.test(perAccount.detail), perAccount.detail)

  const on = publishingCapability({ ...HEALTHY, autoPosting: "on" })
  ok("all three preconditions true ⇒ active", on.state === "active")
  ok("…badged Active, detailed \"Auto posting on\"",
    on.badge === "Active" && /auto posting on/i.test(on.detail))

  // THE EXHAUSTIVE NEGATIVE. Only one of eight input combinations may be active.
  const combos = []
  for (const status of ["connected", "error"]) {
    for (const expired of [false, true]) {
      for (const destinationPaused of [false, true]) {
        for (const autoPosting of ["on", "paused"] as const) {
          combos.push({ connectionStatus: status, expired, destinationPaused, autoPosting })
        }
      }
    }
  }
  const active = combos.filter((c) => publishingCapability(c).state === "active")
  ok(`of ${combos.length} input combinations, EXACTLY ONE is active`, active.length === 1,
    JSON.stringify(active))
  ok("…and it is the one with everything healthy and on",
    active[0]?.connectionStatus === "connected" && active[0]?.expired === false
    && active[0]?.destinationPaused === false && active[0]?.autoPosting === "on")
}

console.log("\n2. PUBLISHING — a broken connection and an unreadable switch both fail closed:")
{
  ok("status error ⇒ attention, Reconnect needed",
    publishingCapability({ ...HEALTHY, connectionStatus: "error", autoPosting: "on" }).badge === "Reconnect needed")
  ok("an expired token ⇒ attention even when everything else is on",
    publishingCapability({ ...HEALTHY, expired: true, autoPosting: "on" }).state === "attention")
  // The worker treats unreadable as paused, so a UI showing "on" would misdescribe the server.
  const unreadable = publishingCapability({ ...HEALTHY, autoPosting: "on", autoPostingUnreadable: true })
  ok("an UNREADABLE Auto Posting setting is reported as paused, not on", unreadable.state === "paused")
  ok("…and says so, rather than implying a choice was made",
    /unreadable/i.test(unreadable.detail))
}

console.log("\n3. AUTO REPLY — the four states, driven by the REAL gate:")
{
  const gateFor = (over: Partial<Parameters<typeof accountAutomationGate>[0]> = {}) =>
    accountAutomationGate({
      settingsReadOk: true, globalEnabled: true, accountEnabled: true,
      activatedAt: "2026-10-18T00:00:00Z", permissionsOk: true, ...over,
    })

  ok("scope missing ⇒ Permission needed",
    autoReplyCapability(gateFor({ permissionsOk: false })).badge === "Permission needed")
  ok("…with state permission_needed",
    autoReplyCapability(gateFor({ permissionsOk: false })).state === "permission_needed")

  for (const [label, over] of [
    ["global off", { globalEnabled: false }],
    ["account off", { accountEnabled: false }],
    ["never activated", { activatedAt: null }],
  ] as const) {
    const cap = autoReplyCapability(gateFor(over))
    if (cap.badge !== "Ready but disabled") {
      fail++; console.log(`  ✗ ${label} should be "Ready but disabled", got "${cap.badge}"`)
    }
  }
  ok("every switched-off state ⇒ Ready but disabled", true)
  ok("…and \"never activated\" says so specifically",
    /never switched on/i.test(autoReplyCapability(gateFor({ activatedAt: null })).detail))

  ok("all gates true ⇒ Enabled", autoReplyCapability(gateFor()).badge === "Enabled")
  ok("…with state active", autoReplyCapability(gateFor()).state === "active")

  ok("unreadable settings ⇒ Attention needed",
    autoReplyCapability(gateFor({ settingsReadOk: false })).badge === "Attention needed")
  ok("…and it must NOT read as Enabled even with every other gate true",
    autoReplyCapability(gateFor({ settingsReadOk: false })).state !== "active")

  // Unresolved work is surfaced even when the switches are off, because an uncertain send is never
  // retried and would otherwise sit invisible for ever.
  const stuck = { unresolvedActions: 2, danglingClaims: 1 }
  ok("unresolved actions ⇒ Attention needed even while enabled",
    autoReplyCapability(gateFor(), stuck).badge === "Attention needed")
  ok("…and while switched off",
    autoReplyCapability(gateFor({ globalEnabled: false }), stuck).badge === "Attention needed")
  ok("…with the counts stated",
    /2 action\(s\)/.test(autoReplyCapability(gateFor(), stuck).detail)
    && /1 message claim\(s\)/.test(autoReplyCapability(gateFor(), stuck).detail))
  // Permission is the blocking, one-click problem, so it wins the pill — but the counts must not
  // vanish, or the operator loses the only notice they will get.
  const both = autoReplyCapability(gateFor({ permissionsOk: false }), stuck)
  ok("missing permission outranks the attention badge…", both.state === "permission_needed" && both.badge === "Permission needed")
  ok("…but the counts still appear in the detail", /2 action\(s\)/.test(both.detail))

  ok("a dangling claim ALONE is enough to raise attention",
    autoReplyCapability(gateFor(), { unresolvedActions: 0, danglingClaims: 1 }).badge === "Attention needed")
  ok("zero counts do not raise attention",
    autoReplyCapability(gateFor(), { unresolvedActions: 0, danglingClaims: 0 }).badge === "Enabled")
}

console.log("\n4. THE ACCOUNTS PAGE WIRES THE GATE, AND KEEPS EVERY EXISTING CONTROL:")
{
  const page = read("app/admin/social-autopilot/accounts/page.tsx")
  const comp = read("components/crm/social/PublishingDestinations.tsx")

  ok("the page reads `scopes`", /select\([^)]*\bscopes\b/s.test(page))
  ok("the page calls accountAutomationGate rather than re-deriving", /accountAutomationGate\(/.test(page))
  ok("…and feeds permissionsOk from the granted scopes", /permissionsOk:\s*\(row\.scopes/.test(page))
  ok("the page reads Auto Posting through the worker's own helper", /readAutoPosting\(/.test(page))
  ok("the page passes both capabilities to the component",
    /publishing:\s*publishingCapability\(/.test(page) && /autoReply:\s*autoReplyCapability\(/.test(page))

  // THE PRESERVATION ASSERTIONS. These controls existed before and must still be here.
  for (const control of ["Resume", "Pause", "Rename", "Disconnect"]) {
    if (!new RegExp(`>${control}<`).test(comp)) {
      fail++; console.log(`  ✗ the existing ${control} control is gone`)
    }
  }
  ok("Pause, Resume, Rename and Disconnect all still render", true)
  ok("the per-destination manage endpoint is unchanged",
    /\/destinations\/manage/.test(comp) || /const MANAGE =/.test(comp))
  ok("pause and resume still go through manage()",
    /manage\(d\.id, \{ action: "pause" \}\)/.test(comp) && /manage\(d\.id, \{ action: "resume" \}\)/.test(comp))

  ok("both capability rows are rendered", /capabilityRow\("Instagram Publishing"/.test(comp)
    && /capabilityRow\("Instagram Auto Reply"/.test(comp))
  ok("there is a Manage in Comments action", /Manage in Comments/.test(comp))
  ok("…pointing at the Comments page", /COMMENTS_PAGE = "\/admin\/social-autopilot\/comments"/.test(comp))
  // The approved layout: name left, badge right, detail underneath, actions on their own row.
  ok("the badge is right-aligned and rendered from cap.badge",
    /shrink-0[^>]*rounded-full[\s\S]{0,160}\{cap\.badge\}/.test(comp))
  ok("the detail sits under the capability name", /\{cap\.detail\}/.test(comp))
  ok("actions render on their own row beneath, not beside the badge",
    /\{actions && <div className="mt-2 flex/.test(comp))

  // ── THE REDUNDANT LINK ────────────────────────────────────────────────────────────────
  ok("the standalone connect link is hidden once an account is connected",
    /configured && destinations\.length === 0 && \(/.test(comp))
  ok("…and the old always-visible wording is gone",
    !/Connect my own Instagram directly/.test(comp))
  ok("…while a connect option REMAINS for an admin with no account",
    /Connect my Instagram account →/.test(comp))
}

console.log("\n5. RE-AUTHORIZATION IS SAFE, AND REUSES THE ONE FLOW:")
{
  const comp = read("components/crm/social/PublishingDestinations.tsx")
  ok("Reconnect is NO LONGER gated on error/expiry (matching TikTok)",
    !/\(d\.status === "error" \|\| d\.expired\) && <a href=\{CONNECT\}/.test(comp))
  ok("Re-authorize Comments uses the EXISTING connect route, not a new OAuth path",
    /href=\{CONNECT\}[^>]*REAUTHORIZE_COMMENTS_TITLE/.test(comp.replace(/\s+/g, " ")))
  // TIGHTENED, NOT LOOSENED. This previously accepted `|| state === "attention"`, which made the
  // button appear for ANY unresolved action. A failed send is not fixed by re-granting a permission
  // we already hold, and on 21 Oct 2026 two permission-refused DMs put this button on screen as the
  // apparent remedy for a problem it could not touch. The condition must now name a PERMISSION
  // problem specifically, and the assertion also forbids the old disjunct returning.
  ok("…appears only when the permission is missing or reported revoked",
    /\(!d\.commentsScopeGranted \|\| d\.autoReply\.state === "permission_needed"\) &&/.test(comp))
  ok("…and NEVER merely because an action failed (no `attention` disjunct)",
    !/d\.autoReply\.state === "attention"\) &&\s*\(/.test(comp) &&
    !/commentsScopeGranted \|\| d\.autoReply\.state === "attention"/.test(comp))
  ok("there is exactly ONE Instagram authorization URL in the component",
    (comp.match(/accounts\/instagram\/connect/g) ?? []).length === 1)
  // The real property: the disconnect handler must not route into the authorization flow. The
  // first version of this assertion used a case-INSENSITIVE search for "CONNECT", which matches
  // the "connect" inside "disconnect" and so could never pass — a check that can only fail is as
  // useless as one that can only pass. This reads the handler body instead.
  const discBody = comp.slice(comp.indexOf("const disconnect = (d: Destination)"))
    .slice(0, comp.slice(comp.indexOf("const disconnect = (d: Destination)")).indexOf("\n  }") + 4)
  ok("the Disconnect handler only calls manage(action: disconnect) — it never opens the OAuth flow",
    /action: "disconnect"/.test(discBody) && !discBody.includes("CONNECT"), discBody.replace(/\s+/g, " ").slice(0, 120))
  ok("…and Re-authorize is a plain link, never preceded by a disconnect call",
    !/onClick=\{\(\) => disconnect\(d\)\}[\s\S]{0,200}href=\{CONNECT\}/.test(comp))

  // The tooltip has to carry the three reassurances, or a safe action still reads as risky.
  ok("the tooltip says nothing is disconnected", /nothing is disconnected/i.test(REAUTHORIZE_COMMENTS_TITLE))
  ok("the tooltip says the SAME account must be used", /SAME\s+Instagram account/i.test(REAUTHORIZE_COMMENTS_TITLE))
  ok("the tooltip says publishing and schedules are unaffected",
    /publishing settings, schedules/i.test(REAUTHORIZE_COMMENTS_TITLE))
  ok("the action label is the approved wording", REAUTHORIZE_COMMENTS_LABEL === "Re-authorize Comments")

  // The scope name must match what the authorization flow actually requests, or permissionsOk is
  // permanently false and Auto Reply sits on "Permission needed" with no error to find.
  ok("the scope checked is the scope requested",
    (INSTAGRAM_ADMIN_SCOPES as readonly string[]).includes(INSTAGRAM_COMMENTS_SCOPE))
}

console.log("\n6. THE COMMENTS PAGE CLEANUP:")
{
  const page = read("app/admin/social-autopilot/comments/page.tsx")
  const client = read("components/crm/social/CommentsClient.tsx")

  ok("globalEnabled is no longer hardcoded false", !/globalEnabled=\{false\}/.test(page))
  ok("…it is read from comment_automation_settings",
    /from\("comment_automation_settings"\)/.test(page) && /global_enabled/.test(page))
  ok("an unreadable setting is reported separately, not as \"off\"",
    /globalUnreadable/.test(page) && /globalUnreadable/.test(client))
  ok("…and fails closed (a read error never yields enabled)",
    /if \(error\) globalUnreadable = true/.test(page))
  ok("a MISSING row is treated as off, which is not a fault",
    /data\?\.global_enabled === true/.test(page))

  ok("the stale \"written but not applied\" claim is gone", !/written but not applied/.test(page))
  ok("the stale manage_messages permission claim is corrected",
    !/separately\s*\n?\/\/ instagram_business_manage_messages/.test(page)
    && /covers reading, public replies AND private replies/.test(page))

  ok("the per-account permission line is derived from scopes, not hardcoded",
    /instagram_business_manage_comments/.test(client) && !/\{ig \? "Permissions needed"/.test(client))
  ok("the Automation pill can now show On / Off / Unknown",
    /globalUnreadable \? "Unknown" : globalEnabled \? "On" : "Off"/.test(client))
}

console.log("\n7. THE PALETTE — five states, five colours, told apart at a glance:")
{
  const STATES: CapabilityState[] = ["active", "paused", "disabled", "permission_needed", "attention"]

  ok("every state has a text colour", STATES.every((s) => !!CAPABILITY_TONE[s]))
  ok("every state has a dot colour", STATES.every((s) => !!CAPABILITY_DOT[s]))

  // THE WHOLE POINT. Before this, paused and disabled shared muted grey, and permission_needed
  // shared amber with attention — five states wearing three colours.
  const tones = STATES.map((s) => CAPABILITY_TONE[s])
  const dots = STATES.map((s) => CAPABILITY_DOT[s])
  ok("all five TEXT colours are distinct", new Set(tones).size === 5, tones.join(" | "))
  ok("all five DOT colours are distinct", new Set(dots).size === 5, dots.join(" | "))

  // The requested meanings.
  ok("active is green (emerald)", /emerald/.test(CAPABILITY_TONE.active) && /emerald/.test(CAPABILITY_DOT.active))
  ok("paused is yellow", /yellow/.test(CAPABILITY_TONE.paused) && /yellow/.test(CAPABILITY_DOT.paused))
  ok("disabled is blue / muted cyan (sky)", /sky|cyan|blue/.test(CAPABILITY_TONE.disabled))
  ok("permission_needed is orange", /orange/.test(CAPABILITY_TONE.permission_needed))
  ok("attention keeps the existing warning colour (amber)",
    CAPABILITY_TONE.attention === "text-amber-600 dark:text-amber-400"
    && CAPABILITY_DOT.attention === "bg-amber-500")

  // ACTIVE IS STILL THE ONLY GREEN. A paused or switched-off capability must never read as running.
  const greens = STATES.filter((s) => /emerald|green/.test(CAPABILITY_TONE[s]))
  ok("exactly ONE state is green, and it is `active`", greens.length === 1 && greens[0] === "active",
    greens.join(", "))
  ok("no NOT-running state uses green",
    (["paused", "disabled", "permission_needed", "attention"] as CapabilityState[])
      .every((s) => !/emerald|green/.test(CAPABILITY_TONE[s]) && !/emerald|green/.test(CAPABILITY_DOT[s])))

  // Dark mode is not optional: a 600-weight text colour on a dark panel is unreadable.
  ok("every text colour declares a dark-mode variant",
    STATES.every((s) => /dark:/.test(CAPABILITY_TONE[s])), tones.join(" | "))

  // The component must RENDER the shared palette rather than keeping its own copy — that drift is
  // exactly what put a different tone function in the preview harness once already.
  const comp = read("components/crm/social/PublishingDestinations.tsx")
  ok("the component reads the shared palette", /CAPABILITY_TONE\[state\]/.test(comp) && /CAPABILITY_DOT\[state\]/.test(comp))
  ok("…and keeps no hard-coded colour of its own",
    !/capabilityTone[\s\S]{0,200}text-(emerald|amber|sky|yellow|orange)-/.test(comp))

  // The status LOGIC is unchanged — this was a visual-only change.
  ok("publishing still reports paused for the live state",
    publishingCapability({ ...HEALTHY, autoPosting: "paused" }).state === "paused")
  ok("auto reply still reports permission_needed with no scope",
    autoReplyCapability(accountAutomationGate({
      settingsReadOk: true, globalEnabled: true, accountEnabled: true,
      activatedAt: "2026-10-18T00:00:00Z", permissionsOk: false,
    })).state === "permission_needed")
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
