import { HiOutlinePhone } from "react-icons/hi2"
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
}: {
  config: SmartLeadFormConfig
  theme: "light" | "dark"
  /** Pulls the title up under the name so the identity block reads as one unit.
   *  Opt-in: the recruiting page sets it to balance its larger photo; the Smart
   *  Lead Form leaves it off and renders exactly as approved. */
  tight?: boolean
}) {
  const { agentName, agentTitle, brokerageName, serviceAreas, phoneNumber } = config.copy
  const { brokerageInfo, serviceAreas: showServiceAreas, phoneNumber: showPhoneNumber } = config.sections.visibility

  const nameColor = theme === "dark" ? "text-white" : "text-[#0b0f1a]"
  const mutedColor = theme === "dark" ? "text-white/80" : "text-[#4b5563]"
  const phoneHoverColor = theme === "dark" ? "hover:text-[#5b9bff]" : "hover:text-[#2f6bff]"

  // IDENTITY HIERARCHY, and why the two themes differ.
  //
  // On the DARK hero, white-on-near-black is already a high-contrast pairing, so
  // 80%/65% alpha reads as deliberate recession — those values stay exactly as
  // shipped and the hero is untouched.
  //
  // On the WHITE background (the Overlapping placement) the same recession was not
  // reading as restraint, it was reading as washed out: #6b7280 cities at font-medium
  // sat too close to the page's own neutral text. The fix is hierarchy rather than
  // uniform boldness — name > title > cities stays intact, but every step moves up:
  // the title takes semibold and a darker grey, and the cities take a darker grey
  // while KEEPING font-medium, which is what preserves the gap between them.
  //
  // Sizes and spacing are untouched; weight and colour carry the whole change.
  // Contrast on white: #374151 ≈ 10.4:1, #4b5563 ≈ 8.0:1 — both clear of AA.
  const titleWeight = theme === "dark" ? "font-medium" : "font-semibold"
  const titleColor = theme === "dark" ? "text-white/80" : "text-[#374151]"
  const areasColor = theme === "dark" ? "text-white/65" : "text-[#4b5563]"

  // Single credibility line: title, then "· Brokerage" when brokerage info is on.
  const titleLine = [agentTitle, brokerageInfo ? brokerageName : ""]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(" · ")

  return (
    <>
      {/* A plain block, NOT a centred flex row. The decorative shield that used to sit
          beside the name was also decentring it: the row was `flex justify-center
          gap-1.5`, which centres the name+icon PAIR, pushing the name itself
          (18px icon + 6px gap) / 2 = 12px left of true centre — measured at −12.2px on
          the live form. So the flex/gap/justify wrapper went with the icon rather than
          the row simply losing a child: the name is now centred by the parent's own
          `text-center`, the identical mechanism the title and service-area lines below
          already use, which puts all three on one axis. */}
      <p className={`mt-3 min-w-0 max-w-full break-words text-[19px] font-semibold sm:text-[20px] ${nameColor}`}>
        {agentName}
      </p>
      {titleLine && (
        <p className={`${tight ? "mt-px" : "mt-1"} max-w-full break-words text-[15px] ${titleWeight} ${titleColor}`}>
          {titleLine}
        </p>
      )}
      {showServiceAreas && serviceAreas && (
        <p className={`mt-1 max-w-full break-words text-[13.5px] font-medium ${areasColor}`}>
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
