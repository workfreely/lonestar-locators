import { HiOutlineShieldCheck, HiOutlinePhone } from "react-icons/hi2"
import type { SmartLeadFormConfig } from "../../../_lib/types"

// Just the name/title/brokerage/service-areas/phone text block — no photo,
// no positioning of its own. Used on the white background after Hero
// (Overlapping) and, unchanged apart from color, directly inside Hero's
// dark background (Under Headline). "justify-center" on the two flex rows
// below is a no-op when an ancestor flex column already centers this as a
// unit (Overlapping) — it's what makes them centered when this instead
// sits in Hero's plain block container (Under Headline).
export default function AgentInfoText({ config, theme }: { config: SmartLeadFormConfig; theme: "light" | "dark" }) {
  const { agentName, agentTitle, brokerageName, serviceAreas, phoneNumber } = config.copy
  const { brokerageInfo, serviceAreas: showServiceAreas, phoneNumber: showPhoneNumber } = config.sections.visibility

  const nameColor = theme === "dark" ? "text-white" : "text-[#0b0f1a]"
  const mutedColor = theme === "dark" ? "text-white/70" : "text-[#6b7280]"
  const fainterColor = theme === "dark" ? "text-white/60" : "text-[#9098a8]"
  const phoneHoverColor = theme === "dark" ? "hover:text-[#5b9bff]" : "hover:text-[#2f6bff]"

  return (
    <>
      <p className={`mt-3 flex min-w-0 max-w-full items-center justify-center gap-1.5 text-[16px] font-semibold ${nameColor}`}>
        <span className="min-w-0 break-words">{agentName}</span>
        <HiOutlineShieldCheck className="h-4 w-4 shrink-0 text-[#2f6bff]" />
      </p>
      <p className={`max-w-full break-words text-[13px] ${mutedColor}`}>{agentTitle}</p>
      {brokerageInfo && <p className={`mt-0.5 max-w-full break-words text-[13px] ${mutedColor}`}>{brokerageName}</p>}
      {showServiceAreas && <p className={`mt-1 max-w-full break-words text-[12px] font-medium ${fainterColor}`}>{serviceAreas}</p>}
      {showPhoneNumber && phoneNumber && (
        <a
          href={`tel:${phoneNumber.replace(/[^\d+]/g, "")}`}
          className={`mt-2.5 flex min-w-0 max-w-full items-center justify-center gap-1.5 text-[13px] font-medium transition-colors ${mutedColor} ${phoneHoverColor}`}
        >
          <HiOutlinePhone className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 break-words">{phoneNumber}</span>
        </a>
      )}
    </>
  )
}
