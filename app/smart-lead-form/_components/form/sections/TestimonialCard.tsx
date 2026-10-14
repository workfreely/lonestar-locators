import { HiStar } from "react-icons/hi2"
import type { TestimonialItem } from "../../../_lib/types"

// THE testimonial card. One component, one source of truth for its styling.
//
// Lifted VERBATIM out of Testimonials.tsx — every class is the original, not a reconstruction —
// and now rendered by both the public Smart Lead Form and the public Thank You page. Changing the
// design here changes it on both; there is deliberately no second implementation that merely looks
// similar.
//
// Only the SURROUNDING layout differs between the two pages: the form stacks them in a single
// column, the Thank You page lays two out in a grid. The card itself is identical.
export default function TestimonialCard({ testimonial }: { testimonial: TestimonialItem }) {
  const t = testimonial
  return (
    <div className="rounded-2xl border border-[#e2e4ea] bg-white p-5">
      <div className="flex gap-0.5 text-amber-400">
        {Array.from({ length: 5 }).map((_, j) => (
          <HiStar key={j} className="h-7 w-7" />
        ))}
      </div>
      <p className="mt-2.5 break-words text-[17px] leading-relaxed text-[#3a3f4d]">&ldquo;{t.quote}&rdquo;</p>
      <div className="mt-3 flex min-w-0 items-center gap-2.5">
        {t.photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t.photoUrl} alt={t.name} className="h-8 w-8 shrink-0 rounded-full object-cover" />
        )}
        <p className="min-w-0 break-words text-[16px] font-semibold text-[#111318]">
          {t.name}
          {t.city && <span className="font-normal text-[#9098a8]"> — {t.city}</span>}
        </p>
      </div>
    </div>
  )
}
