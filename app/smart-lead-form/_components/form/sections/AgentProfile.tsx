import type { SmartLeadFormConfig } from "../../../_lib/types"
import { agentPhotoOverlapRem } from "../../../_lib/agentPhotoSizes"
import AgentPhoto from "./AgentPhoto"
import AgentInfoText from "./AgentInfoText"

// Overlapping placement only — SmartLeadForm.tsx doesn't render this
// component at all when Under Headline is selected, since in that case
// the photo and text both live inside Hero.tsx instead.
export default function AgentProfile({ config }: { config: SmartLeadFormConfig }) {
  const { agentPhotoSize } = config.branding

  return (
    <section className="px-5 pb-8 pt-0 sm:px-8">
      <div className="mx-auto flex max-w-lg flex-col items-center text-center">
        <div style={{ marginTop: `-${agentPhotoOverlapRem(agentPhotoSize)}rem` }}>
          <AgentPhoto config={config} />
        </div>

        <AgentInfoText config={config} theme="light" />
      </div>
    </section>
  )
}
