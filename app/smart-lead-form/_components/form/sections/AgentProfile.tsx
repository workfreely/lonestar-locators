import { HiCheck } from "react-icons/hi2"
import type { SmartLeadFormConfig } from "../../../_lib/types"
import { AGENT_PHOTO_SIZES } from "../../../_lib/agentPhotoSizes"
import AgentPhoto from "./AgentPhoto"
import AgentInfoText from "./AgentInfoText"

/** Hard ceiling on the reassurance microcopy, matching the editor's maxLength.
 *  Enforced at RENDER too, not only in the input: the editor is not the only way
 *  a config can reach this component, and one over-long line would push the form
 *  card down and undo the spacing this section is carefully balancing. */
export const FORM_REASSURANCE_MAX = 60

// Overlapping placement only — SmartLeadForm.tsx doesn't render this
// component at all when Under Headline is selected, since in that case
// the photo and text both live inside Hero.tsx instead.
export default function AgentProfile({ config }: { config: SmartLeadFormConfig }) {
  const { agentPhotoSize } = config.branding
  const reassurance = (config.copy.formReassurance ?? "").trim().slice(0, FORM_REASSURANCE_MAX)

  return (
    // The bottom padding is the lever that pays for the reassurance line, so it
    // depends on whether that line is there at all.
    //
    // WITHOUT it: pb-8, exactly as this section has always been — a blank setting
    // leaves no trace, not a collapsed-looking gap.
    //
    // WITH it: pb-0. The cities line used to sit 68px above the form card (34px of
    // this section's bottom padding + 34px of the form section's top padding).
    // Surrendering this section's half, and reclaiming ~13px of the form's half via
    // the line's own negative bottom margin, fits the new line INSIDE that gap and
    // still closes the section up rather than making it taller. The form section is
    // deliberately untouched — it is shared with the Under Headline layout, which
    // does not get this line.
    <section className={`px-5 pt-0 sm:px-8 ${reassurance ? "pb-0" : "pb-8"}`}>
      <div className="mx-auto flex max-w-lg flex-col items-center text-center">
        <div className={AGENT_PHOTO_SIZES[agentPhotoSize].pullUpClass}>
          <AgentPhoto config={config} />
        </div>

        <AgentInfoText config={config} theme="light" />

        {/* A quiet green pill: the middle rung of the page's three-level hierarchy —
            the blue incentive bar above is the loud one (benefits), this is
            low-friction reassurance, and the grey/black identity text is detail.
            Staying BELOW the blue bar is the whole job, so the green is desaturated
            on every axis: a near-white #f2f9f4 ground, a #d4e9dc hairline for
            definition rather than contrast, and muted #2f6b4a text. A saturated
            green with a filled ground would read as a success ALERT — something that
            just happened — when nothing has happened yet.

            Text stays whatever the agent typed; the treatment is independent of the
            wording, so the copy remains fully editable and the default sentence is
            not special-cased.

            The negative bottom margin eats into the form section's 34px top padding
            so the line lands ~21px above the card instead of 34px. Margins do not
            collapse inside this flex column, so it genuinely shortens the section
            rather than just shifting the text down.

            mt-2.5 rather than mt-3.5 because the 13px line box carries ~4px of
            leading above its ink: a 14px margin measured as an 18px VISIBLE gap,
            where 10px lands it at ~14px — mid-band for the separation this line
            wants from the identity block. */}
        {reassurance && (
          <p className="mt-2.5 -mb-[13px] inline-flex max-w-full items-center gap-1.5 rounded-full border border-[#d4e9dc] bg-[#f2f9f4] px-3 py-1.5 text-[13px] font-medium text-[#2f6b4a]">
            <HiCheck className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="min-w-0">{reassurance}</span>
          </p>
        )}
      </div>
    </section>
  )
}
