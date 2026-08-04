import type { SmartLeadFormConfig, AfterFormSectionId } from "../../_lib/types"
import { serviceAreasLabel } from "@/lib/markets/catalog"
import Hero from "./sections/Hero"
import AgentProfile from "./sections/AgentProfile"
import LeadFormFields from "./sections/LeadFormFields"
import Testimonials from "./sections/Testimonials"
import FAQ from "./sections/FAQ"
import Footer from "./sections/Footer"

const AFTER_FORM_REGISTRY: Record<AfterFormSectionId, (config: SmartLeadFormConfig) => React.ReactNode> = {
  testimonials: (config) => <Testimonials config={config} />,
  faq: (config) => <FAQ config={config} />,
}

// Fixed page order — Testimonials always render before FAQs. Reordering was
// removed from the editor, so this order is no longer configurable (any legacy
// `sections.afterForm` value in a saved config is intentionally ignored).
const AFTER_FORM_ORDER: AfterFormSectionId[] = ["testimonials", "faq"]

export default function SmartLeadForm({
  config,
  serviceAreaSlugs,
  submitUsername,
}: {
  config: SmartLeadFormConfig
  // The workspace's selected market slugs — drives which cities the form shows.
  // Read live (not baked into config), so Settings changes reflect immediately.
  serviceAreaSlugs?: string[]
  // When set (the public /{username} page), the form submits real, attributed
  // leads to /api/leads/submit for this username. When absent (editor preview),
  // submit is a no-op confirmation.
  submitUsername?: string
}) {
  // The displayed "Service Areas" text is derived from the selected markets
  // (single source of truth), overriding the editor copy when a selection
  // exists. Every section reads config.copy.serviceAreas, so overriding here
  // updates the whole page with no extra threading.
  const displayConfig: SmartLeadFormConfig =
    serviceAreaSlugs && serviceAreaSlugs.length
      ? { ...config, copy: { ...config.copy, serviceAreas: serviceAreasLabel(serviceAreaSlugs) } }
      : config

  const { visibility } = displayConfig.sections
  // Under Headline puts the photo and agent info text inside Hero itself,
  // so AgentProfile (the white, overlapping-only section) is only rendered
  // for the Overlapping position.
  const showOverlappingAgentProfile = visibility.agentProfile && displayConfig.branding.profileImagePosition !== "underHeadline"

  return (
    <div className="min-h-full bg-white">
      {/* Hero + Highlights + overlapping Agent Photo are one composed hero
          unit — Highlights render inside Hero itself, and AgentProfile is
          always the very next sibling so its photo overlaps Hero's own
          bottom edge, not a section that could land between them. */}
      <Hero config={displayConfig} />
      {showOverlappingAgentProfile && <AgentProfile config={displayConfig} />}

      <LeadFormFields config={displayConfig} serviceAreaSlugs={serviceAreaSlugs} submitUsername={submitUsername} />

      {AFTER_FORM_ORDER.map((id) => (visibility[id] ? <div key={id}>{AFTER_FORM_REGISTRY[id](displayConfig)}</div> : null))}

      {/* Footer always renders — it's a fixed closing anchor with no toggle. */}
      <Footer config={displayConfig} />
    </div>
  )
}
