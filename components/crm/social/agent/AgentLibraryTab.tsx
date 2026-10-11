"use client"

import type { AgentVideo } from "./AgentSocialClient"

// LIBRARY — property-aware cards for every video the admin has shared.
//
// READ-ONLY IN STAGE 3. Review opens the details panel; Approve and Skip are rendered disabled so
// the finished shape is reviewable without a control existing that could write.
const STATUS_STYLE: Record<string, string> = {
  "Pending Review": "bg-[var(--crm-border)] text-[var(--crm-text-muted)]",
  Approved: "bg-emerald-500/15 text-emerald-400",
  Scheduled: "bg-sky-500/15 text-sky-400",
  "Needs Review": "bg-amber-500/15 text-amber-400",
  Skipped: "bg-[var(--crm-border)] text-[var(--crm-text-muted)]",
  Published: "bg-[var(--crm-border)] text-[var(--crm-text-muted)]",
}

export default function AgentLibraryTab({ videos, onOpen }: { videos: AgentVideo[] | null; onOpen: (id: string) => void }) {
  if (videos === null) return <Skeleton />
  if (videos.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--crm-border)] bg-[var(--crm-card)] px-4 py-8 text-center">
        <p className="text-[14px] font-medium">No videos available yet</p>
        {/* The honest explanation. An empty library here is almost always "nothing has been shared
            with you", not a fault, and saying so saves a support message. */}
        <p className="mt-1 text-[12.5px] text-[var(--crm-text-muted)]">
          Your admin hasn’t made any property videos available to agents yet. They’ll appear here once they do.
        </p>
      </div>
    )
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {videos.map((v) => (
        <article key={v.contentId} className="overflow-hidden rounded-lg border border-[var(--crm-border)] bg-[var(--crm-card)]">
          <button
            type="button" onClick={() => onOpen(v.contentId)}
            className="block w-full text-left"
            aria-label={`Open details for ${v.propertyName ?? "this property"}`}
          >
            {/* Poster frame. Media is fetched per-video by the panel, not pre-signed for the whole
                grid — a grid of bearer tokens is a grid of credentials. */}
            {/* Full-width poster band with a FIXED height. An aspect-ratio box capped by max-h
                derives its WIDTH from that cap (224 x 9/16 = 126px), which left the poster as a
                narrow column on the left of a wider card. The card is the grid unit; the poster
                fills it. */}
            <div className="flex h-44 w-full items-center justify-center bg-black/60">
              <span className="text-[11px] text-[var(--crm-text-muted)]">
                {v.durationSeconds ? `${Math.round(v.durationSeconds)}s` : "Video"}
              </span>
            </div>
            <div className="px-3 py-2.5">
              <h3 className="truncate text-[13.5px] font-medium">{v.propertyName ?? "Untitled property"}</h3>
              <p className="mt-0.5 truncate text-[12px] text-[var(--crm-text-muted)]">
                {[v.city, v.propertyType].filter(Boolean).join(" · ") || "—"}
              </p>
              {v.startingPrice && (
                <p className="mt-1 text-[12.5px] font-medium tabular-nums">
                  From {v.startingPrice}
                  {/* Verification date sits WITH the price, never apart from it: a figure an agent
                      is about to quote should carry how fresh it is. */}
                  {v.pricingLastVerified && (
                    <span className="ml-1.5 font-normal text-[11px] text-[var(--crm-text-muted)]">
                      verified {v.pricingLastVerified}
                    </span>
                  )}
                </p>
              )}
              <span className={`mt-2 inline-block rounded px-1.5 py-0.5 text-[10.5px] ${STATUS_STYLE[v.status] ?? STATUS_STYLE["Pending Review"]}`}>
                {v.status}
              </span>
            </div>
          </button>
          <div className="flex gap-2 border-t border-[var(--crm-border)] px-3 py-2">
            <button type="button" onClick={() => onOpen(v.contentId)}
              className="flex-1 rounded-md border border-[var(--crm-border)] px-2 py-1.5 text-[12px] hover:bg-[var(--crm-workspace)]">
              Review
            </button>
            <button type="button" disabled title="Available in the next release"
              className="flex-1 rounded-md border border-[var(--crm-border)] px-2 py-1.5 text-[12px] opacity-40">
              Approve
            </button>
            <button type="button" disabled title="Available in the next release"
              className="rounded-md border border-[var(--crm-border)] px-2 py-1.5 text-[12px] opacity-40">
              Skip
            </button>
          </div>
        </article>
      ))}
    </div>
  )
}

function Skeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-72 animate-pulse rounded-lg border border-[var(--crm-border)] bg-[var(--crm-card)]" />
      ))}
    </div>
  )
}
