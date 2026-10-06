import { HiOutlineShieldCheck, HiOutlinePhone } from "react-icons/hi2"
import type { SmartLeadFormConfig } from "../../../_lib/types"

// Condensed name/credential/service-areas text block. The title and brokerage
// combine into one credibility line — "Licensed Apartment Locator · AptAmigo" —
// with the brokerage gated by visibility.brokerageInfo (OFF by default). The
// agent phone is also OFF by default but stays fully toggle-able via
// visibility.phoneNumber, so an agent can choose to show it; when hidden it
// still lives in profile data, emails, signatures, guest cards, CRM, and Beast
// Companion. Used on the white background after Hero (Overlapping) and, apart
// from color, directly inside Hero's dark background (Under Headline).
export default function AgentInfoText({
  config,
  theme,
  tight = false,
  verifiedBadge = false,
}: {
  config: SmartLeadFormConfig
  theme: "light" | "dark"
  /** Pulls the title up under the name so the identity block reads as one unit.
   *  Opt-in: the recruiting page sets it to balance its larger photo; the Smart
   *  Lead Form leaves it off and renders exactly as approved. */
  tight?: boolean
  /** Decorative blue shield beside the name. Removed from the public Smart Lead
   *  Form (both the Under Headline and Overlapping placements) and now OPT-IN, so
   *  the recruiting page at /locator-beast/join/[slug] — which shares this
   *  component — keeps it until we decide about that page on its own terms.
   *  Default OFF: the two Smart Lead Form call sites are the common case, and a
   *  surface that wants the badge should have to say so. */
  verifiedBadge?: boolean
}) {
  const { agentName, agentTitle, brokerageName, serviceAreas, phoneNumber } = config.copy
  const { brokerageInfo, serviceAreas: showServiceAreas, phoneNumber: showPhoneNumber } = config.sections.visibility

  const nameColor = theme === "dark" ? "text-white" : "text-[#0b0f1a]"
  const mutedColor = theme === "dark" ? "text-white/80" : "text-[#4b5563]"
  const fainterColor = theme === "dark" ? "text-white/65" : "text-[#6b7280]"
  const phoneHoverColor = theme === "dark" ? "hover:text-[#5b9bff]" : "hover:text-[#2f6bff]"

  // Single credibility line: title, then "· Brokerage" when brokerage info is on.
  const titleLine = [agentTitle, brokerageInfo ? brokerageName : ""]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(" · ")

  return (
    <>
      {/* Two layouts, because the badge is not just an added glyph — it changes how
          the name is centred. WITH it, `justify-center` centres the name+icon PAIR,
          which pushes the name itself (18px icon + 6px gap) / 2 = 12px left of true
          centre; measured at exactly −12.2px on the live form. That offset is the
          reason the badge-less branch is a plain block rather than the same flex row
          minus one child: the name is centred by the parent's own `text-center`, the
          identical mechanism the title and service-area lines already use, so all
          three lines share one axis.

          The badge branch is kept byte-for-byte as it shipped so the recruiting page
          renders exactly as before. */}
      {verifiedBadge ? (
        <p className={`mt-3 flex min-w-0 max-w-full items-center justify-center gap-1.5 text-[19px] font-semibold sm:text-[20px] ${nameColor}`}>
          <span className="min-w-0 break-words">{agentName}</span>
          <HiOutlineShieldCheck className="h-[18px] w-[18px] shrink-0 text-[#2f6bff]" />
        </p>
      ) : (
        <p className={`mt-3 min-w-0 max-w-full break-words text-[19px] font-semibold sm:text-[20px] ${nameColor}`}>
          {agentName}
        </p>
      )}
      {titleLine && (
        <p className={`${tight ? "mt-px" : "mt-1"} max-w-full break-words text-[15px] font-medium ${mutedColor}`}>
          {titleLine}
        </p>
      )}
      {showServiceAreas && serviceAreas && (
        <p className={`mt-1 max-w-full break-words text-[13.5px] font-medium ${fainterColor}`}>
          {serviceAreas
            .split(/\s*,\s*/)
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
      {showPhoneNumber && phoneNumber && (
        <a
          href={`tel:${phoneNumber.replace(/[^\d+]/g, "")}`}
          className={`mt-2 flex min-w-0 max-w-full items-center justify-center gap-1.5 text-[14px] font-medium transition-colors ${mutedColor} ${phoneHoverColor}`}
        >
          <HiOutlinePhone className="h-4 w-4 shrink-0" />
          <span className="min-w-0 break-words">{phoneNumber}</span>
        </a>
      )}
    </>
  )
}
