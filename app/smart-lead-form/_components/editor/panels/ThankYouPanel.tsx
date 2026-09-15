"use client"

import type { SmartLeadFormConfig } from "../../../_lib/types"
import { TextField } from "../ui/TextField"

type Updater = (updater: (prev: SmartLeadFormConfig) => SmartLeadFormConfig) => void

// The "Thank You Page" tab — everything here controls the POST-SUBMIT experience
// (the /{username}/thank-you page), NOT the Smart Lead Form itself. All settings
// are optional; the thank-you page always looks complete when they are blank.
export default function ThankYouPanel({
  config,
  onChange,
}: {
  config: SmartLeadFormConfig
  onChange: Updater
}) {
  return (
    <div className="pt-3">
      {/* Section framing — removes any ambiguity about where these appear. */}
      <p className="text-[13px] font-semibold text-[#111318]">Thank You Page</p>
      <p className="mt-1 pb-2 text-[11.5px] leading-relaxed text-[#9098a8]">
        Customize what clients see after they submit your Smart Lead Form. These settings do not change the form itself.
      </p>

      {/* Optional intro video (post-submit only). */}
      <div className="pt-2">
        <p className="pb-1 text-[12px] font-semibold text-[#4b5162]">Thank You Page Video (Optional)</p>
        <p className="pb-1 text-[11.5px] leading-relaxed text-[#9098a8]">
          Add a YouTube video to introduce yourself and explain what happens next. It appears on your thank-you page after a
          client submits the form, never on the form itself.
        </p>
        <TextField
          label="YouTube URL"
          value={config.thankYouVideoUrl}
          onChange={(v) => onChange((prev) => ({ ...prev, thankYouVideoUrl: v }))}
        />
      </div>

      {/* Optional apply-step override. */}
      <div className="pt-4">
        <p className="pb-1 text-[12px] font-semibold text-[#4b5162]">Application Instructions (Optional)</p>
        <p className="pb-1 text-[11.5px] leading-relaxed text-[#9098a8]">
          Customize how clients should list you when they apply. Leave blank to use your name and brokerage.
        </p>
        <TextField
          label="Application instructions"
          value={config.thankYouApplyInstructions}
          onChange={(v) => onChange((prev) => ({ ...prev, thankYouApplyInstructions: v }))}
          multiline
        />
      </div>

      {/* Optional client reward — drives the conditional reward step. */}
      <div className="pt-4">
        <p className="pb-1 text-[12px] font-semibold text-[#4b5162]">Client Reward (Optional)</p>
        <p className="pb-1 text-[11.5px] leading-relaxed text-[#9098a8]">
          If you offer clients a reward (rebate, gift, free movers, etc.), describe it. Leave blank to hide the reward step.
        </p>
        <TextField
          label="Client reward"
          value={config.thankYouIncentive}
          onChange={(v) => onChange((prev) => ({ ...prev, thankYouIncentive: v }))}
        />
      </div>
    </div>
  )
}
