import { HiOutlineShieldCheck } from "react-icons/hi2"
import type { SmartLeadFormConfig } from "../../../_lib/types"

// Condensed name/credential/service-areas text block — no photo, no phone.
// (The agent phone is intentionally NOT shown here; it lives in profile data,
// emails, signatures, guest cards, CRM, and Beast Companion instead.) The
// title and brokerage are combined into one credibility line —
// "Licensed Apartment Locator · AptAmigo". Used on the white background after
// Hero (Overlapping) and, apart from color, directly inside Hero's dark
// background (Under Headline).
export default function AgentInfoText({ config, theme }: { config: SmartLeadFormConfig; theme: "light" | "dark" }) {
  const { agentName, agentTitle, brokerageName, serviceAreas } = config.copy
  const { brokerageInfo, serviceAreas: showServiceAreas } = config.sections.visibility

  const nameColor = theme === "dark" ? "text-white" : "text-[#0b0f1a]"
  const mutedColor = theme === "dark" ? "text-white/80" : "text-[#4b5563]"
  const fainterColor = theme === "dark" ? "text-white/65" : "text-[#6b7280]"

  // Single credibility line: title, then "· Brokerage" when brokerage info is on.
  const titleLine = [agentTitle, brokerageInfo ? brokerageName : ""]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(" · ")

  return (
    <>
      <p className={`mt-3 flex min-w-0 max-w-full items-center justify-center gap-1.5 text-[17px] font-semibold ${nameColor}`}>
        <span className="min-w-0 break-words">{agentName}</span>
        <HiOutlineShieldCheck className="h-[18px] w-[18px] shrink-0 text-[#2f6bff]" />
      </p>
      {titleLine && <p className={`mt-1 max-w-full break-words text-[14px] font-medium ${mutedColor}`}>{titleLine}</p>}
      {showServiceAreas && serviceAreas && (
        <p className={`mt-1 max-w-full break-words text-[13px] font-medium ${fainterColor}`}>{serviceAreas}</p>
      )}
    </>
  )
}
