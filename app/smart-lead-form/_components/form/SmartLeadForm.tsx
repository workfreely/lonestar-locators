import type { SmartLeadFormConfig, AfterFormSectionId } from "../../_lib/types"
import { serviceAreasLabelCanonical } from "@/lib/markets/catalog"
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
  pathUtmSource,
}: {
  config: SmartLeadFormConfig
  // The workspace's selected market slugs — drives which cities the form shows.
  // Read live (not baked into config), so Settings changes reflect immediately.
  serviceAreaSlugs?: string[]
  // When set (the public /{username} page), the form submits real, attributed
  // leads to /api/leads/submit for this username. When absent (editor preview),
  // submit is a no-op confirmation.
  submitUsername?: string
  // Attribution implied by a clean branded URL path; forwarded verbatim to the fields.
  pathUtmSource?: string
}) {
  // Service Areas come from ONE source: the agent's Profile market selection
  // (serviceAreaSlugs). They render in canonical catalog order (matching how
  // Profile lists them), so the display is stable and never drifts from Profile.
  // The old editable copy.serviceAreas is no longer a source of truth. This is
  // display-only — the canonical selection is untouched.
  const displayConfig: SmartLeadFormConfig =
    serviceAreaSlugs && serviceAreaSlugs.length
      ? { ...config, copy: { ...config.copy, serviceAreas: serviceAreasLabelCanonical(serviceAreaSlugs) } }
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

      <LeadFormFields config={displayConfig} serviceAreaSlugs={serviceAreaSlugs} submitUsername={submitUsername} pathUtmSource={pathUtmSource} />

      {AFTER_FORM_ORDER.map((id) => (visibility[id] ? <div key={id}>{AFTER_FORM_REGISTRY[id](displayConfig)}</div> : null))}

      {/* Footer always renders — it's a fixed closing anchor with no toggle. */}
      <Footer config={displayConfig} />
    </div>
  )
}
