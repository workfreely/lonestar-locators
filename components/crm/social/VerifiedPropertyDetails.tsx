"use client"

import { useEffect, useState } from "react"
import type { PropertyResearchRecord, ClaimStatus, TimedClaim } from "@/lib/social/propertyResearch"

/**
 * VERIFIED PROPERTY DETAILS — the reusable research for this video's property.
 *
 * Collapsed by default and read-only. It sits beneath the existing THIS VIDEO and PROPERTY
 * STARTING PRICES fields and changes neither: those describe THIS clip and are edited by hand,
 * while this is what is known about the BUILDING, shared by every video of it.
 *
 * ── NOTHING HERE FLOWS INTO MARKETING ───────────────────────────────────────────────────────
 * No value is copied into an overlay, caption, highlight or template. Promoting a fact out of
 * research into marketing stays a deliberate human act, which is why every time-sensitive claim
 * is shown WITH its status and date rather than as a bare number. A badge reading
 * "previously recorded · 2026-10-14" is the point, not decoration.
 */
const STATUS_STYLE: Record<ClaimStatus, { label: string; cls: string }> = {
  verified_current: { label: "verified", cls: "text-emerald-600" },
  previously_recorded: { label: "unverified", cls: "text-amber-600" },
  expired: { label: "expired", cls: "text-red-600" },
  conflicting: { label: "conflicting", cls: "text-red-600" },
  unknown: { label: "unknown", cls: "text-[var(--crm-text-muted)]" },
}

function Claim({ label, claim }: { label: string; claim: TimedClaim }) {
  const s = STATUS_STYLE[claim.status] ?? STATUS_STYLE.unknown
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[12px]">
      <span className="text-[var(--crm-text-muted)]">{label}</span>
      <span className="font-medium text-[var(--crm-text-primary)]">{claim.value}</span>
      <span className={`text-[10.5px] font-semibold uppercase tracking-wide ${s.cls}`}>{s.label}</span>
      <span className="text-[10.5px] text-[var(--crm-text-muted)]">{claim.verifiedAt}</span>
      {claim.appliesTo && <span className="text-[10.5px] text-[var(--crm-text-muted)]">· {claim.appliesTo}</span>}
    </div>
  )
}

function List({ title, items }: { title: string; items?: string[] | null }) {
  if (!items || items.length === 0) return null
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-[var(--crm-text-muted)]">{title}</div>
      <div className="mt-0.5 text-[12px] text-[var(--crm-text-primary)]">{items.join(" · ")}</div>
    </div>
  )
}

export default function VerifiedPropertyDetails({ placeId }: { placeId: string | null | undefined }) {
  const [open, setOpen] = useState(false)
  const [record, setRecord] = useState<PropertyResearchRecord | null | "loading">("loading")

  useEffect(() => {
    // A MISSING place_id MATCHES NOTHING — never fetch, never guess a property.
    if (!open || !placeId) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`/api/admin/social-autopilot/property-research?placeId=${encodeURIComponent(placeId)}`)
        const json = (await res.json()) as { research?: unknown }
        if (!cancelled) setRecord((json.research as PropertyResearchRecord | null) ?? null)
      } catch {
        if (!cancelled) setRecord(null)
      }
    })()
    return () => { cancelled = true }
  }, [open, placeId])

  if (!placeId) return null

  const s = record && record !== "loading" ? record.stable : null
  const p = record && record !== "loading" ? record.pricing : null

  return (
    <div className="border-t border-[var(--crm-border)] pt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-[11px] font-semibold uppercase tracking-wide text-[var(--crm-text-secondary)]"
      >
        <span aria-hidden>{open ? "▾" : "▸"}</span> Verified Property Details
      </button>

      {open && (
        <div className="mt-2 flex flex-col gap-2.5">
          {record === "loading" && <p className="text-[12px] text-[var(--crm-text-muted)]">Loading…</p>}
          {record === null && (
            <p className="text-[12px] text-[var(--crm-text-muted)]">
              No research recorded for this property yet.
            </p>
          )}

          {s && (
            <>
              <div className="text-[12px] text-[var(--crm-text-primary)]">
                {[s.address, s.neighborhood, s.city].filter(Boolean).join(" · ") || "—"}
                {s.officialWebsite && (
                  <>
                    {" · "}
                    <a href={s.officialWebsite} target="_blank" rel="noopener noreferrer" className="underline">
                      official site
                    </a>
                  </>
                )}
              </div>
              <div className="text-[12px] text-[var(--crm-text-muted)]">
                {[s.yearBuilt && `built ${s.yearBuilt}`, s.stories && `${s.stories} storeys`, s.unitCount && `${s.unitCount} units`, s.architecturalSubtype && `subtype: ${s.architecturalSubtype}`]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
              <List title="Ceiling heights" items={s.ceilingHeights} />
              <List title="Layouts" items={s.layouts} />
              <List title="Architecture" items={s.architecture} />
              <List title="Interior features" items={s.interiorFeatures} />
              <List title="Community amenities" items={s.communityAmenities} />
              <List title="Laundry" items={s.laundry ? [s.laundry] : null} />
              <List title="Parking" items={s.parking ? [s.parking] : null} />

              {!!s.floorPlans?.length && (
                <div>
                  <div className="text-[10px] uppercase tracking-wide text-[var(--crm-text-muted)]">
                    Floor plans ({s.floorPlans.length})
                  </div>
                  <div className="mt-1 flex flex-col gap-0.5">
                    {s.floorPlans.map((f) => (
                      <div key={f.model} className="text-[12px] text-[var(--crm-text-primary)]">
                        <span className="font-medium">{f.model}</span>
                        {[f.beds && `${f.beds} bd`, f.baths && `${f.baths} ba`, f.sqft && `${f.sqft} sf`, f.rent]
                          .filter(Boolean)
                          .map((x) => ` · ${x}`)
                          .join("")}
                        {f.qualification && <span className="text-[var(--crm-text-muted)]"> · {f.qualification}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {p && (
            <div className="flex flex-col gap-1">
              <div className="text-[10px] uppercase tracking-wide text-[var(--crm-text-muted)]">
                Prices &amp; specials
              </div>
              {Object.entries(p.startingPrices ?? {}).map(([k, c]) => c && <Claim key={k} label={k} claim={c} />)}
              {(p.specials ?? []).map((c, i) => <Claim key={i} label="special" claim={c} />)}
            </div>
          )}

          {record && record !== "loading" && !!record.unresolved?.length && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-amber-600">Needs confirmation</div>
              {record.unresolved.map((u, i) => (
                <div key={i} className="text-[12px] text-[var(--crm-text-primary)]">
                  <span className="font-medium">{u.field}</span> — {u.issue}
                </div>
              ))}
            </div>
          )}

          {record && record !== "loading" && !!record.sources?.length && (
            <div>
              <div className="text-[10px] uppercase tracking-wide text-[var(--crm-text-muted)]">Sources</div>
              {record.sources.map((src, i) => (
                <div key={i} className="truncate text-[11.5px]">
                  <a href={src.url} target="_blank" rel="noopener noreferrer" className="underline text-[var(--crm-text-secondary)]">
                    {src.url}
                  </a>
                  <span className={src.kind === "official" ? "ml-1.5 text-emerald-600" : "ml-1.5 text-[var(--crm-text-muted)]"}>
                    {src.kind === "official" ? "official" : "third-party"}
                  </span>
                  <span className="ml-1.5 text-[var(--crm-text-muted)]">{src.verifiedAt}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
