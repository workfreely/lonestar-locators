// Control Center — small pure formatting helpers (no I/O). Dates are MM/DD/YYYY per product rule.

export function fmtInt(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—"
  return new Intl.NumberFormat("en-US").format(n)
}

export function pctOf(n: number | null | undefined, total: number | null | undefined): number {
  if (!n || !total) return 0
  return (n / total) * 100
}

/** Whole-number percent string (value only; the "%" glyph is rendered separately as <small class="sym">). */
export function fmtPctInt(p: number): string {
  if (!Number.isFinite(p)) return "—"
  if (p > 0 && p < 0.5) return "~0"
  return String(Math.round(p))
}

export function fmtPct1(p: number): string {
  return Number.isFinite(p) ? p.toFixed(1) : "—"
}

function pad(n: number) { return n < 10 ? `0${n}` : String(n) }

/** MM/DD/YYYY */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`
}

/** MM/DD/YYYY HH:MM (24h, local) */
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return `${fmtDate(iso)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—"
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return "just now"
  const m = Math.floor(ms / 60000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

/** Normalize a stored value to display text; arrays/objects are rendered compactly. */
export function toText(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (Array.isArray(v)) return v.length ? v.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" · ") : null
  if (typeof v === "object") return JSON.stringify(v)
  const s = String(v).trim()
  return s === "" ? null : s
}

export function truncate(s: string | null | undefined, n = 80): string {
  if (!s) return "—"
  return s.length > n ? s.slice(0, n - 1) + "…" : s
}

/** Turn a snake_case column into a readable label. */
export function labelize(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}
