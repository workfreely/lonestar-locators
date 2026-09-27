"use client"
// Control Center shell — main left navigation (major Beast systems) + top bar. Client-only for the
// active-state highlight (usePathname). The registry below is the ONLY place a system is declared;
// adding a module later is one entry. Existing apps (Social Beast, Security Beast) are linked, not rebuilt.
// Authorization is NOT done here — the server layout gates every route; this is UX only.
import Link from "next/link"
import { usePathname } from "next/navigation"
import type { ReactNode } from "react"
import { fmtDate, timeAgo } from "@/lib/controlCenter/format"
import { CC_BASE } from "@/lib/controlCenter/paths"
import BackToDashboard from "@/components/crm/BackToDashboard"

type NavItem = { label: string; href: string; kind: "internal" | "external"; tag?: string; icon: ReactNode; slug?: string }
const ic = (d: string, extra?: ReactNode) => (
  <svg className="ic" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d={d} />{extra}</svg>
)
export const NAV: NavItem[] = [
  { label: "Overview", href: CC_BASE, kind: "internal", icon: <svg className="ic" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="2" y="2" width="5" height="5" rx="1" /><rect x="9" y="2" width="5" height="5" rx="1" /><rect x="2" y="9" width="5" height="5" rx="1" /><rect x="9" y="9" width="5" height="5" rx="1" /></svg> },
  { label: "Property Intelligence", href: `${CC_BASE}/property-intelligence`, slug: "property-intelligence", kind: "internal", icon: ic("M2 13V7l6-4 6 4v6M6 13V9h4v4") },
  { label: "Property Search", href: `${CC_BASE}/property-search`, slug: "property-search", kind: "internal", tag: "V1.5", icon: ic("M10 10l3.5 3.5", <circle cx="7" cy="7" r="4" />) },
  { label: "Follow-Up", href: `${CC_BASE}/follow-up`, slug: "follow-up", kind: "internal", tag: "V1.5", icon: ic("M2 4h12v7H6l-3 2v-2H2z") },
  { label: "Social Beast", href: "/admin/social-autopilot", kind: "external", tag: "existing app ↗", icon: <svg className="ic" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><rect x="2" y="3" width="12" height="9" rx="1.5" /><path d="M6.5 6v3l3-1.5z" fill="currentColor" stroke="none" /></svg> },
  { label: "Security Beast", href: "/admin/security", kind: "external", tag: "existing ↗", icon: ic("M8 2l5 2v4c0 3-2.2 5-5 6-2.8-1-5-3-5-6V4z") },
  { label: "Agents / Jobs", href: `${CC_BASE}/agents-jobs`, slug: "agents-jobs", kind: "internal", tag: "observe", icon: ic("M8 5v3l2 1.5", <circle cx="8" cy="8" r="5.5" />) },
  { label: "Review Center", href: `${CC_BASE}/review-center`, slug: "review-center", kind: "internal", icon: ic("M2 4h12M2 8h8M2 12h5") },
  { label: "Import / Export", href: `${CC_BASE}/import-export`, slug: "import-export", kind: "internal", tag: "V1.5", icon: ic("M8 2v8M5 7l3 3 3-3M3 12h10") },
  { label: "Analytics", href: `${CC_BASE}/analytics`, slug: "analytics", kind: "internal", tag: "V2", icon: ic("M2 13l4-5 3 3 5-7") },
  { label: "System", href: `${CC_BASE}/system`, slug: "system", kind: "internal", tag: "V2", icon: ic("M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2", <circle cx="8" cy="8" r="2" />) },
]

const PI_TABS: Record<string, string> = { "": "Overview", properties: "Properties", images: "Images", review: "Review", sources: "Sources", history: "History" }

// One visible title per page: the breadcrumb shows only the PARENT path, the <h1> shows the page itself —
// never the same label twice.
function titleFor(pathname: string): { title: string; crumb: ReactNode } {
  const rest = pathname.startsWith(CC_BASE) ? pathname.slice(CC_BASE.length).split("/").filter(Boolean) : []
  if (rest.length === 0) return { title: "Overview", crumb: <b>Control Center</b> }
  const sys = NAV.find((n) => n.slug === rest[0])
  const sysLabel = sys?.label ?? rest[0]
  if (rest[0] === "property-intelligence") {
    const tab = rest[1] ?? ""
    const tabLabel = PI_TABS[tab] ?? tab
    if (rest.length > 2) return { title: "Property", crumb: <><b>Control Center</b> / Property Intelligence / {tabLabel}</> }
    if (tab === "") return { title: "Property Intelligence", crumb: <b>Control Center</b> }
    return { title: tabLabel, crumb: <><b>Control Center</b> / Property Intelligence</> }
  }
  return { title: sysLabel, crumb: <b>Control Center</b> }
}

export default function Shell({ children, attention, running, generatedAt }: { children: ReactNode; attention: number | null; running: number | null; generatedAt: string | null }) {
  const pathname = usePathname() ?? CC_BASE
  const { title, crumb } = titleFor(pathname)
  const isActive = (n: NavItem) => n.kind === "internal" && (n.href === CC_BASE ? pathname === CC_BASE : pathname === n.href || pathname.startsWith(n.href + "/"))
  return (
    <>
      <aside className="side">
        <div className="brand"><div className="name">Locator Beast</div><div className="sub">Control Center</div></div>
        <div className="env"><span className="dot" />LB production · read model</div>
        <nav className="nav" aria-label="Beast systems">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={`nav-item${n.kind === "external" ? " ext" : ""}`} aria-current={isActive(n) ? "page" : undefined} title={n.kind === "external" ? "Opens the existing app — integrated, not rebuilt" : undefined}>
              {n.icon}<span className="lbl">{n.label}</span>{n.tag ? <span className="tag">{n.tag}</span> : null}
            </Link>
          ))}
        </nav>
        <Link href="/admin/leads" className="back">← Back to Locator Beast</Link>
        <div className="side-foot">
          <span className="freeze">● PI production processing frozen</span>
          <span>Supabase is the source of truth. This surface is read-only; any write goes through the safe writer.</span>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <div><div className="crumb">{crumb}</div><h1>{title}</h1></div>
          <div className="spacer" />
          {attention === null ? <span className="pill faint">attention · not loaded</span> : <span className={`pill${attention > 0 ? " attn" : ""}`}><span className="dot" style={{ background: attention > 0 ? "var(--warn)" : "var(--good)" }} />{attention} need a human</span>}
          <span className="pill"><span className="dot" style={{ background: running ? "var(--accent)" : "var(--ink-3)" }} />{running ? `${running} job${running === 1 ? "" : "s"} running` : "no jobs running"}</span>
          <span className="pill faint" title={generatedAt ?? undefined}>Snapshot · {fmtDate(generatedAt)} · {timeAgo(generatedAt)}</span>
          <BackToDashboard />
        </header>
        {children}
      </div>
    </>
  )
}
