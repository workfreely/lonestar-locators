// Presentational card for a single network member: profile photo (or initials),
// name, joined date, and status badge. Uses the CRM design tokens. No actions —
// action buttons live in the admin panel.

export type MemberStatus = "pending" | "active" | "inactive"

const STATUS_STYLES: Record<MemberStatus, string> = {
  active: "bg-emerald-500/15 text-emerald-400",
  pending: "bg-amber-500/15 text-amber-400",
  inactive: "bg-zinc-500/15 text-zinc-400",
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
  action,
}: {
  name: string
  photoUrl: string | null
  joinedDate: string | null
  status: string | null
  // Optional secondary line (e.g. "Referred by …" in the admin panel).
  subtitle?: string | null
  // Optional trailing controls (admin Approve/Deactivate buttons).
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-[var(--crm-border)] bg-[var(--crm-panel)] px-3.5 py-3">
      <Avatar name={name} photoUrl={photoUrl} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold text-[var(--crm-text-primary)]">{name}</p>
        <p className="truncate text-[12px] text-[var(--crm-text-muted)]">
          {subtitle ? `${subtitle} · ` : ""}Joined {formatDate(joinedDate)}
        </p>
      </div>
      <StatusBadge status={status} />
      {action}
    </div>
  )
}
