import type { SmartLeadFormConfig } from "../../../_lib/types"
import { HERO_THEMES } from "../../../_lib/heroThemes"
import UploadTile from "../ui/UploadTile"
import SegmentedControl from "../ui/SegmentedControl"
import Select from "../ui/Select"

type Updater = (updater: (prev: SmartLeadFormConfig) => SmartLeadFormConfig) => void

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

export default function BrandingPanel({ config, onChange }: { config: SmartLeadFormConfig; onChange: Updater }) {
  const { logoUrl, agentPhotoUrl, agentPhotoSize, heroTheme, heroImageUrl, heroOverlay, buttonColor } = config.branding

  function updateBranding(patch: Partial<SmartLeadFormConfig["branding"]>) {
    onChange((prev) => ({ ...prev, branding: { ...prev.branding, ...patch } }))
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-4">
        <UploadTile label="Agent Photo" imageUrl={agentPhotoUrl} onChange={(url) => updateBranding({ agentPhotoUrl: url })} round />
        <UploadTile label="Logo" imageUrl={logoUrl} onChange={(url) => updateBranding({ logoUrl: url })} />
      </div>

      <div className="py-3">
        <p className="mb-2 text-[12px] font-semibold text-[#6b7280]">Agent Photo Size</p>
        <SegmentedControl
          options={PHOTO_SIZE_OPTIONS}
          value={agentPhotoSize}
          onChange={(value) => updateBranding({ agentPhotoSize: value })}
        />
      </div>

      <div className="py-3">
        <p className="mb-2 text-[12px] font-semibold text-[#6b7280]">Hero Background</p>
        <Select
          label="Theme"
          options={HERO_THEMES.map((theme) => ({ id: theme.id, label: theme.label }))}
          value={heroTheme}
          onChange={(value) => updateBranding({ heroTheme: value })}
        />

        {heroTheme === "custom" ? (
          <UploadTile label="Background Image" imageUrl={heroImageUrl} onChange={(url) => updateBranding({ heroImageUrl: url })} wide />
        ) : (
          <p className="rounded-lg border border-dashed border-[#e5e7ee] bg-[#f9fafb] px-3 py-2.5 text-[12px] leading-relaxed text-[#9098a8]">
            Built-in city photography for this theme is coming soon. Switch to Custom to upload your own background.
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
