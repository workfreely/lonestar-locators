"use client"
import { useEffect, useState } from "react"
import { SettingsCard, settingsInputCls } from "@/components/crm/settings/SettingsShell"

type Conflict = {
  id: number
  place_id: string
  property_name: string
  field_name: string
  existing_value: string | null
  incoming_value: string | null
  incoming_source_type: string | null
  classification: string
}

function fmt(v: string | null) {
  if (!v) return "—"
  try { const p = JSON.parse(v); if (Array.isArray(p)) return p.join(" · ") } catch { /* not json */ }
  return v
}

export default function ConflictReview() {
  const [conflicts, setConflicts] = useState<Conflict[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<number | null>(null)
  const [editing, setEditing] = useState<number | null>(null)
  const [editVal, setEditVal] = useState("")

  const load = () => {
    setLoading(true)
    fetch("/api/admin/property-intelligence/conflicts")
      .then((r) => r.json())
      .then((d) => setConflicts(d.conflicts ?? []))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  async function act(id: number, action: string, value?: string) {
    setBusy(id)
    try {
      const res = await fetch("/api/admin/property-intelligence/conflicts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, value }),
      })
      if (res.ok) { setEditing(null); setConflicts((c) => c.filter((x) => x.id !== id)) }
      else { const e = await res.json(); alert(e.error ?? "failed") }
    } finally { setBusy(null) }
  }

  if (loading) return <p style={{ color: "#6b7280", fontSize: 14 }}>Loading conflicts…</p>
  if (!conflicts.length) return <p style={{ color: "#3f8f5b", fontSize: 14 }}>No conflicts pending review. 🎉</p>

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <p style={{ color: "#6b7280", fontSize: 13, margin: 0 }}>
        {conflicts.length} conflict{conflicts.length === 1 ? "" : "s"} awaiting a decision. Existing curated values are preserved until you choose. Every action is audited with admin provenance.
      </p>
      {conflicts.map((c) => (
        <SettingsCard key={c.id}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
            <strong style={{ fontSize: 15, color: "#1f2430" }}>{c.property_name}</strong>
            <span style={{ fontSize: 12, color: "#9098a8", fontFamily: "ui-monospace, monospace" }}>{c.field_name} · {c.classification}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 10 }}>
            <div style={{ background: "#f7f8fa", borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ fontSize: 11, color: "#9098a8", textTransform: "uppercase", letterSpacing: ".04em" }}>Existing (curated)</div>
              <div style={{ fontSize: 13.5, color: "#1f2430", marginTop: 4 }}>{fmt(c.existing_value)}</div>
              <div style={{ fontSize: 11, color: "#b3b8c4", marginTop: 6 }}>source: curated research (trusted_locator_source)</div>
            </div>
            <div style={{ background: "#eef4ff", borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ fontSize: 11, color: "#5b7bb0", textTransform: "uppercase", letterSpacing: ".04em" }}>Proposed</div>
              <div style={{ fontSize: 13.5, color: "#1f2430", marginTop: 4 }}>{fmt(c.incoming_value)}</div>
              <div style={{ fontSize: 11, color: "#8fa5c9", marginTop: 6 }}>source: {c.incoming_source_type ?? "official_property_site"} · checked today</div>
            </div>
          </div>
          {editing === c.id ? (
            <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center" }}>
              <input className={settingsInputCls} style={{ flex: 1 }} value={editVal} onChange={(e) => setEditVal(e.target.value)} placeholder="comma-separated keywords" />
              <button onClick={() => act(c.id, "edit_manually", editVal)} disabled={busy === c.id || !editVal.trim()} style={btn(true)}>Save</button>
              <button onClick={() => setEditing(null)} style={btn(false)}>Cancel</button>
            </div>
          ) : (
            <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
              <button onClick={() => act(c.id, "keep_existing")} disabled={busy === c.id} style={btn(false)}>Keep existing</button>
              <button onClick={() => act(c.id, "use_proposed")} disabled={busy === c.id} style={btn(true)}>Use proposed</button>
              <button onClick={() => { setEditing(c.id); setEditVal(fmt(c.incoming_value)) }} disabled={busy === c.id} style={btn(false)}>Edit manually</button>
            </div>
          )}
        </SettingsCard>
      ))}
    </div>
  )
}

function btn(primary: boolean): React.CSSProperties {
  return {
    fontSize: 13, fontWeight: 600, padding: "7px 14px", borderRadius: 8, cursor: "pointer",
    border: primary ? "1px solid #2f5bd0" : "1px solid #d2cec2",
    background: primary ? "#2f5bd0" : "#fff", color: primary ? "#fff" : "#4b5162",
  }
}
