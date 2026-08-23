// Neutral placeholder shown while the real workspace/form/profile data loads.
//
// It exists so the editor has something honest to render in that window. The
// alternative — seeding state with DEFAULT_CONFIG — meant a real agent watched
// the design template's identity ("Jordan Blake", "Placeholder Realty Group",
// a sample phone, sample markets, three named sample testimonials) appear as if
// it were their own form.
//
// Deliberately contentless: shapes only, no text, no names, no numbers. It
// roughly echoes the form's rhythm (hero band, identity line, a few fields) so
// the frame does not visibly jump when the real preview replaces it.
export default function PreviewSkeleton() {
  const bar = "rounded-md bg-[#eceef3]"
  return (
    <div className="animate-pulse" aria-hidden>
      {/* Hero band */}
      <div className="flex flex-col items-center gap-4 bg-[#f4f5f8] px-10 py-14">
        <div className={`h-3 w-40 ${bar}`} />
        <div className={`h-7 w-[420px] ${bar}`} />
        <div className={`h-4 w-[300px] ${bar}`} />
        <div className="mt-2 h-20 w-20 rounded-full bg-[#eceef3]" />
        <div className={`h-4 w-48 ${bar}`} />
        <div className={`h-3 w-64 ${bar}`} />
      </div>
      {/* Form band */}
      <div className="flex flex-col gap-4 px-10 py-10">
        <div className="grid grid-cols-2 gap-4">
          <div className={`h-11 ${bar}`} />
          <div className={`h-11 ${bar}`} />
        </div>
        <div className={`h-11 ${bar}`} />
        <div className={`h-11 ${bar}`} />
        <div className={`h-11 w-full rounded-full bg-[#e4e7ee]`} />
      </div>
    </div>
  )
}
