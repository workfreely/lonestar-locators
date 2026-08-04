// The ONE card/box style for the editor. Fixed 16px horizontal padding, 12px
// vertical, one radius — replaces the old mix of px-2.5 / p-3 / px-3.5 across
// Fields, Content, Consent and Share.
//   • default: white, bordered card (testimonials, FAQ, share rows, QR, URL box)
//   • muted:   borderless grey info callout (help text at the top of a tab)
// Pass className for inner layout only (e.g. "flex items-center gap-3") — never
// to override the padding/border/radius.
export default function Card({
  children,
  className = "",
  muted = false,
}: {
  children: React.ReactNode
  className?: string
  muted?: boolean
}) {
  const skin = muted ? "bg-[#f4f5f8]" : "border border-[#e5e7ee] bg-white"
  return <div className={`rounded-xl px-4 py-3 ${skin} ${className}`}>{children}</div>
}
