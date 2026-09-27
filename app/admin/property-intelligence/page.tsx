import { redirect } from "next/navigation"

// /admin/property-intelligence → the Control Center's Property Intelligence module. The existing
// /admin/property-intelligence/conflicts page is unaffected (it is also linked from the PI Review tab).
// Authorization is enforced by the Control Center layout on the destination.
export const dynamic = "force-dynamic"

export default async function PropertyIntelligenceEntry() {
  redirect("/admin/control-center/property-intelligence")
}
