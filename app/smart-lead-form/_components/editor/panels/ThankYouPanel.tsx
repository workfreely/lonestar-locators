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
//
// Visual hierarchy mirrors the Content tab exactly:
//   • section title    → text-[13px] font-semibold text-[#111318]   (e.g. "Smart Lead Form")
//   • sub-group title  → text-[12px] font-semibold text-[#4b5162]   (e.g. "Testimonial 1")
//   • field label      → provided by TextField (text-[12px] font-semibold text-[#6b7280])
//   • helper copy      → text-[11.5px] leading-relaxed text-[#9098a8]
//   • section spacing  → each group wrapped in pt-3
export default function ThankYouPanel({
  config,
  onChange,
}: {
  config: SmartLeadFormConfig
  onChange: Updater
}) {
  const set = (patch: Partial<SmartLeadFormConfig>) => onChange((prev) => ({ ...prev, ...patch }))
  const rewardOn = shouldShowReward(config.thankYouShowReward, config.thankYouIncentive)

  const sectionTitle = "pb-1 text-[13px] font-semibold text-[#111318]"
  const groupTitle = "pb-1 text-[12px] font-semibold text-[#4b5162]"
  const helper = "pb-1 text-[11.5px] leading-relaxed text-[#9098a8]"

  return (
    <div className="pt-3">
      {/* Framing — removes any ambiguity about where these appear. */}
      <p className={sectionTitle}>Thank You Page</p>
      <p className="text-[11.5px] leading-relaxed text-[#9098a8]">
        Customize what clients see after they submit your Smart Lead Form. These settings do not change the form itself.
        Every field is optional — leave one blank to use the default.
      </p>

      {/* ── Intro ─────────────────────────────────────────────────────────── */}
      <div className="pt-3">
        <p className={sectionTitle}>Intro</p>
        <p className={helper}>
          The headline stays “Thanks, {"{firstName}"}!”. Edit the supporting line below — use {"{firstName}"} and{" "}
          {"{city}"} to personalize it.
        </p>
        <TextField
          label="Supporting message"
          value={config.thankYouIntro}
          onChange={(v) => set({ thankYouIntro: v })}
          placeholder={THANKYOU_DEFAULTS.intro}
          multiline
        />
      </div>

      {/* ── Steps ─────────────────────────────────────────────────────────── */}
      <div className="pt-3">
        <p className={sectionTitle}>Steps</p>
        <p className={helper}>Step 1 (“{THANKYOU_DEFAULTS.step1Title}”) is shown as completed and isn’t editable.</p>

        <p className={`pt-2 ${groupTitle}`}>Step 2</p>
        <TextField label="Title" value={config.thankYouStep2Title} onChange={(v) => set({ thankYouStep2Title: v })} placeholder={THANKYOU_DEFAULTS.step2Title} />
        <TextField label="Description" value={config.thankYouStep2Body} onChange={(v) => set({ thankYouStep2Body: v })} placeholder={THANKYOU_DEFAULTS.step2Body} multiline />

        <p className={`pt-3 ${groupTitle}`}>Step 3</p>
        <TextField label="Title" value={config.thankYouStep3Title} onChange={(v) => set({ thankYouStep3Title: v })} placeholder={THANKYOU_DEFAULTS.step3Title} />
        <TextField label="Description" value={config.thankYouStep3Body} onChange={(v) => set({ thankYouStep3Body: v })} placeholder={THANKYOU_DEFAULTS.step3Body} multiline />

        <p className={`pt-3 ${groupTitle}`}>Step 4 — Applying</p>
        <p className={helper}>The default description automatically lists your name and brokerage. Add your own instructions to override it.</p>
        <TextField label="Title" value={config.thankYouStep4Title} onChange={(v) => set({ thankYouStep4Title: v })} placeholder={THANKYOU_DEFAULTS.step4Title} />
        <TextField label="Application instructions" value={config.thankYouApplyInstructions} onChange={(v) => set({ thankYouApplyInstructions: v })} placeholder="Uses your name + brokerage by default" multiline />
      </div>

      {/* ── Reward step (optional) — the ToggleRow is the section header, mirroring
          how Testimonials / FAQs head their sections in the Content tab. ────── */}
      <div className="pt-3">
        <ToggleRow strong label="Reward step" checked={rewardOn} onChange={(v) => set({ thankYouShowReward: v ? "on" : "off" })} />
        {rewardOn && (
          <>
            <TextField label="Reward title" value={config.thankYouRewardTitle} onChange={(v) => set({ thankYouRewardTitle: v })} placeholder={THANKYOU_DEFAULTS.rewardTitle} />
            <p className={`pt-1 ${helper}`}>Describe the reward (rebate, gift, free movers, etc.). This is the only reward data.</p>
            <TextField label="Reward description" value={config.thankYouIncentive} onChange={(v) => set({ thankYouIncentive: v })} placeholder={THANKYOU_DEFAULTS.rewardBody} multiline />
          </>
        )}
      </div>

      {/* ── Video (optional) ──────────────────────────────────────────────── */}
      <div className="pt-3">
        <p className={sectionTitle}>Video</p>
        <p className={helper}>
          Add a YouTube video to introduce yourself and explain what happens next. It appears on your thank-you page after a
          client submits the form, never on the form itself.
        </p>
        <TextField label="Thank You Page Video (Optional)" value={config.thankYouVideoUrl} onChange={(v) => set({ thankYouVideoUrl: v })} placeholder="https://youtu.be/…" />
      </div>
    </div>
  )
}
