import "./control-center.css"
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google"
import { ensurePlatformAdminPage } from "@/lib/auth/ensurePlatformAdminPage"
import { getOverview } from "@/lib/controlCenter/overview"
import Shell from "./_components/Shell"

// Locator Beast Control Center — the private admin/operational surface over the Beast Brain.
//
// AUTHORIZATION: server-side, platform-admin ONLY, via the existing ensurePlatformAdminPage()
// (auth.getUser() + is_platform_admin() RPC): unauthenticated → /login, non-admin → 404. This layout
// gates every Control Center route; child layouts/pages call it again (defense in depth, mirroring
// Social Autopilot). Hiding the menu item is UX only. All data reads happen server-side with the
// service-role client AFTER this gate; nothing here writes.
//
// Renders inside app/admin/layout.tsx (fixed CRM container): the .cc root owns its own scoped visual
// system and its own scroll (height:100%).
export const dynamic = "force-dynamic"

const sans = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-cc-sans", display: "swap" })
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["500"], variable: "--font-cc-mono", display: "swap" })

export default async function ControlCenterLayout({ children }: { children: React.ReactNode }) {
  await ensurePlatformAdminPage()
  let attention: number | null = null, running: number | null = null, generatedAt: string | null = null
  try {
    const ov = await getOverview()
    attention = ov.attentionTotal; running = ov.jobs.available ? ov.jobs.running : null; generatedAt = ov.generatedAt
  } catch { /* top-bar pills degrade to "not loaded"; pages report their own errors */ }
  return (
    <div className={`cc ${sans.variable} ${mono.variable}`}>
      <Shell attention={attention} running={running} generatedAt={generatedAt}>{children}</Shell>
    </div>
  )
}
