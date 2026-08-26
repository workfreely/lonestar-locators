"use client"

import { SettingsHeader } from "@/components/crm/settings/SettingsShell"

export default function EditorToolbar({
  onSave,
  saving,
  saved,
  saveError,
}: {
  onSave: () => void
  saving: boolean
  saved: boolean
  saveError: string | null
}) {
  // Reuses the shared Business Settings header: Back to Dashboard and the agent
  // avatar/menu come from SettingsHeader, and Save slots between them. The
  // Desktop/Mobile toggle was removed rather than replaced — one responsive form
  // means one preview, and nothing takes the toggle's place. The public link
  // lives in the Share tab (not the header), keeping this bar minimal.
  return (
    /* forceDarkSurface: this editor renders outside ThemeProvider, so the
       header's --crm-* tokens would otherwise resolve to the LIGHT defaults and
       the bar would come out white. On /admin pages the theme is already on
       <html>, so they must NOT pass this. */
    <SettingsHeader forceDarkSurface>
      <div className="flex items-center gap-3">
        {saveError && <span className="text-[12.5px] font-medium text-red-600">{saveError}</span>}
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="rounded-full bg-[#111318] px-5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#2f6bff] disabled:opacity-60"
        >
          {saving ? "Saving…" : saved ? "Saved" : "Save Changes"}
        </button>
      </div>
    </SettingsHeader>
  )
}
