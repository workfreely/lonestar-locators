export const dynamic = "force-dynamic"

import { ensurePlatformAdminPage } from "@/lib/auth/ensurePlatformAdminPage"
import AppHeader from "@/components/crm/AppHeader"
import BackToDashboard from "@/components/crm/BackToDashboard"

// Security Beast — V1 VISUAL/PRESENTATIONAL admin surface (platform-admin only).
//
// This page documents the planned Locator Beast security architecture. It introduces NO real
// security monitoring, detection, scoring, blocking, logging, APIs, tables, middleware, or auth
// changes — it is a roadmap visualization. It reuses the existing Locator Beast application shell
// (AppHeader + BackToDashboard over the workspace background) and the existing theme tokens
// (var(--crm-*)), so it follows whatever theme the user has selected and updates automatically when
// the theme changes. No colors from the design mockup are hard-coded.
//
// Status chips (Concept / Planned / Building / Active) are INTERNAL ROADMAP LABELS. There is no
// authoritative operational-status source yet, so every layer is defaulted conservatively to
// Concept or Planned — nothing is claimed Active/Building. The top-level "Protection Active"
// treatment is presentational (the product's posture) and does NOT imply the 14 layers are live.

type LayerStatus = "Concept" | "Planned" | "Building" | "Active"
type Layer = { n: number; name: string; purpose: string; concept: string; status: LayerStatus }

const LAYERS: Layer[] = [
  { n: 1, name: "Edge Protection", purpose: "Stop attacks before they reach Locator Beast.", concept: "WAF, DDoS protection, known malicious IPs/networks, bot filtering.", status: "Planned" },
  { n: 2, name: "Identity Protection", purpose: "Verify that the person accessing an account is legitimate.", concept: "Strong authentication, passkeys/MFA, unusual-login verification.", status: "Planned" },
  { n: 3, name: "Trusted Devices", purpose: "Recognize approved devices instead of relying solely on IP addresses.", concept: "Device enrollment, new-device verification, “Was this you?” alerts.", status: "Concept" },
  { n: 4, name: "Network Intelligence", purpose: "Evaluate where requests originate.", concept: "IP reputation, VPN/proxy/Tor/datacenter signals, scraper-network blacklist and trusted-network rules.", status: "Planned" },
  { n: 5, name: "Behavioral Detection", purpose: "Identify attackers even when IPs/accounts change.", concept: "Request velocity, navigation patterns, enumeration, automation behavior, cross-session correlation.", status: "Planned" },
  { n: 6, name: "Extraction Protection", purpose: "Detect legitimate-looking accounts attempting to steal data.", concept: "Bulk-access detection, unusual property/data consumption, rate limiting, automatic restriction.", status: "Planned" },
  { n: 7, name: "Adaptive Defense", purpose: "Increase protection as risk increases.", concept: "Observe → enhanced monitoring → challenge → throttle → restrict → terminate/block.", status: "Concept" },
  { n: 8, name: "Moving Target Defense", purpose: "Prevent attackers from relying on a completely static defensive environment.", concept: "Rotate pretested challenges, tokens, validation parameters and defensive configurations without changing Locator Beast business logic.", status: "Concept" },
  { n: 9, name: "Deception Layer", purpose: "Detect reconnaissance and automated exploration.", concept: "Honeypots, honeytokens, decoy endpoints/resources and canary signals that normal users never need.", status: "Concept" },
  { n: 10, name: "Protected Data Plane", purpose: "Keep sensitive information behind additional authorization.", concept: "Public → Internal → Protected → Restricted → Crown Jewel classifications; minimum necessary data returned.", status: "Planned" },
  { n: 11, name: "Protected View", purpose: "Discourage capture/leakage of sensitive information.", concept: "Account/session watermarks, print/copy deterrence where appropriate, minimal PII exposure.", status: "Concept" },
  { n: 12, name: "Server-Side Vault", purpose: "Keep the most valuable technology out of the browser entirely.", concept: "Proprietary algorithms, recommendation logic, security rules, credentials and internal datasets remain server-side.", status: "Planned" },
  { n: 13, name: "Privileged/Admin Protection", purpose: "Make administrative access fundamentally different from ordinary access.", concept: "Separate privileged gateway, trusted device, stronger authentication, short-lived authorization; do not depend on a predictable /admin URL.", status: "Planned" },
  { n: 14, name: "Forensic Evidence", purpose: "Preserve what happened if someone attacks or extracts data.", concept: "Security-event timeline, account/session/device/network relationships, resources accessed and defensive actions taken.", status: "Planned" },
]

// Chip system supports all four labels; only Concept/Planned are used in V1 data. Concept =
// outline, Planned = filled neutral (both theme-token driven). Building/Active use restrained
// semantic accents consistent with the rest of Locator Beast's status styling.
const STATUS_CHIP: Record<LayerStatus, string> = {
  Concept: "text-[var(--crm-text-muted)] border border-[var(--crm-border)]",
  Planned: "text-[var(--crm-text-secondary)] bg-[var(--crm-card)] border border-[var(--crm-border)]",
  Building: "text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/25",
  Active: "text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border border-emerald-500/25",
}
function StatusChip({ status }: { status: LayerStatus }) {
  return <span className={`inline-flex items-center text-[11px] font-semibold px-2.5 py-0.5 rounded-full whitespace-nowrap ${STATUS_CHIP[status]}`}>{status}</span>
}

const OVERVIEW = [
  { title: "Access Protection", body: "Monitoring authentication and access activity.", icon: "shield" as const },
  { title: "Threat Detection", body: "Detecting unusual traffic and behavior.", icon: "radar" as const },
  { title: "Evidence & Response", body: "Security events and response controls.", icon: "evidence" as const },
]

const PRINCIPLES = [
  "Assume the client is observable. Protect the source.",
  "Authenticate the person. Trust the device. Evaluate the session. Authorize the data.",
  "Protect information, not just pages.",
  "Create friction for attackers, not legitimate users.",
  "Never rely on a single security layer.",
  "Keep Locator Beast stable while the defensive layer adapts.",
  "Make unauthorized extraction difficult, detectable, containable and attributable where reasonably possible.",
]

// Restrained line icons (stroke = currentColor, so they inherit the theme's text color).
function Icon({ name, className }: { name: string; className?: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const }
  const paths: Record<string, React.ReactNode> = {
    shield: <><path {...common} d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" /><path {...common} d="M9.5 12l1.8 1.8L15 10" /></>,
    radar: <><circle {...common} cx="12" cy="12" r="8" /><circle {...common} cx="12" cy="12" r="3.4" /><path {...common} d="M12 12l6-3.5" /></>,
    evidence: <><rect {...common} x="5" y="4" width="14" height="16" rx="2" /><path {...common} d="M9 4.5V4a3 3 0 016 0v.5" /><path {...common} d="M9.5 13l1.6 1.6L15 11" /></>,
    lock: <><rect {...common} x="5" y="10" width="14" height="10" rx="2" /><path {...common} d="M8 10V7a4 4 0 018 0v3" /></>,
    person: <><circle {...common} cx="12" cy="8" r="3.2" /><path {...common} d="M5.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" /></>,
    layers: <><path {...common} d="M12 4l8 4-8 4-8-4 8-4z" /><path {...common} d="M4 12l8 4 8-4" /></>,
    people: <><circle {...common} cx="9" cy="9" r="3" /><path {...common} d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" /><path {...common} d="M16 6.2a3 3 0 010 5.6M17 14c2.4.3 4 2.2 4 4.6" /></>,
    balance: <><path {...common} d="M12 4v16M6 8h12M6 8l-2.5 5a2.5 2.5 0 005 0L6 8zM18 8l-2.5 5a2.5 2.5 0 005 0L18 8z" /></>,
    gears: <><circle {...common} cx="12" cy="12" r="3" /><path {...common} d="M12 4v2M12 18v2M4 12h2M18 12h2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M17.7 6.3l-1.4 1.4M7.7 16.3l-1.4 1.4" /></>,
    stack: <><rect {...common} x="4" y="4" width="16" height="4" rx="1" /><rect {...common} x="4" y="10" width="16" height="4" rx="1" /><rect {...common} x="4" y="16" width="16" height="4" rx="1" /></>,
  }
  return <svg viewBox="0 0 24 24" className={className} aria-hidden>{paths[name] ?? paths.shield}</svg>
}
const PRINCIPLE_ICONS = ["lock", "person", "stack", "person", "layers", "balance", "gears"]

export default async function SecurityBeastPage() {
  await ensurePlatformAdminPage()

  const card = "rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-panel)]"
  const gridCols = "md:grid-cols-[2.25rem_minmax(150px,1.05fr)_minmax(180px,1.35fr)_minmax(200px,1.55fr)_5.5rem]"
  const mobileLabel = "md:hidden block text-[10px] uppercase tracking-wide text-[var(--crm-text-muted)] mb-0.5"

  return (
    <div className="relative h-full w-full flex flex-col bg-gradient-to-b from-zinc-100 to-zinc-200 dark:from-[var(--crm-workspace)] dark:to-[var(--crm-workspace)]">
      <AppHeader variant="dark" fullBleed>
        <BackToDashboard />
      </AppHeader>

      <div className="beast-ai-clearance flex-1 overflow-y-auto p-5">
        <div className="max-w-[1200px] mx-auto space-y-5">

          {/* ── Header + presentational status ─────────────────────────────── */}
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-4 min-w-0">
              <div className="flex-none h-16 w-16 rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-panel)] flex items-center justify-center text-[var(--crm-accent)]">
                <Icon name="shield" className="h-8 w-8" />
              </div>
              <div className="min-w-0">
                <h1 className="text-[26px] leading-tight font-extrabold text-[var(--crm-text-primary)]">Security Beast</h1>
                <p className="text-[13px] text-[var(--crm-text-secondary)] mt-0.5">Protection and monitoring for Locator Beast.</p>
                <p className="text-[13.5px] font-semibold text-[var(--crm-text-primary)] mt-1.5">Predictable for legitimate users. Unpredictable for adversaries.</p>
              </div>
            </div>

            {/* Protection Active — PRESENTATIONAL posture, not wired to telemetry. */}
            <div className={`${card} p-4 w-full sm:w-[320px]`}>
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500/60 motion-safe:animate-ping" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                </span>
                <span className="text-[14px] font-bold text-[var(--crm-text-primary)]">Protection Active</span>
              </div>
              <p className="text-[12px] text-[var(--crm-text-secondary)] mt-1.5">Security Beast is monitoring and protecting Locator Beast.</p>
            </div>
          </div>

          {/* ── Three overview cards ───────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {OVERVIEW.map((o) => (
              <div key={o.title} className={`${card} p-4`}>
                <div className="h-9 w-9 rounded-xl border border-[var(--crm-border)] bg-[var(--crm-card)] flex items-center justify-center text-[var(--crm-accent)]">
                  <Icon name={o.icon} className="h-5 w-5" />
                </div>
                <h3 className="text-[13.5px] font-bold text-[var(--crm-text-primary)] mt-2.5">{o.title}</h3>
                <p className="text-[12px] text-[var(--crm-text-secondary)] mt-0.5">{o.body}</p>
              </div>
            ))}
          </div>

          {/* ── Security Layers ────────────────────────────────────────────── */}
          <section className={`${card} p-4`}>
            <div className="flex items-center gap-2">
              <Icon name="layers" className="h-4 w-4 text-[var(--crm-accent)]" />
              <h2 className="text-[15px] font-bold text-[var(--crm-text-primary)]">Security Layers</h2>
            </div>
            <p className="text-[12px] text-[var(--crm-text-muted)] mt-0.5">A multi-layered approach to keep Locator Beast secure, stable, and ahead of threats.</p>

            <div className="mt-3 rounded-xl border border-[var(--crm-border)] overflow-hidden">
              {/* Column headers — desktop only */}
              <div className={`hidden md:grid ${gridCols} gap-x-4 px-4 py-2 bg-[var(--crm-card)] border-b border-[var(--crm-border)] text-[10.5px] font-semibold uppercase tracking-wide text-[var(--crm-text-muted)]`}>
                <span>#</span><span>Layer</span><span>Purpose</span><span>Initial concept</span><span className="md:text-right">Status</span>
              </div>
              <ul className="divide-y divide-[var(--crm-border)]">
                {LAYERS.map((l) => (
                  <li key={l.n} className={`px-4 py-3.5 grid grid-cols-1 gap-y-2 md:gap-y-0 md:gap-x-4 md:items-start ${gridCols} hover:bg-[var(--crm-card)] transition-colors`}>
                    {/* Mobile: number + name + status on one line */}
                    <div className="flex items-center justify-between gap-3 md:hidden">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[12px] font-semibold text-[var(--crm-text-muted)] tabular-nums">{String(l.n).padStart(2, "0")}</span>
                        <span className="text-[13.5px] font-bold text-[var(--crm-text-primary)] truncate">{l.name}</span>
                      </div>
                      <StatusChip status={l.status} />
                    </div>
                    {/* Desktop cells */}
                    <span className="hidden md:block text-[12px] font-semibold text-[var(--crm-text-muted)] tabular-nums pt-0.5">{String(l.n).padStart(2, "0")}</span>
                    <span className="hidden md:block text-[13px] font-semibold text-[var(--crm-text-primary)] leading-snug">{l.name}</span>
                    <div className="text-[12.5px] text-[var(--crm-text-secondary)] leading-snug">
                      <span className={mobileLabel}>Purpose</span>{l.purpose}
                    </div>
                    <div className="text-[12px] text-[var(--crm-text-muted)] leading-snug">
                      <span className={mobileLabel}>Initial concept</span>{l.concept}
                    </div>
                    <div className="hidden md:flex md:justify-end pt-0.5"><StatusChip status={l.status} /></div>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* ── Security Beast Principles ──────────────────────────────────── */}
          <section className={`${card} p-4`}>
            <h2 className="text-[15px] font-bold text-[var(--crm-text-primary)]">Security Beast Principles</h2>
            <p className="text-[12px] text-[var(--crm-text-muted)] mt-0.5">Core principles that guide how we protect Locator Beast.</p>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {PRINCIPLES.map((p, i) => (
                <div key={i} className="rounded-xl border border-[var(--crm-border)] bg-[var(--crm-card)] p-3.5">
                  <div className="h-8 w-8 rounded-lg border border-[var(--crm-border)] bg-[var(--crm-panel)] flex items-center justify-center text-[var(--crm-accent)]">
                    <Icon name={PRINCIPLE_ICONS[i] ?? "shield"} className="h-[18px] w-[18px]" />
                  </div>
                  <p className="text-[12.5px] font-medium text-[var(--crm-text-primary)] leading-snug mt-2.5">{p}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Subtle protection mark (matches the site footer wording). */}
          <div className="pt-1 pb-2 text-center text-[11px] text-[var(--crm-text-muted)]">Protected by Security Beast</div>
        </div>
      </div>
    </div>
  )
}
