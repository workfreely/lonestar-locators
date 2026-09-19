// Canonical Social Beast "Published" timestamp formatter for the History table.
//
// Renders the ACTUAL publication moment (a post's `published_at`, never `scheduled_at`)
// as a single line: "Sep 19, 2026 · 2:42 AM". Displayed in America/Chicago to match the
// rest of Social Beast's scheduling (recurrence windows are Central), so the History time
// reads consistently with the schedule the locator set.
//
// Pure + timezone-explicit so it renders identically on the server and in tests. When the
// History table is wired to real published posts, pass the post's `published_at` here.
export function formatPublishedAt(
  publishedAt: string | Date | null | undefined,
  timeZone = "America/Chicago",
): string {
  if (!publishedAt) return "—"
  const d = publishedAt instanceof Date ? publishedAt : new Date(publishedAt)
  if (Number.isNaN(d.getTime())) return "—"
  const date = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone }).format(d)
  const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone }).format(d)
  return `${date} · ${time}`
}
