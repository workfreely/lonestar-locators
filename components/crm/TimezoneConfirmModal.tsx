"use client"

import { useState } from "react"
import {
  detectBrowserTimeZone,
  formatTimeZoneLabel,
  isValidTimeZone,
  COMMON_TIMEZONES,
} from "@/lib/timezone"

/**
 * First-login timezone confirmation — shown ONLY when profiles.timezone is null
 * (new users AND existing users who never confirmed). Detects the device IANA
 * zone to SEED the choice; the user Confirms or Changes; the value persists to
 * profiles.timezone. Never overwrites an already-saved zone (this never renders
 * once one exists). If detection is invalid, opens straight to the picker.
 */
export default function TimezoneConfirmModal({ onSaved }: { onSaved: (tz: string) => void }) {
  const detected = detectBrowserTimeZone()
  const detectedValid = isValidTimeZone(detected)
  const [mode, setMode] = useState<"confirm" | "change">(detectedValid ? "confirm" : "change")
  const [selected, setSelected] = useState<string>(detectedValid ? detected : "America/Chicago")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The detected zone appears in the picker even if it isn't one of the curated
  // common zones, so the user can keep it.
  const options = COMMON_TIMEZONES.some((z) => z.tz === detected) || !detectedValid
    ? COMMON_TIMEZONES
    : [{ tz: detected, label: "Detected" }, ...COMMON_TIMEZONES]

  async function save(tz: string) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/profile/timezone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone: tz }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "Save failed")
      onSaved(tz)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed")
      setSaving(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Confirm your time zone"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10050,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.55)",
        padding: 16,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 440,
          background: "#fff",
          color: "#111827",
          borderRadius: 16,
          boxShadow: "0 20px 60px rgba(0,0,0,0.35)",
          padding: 24,
        }}
      >
        <h2 style={{ margin: "0 0 10px", fontSize: 18, fontWeight: 700 }}>Confirm your time zone</h2>

        {mode === "confirm" ? (
          <>
            <p style={{ margin: "0 0 6px", fontSize: 14, lineHeight: 1.5 }}>
              We detected <strong>{formatTimeZoneLabel(detected)}</strong>.
            </p>
            <p style={{ margin: "0 0 20px", fontSize: 13.5, color: "#4b5563", lineHeight: 1.5 }}>
              Locator Beast will use this time zone for Next Actions, follow-ups, reminders, and Agenda times.
            </p>
            {error && <p style={{ color: "#dc2626", fontSize: 13, margin: "0 0 12px" }}>{error}</p>}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                disabled={saving}
                onClick={() => save(detected)}
                style={btnPrimary}
              >
                {saving ? "Saving…" : "Confirm"}
              </button>
              <button type="button" disabled={saving} onClick={() => setMode("change")} style={btnSecondary}>
                Change
              </button>
            </div>
          </>
        ) : (
          <>
            <p style={{ margin: "0 0 12px", fontSize: 13.5, color: "#4b5563", lineHeight: 1.5 }}>
              Choose the time zone Locator Beast should use for Next Actions, follow-ups, reminders, and Agenda times.
            </p>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #d1d5db",
                fontSize: 14,
                marginBottom: 16,
              }}
            >
              {options.map((z) => (
                <option key={z.tz} value={z.tz}>
                  {z.label} — {z.tz}
                </option>
              ))}
            </select>
            {error && <p style={{ color: "#dc2626", fontSize: 13, margin: "0 0 12px" }}>{error}</p>}
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" disabled={saving} onClick={() => save(selected)} style={btnPrimary}>
                {saving ? "Saving…" : "Save time zone"}
              </button>
              {detectedValid && (
                <button type="button" disabled={saving} onClick={() => setMode("confirm")} style={btnSecondary}>
                  Back
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const btnPrimary: React.CSSProperties = {
  flex: 1,
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid #2563eb",
  background: "#2563eb",
  color: "#fff",
  fontWeight: 600,
  fontSize: 14,
  cursor: "pointer",
}
const btnSecondary: React.CSSProperties = {
  flex: 1,
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid #d1d5db",
  background: "#fff",
  color: "#111827",
  fontWeight: 600,
  fontSize: 14,
  cursor: "pointer",
}
