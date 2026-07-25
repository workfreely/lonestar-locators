import type { SmartLeadFormConfig } from "../../../_lib/types"
import { TextField } from "../ui/TextField"
import Toggle from "../ui/Toggle"

type Updater = (updater: (prev: SmartLeadFormConfig) => SmartLeadFormConfig) => void

export default function ConsentPanel({ config, onChange }: { config: SmartLeadFormConfig; onChange: Updater }) {
  const consent = config.consent

  function updateConsent(patch: Partial<SmartLeadFormConfig["consent"]>) {
    onChange((prev) => ({ ...prev, consent: { ...prev.consent, ...patch } }))
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="rounded-xl bg-[#f4f5f8] p-3 text-[12px] leading-relaxed text-[#6b7280]">
        This checkbox appears just above the submit button. Wording is fully editable.
      </div>

      <div className="pt-2">
        <Toggle label="Consent checkbox" checked={consent.enabled} onChange={(v) => updateConsent({ enabled: v })} />
        {consent.enabled && (
          <TextField label="Consent Text" value={consent.text} onChange={(v) => updateConsent({ text: v })} multiline />
        )}
      </div>
    </div>
  )
}
