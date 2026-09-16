"use client"

import type { SmartLeadFormConfig } from "../../../_lib/types"
import { TextField } from "../ui/TextField"
import ToggleRow from "../ui/ToggleRow"
import { THANKYOU_DEFAULTS, shouldShowReward } from "@/lib/smartForm/thankYouSteps"

type Updater = (updater: (prev: SmartLeadFormConfig) => SmartLeadFormConfig) => void

// The "Thank You Page" tab — everything here controls the POST-SUBMIT experience
// (the /{username}/thank-you page), NOT the Smart Lead Form itself. The editor
// mirrors the public page 1:1 (Intro, then the numbered steps in order, then the
// video) so an agent can scan it and know exactly where each item appears. Every
// field is optional; a blank field uses the default (shown as placeholder).
//
// Visual hierarchy matches the Content tab (section title #111318 / TextField
// label / #9098a8 helper; pt-3 section rhythm).
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
  const helper = "pb-1 text-[11.5px] leading-relaxed text-[#9098a8]"

  return (
    <div className="pt-3">
      {/* Framing */}
      <p className={sectionTitle}>Thank You Page</p>
      <p className="text-[11.5px] leading-relaxed text-[#9098a8]">
        Customize what clients see after they submit your Smart Lead Form.
      </p>

      {/* ── Intro (kept separate from the numbered steps) ─────────────────── */}
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

      {/* ── Step 1 — informational only ───────────────────────────────────── */}
      <div className="pt-3">
        <p className={sectionTitle}>Step 1 — Form submitted</p>
        <p className="text-[11.5px] leading-relaxed text-[#9098a8]">Completed automatically.</p>
      </div>

      {/* ── Step 2 ────────────────────────────────────────────────────────── */}
      <div className="pt-3">
        <p className={sectionTitle}>Step 2 — Personalized apartment list</p>
        <TextField label="Title" value={config.thankYouStep2Title} onChange={(v) => set({ thankYouStep2Title: v })} placeholder={THANKYOU_DEFAULTS.step2Title} />
        <TextField label="Description" value={config.thankYouStep2Body} onChange={(v) => set({ thankYouStep2Body: v })} placeholder={THANKYOU_DEFAULTS.step2Body} multiline />
      </div>

      {/* ── Step 3 ────────────────────────────────────────────────────────── */}
      <div className="pt-3">
        <p className={sectionTitle}>Step 3 — Tour your favorites</p>
        <TextField label="Title" value={config.thankYouStep3Title} onChange={(v) => set({ thankYouStep3Title: v })} placeholder={THANKYOU_DEFAULTS.step3Title} />
        <TextField label="Description" value={config.thankYouStep3Body} onChange={(v) => set({ thankYouStep3Body: v })} placeholder={THANKYOU_DEFAULTS.step3Body} multiline />
      </div>

      {/* ── Step 4 ────────────────────────────────────────────────────────── */}
      <div className="pt-3">
        <p className={sectionTitle}>Step 4 — Applying</p>
        <p className={helper}>Uses your name and brokerage by default.</p>
        <TextField label="Title" value={config.thankYouStep4Title} onChange={(v) => set({ thankYouStep4Title: v })} placeholder={THANKYOU_DEFAULTS.step4Title} />
        <TextField label="Application instructions" value={config.thankYouApplyInstructions} onChange={(v) => set({ thankYouApplyInstructions: v })} placeholder="Uses your name + brokerage by default" multiline />
      </div>

      {/* ── Step 5 — reward (optional) ────────────────────────────────────── */}
      <div className="pt-3">
        <p className={sectionTitle}>Step 5 — Reward</p>
        <ToggleRow label="Show reward step" checked={rewardOn} onChange={(v) => set({ thankYouShowReward: v ? "on" : "off" })} />
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
