export default function Divider({ label = "or" }: { label?: string }) {
  return (
    <div className="my-6 flex items-center gap-4">
      <div className="h-px flex-1 bg-[var(--beast-border)]" />
      <span className="text-[12px] font-medium uppercase tracking-wide text-[var(--beast-ink-soft)]">
        {label}
      </span>
      <div className="h-px flex-1 bg-[var(--beast-border)]" />
    </div>
  );
}
