import type { SmartLeadFormConfig } from "../../../_lib/types"
import TestimonialCard from "./TestimonialCard"

export default function Testimonials({ config }: { config: SmartLeadFormConfig }) {
  return (
    <section className="bg-[#f7f8fa] px-5 py-10 sm:px-8">
      <div className="mx-auto max-w-lg">
        <p className="text-center text-[18px] font-semibold uppercase tracking-[0.2em] text-[#9098a8]">
          What renters are saying
        </p>
        <div className="mt-5 flex flex-col gap-3">
          {config.copy.testimonials.map((t, i) => (
            <TestimonialCard key={i} testimonial={t} />
          ))}
        </div>
      </div>
    </section>
  )
}
