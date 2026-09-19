"use client"

import { useState } from "react"
import VideoLightbox from "@/components/crm/social/VideoLightbox"
import { formatPublishedAt } from "@/lib/social/formatPublishedAt"
import type { DemoHistoryItem } from "@/components/crm/social/demoFixtures"

// Social Autopilot → History table (client). Same columns/layout as before — only the first column
// changed from a flat color bar to a real 9:16 VIDEO thumbnail that opens the SHARED preview
// lightbox (the same enlarge experience the Post Editor uses; never a second History-only modal).
//
// History represents what was actually published, so the thumbnail plays the PUBLISHED/RENDERED
// artifact (row.previewUrl) — not a mutable source clip. Demo rows carry no media (previewUrl null),
// so they show the existing Social Beast demo thumbnail treatment (gradient + ▶, matching the Video
// Library) and are non-interactive until a real artifact exists. Wiring is otherwise complete: the
// moment real History supplies previewUrl, the thumbnail plays it with zero further changes here.

// 9:16 thumbnail, reusing the Library/Queue treatment: real artifact → seeked poster frame; demo →
// gradient block. A ▶ badge marks it as a video in both cases.
function HistoryThumb({ item }: { item: DemoHistoryItem }) {
  return (
    <div className="relative w-10 h-[71px] flex-none rounded-md overflow-hidden bg-black">
      {item.previewUrl ? (
        <video
          src={item.previewUrl}
          muted
          playsInline
          preload="metadata"
          onLoadedMetadata={(e) => {
            const v = e.currentTarget
            try {
              v.currentTime = Math.min(0.6, (isFinite(v.duration) ? v.duration : 2) / 2)
            } catch {
              /* seeking unsupported — first frame stands */
            }
          }}
          className="w-full h-full object-cover"
        />
      ) : (
        <div
          className="w-full h-full"
          style={{ background: `linear-gradient(160deg, hsl(${item.hue} 55% 42%), hsl(${item.hue + 30} 55% 28%))` }}
          aria-hidden
        />
      )}
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span className="h-6 w-6 rounded-full bg-white/85 text-black text-[10px] flex items-center justify-center pl-0.5">▶</span>
      </span>
    </div>
  )
}

export default function HistoryTable({ items }: { items: DemoHistoryItem[] }) {
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)

  return (
    <div>
      <div className="rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-panel)] overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-[var(--crm-text-muted)]">
              <th className="px-3 py-3 font-semibold">Video</th>
              <th className="px-3 py-3 font-semibold">Platform</th>
              <th className="px-3 py-3 font-semibold">Property</th>
              <th className="px-3 py-3 font-semibold">Published</th>
              <th className="px-3 py-3 font-semibold">Caption</th>
              <th className="px-3 py-3 font-semibold">On-video text</th>
              <th className="px-3 py-3 font-semibold text-right">Reuse</th>
              <th className="px-3 py-3 font-semibold">Post</th>
            </tr>
          </thead>
          <tbody>
            {items.map((h) => (
              <tr key={h.id} className="border-t border-[var(--crm-border)]">
                <td className="px-3 py-2.5">
                  {h.previewUrl ? (
                    <button
                      type="button"
                      aria-label={`Play ${h.propertyName} video`}
                      onClick={() => setLightboxSrc(h.previewUrl)}
                      className="block rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--crm-text-primary)]"
                    >
                      <HistoryThumb item={h} />
                    </button>
                  ) : (
                    // Demo row — no published artifact to play yet; show the thumbnail, non-interactive.
                    <div title="Preview available once this publication has a rendered video">
                      <HistoryThumb item={h} />
                    </div>
                  )}
                </td>
                <td className="px-3 py-2.5 text-[var(--crm-text-secondary)] whitespace-nowrap">{h.platform}</td>
                <td className="px-3 py-2.5 font-semibold text-[var(--crm-text-primary)] whitespace-nowrap">
                  {h.propertyName}
                  <div className="text-[11px] font-normal text-[var(--crm-text-muted)]">{h.market}</div>
                </td>
                <td className="px-3 py-2.5 text-[var(--crm-text-secondary)] whitespace-nowrap">{formatPublishedAt(h.publishedAt)}</td>
                <td className="px-3 py-2.5 text-[var(--crm-text-secondary)] whitespace-nowrap">{h.captionVariation}</td>
                <td className="px-3 py-2.5 text-[var(--crm-text-secondary)] whitespace-nowrap">{h.onVideoText}</td>
                <td className="px-3 py-2.5 text-[var(--crm-text-secondary)] text-right tabular-nums">×{h.reuseCount}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <span className="text-[12px] font-semibold text-[var(--crm-text-muted)]">View post ↗</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {lightboxSrc && <VideoLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
    </div>
  )
}
