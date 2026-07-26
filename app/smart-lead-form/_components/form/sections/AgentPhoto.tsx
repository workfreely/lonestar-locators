import type { SmartLeadFormConfig } from "../../../_lib/types"
import { AGENT_PHOTO_SIZES } from "../../../_lib/agentPhotoSizes"

// Just the photo/initials box — no positioning of its own. AgentProfile.tsx
// wraps this with a negative margin for the overlapping placement; Hero.tsx
// wraps it plainly for the under-headline placement.
export default function AgentPhoto({ config }: { config: SmartLeadFormConfig }) {
  const { agentPhotoUrl, agentPhotoSize } = config.branding
  const { agentName } = config.copy
  const size = AGENT_PHOTO_SIZES[agentPhotoSize]

  return (
    <div
      className={`${size.boxClass} overflow-hidden rounded-full border-4 border-white bg-[#f0f1f5] shadow-[0_8px_24px_rgba(15,23,42,0.15)]`}
    >
      {agentPhotoUrl ? (
        <img src={agentPhotoUrl} alt={agentName} className="h-full w-full object-cover" />
      ) : (
        <div className={`flex h-full w-full items-center justify-center font-semibold text-[#a1a8b8] ${size.initialsClass}`}>
          {agentName
            .split(" ")
            .map((n) => n[0])
            .join("")}
        </div>
      )}
    </div>
  )
}
