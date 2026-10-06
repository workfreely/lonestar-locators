import type { SmartLeadFormConfig } from "../../../_lib/types"
import { getHeroTheme } from "../../../_lib/heroThemes"
import { AVAILABLE_THEME_GROUPS, CUSTOM_THEME_ID } from "@/lib/themes/config"
import UploadTile from "../ui/UploadTile"
import SegmentedControl from "../ui/SegmentedControl"
import Select from "../ui/Select"
import { TextField } from "../ui/TextField"
import { DEFAULT_CONFIG } from "../../../_lib/defaultConfig"
import { FORM_REASSURANCE_MAX } from "../../form/sections/AgentProfile"

type Updater = (updater: (prev: SmartLeadFormConfig) => SmartLeadFormConfig) => void

// Hero Background dropdown, rendered straight from the centralized theme catalog
// in its fixed order (grouped by state), with Custom always the final option.
const THEME_GROUPS = AVAILABLE_THEME_GROUPS.map((g) => ({
  label: g.state,
  options: g.themes.map((t) => ({ id: t.slug, label: t.label })),
}))
const CUSTOM_OPTION = [{ id: CUSTOM_THEME_ID, label: "Custom" }]

const SWATCHES = ["#2f6bff", "#7c3aed", "#0f9d58", "#e11d48", "#ea580c", "#0891b2"]

const OVERLAY_OPTIONS: { id: SmartLeadFormConfig["branding"]["heroOverlay"]; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "medium", label: "Medium" },
  { id: "dark", label: "Dark" },
]

const PHOTO_SIZE_OPTIONS: { id: SmartLeadFormConfig["branding"]["agentPhotoSize"]; label: string }[] = [
  { id: "small", label: "Small" },
  { id: "medium", label: "Medium" },
  { id: "large", label: "Large" },
]

const PROFILE_IMAGE_POSITION_OPTIONS: { id: SmartLeadFormConfig["branding"]["profileImagePosition"]; label: string }[] = [
  { id: "underHeadline", label: "Under Headline" },
  { id: "overlapping", label: "Overlapping" },
]

export default function BrandingPanel({ config, onChange }: { config: SmartLeadFormConfig; onChange: Updater }) {
  const { agentPhotoSize, profileImagePosition, heroTheme, heroImageUrl, heroOverlay, buttonColor } =
    config.branding
  const { formReassurance } = config.copy

  function updateBranding(patch: Partial<SmartLeadFormConfig["branding"]>) {
    onChange((prev) => ({ ...prev, branding: { ...prev.branding, ...patch } }))
  }

  // The reassurance line is microcopy, so it lives in `copy` with the rest of the
  // editable text even though its control sits in this panel beside the placement
  // switch that governs whether it renders at all.
  function updateCopy(patch: Partial<SmartLeadFormConfig["copy"]>) {
    onChange((prev) => ({ ...prev, copy: { ...prev.copy, ...patch } }))
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="pb-3">
        <p className="mb-2 text-[12px] font-semibold text-[#6b7280]">Agent Photo Size</p>
        <SegmentedControl
          options={PHOTO_SIZE_OPTIONS}
          value={agentPhotoSize}
          onChange={(value) => updateBranding({ agentPhotoSize: value })}
        />

        <p className="mb-2 mt-3 text-[12px] font-semibold text-[#6b7280]">Agent Photo Position</p>
        <SegmentedControl
          options={PROFILE_IMAGE_POSITION_OPTIONS}
          value={profileImagePosition}
          onChange={(value) => updateBranding({ profileImagePosition: value })}
        />

        {/* Overlapping only, and shown HERE rather than in the Content tab because
            it exists only as a consequence of the control directly above it — the
            line lives in the gap that the Overlapping placement creates between the
            agent block and the form. Switching to Under Headline hides the field
            without discarding the text, so switching back restores it.

            Clearing it is a supported choice: the renderer drops the line and
            restores the section's original spacing. The placeholder shows the
            default so a blank field still reads as deliberate rather than broken. */}
        {profileImagePosition === "overlapping" && (
          <div className="mt-3">
            <TextField
              label="Form Reassurance Text"
              value={formReassurance}
              onChange={(v) => updateCopy({ formReassurance: v })}
              maxLength={FORM_REASSURANCE_MAX}
              placeholder={DEFAULT_CONFIG.copy.formReassurance}
            />
          </div>
        )}
      </div>

      <div className="py-3">
        <p className="mb-2 text-[12px] font-semibold text-[#6b7280]">Hero Background</p>
        <Select
          label="Background"
          groups={THEME_GROUPS}
          options={CUSTOM_OPTION}
          value={heroTheme}
          onChange={(value) => updateBranding({ heroTheme: value })}
        />

        {heroTheme === CUSTOM_THEME_ID ? (
          <UploadTile label="Background Image" imageUrl={heroImageUrl} onChange={(url) => updateBranding({ heroImageUrl: url })} wide />
        ) : getHeroTheme(heroTheme).defaultImageUrl ? (
          // Bundled photography exists for this city — show a live preview so the
          // locator sees exactly what the hero background will be.
          <div className="mt-2 overflow-hidden rounded-lg border border-[#e5e7ee]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={getHeroTheme(heroTheme).defaultImageUrl as string}
              alt={`${getHeroTheme(heroTheme).label} skyline`}
              loading="lazy"
              decoding="async"
              className="h-24 w-full object-cover"
            />
          </div>
        ) : (
          // Built-in theme with no photography yet — it stays selectable and the
          // hero falls back to the default background.
          <p className="rounded-lg border border-dashed border-[#e5e7ee] bg-[#f9fafb] px-3 py-2.5 text-[12px] leading-relaxed text-[#9098a8]">
            No photo yet — your hero uses the default. Choose Custom to upload your own.
          </p>
        )}

        <p className="mb-2 mt-3 text-[12px] font-semibold text-[#6b7280]">Overlay</p>
        <div>
          <SegmentedControl
            options={OVERLAY_OPTIONS}
            value={heroOverlay}
            onChange={(value) => updateBranding({ heroOverlay: value })}
          />
        </div>
      </div>

      <div className="py-3">
        <p className="mb-2 text-[12px] font-semibold text-[#6b7280]">Button Color</p>
        <div className="flex flex-wrap items-center gap-2">
          {SWATCHES.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => updateBranding({ buttonColor: color })}
              className={`h-8 w-8 rounded-full transition-transform hover:scale-110 ${
                buttonColor === color ? "ring-2 ring-offset-2 ring-[#111318]" : ""
              }`}
              style={{ backgroundColor: color }}
              aria-label={color}
            />
          ))}
          <label className="relative h-8 w-8 cursor-pointer overflow-hidden rounded-full border border-[#e5e7ee]">
            <input
              type="color"
              value={buttonColor}
              onChange={(e) => updateBranding({ buttonColor: e.target.value })}
              className="absolute -left-1 -top-1 h-10 w-10 cursor-pointer"
            />
          </label>
        </div>
      </div>
    </div>
  )
}
