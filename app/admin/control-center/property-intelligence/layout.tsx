import { ensurePlatformAdminPage } from "@/lib/auth/ensurePlatformAdminPage"
import { PI_BASE } from "@/lib/controlCenter/paths"
import ModNav from "../_components/ModNav"

// Property Intelligence module — module navigation = the tools within this one system.
// Overview summarizes; Properties / Images / Review / Sources / History are working screens.
// Property Detail is reached from Properties → select a property (not a top-level tab); job
// execution detail lives in the global Agents / Jobs module. Gated again here (defense in depth).
export const dynamic = "force-dynamic"

const TABS = [
  { label: "Overview", slug: "" },
  { label: "Properties", slug: "properties" },
  { label: "Images", slug: "images" },
  { label: "Review", slug: "review" },
  { label: "Sources", slug: "sources" },
  { label: "History", slug: "history" },
]

export default async function PropertyIntelligenceLayout({ children }: { children: React.ReactNode }) {
  await ensurePlatformAdminPage()
  return (
    <main className="content" style={{ gap: 18 }}>
      <ModNav base={PI_BASE} tabs={TABS} label="Property Intelligence tools" />
      <p className="subnote">Property Detail opens from Properties → select a property. Job execution detail lives in the global Agents / Jobs module. All screens are read-only in V1; writes go only through the safe writer.</p>
      {children}
    </main>
  )
}
