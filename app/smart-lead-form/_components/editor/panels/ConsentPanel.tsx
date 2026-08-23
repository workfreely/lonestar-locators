import type { SmartLeadFormConfig } from "../../../_lib/types"
import { TextField } from "../ui/TextField"

type Updater = (updater: (prev: SmartLeadFormConfig) => SmartLeadFormConfig) => void

// A SECTION of the Content tab, not a tab of its own any more. Consent used to
// be a top-level tab holding a single editable string plus an on/off switch —
// a whole tab for one field, and a switch that let an agent publish a form with
// no consent at all. The switch is gone (consent is now required on every
// public form, enforced in mergeSmartFormConfig) and the wording moved in
// beside the other legal copy.
//
// Only the wording is configurable. Whether the checkbox appears, and whether
// it blocks submission, are no longer agent decisions.
export default function ConsentPanel({ config, onChange }: { config: SmartLeadFormConfig; onChange: Updater }) {
  function updateConsent(patch: Partial<SmartLeadFormConfig["consent"]>) {
    onChange((prev) => ({ ...prev, consent: { ...prev.consent, ...patch } }))
  }

  return (
    <>
      <p className="pb-1 text-[11px] font-semibold uppercase tracking-widest text-[#9098a8]">Consent Text</p>
      <p className="pb-2 text-[12px] leading-relaxed text-[#9098a8]">
        Always shown above your submit button, and required before a lead can submit. You can reword
        it, but it cannot be turned off or left blank.
      </p>
      {/* No field label: the section heading above already reads CONSENT TEXT,
          and a label repeating it under the helper copy said the same thing
          twice. */}
      <TextField value={config.consent.text} onChange={(v) => updateConsent({ text: v })} multiline />
    </>
  )
}
