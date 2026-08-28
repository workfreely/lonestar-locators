"use client"

import { useState } from "react"

// Add New Property — FORM SHELL.
//
// Opened from the failed-search state in the property search bar. Deliberately
// NOT persisted: creating a reusable property needs the property-schema work
// that has not been approved, so "Add Property" is inert and this writes
// nothing. Everything here is layout plus local state.
//
// The URL row reuses the EXISTING Add Favorites pattern verbatim — same
// /api/favorites/detect-metadata route, same blur/paste triggers, same
// stale-response token, same "never clobber what the user typed" rule. No second
// metadata system is introduced.

type Detection = "idle" | "detecting" | "success" | "failed"

// Commission is THREE independent values, not one choice between three. A
// property can pay a send percentage, an escort percentage and a flat
// fee/bonus at the same time, so each gets its own field and any combination
// (including none) is valid. Nothing in the property model represents this
// today — commission currently exists only on a closed lease's invoice — which
// is why these are captured but not yet persisted.

const FIELD =
  "w-full text-[13px] border border-[var(--crm-border)] rounded-lg px-2.5 py-1.5 bg-[var(--crm-inset)] text-[var(--crm-text-primary)]"
const LABEL =
  "text-[10px] font-semibold text-[var(--crm-text-muted)] uppercase tracking-widest mb-1 block"

function isValidUrl(value: string) {
  try {
    const u = new URL(value.trim())
    return u.protocol === "http:" || u.protocol === "https:"
  } catch {
    return false
  }
}

export default function AddPropertyModal({
  initialName = "",
  onClose,
}: {
  /** The text the locator searched for. Prefills Property Name, since a failed
   *  search is usually the property's name typed correctly. */
  initialName?: string
  onClose: () => void
}) {
  const [url, setUrl] = useState("")
  const [name, setName] = useState(initialName)
  const [phone, setPhone] = useState("")
  const [address, setAddress] = useState("")
  const [sendPct, setSendPct] = useState("")
  const [escortPct, setEscortPct] = useState("")
  const [flatFee, setFlatFee] = useState("")
  const [special, setSpecial] = useState("")
  const [detection, setDetection] = useState<Detection>("idle")
  const [token, setToken] = useState(0)

  async function runDetection(value: string) {
    if (!isValidUrl(value)) return
    const mine = token + 1
    setToken(mine)
    setDetection("detecting")
    try {
      const res = await fetch("/api/favorites/detect-metadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: value }),
      })
      const data = await res.json().catch(() => ({ success: false }))
      // Stale guard: a newer URL has since taken over.
      setToken((current) => {
        if (current !== mine) return current
        if (!data.success) {
          setDetection("failed")
          return current
        }
        // Never clobber something the locator already typed.
        setName((n) => (n.trim() === "" && data.propertyName ? data.propertyName : n))
        setAddress((a) => (a.trim() === "" && data.propertyAddress ? data.propertyAddress : a))
        setDetection("success")
        return current
      })
    } catch {
      setDetection("failed")
    }
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl bg-[var(--crm-panel)] p-6 shadow-2xl">
        <h3 className="flex-none text-lg font-bold text-[var(--crm-text-primary)]">Add New Property</h3>
        <p className="mt-1 flex-none text-sm text-[var(--crm-text-secondary)]">
          Paste a property link to auto-fill what we can, then review the details.
        </p>

        <div className="mt-4 flex-1 space-y-3 overflow-y-auto pr-1">
          <div>
            <label className={LABEL}>Property URL</label>
            <input
              type="text"
              autoFocus
              value={url}
              onChange={(e) => {
                setUrl(e.target.value)
                setDetection("idle")
              }}
              onBlur={(e) => void runDetection(e.target.value)}
              onPaste={(e) => {
                const pasted = e.clipboardData.getData("text")
                if (isValidUrl(pasted)) setTimeout(() => void runDetection(pasted), 0)
              }}
              placeholder="https://... (paste a property link to auto-fill)"
              className={FIELD}
            />
            {detection === "detecting" && (
              <p className="mt-1 text-[11px] text-[var(--crm-text-muted)]">Detecting property info…</p>
            )}
            {detection === "success" && (
              <p className="mt-1 text-[11px] font-medium text-emerald-600">✓ Auto-filled from the property page</p>
            )}
            {detection === "failed" && (
              <p className="mt-1 text-[11px] font-medium text-amber-600">
                Couldn&apos;t detect details — enter them manually
              </p>
            )}
          </div>

          <div>
            <label className={LABEL}>Property Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={FIELD} />
          </div>

          <div>
            <label className={LABEL}>Property Phone</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={FIELD} />
          </div>

          <div>
            <label className={LABEL}>Property Address</label>
            <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} className={FIELD} />
          </div>

          {/* Three independent commission fields on one line — any, all or none
              may be filled. Deliberately NOT a single-choice control: a property
              can pay a send percentage, an escort percentage and a flat
              fee/bonus at once, and we may need to store more than one. */}
          <div>
            {/* Section label only — the grid below is unchanged, so the three
                inputs keep their widths, order and labels. mb-1 (the same margin
                every other label uses) keeps the added height minimal. */}
            <label className={LABEL.replace("mb-1", "mb-2.5")}>Commission</label>
            <div className="grid grid-cols-3 gap-2">
            <div>
              <label className={LABEL}>Send %</label>
              <div className="relative">
                <input
                  type="text"
                  inputMode="decimal"
                  value={sendPct}
                  onChange={(e) => setSendPct(e.target.value.replace(/[^0-9.]/g, ""))}
                  placeholder="100"
                  className={`${FIELD} pr-6`}
                />
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[12.5px] text-[var(--crm-text-muted)]">
                  %
                </span>
              </div>
            </div>

            <div>
              <label className={LABEL}>Escort %</label>
              <div className="relative">
                <input
                  type="text"
                  inputMode="decimal"
                  value={escortPct}
                  onChange={(e) => setEscortPct(e.target.value.replace(/[^0-9.]/g, ""))}
                  placeholder="50"
                  className={`${FIELD} pr-6`}
                />
                <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[12.5px] text-[var(--crm-text-muted)]">
                  %
                </span>
              </div>
            </div>

            <div>
              <label className={LABEL}>Flat Fee / Bonus</label>
              <div className="relative">
                <input
                  type="text"
                  inputMode="decimal"
                  value={flatFee}
                  onChange={(e) => setFlatFee(e.target.value.replace(/[^0-9.]/g, ""))}
                  placeholder="500"
                  className={`${FIELD} pl-5`}
                />
                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[12.5px] text-[var(--crm-text-muted)]">
                  $
                </span>
              </div>
            </div>
            </div>
          </div>

          <div>
            <label className={LABEL}>Current Special</label>
            <input
              type="text"
              value={special}
              onChange={(e) => setSpecial(e.target.value)}
              placeholder="e.g. 6 weeks free"
              className={FIELD}
            />
          </div>
        </div>

        <div className="mt-5 flex flex-none items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-2 text-[13px] font-semibold text-[var(--crm-text-secondary)] transition-colors hover:bg-[var(--crm-card)]"
          >
            Cancel
          </button>
          {/* INERT. Saving needs the property-schema work that is not approved —
              wiring it now would write a property with nowhere durable to live. */}
          <button
            type="button"
            onClick={() => {}}
            className="rounded-lg bg-[#2f6bff] px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#265fe0]"
          >
            Add Property
          </button>
        </div>
      </div>
    </div>
  )
}
