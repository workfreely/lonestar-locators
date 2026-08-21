// Presentational card for a single network member: profile photo (or initials),
// name, joined date, and status badge. Uses the CRM design tokens. No actions —
// action buttons live in the admin panel.

export type MemberStatus = "pending" | "active" | "inactive" | "verified" | "unverified"

// `verified` / `unverified` are used by the owner-only License Verification page,
// which reuses this same row. Purely additive — the three network statuses above
// render exactly as before.
const STATUS_STYLES: Record<MemberStatus, string> = {
  active: "bg-emerald-500/15 text-emerald-400",
  pending: "bg-amber-500/15 text-amber-400",
  inactive: "bg-zinc-500/15 text-zinc-400",
  verified: "bg-emerald-500/15 text-emerald-400",
  unverified: "bg-zinc-500/15 text-zinc-400",
}

export function StatusBadge({ status }: { status: string | null }) {
  const s = (status ?? "pending") as MemberStatus
  const cls = STATUS_STYLES[s] ?? STATUS_STYLES.pending
  const label = s.charAt(0).toUpperCase() + s.slice(1)
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${cls}`}>
      {label}
    </span>
  )
}

/** Referral context, shown only when a sponsor exists. Neutral grey on purpose:
 *  it is context, not status, and must never read as a peer of the verification
 *  badge sitting to its right. */
export function ReferredByPill({ sponsorName }: { sponsorName: string | null }) {
  if (!sponsorName?.trim()) return null
  return (
    <span className="inline-flex flex-none items-center rounded-full bg-[var(--crm-inset)] px-2 py-0.5 text-[11px] font-medium text-[var(--crm-text-muted)]">
      Referred by {sponsorName.trim()}
    </span>
  )
}

function Avatar({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
  return (
    <div className="h-10 w-10 flex-none overflow-hidden rounded-full border border-[var(--crm-border)] bg-[var(--crm-inset)]">
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[13px] font-semibold text-[var(--crm-text-muted)]">
          {initials || "—"}
        </div>
      )}
    </div>
  )
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

export default function MemberCard({
  name,
  photoUrl,
  joinedDate,
  status,
  subtitle,
  meta,
  action,
}: {
  name: string
  photoUrl: string | null
  joinedDate: string | null
  status: string | null
  // Optional secondary line (e.g. "Referred by …" in the admin panel).
  subtitle?: string | null
  // Optional trailing context beside the metadata — a pill, not a status. Sits in
  // the identity block rather than the action cluster so it stays subordinate to
  // the verification badge, and wraps under the metadata on a narrow row.
  meta?: React.ReactNode
  // Optional trailing controls (admin Approve/Deactivate buttons).
  action?: React.ReactNode
}) {
  return (
    // flex-wrap + a floor on the text block: when the badge and actions can no
    // longer fit beside the name they wrap to a second line instead of crushing it.
    // `min-w-0` alone let the text shrink to nothing on narrow screens, which hid the
    // agent's name entirely. The floor is capped at 100% of the row so it can never
    // itself cause overflow on a very small phone. On a wide row every child still
    // fits on one line, so the desktop layout is byte-for-byte what it was.
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--crm-border)] bg-[var(--crm-panel)] px-3.5 py-3">
      <Avatar name={name} photoUrl={photoUrl} />
      <div className="min-w-[min(100%,16rem)] flex-1">
        <p className="truncate text-[14px] font-semibold text-[var(--crm-text-primary)]">{name}</p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="min-w-0 truncate text-[12px] text-[var(--crm-text-muted)]">
            {subtitle ? `${subtitle} · ` : ""}Joined {formatDate(joinedDate)}
          </p>
          {meta}
        </div>
      </div>
      <StatusBadge status={status} />
      {action}
    </div>
  )
}
