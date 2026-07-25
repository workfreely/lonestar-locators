import type { SmartLeadFormConfig, AfterFormSectionId } from "../../_lib/types"
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

export default function SmartLeadForm({ config }: { config: SmartLeadFormConfig }) {
  const { afterForm, visibility } = config.sections

  return (
    <div className="min-h-full bg-white">
      {/* Hero + Highlights + overlapping Agent Photo are one composed hero
          unit — Highlights render inside Hero itself, and AgentProfile is
          always the very next sibling so its photo overlaps Hero's own
          bottom edge, not a section that could land between them. */}
      <Hero config={config} />
      {visibility.agentProfile && <AgentProfile config={config} />}

      <LeadFormFields config={config} />

      {afterForm.map((id) => (visibility[id] ? <div key={id}>{AFTER_FORM_REGISTRY[id](config)}</div> : null))}

      {visibility.footer && <Footer config={config} />}
    </div>
  )
}
