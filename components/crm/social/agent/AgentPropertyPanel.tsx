"use client"

import { useCallback, useEffect, useState } from "react"

// READ-ONLY PROPERTY DETAILS.
//
// The point of this panel is that an agent can answer a renter's question without messaging the
// admin. So it shows pricing, specials, unit mix, amenities, the operational notes a locator is
// actually asked about on a tour call — and, beside the time-sensitive ones, WHEN THEY WERE LAST
// VERIFIED. A price with no date is a claim; a price with a date is evidence, and an agent can
// decide for themselves whether to quote it.
//
// Every field here arrives from /api/agent/social/property, which selects through the
// agentPropertyView allowlist. Nothing admin-only is fetched, so nothing admin-only can be
// rendered by mistake.
type Details = {
  property: Record<string, unknown> | null
  video: Record<string, unknown> | null
  posting: Record<string, unknown> | null
}

export default function AgentPropertyPanel({ contentId, onClose }: { contentId: string; onClose: () => void }) {
  const [data, setData] = useState<Details | null>(null)
  const [media, setMedia] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/agent/social/property/${encodeURIComponent(contentId)}`)
      if (!res.ok) { setError(res.status === 404 ? "This video is no longer available." : "Couldn't load details."); return }
      setData((await res.json()) as Details)
    } catch { setError("Couldn't load details.") }
  }, [contentId])

  // Media is requested SEPARATELY and only when this panel opens — one short-lived signed url for
  // one video, rather than a grid of them minted on every library render.
  const loadMedia = useCallback(async () => {
    try {
      const res = await fetch(`/api/agent/social/media/${encodeURIComponent(contentId)}`)
      if (!res.ok) return
      const j = (await res.json()) as { url?: string }
      setMedia(j.url ?? null)
    } catch { /* playback is optional; the facts matter more */ }
  }, [contentId])

  useEffect(() => { void load(); void loadMedia() }, [load, loadMedia])
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", esc)
    return () => window.removeEventListener("keydown", esc)
  }, [onClose])

  const p = (data?.property ?? null) as Record<string, any> | null
  const post = (data?.posting ?? null) as Record<string, any> | null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6" onClick={onClose}>
      <div
        role="dialog" aria-modal="true" aria-label="Property details"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-xl border border-[var(--crm-border)] bg-[var(--crm-card)] sm:rounded-xl"
      >
        <header className="sticky top-0 flex items-start justify-between gap-3 border-b border-[var(--crm-border)] bg-[var(--crm-card)] px-4 py-3">
          <div className="min-w-0">
            <h2 className="truncate text-[16px] font-semibold">{p?.name ?? "Property details"}</h2>
            <p className="truncate text-[12px] text-[var(--crm-text-muted)]">
              {[p?.city, (data?.video as Record<string, any>)?.propertyType].filter(Boolean).join(" · ")}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="shrink-0 rounded-md border border-[var(--crm-border)] px-2.5 py-1 text-[12px]">Close</button>
        </header>

        <div className="flex flex-col gap-4 px-4 py-4">
          {error && <p className="text-[12.5px] text-amber-400">{error}</p>}

          {media && (
            <video src={media} controls playsInline className="max-h-[50vh] w-full rounded-lg bg-black" />
          )}

          {p && (
            <>
              <Section title="Pricing">
                <Fact label="Range" value={range(p.pricing?.rentMin, p.pricing?.rentMax)} />
                {Object.entries(p.pricing?.byType ?? {}).map(([k, v]) =>
                  typeof v === "number" && v > 0 ? <Fact key={k} label={bedLabel(k)} value={`$${v.toLocaleString("en-US")}/mo`} /> : null)}
                <Verified at={p.pricing?.lastVerified} what="Pricing" />
              </Section>

              {p.special?.text && (
                <Section title="Current special">
                  <p className="text-[13px]">{p.special.text}</p>
                  <Verified at={p.special.checkedAt} what="Special" source={p.special.source} />
                </Section>
              )}

              <Section title="Units">
                <Fact label="Bedrooms" value={range(p.beds?.min, p.beds?.max)} />
                <Fact label="Bathrooms" value={range(p.baths?.min, p.baths?.max)} />
                <Fact label="Square feet" value={range(p.sqft?.min, p.sqft?.max)} />
              </Section>

              {p.website && (
                <Section title="Property website">
                  <a href={p.website} target="_blank" rel="noopener noreferrer"
                    className="break-all text-[12.5px] underline">{p.website}</a>
                </Section>
              )}

              {hasAnyNote(p.notes) && (
                <Section title="Good to know">
                  <NoteRow label="Escort" value={p.notes?.escort} verified={p.notes?.escortVerified} />
                  <NoteRow label="Tour hours" value={p.notes?.tourHours} verified={p.notes?.hoursVerified} />
                  <NoteRow label="Pets" value={p.notes?.petPolicy} verified={p.notes?.petPolicyVerified} />
                  <NoteRow label="Restricted breeds" value={p.notes?.restrictedBreeds} />
                  <NoteRow label="Lease terms" value={p.notes?.leaseTerms} />
                  <NoteRow label="Utilities" value={p.notes?.utilities} />
                  <NoteRow label="Internet" value={p.notes?.internet} verified={p.notes?.internetVerified} />
                  <NoteRow label="Deposit alternative" value={p.notes?.depositAlternative} />
                </Section>
              )}
            </>
          )}

          {post?.caption && (
            <Section title="Caption">
              <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed">{post.caption}</p>
            </Section>
          )}

          <Section title="Posting">
            {post ? (
              <>
                <Fact label="Status" value={String(post.status ?? "—")} />
                <Fact label="Destination" value={String(post.destination ?? "—")} />
                <Fact label="Scheduled" value={post.scheduledAt ? new Date(post.scheduledAt).toLocaleString() : "Not scheduled"} />
                {post.needsReviewReason && <p className="mt-1 text-[12px] text-amber-400">{post.needsReviewReason}</p>}
              </>
            ) : (
              <p className="text-[12.5px] text-[var(--crm-text-muted)]">You haven’t reviewed this video yet.</p>
            )}
          </Section>
        </div>
      </div>
    </div>
  )
}

const bedLabel = (k: string) => ({ studio: "Studio", oneBr: "1 bed", twoBr: "2 bed", threeBr: "3 bed", fourBr: "4 bed", fivePlusBr: "5+ bed", townhome: "Townhome", loft: "Loft", penthouse: "Penthouse" }[k] ?? k)
const range = (a: unknown, b: unknown) => {
  const n = (x: unknown) => (typeof x === "number" && x > 0 ? x.toLocaleString("en-US") : null)
  const lo = n(a), hi = n(b)
  if (lo && hi && lo !== hi) return `${lo} – ${hi}`
  return lo ?? hi ?? "—"
}
const hasAnyNote = (notes: Record<string, unknown> | undefined) =>
  !!notes && Object.values(notes).some((v) => typeof v === "string" && v.trim())

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 text-[10.5px] uppercase tracking-wide text-[var(--crm-text-muted)]">{title}</h3>
      <div className="rounded-lg border border-[var(--crm-border)] px-3 py-2.5">{children}</div>
    </section>
  )
}
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 py-0.5 text-[12.5px]">
      <span className="text-[var(--crm-text-muted)]">{label}</span>
      <span className="text-right tabular-nums">{value}</span>
    </div>
  )
}
function NoteRow({ label, value, verified }: { label: string; value?: unknown; verified?: unknown }) {
  if (typeof value !== "string" || !value.trim()) return null
  return (
    <div className="py-1 text-[12.5px]">
      <span className="text-[var(--crm-text-muted)]">{label}: </span>
      <span>{value}</span>
      {typeof verified === "string" && verified && (
        <span className="ml-1.5 text-[10.5px] text-[var(--crm-text-muted)]">verified {verified}</span>
      )}
    </div>
  )
}
/** Time-sensitive facts carry their date INLINE, never in a footnote. */
function Verified({ at, what, source }: { at?: unknown; what: string; source?: unknown }) {
  if (typeof at !== "string" || !at) {
    return <p className="mt-1 text-[11px] text-amber-400/80">{what} has no verification date — confirm before quoting.</p>
  }
  return (
    <p className="mt-1 text-[11px] text-[var(--crm-text-muted)]">
      {what} verified {at}{typeof source === "string" && source ? ` · ${source}` : ""}
    </p>
  )
}
