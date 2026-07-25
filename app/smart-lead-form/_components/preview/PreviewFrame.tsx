export default function PreviewFrame({
  device,
  children,
}: {
  device: "mobile" | "desktop"
  children: React.ReactNode
}) {
  if (device === "mobile") {
    return (
      <div className="rounded-[2.5rem] border-[10px] border-[#111318] bg-[#111318] shadow-[0_30px_80px_-30px_rgba(15,23,42,0.4)]">
        <div className="h-6 w-full" />
        <div className="h-[720px] w-[375px] overflow-y-auto rounded-b-[1.75rem] rounded-t-lg bg-white">
          {children}
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-[960px] overflow-hidden rounded-2xl border border-[#e2e4ea] bg-white shadow-[0_30px_80px_-30px_rgba(15,23,42,0.25)]">
      <div className="flex items-center gap-1.5 border-b border-[#e2e4ea] bg-[#f7f8fa] px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
      </div>
      <div className="max-h-[720px] overflow-y-auto">{children}</div>
    </div>
  )
}
