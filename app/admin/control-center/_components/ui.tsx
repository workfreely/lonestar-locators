// Control Center — shared, server-safe presentational components (no hooks, no I/O).
// One component language for every module: Card / Tile / Chip / Pct / Seg / CovRow / Row / SecHead / NotWired.
import type { CSSProperties, ReactNode } from "react"
import { fmtInt, fmtPct1, fmtPctInt, pctOf } from "@/lib/controlCenter/format"

export type Tone = "good" | "warn" | "crit" | "info" | "neutral" | "accent"
const toneVar: Record<Tone | "ink3", string> = {
  good: "var(--good)", warn: "var(--warn)", crit: "var(--crit)", info: "var(--info)", neutral: "var(--ink-2)", accent: "var(--accent)", ink3: "var(--ink-3)",
}

export function Card({ children, className = "", dim = false, style }: { children: ReactNode; className?: string; dim?: boolean; style?: CSSProperties }) {
  return <section className={`card${dim ? " dim" : ""} ${className}`.trim()} style={style}>{children}</section>
}

export function Tile({ k, v, s, chip }: { k: ReactNode; v: ReactNode; s?: ReactNode; chip?: ReactNode }) {
  return (
    <section className="card tile">
      <div className="k">{k}{chip}</div>
      <div className="v num">{v}</div>
      {s ? <div className="s">{s}</div> : null}
    </section>
  )
}

export function Chip({ tone = "neutral", dot = false, children, title }: { tone?: Tone; dot?: boolean; children: ReactNode; title?: string }) {
  return <span className={`chip ${tone}`} title={title}>{dot ? <span className="dot" /> : null}{children}</span>
}

/** Percent value with the quiet "%" glyph. Whole-number display; exact value in the title. */
export function Pct({ value, title }: { value: number; title?: string }) {
  return <span className="num" title={title ?? `${fmtPct1(value)}%`}>{fmtPctInt(value)}<small className="sym">%</small></span>
}

export function Num({ n }: { n: number | null | undefined }) {
  return <span className="num">{fmtInt(n)}</span>
}

export function Seg({ parts, height, label }: { parts: { w: number; tone: Tone | "ink3"; title?: string }[]; height?: number; label?: string }) {
  return (
    <div className="seg" style={height ? { height } : undefined} aria-label={label}>
      {parts.map((p, i) => <span key={i} style={{ width: `${Math.max(0, Math.min(100, p.w))}%`, background: toneVar[p.tone] }} title={p.title} />)}
    </div>
  )
}

/** Data-completeness row: label · bar · % · status. `count === null` renders as unavailable. */
export function CovRow({ label, count, total, note, source, na = false }: { label: string; count: number | null; total: number; note: string; source?: string; na?: boolean }) {
  const p = na || count === null ? 0 : pctOf(count, total)
  const low = p < 2
  return (
    <div className="cov" title={source}>
      <span className="lbl">{label}</span>
      <div className="bar"><span className={low ? "low" : ""} style={{ width: `${na ? 0 : Math.max(p, count ? 1 : 0)}%` }} /></div>
      {na ? <span className="pct faint">n/a</span> : count === null ? <span className="pct faint">—</span> : <span className="pct"><Pct value={p} title={`${fmtInt(count)} of ${fmtInt(total)} · ${fmtPct1(p)}%`} /></span>}
      <span className="st">{count !== null && !na ? `${fmtInt(count)} · ` : ""}{note}</span>
    </div>
  )
}

export function Row({ t, d, right }: { t: ReactNode; d?: ReactNode; right?: ReactNode }) {
  return (
    <div className="row">
      <div><div className="t">{t}</div>{d ? <div className="d">{d}</div> : null}</div>
      {right ? <div className="r">{right}</div> : null}
    </div>
  )
}

export function SecHead({ eyebrow, note }: { eyebrow: ReactNode; note?: ReactNode }) {
  return <div className="sec-head"><span className="eyebrow">{eyebrow}</span>{note ? <span className="note">{note}</span> : null}</div>
}

/** Honest placeholder for a signal that has no reliable backend source yet. Never shows a number. */
export function NotWired({ what, why }: { what: ReactNode; why: ReactNode }) {
  return (
    <div className="nw">
      <div><div>{what}</div><div className="why">{why}</div></div>
      <Chip tone="neutral">not wired</Chip>
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>
}

/** Field-state chip used on Property Detail. Unknown ≠ No. */
export type FieldState = "Verified" | "Missing" | "Unknown" | "Conflict" | "Needs Review" | "Stale" | "Unsourced"
export function StateChip({ state }: { state: FieldState }) {
  const tone: Record<FieldState, Tone> = { Verified: "good", Missing: "warn", Unknown: "neutral", Conflict: "crit", "Needs Review": "info", Stale: "neutral", Unsourced: "neutral" }
  return <Chip tone={tone[state]}>{state}</Chip>
}
