import { HiStar } from "react-icons/hi2"
import type { SmartLeadFormConfig } from "../../../_lib/types"

export default function Testimonials({ config }: { config: SmartLeadFormConfig }) {
  return (
    <section className="bg-[#f7f8fa] px-5 py-10 sm:px-8">
      <div className="mx-auto max-w-lg">
        <p className="text-center text-[13px] font-semibold uppercase tracking-[0.2em] text-[#9098a8]">
          What renters are saying
        </p>
        <div className="mt-5 flex flex-col gap-3">
          {config.copy.testimonials.map((t, i) => (
            <div key={i} className="rounded-2xl border border-[#e2e4ea] bg-white p-5">
              <div className="flex gap-0.5 text-amber-400">
                {Array.from({ length: 5 }).map((_, j) => (
                  <HiStar key={j} className="h-3.5 w-3.5" />
                ))}
              </div>
              <p className="mt-2.5 text-[14px] leading-relaxed text-[#3a3f4d]">&ldquo;{t.quote}&rdquo;</p>
              <div className="mt-3 flex items-center gap-2.5">
                {t.photoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.photoUrl} alt={t.name} className="h-8 w-8 rounded-full object-cover" />
                )}
                <p className="text-[12.5px] font-semibold text-[#111318]">
                  {t.name}
                  {t.city && <span className="font-normal text-[#9098a8]"> — {t.city}</span>}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
