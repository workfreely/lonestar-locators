// Social Autopilot — UI-ONLY demo fixtures for the visual/product-structure review.
//
// These are plain client-side constants used to preview the Library / Queue / History
// layouts before real data exists. They are NEVER written to the database, never sent
// to any API, and never mixed with real records (Library shows them only when there
// are zero real items, behind a clear "Sample" banner). Deleting this file removes all
// sample content — zero production impact. Replace with real data as each engine ships.

export type DemoLibraryItem = {
  id: string
  displayName: string // shows the SA1.1 naming vision (Property - Market - date - NN)
  propertyName: string
  market: string
  dateLabel: string
  originalFilename: string
  hue: number // deterministic placeholder-thumbnail color (no real media)
}

export const DEMO_LIBRARY: DemoLibraryItem[] = [
  { id: "d1", displayName: "Alta Westover Hills - San Antonio - 2026-09-11 - 01", propertyName: "Alta Westover Hills", market: "San Antonio", dateLabel: "Sep 11, 2026", originalFilename: "IMG_8472.MOV", hue: 262 },
  { id: "d2", displayName: "Alta Westover Hills - San Antonio - 2026-09-11 - 02", propertyName: "Alta Westover Hills", market: "San Antonio", dateLabel: "Sep 11, 2026", originalFilename: "IMG_8473.MOV", hue: 262 },
  { id: "d3", displayName: "Alta Westover Hills - San Antonio - 2026-09-11 - 03", propertyName: "Alta Westover Hills", market: "San Antonio", dateLabel: "Sep 11, 2026", originalFilename: "IMG_8474.MOV", hue: 262 },
  { id: "d4", displayName: "The M9 - Austin - 2026-09-10 - 01", propertyName: "The M9", market: "Austin", dateLabel: "Sep 10, 2026", originalFilename: "DJI_0091.MP4", hue: 200 },
  { id: "d5", displayName: "The M9 - Austin - 2026-09-10 - 02", propertyName: "The M9", market: "Austin", dateLabel: "Sep 10, 2026", originalFilename: "DJI_0092.MP4", hue: 200 },
  { id: "d6", displayName: "Knox - Dallas - 2026-09-09 - 01", propertyName: "Knox", market: "Dallas", dateLabel: "Sep 9, 2026", originalFilename: "clip_final_v2.mov", hue: 12 },
  { id: "d7", displayName: "Knox - Dallas - 2026-09-09 - 02", propertyName: "Knox", market: "Dallas", dateLabel: "Sep 9, 2026", originalFilename: "clip_final_v3.mov", hue: 12 },
  { id: "d8", displayName: "Aris Midtown - Houston - 2026-09-08 - 01", propertyName: "Aris Midtown", market: "Houston", dateLabel: "Sep 8, 2026", originalFilename: "IMG_1042.MOV", hue: 150 },
]

export type DemoQueueItem = {
  id: string
  propertyName: string
  market: string
  platform: "Instagram" | "TikTok" | "YouTube"
  status: "Draft" | "Rendering" | "Ready" | "Scheduled" | "Publishing" | "Needs Attention"
  whenLabel: string
  hue: number
}

export const DEMO_QUEUE: DemoQueueItem[] = [
  { id: "q1", propertyName: "Alta Westover Hills", market: "San Antonio", platform: "Instagram", status: "Scheduled", whenLabel: "Sep 12, 9:00 AM", hue: 262 },
  { id: "q2", propertyName: "The M9", market: "Austin", platform: "TikTok", status: "Ready", whenLabel: "Sep 12, 12:30 PM", hue: 200 },
  { id: "q3", propertyName: "Knox", market: "Dallas", platform: "YouTube", status: "Rendering", whenLabel: "Sep 13, 8:00 AM", hue: 12 },
  { id: "q4", propertyName: "Aris Midtown", market: "Houston", platform: "Instagram", status: "Needs Attention", whenLabel: "Sep 13, 5:00 PM", hue: 150 },
  { id: "q5", propertyName: "The M9", market: "Austin", platform: "Instagram", status: "Draft", whenLabel: "Not scheduled", hue: 200 },
]

export type DemoHistoryItem = {
  id: string
  propertyName: string
  market: string
  platform: "Instagram" | "TikTok" | "YouTube"
  /** ISO publication instant — the canonical `published_at` semantics (never scheduled_at).
   *  Rendered via formatPublishedAt as "Sep 5, 2026 · 2:42 AM". */
  publishedAt: string
  captionVariation: string
  onVideoText: string
  reuseCount: number
  hue: number
}

export const DEMO_HISTORY: DemoHistoryItem[] = [
  { id: "h1", propertyName: "Alta Westover Hills", market: "San Antonio", platform: "Instagram", publishedAt: "2026-09-05T07:42:00Z", captionVariation: "Free-rent hook", onVideoText: "1 month free", reuseCount: 3, hue: 262 },
  { id: "h2", propertyName: "The M9", market: "Austin", platform: "TikTok", publishedAt: "2026-09-04T18:15:00Z", captionVariation: "Amenity tour", onVideoText: "Rooftop pool", reuseCount: 2, hue: 200 },
  { id: "h3", propertyName: "Knox", market: "Dallas", platform: "YouTube", publishedAt: "2026-09-02T21:05:00Z", captionVariation: "Walkthrough", onVideoText: "$1,450/mo", reuseCount: 1, hue: 12 },
]

// Distinct markets present in the demo library (for the market filter preview).
export const DEMO_MARKETS: string[] = Array.from(new Set(DEMO_LIBRARY.map((d) => d.market)))
