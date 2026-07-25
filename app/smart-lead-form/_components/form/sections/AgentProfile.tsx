import { HiOutlineShieldCheck, HiOutlinePhone } from "react-icons/hi2"
import type { SmartLeadFormConfig } from "../../../_lib/types"
import { AGENT_PHOTO_SIZES, agentPhotoOverlapRem } from "../../../_lib/agentPhotoSizes"

export default function AgentProfile({ config }: { config: SmartLeadFormConfig }) {
  const { agentPhotoUrl, agentPhotoSize } = config.branding
  const { agentName, agentTitle, brokerageName, serviceAreas, phoneNumber } = config.copy
  const { brokerageInfo, serviceAreas: showServiceAreas, phoneNumber: showPhoneNumber } = config.sections.visibility
  const size = AGENT_PHOTO_SIZES[agentPhotoSize]

  return (
    <section className="px-5 pb-8 pt-0 sm:px-8">
      <div className="mx-auto flex max-w-lg flex-col items-center text-center">
        <div
          style={{ marginTop: `-${agentPhotoOverlapRem(agentPhotoSize)}rem` }}
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

        <p className="mt-3 flex items-center gap-1.5 text-[16px] font-semibold text-[#0b0f1a]">
          {agentName}
          <HiOutlineShieldCheck className="h-4 w-4 text-[#2f6bff]" />
        </p>
        <p className="text-[13px] text-[#6b7280]">{agentTitle}</p>
        {brokerageInfo && <p className="mt-0.5 text-[13px] text-[#6b7280]">{brokerageName}</p>}
        {showServiceAreas && <p className="mt-1 text-[12px] font-medium text-[#9098a8]">{serviceAreas}</p>}
        {showPhoneNumber && phoneNumber && (
          <a
            href={`tel:${phoneNumber.replace(/[^\d+]/g, "")}`}
            className="mt-2.5 flex items-center gap-1.5 text-[13px] font-medium text-[#6b7280] transition-colors hover:text-[#2f6bff]"
          >
            <HiOutlinePhone className="h-3.5 w-3.5" />
            {phoneNumber}
          </a>
        )}
      </div>
    </section>
  )
}
