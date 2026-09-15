"use client"

import type { SmartLeadFormConfig } from "../../../_lib/types"
import { TextField } from "../ui/TextField"
import ToggleRow from "../ui/ToggleRow"
import { THANKYOU_DEFAULTS, shouldShowReward } from "@/lib/smartForm/thankYouSteps"

type Updater = (updater: (prev: SmartLeadFormConfig) => SmartLeadFormConfig) => void

// The "Thank You Page" tab — everything here controls the POST-SUBMIT experience
// (the /{username}/thank-you page), NOT the Smart Lead Form itself. Every field
// is optional; a blank field uses the default (shown as placeholder), so the
// thank-you page always looks complete.
export default function ThankYouPanel({
  config,
  onChange,
}: {
  config: SmartLeadFormConfig
  onChange: Updater
}) {
  const set = (patch: Partial<SmartLeadFormConfig>) => onChange((prev) => ({ ...prev, ...patch }))
  const rewardOn = shouldShowReward(config.thankYouShowReward, config.thankYouIncentive)

  const SectionLabel = ({ children }: { children: React.ReactNode }) => (
    <p className="pt-4 pb-1 text-[11px] font-semibold uppercase tracking-widest text-[#9098a8]">{children}</p>
  )

  return (
    <div className="pt-3">
      {/* Framing — removes any ambiguity about where these appear. */}
      <p className="text-[13px] font-semibold text-[#111318]">Thank You Page</p>
      <p className="mt-1 text-[11.5px] leading-relaxed text-[#9098a8]">
        Customize what clients see after they submit your Smart Lead Form. These settings do not change the form itself.
        Every field is optional — leave one blank to use the default.
      </p>

      {/* ── Intro ─────────────────────────────────────────────────────────── */}
      <SectionLabel>Intro</SectionLabel>
      <p className="pb-1 text-[11.5px] leading-relaxed text-[#9098a8]">
        The headline stays “Thanks, {"{firstName}"}!”. You can edit the supporting line below. Use {"{firstName}"} and{" "}
        {"{city}"} to personalize it.
      </p>
      <TextField
        label="Supporting message"
        value={config.thankYouIntro}
        onChange={(v) => set({ thankYouIntro: v })}
        placeholder={THANKYOU_DEFAULTS.intro}
        multiline
      />

      {/* ── Steps ─────────────────────────────────────────────────────────── */}
      <SectionLabel>Steps</SectionLabel>
      <p className="pb-1 text-[11.5px] leading-relaxed text-[#9098a8]">
        Step 1 (“{THANKYOU_DEFAULTS.step1Title}”) is shown as completed and isn’t editable.
      </p>

      <p className="pt-2 pb-1 text-[12px] font-semibold text-[#4b5162]">Step 2</p>
      <TextField label="Title" value={config.thankYouStep2Title} onChange={(v) => set({ thankYouStep2Title: v })} placeholder={THANKYOU_DEFAULTS.step2Title} />
      <TextField label="Description" value={config.thankYouStep2Body} onChange={(v) => set({ thankYouStep2Body: v })} placeholder={THANKYOU_DEFAULTS.step2Body} multiline />

      <p className="pt-3 pb-1 text-[12px] font-semibold text-[#4b5162]">Step 3</p>
      <TextField label="Title" value={config.thankYouStep3Title} onChange={(v) => set({ thankYouStep3Title: v })} placeholder={THANKYOU_DEFAULTS.step3Title} />
      <TextField label="Description" value={config.thankYouStep3Body} onChange={(v) => set({ thankYouStep3Body: v })} placeholder={THANKYOU_DEFAULTS.step3Body} multiline />

      <p className="pt-3 pb-1 text-[12px] font-semibold text-[#4b5162]">Step 4 — Applying</p>
      <p className="pb-1 text-[11.5px] leading-relaxed text-[#9098a8]">
        The default description automatically lists your name and brokerage. Add your own instructions to override it.
      </p>
      <TextField label="Title" value={config.thankYouStep4Title} onChange={(v) => set({ thankYouStep4Title: v })} placeholder={THANKYOU_DEFAULTS.step4Title} />
      <TextField label="Application instructions" value={config.thankYouApplyInstructions} onChange={(v) => set({ thankYouApplyInstructions: v })} placeholder="Uses your name + brokerage by default" multiline />

      {/* ── Reward step (optional) ────────────────────────────────────────── */}
      <SectionLabel>Reward Step (Optional)</SectionLabel>
      <ToggleRow
        strong
        label="Show reward step"
        checked={rewardOn}
        onChange={(v) => set({ thankYouShowReward: v ? "on" : "off" })}
      />
      {rewardOn && (
        <div className="pt-1">
          <TextField label="Reward title" value={config.thankYouRewardTitle} onChange={(v) => set({ thankYouRewardTitle: v })} placeholder={THANKYOU_DEFAULTS.rewardTitle} />
          <p className="pb-1 pt-2 text-[11.5px] leading-relaxed text-[#9098a8]">
            Describe the reward (rebate, gift, free movers, etc.). This is the only reward data — nothing else changes.
          </p>
          <TextField label="Reward description" value={config.thankYouIncentive} onChange={(v) => set({ thankYouIncentive: v })} placeholder={THANKYOU_DEFAULTS.rewardBody} multiline />
        </div>
      )}

      {/* ── Video (optional) ──────────────────────────────────────────────── */}
      <SectionLabel>Video (Optional)</SectionLabel>
      <p className="pb-1 text-[12px] font-semibold text-[#4b5162]">Thank You Page Video (Optional)</p>
      <p className="pb-1 text-[11.5px] leading-relaxed text-[#9098a8]">
        Add a YouTube video to introduce yourself and explain what happens next. It appears on your thank-you page after a
        client submits the form, never on the form itself.
      </p>
      <TextField label="YouTube URL" value={config.thankYouVideoUrl} onChange={(v) => set({ thankYouVideoUrl: v })} placeholder="https://youtu.be/…" />
    </div>
  )
}
