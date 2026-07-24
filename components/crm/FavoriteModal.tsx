"use client"

import { useEffect, useRef, useState } from "react"
import { isValidUrl, normalizeUrl } from "@/lib/utils/isValidUrl"

export type FavoriteInput = {
  propertyName: string
  propertyUrl: string
  propertyAddress: string
}

type DetectionState = "idle" | "detecting" | "success" | "failed"

type Slot = {
  name: string
  url: string
  address: string
  detection: DetectionState
}

const EMPTY_SLOT: Slot = { name: "", url: "", address: "", detection: "idle" }

function isSlotEmpty(s: Slot) {
  return s.name.trim() === "" && s.url.trim() === ""
}

// Complete if there's a Property Name (manual entry, with or without a
// URL), OR a valid URL whose metadata detection has actually succeeded
// (per spec: "a valid URL alone should be enough to save after
// successful detection" — the "after successful detection" qualifier is
// load-bearing here, not just decorative). A URL that's present but
// malformed always blocks the slot, even if a name was also typed.
function isSlotComplete(s: Slot) {
  const urlText = s.url.trim()
  if (urlText && !isValidUrl(urlText)) return false
  if (s.name.trim() !== "") return true
  return isValidUrl(urlText) && s.detection === "success"
}

export default function FavoriteModal({
  open,
  editing,
  onClose,
  onSave,
}: {
  open: boolean
  // Non-null when editing a single existing favorite — shows one
  // pre-filled slot. Null means "add new," showing three empty slots so
  // several properties can be saved in one pass.
  editing: { property_name: string | null; property_url: string | null; property_address: string | null } | null
  onClose: () => void
  // Receives only the slots that had at least a name or URL filled in —
  // fully blank slots are dropped before this is ever called. Returns
  // whether the save actually succeeded; the modal only clears and closes
  // on a confirmed success, matching the pattern used elsewhere in the
  // Lead Panel.
  onSave: (entries: FavoriteInput[]) => Promise<boolean>
}) {
  const isEditing = editing !== null
  const slotCount = isEditing ? 1 : 3

  const [slots, setSlots] = useState<Slot[]>(() => Array.from({ length: slotCount }, () => ({ ...EMPTY_SLOT })))
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(false)

  // Guards against a slow/stale detect response landing after the URL in
  // that slot has already changed again — only the latest request per
  // slot is allowed to write back into state.
  const detectionTokens = useRef<number[]>([0, 0, 0])

  useEffect(() => {
    if (!open) return
    if (editing) {
      setSlots([{
        name: editing.property_name ?? "",
        url: editing.property_url ?? "",
        address: editing.property_address ?? "",
        detection: "idle",
      }])
    } else {
      setSlots(Array.from({ length: 3 }, () => ({ ...EMPTY_SLOT })))
    }
    detectionTokens.current = [0, 0, 0]
    setSubmitError(false)
  }, [open, editing])

  if (!open) return null

  function updateSlot(index: number, field: "name" | "url" | "address", value: string) {
    setSlots((prev) => prev.map((s, i) => {
      if (i !== index) return s
      // Editing the URL by hand invalidates whatever the last detection
      // pass found — the badge shouldn't keep claiming success/failure
      // for a URL that's no longer there.
      if (field === "url") return { ...s, url: value, detection: "idle" }
      return { ...s, [field]: value }
    }))
  }

  async function runDetection(index: number, urlValue: string) {
    if (!isValidUrl(urlValue)) return

    const myToken = ++detectionTokens.current[index]
    setSlots((prev) => prev.map((s, i) => (i === index ? { ...s, detection: "detecting" } : s)))

    try {
      const res = await fetch("/api/favorites/detect-metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlValue }),
      })
      const data = await res.json().catch(() => ({ success: false }))

      if (detectionTokens.current[index] !== myToken) return // stale — a newer URL/request has since taken over this slot

      setSlots((prev) => prev.map((s, i) => {
        if (i !== index) return s
        if (!data.success) return { ...s, detection: "failed" }
        return {
          ...s,
          // Never clobber something the user already typed themselves.
          name: s.name.trim() === "" && data.propertyName ? data.propertyName : s.name,
          address: s.address.trim() === "" && data.propertyAddress ? data.propertyAddress : s.address,
          detection: "success",
        }
      }))
    } catch {
      if (detectionTokens.current[index] !== myToken) return
      setSlots((prev) => prev.map((s, i) => (i === index ? { ...s, detection: "failed" } : s)))
    }
  }

  const filledSlots = slots.filter((s) => !isSlotEmpty(s))
  const hasIncompleteSlot = filledSlots.some((s) => !isSlotComplete(s))
  const canSubmit = filledSlots.length > 0 && !hasIncompleteSlot && !submitting

  function reset() {
    setSlots(Array.from({ length: slotCount }, () => ({ ...EMPTY_SLOT })))
    detectionTokens.current = [0, 0, 0]
    setSubmitError(false)
  }

  async function handleSubmit() {
    if (!canSubmit) return
    setSubmitting(true)
    setSubmitError(false)
    const entries: FavoriteInput[] = filledSlots.map((s) => ({
      propertyName: s.name.trim(),
      propertyUrl: s.url.trim() ? normalizeUrl(s.url.trim()) : "",
      propertyAddress: s.address.trim(),
    }))
    const ok = await onSave(entries)
    setSubmitting(false)
    if (ok) {
      reset()
    } else {
      setSubmitError(true)
    }
  }

  function handleClose() {
    reset()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[10000] bg-black/40 backdrop-blur-sm flex items-center justify-center px-4">
      <div className="w-full max-w-lg max-h-[85vh] bg-[var(--crm-panel)] rounded-2xl shadow-2xl p-6 flex flex-col">
        <h3 className="text-lg font-bold text-[var(--crm-text-primary)] flex-none">
          {isEditing ? "Edit Favorite" : "Add Favorites"}
        </h3>
        {!isEditing && (
          <p className="text-sm text-[var(--crm-text-secondary)] mt-1 flex-none">
            Add up to three properties at once — leave any slot blank to skip it.
          </p>
        )}

        <div className="mt-4 space-y-4 overflow-y-auto flex-1 pr-1">
          {slots.map((slot, i) => (
            <div key={i}>
              {!isEditing && (
                <p className="text-[11px] font-bold text-[var(--crm-text-secondary)] uppercase tracking-widest mb-2">
                  Favorite Property #{i + 1}
                </p>
              )}

              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-semibold text-[var(--crm-text-muted)] uppercase tracking-widest mb-1 block">
                    Property URL
                  </label>
                  <input
                    type="text"
                    autoFocus={i === 0}
                    value={slot.url}
                    onChange={(e) => updateSlot(i, "url", e.target.value)}
                    onBlur={(e) => runDetection(i, e.target.value)}
                    onPaste={(e) => {
                      const pasted = e.clipboardData.getData("text")
                      if (isValidUrl(pasted)) setTimeout(() => runDetection(i, pasted), 0)
                    }}
                    placeholder="https://... (paste a listing link to auto-fill)"
                    className="w-full text-[13px] border border-[var(--crm-border)] rounded-lg px-2.5 py-1.5 bg-[var(--crm-inset)] text-[var(--crm-text-primary)]"
                  />
                  {slot.detection === "detecting" && (
                    <p className="text-[11px] text-[var(--crm-text-muted)] mt-1">Detecting property info…</p>
                  )}
                  {slot.detection === "success" && (
                    <p className="text-[11px] text-emerald-600 font-medium mt-1">✓ Auto-filled from the property page</p>
                  )}
                  {slot.detection === "failed" && (
                    <p className="text-[11px] text-amber-600 font-medium mt-1">Couldn't detect details — enter them manually</p>
                  )}
                </div>

                <div>
                  <label className="text-[10px] font-semibold text-[var(--crm-text-muted)] uppercase tracking-widest mb-1 block">
                    Property Name
                  </label>
                  <input
                    type="text"
                    value={slot.name}
                    onChange={(e) => updateSlot(i, "name", e.target.value)}
                    className="w-full text-[13px] border border-[var(--crm-border)] rounded-lg px-2.5 py-1.5 bg-[var(--crm-inset)] text-[var(--crm-text-primary)]"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-semibold text-[var(--crm-text-muted)] uppercase tracking-widest mb-1 block">
                    Property Address (optional)
                  </label>
                  <input
                    type="text"
                    value={slot.address}
                    onChange={(e) => updateSlot(i, "address", e.target.value)}
                    className="w-full text-[13px] border border-[var(--crm-border)] rounded-lg px-2.5 py-1.5 bg-[var(--crm-inset)] text-[var(--crm-text-primary)]"
                  />
                </div>
              </div>

              {i < slots.length - 1 && <hr className="mt-4 border-[var(--crm-border-soft)]" />}
            </div>
          ))}
        </div>

        <div className="flex-none">
          <div className="flex justify-end gap-3 mt-5">
            <button
              onClick={handleClose}
              className="px-4 py-2 rounded-xl border border-[var(--crm-border)] text-sm font-medium text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? "Saving..." : "Save"}
            </button>
          </div>

          {submitError && (
            <p className="text-[11.5px] text-red-600 font-medium mt-2 text-right">
              Couldn't save — nothing was cleared, try again.
            </p>
          )}
          {!submitError && hasIncompleteSlot && (
            <p className="text-[11.5px] text-amber-600 font-medium mt-2 text-right">
              Add a Property Name, or wait for the URL to finish detecting, for each filled-in property.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
