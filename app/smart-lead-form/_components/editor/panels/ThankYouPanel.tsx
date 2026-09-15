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
// Visual hierarchy mirrors the Content tab (section title #111318 / sub-group
// #4b5162 / TextField label / #9098a8 helper; pt-3 section rhythm).
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
      {/* Framing */}
      <p className={sectionTitle}>Thank You Page</p>
      <p className="text-[11.5px] leading-relaxed text-[#9098a8]">
        Customize what clients see after they submit your Smart Lead Form.
      </p>

      {/* ── Intro ─────────────────────────────────────────────────────────── */}
      <div className="pt-3">
        <p className={sectionTitle}>Intro</p>
        <p className={helper}>Use {"{firstName}"} and {"{city}"} to personalize it.</p>
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
        <p className={helper}>Step 1 is shown as completed and can’t be edited.</p>

        <p className={`pt-2 ${groupTitle}`}>Step 2</p>
        <TextField label="Title" value={config.thankYouStep2Title} onChange={(v) => set({ thankYouStep2Title: v })} placeholder={THANKYOU_DEFAULTS.step2Title} />
        <TextField label="Description" value={config.thankYouStep2Body} onChange={(v) => set({ thankYouStep2Body: v })} placeholder={THANKYOU_DEFAULTS.step2Body} multiline />

        <p className={`pt-3 ${groupTitle}`}>Step 3</p>
        <TextField label="Title" value={config.thankYouStep3Title} onChange={(v) => set({ thankYouStep3Title: v })} placeholder={THANKYOU_DEFAULTS.step3Title} />
        <TextField label="Description" value={config.thankYouStep3Body} onChange={(v) => set({ thankYouStep3Body: v })} placeholder={THANKYOU_DEFAULTS.step3Body} multiline />

        <p className={`pt-3 ${groupTitle}`}>Step 4 — Applying</p>
        <p className={helper}>Uses your name and brokerage by default.</p>
        <TextField label="Title" value={config.thankYouStep4Title} onChange={(v) => set({ thankYouStep4Title: v })} placeholder={THANKYOU_DEFAULTS.step4Title} />
        <TextField label="Application instructions" value={config.thankYouApplyInstructions} onChange={(v) => set({ thankYouApplyInstructions: v })} placeholder="Uses your name + brokerage by default" multiline />
      </div>

      {/* ── Reward step (optional) — ToggleRow heads the section, like Content. */}
      <div className="pt-3">
        <ToggleRow strong label="Reward step" checked={rewardOn} onChange={(v) => set({ thankYouShowReward: v ? "on" : "off" })} />
        <p className={helper}>Use this for rebates, free movers, or other client rewards.</p>
        {rewardOn && (
          <>
            <TextField label="Reward title" value={config.thankYouRewardTitle} onChange={(v) => set({ thankYouRewardTitle: v })} placeholder={THANKYOU_DEFAULTS.rewardTitle} />
            <TextField label="Reward description" value={config.thankYouIncentive} onChange={(v) => set({ thankYouIncentive: v })} placeholder={THANKYOU_DEFAULTS.rewardBody} multiline />
          </>
        )}
      </div>

      {/* ── Video (optional) ──────────────────────────────────────────────── */}
      <div className="pt-3">
        <p className={`flex items-center gap-1.5 ${sectionTitle}`}>
          <svg width="17" height="17" viewBox="0 0 24 24" className="flex-none" aria-hidden>
            <rect x="2" y="5" width="20" height="14" rx="4" fill="#FF0000" />
            <path d="M10 8.5l6 3.5-6 3.5v-7z" fill="#ffffff" />
          </svg>
          Thank You Page Video
        </p>
        <p className={helper}>Add an optional YouTube video for your clients.</p>
        <TextField label="YouTube URL" value={config.thankYouVideoUrl} onChange={(v) => set({ thankYouVideoUrl: v })} placeholder="https://youtu.be/…" />
      </div>
    </div>
  )
}
