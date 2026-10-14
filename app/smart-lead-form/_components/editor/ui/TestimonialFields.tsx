"use client"

import type { TestimonialItem } from "../../../_lib/types"
import { TextField } from "./TextField"
import UploadTile from "./UploadTile"
import Card from "./Card"

// THE testimonial editor. One component, used by the Content tab (all three) and the Thank You
// Page tab (the first two), both writing to the SAME config.copy.testimonials array.
//
// It was lifted verbatim out of ContentPanel rather than reimplemented, so there is no second
// testimonial system to drift: same upload tile, same fields, same labels, same ordering. Editing
// a testimonial in either place is editing the same object, and whichever tab is open next shows
// the edit already there.
export default function TestimonialFields({
  testimonials,
  onChange,
  count = 3,
  startIndex = 0,
}: {
  testimonials: readonly TestimonialItem[]
  /** index is the position in config.copy.testimonials — never a local copy. */
  onChange: (index: 0 | 1 | 2, patch: Partial<TestimonialItem>) => void
  /** How many to render. The Thank You page shows two, so its tab edits two. */
  count?: number
  startIndex?: number
}) {
  return (
    <div className="flex flex-col gap-3 pb-1 pt-1">
      {testimonials.slice(startIndex, startIndex + count).map((t, i) => {
        const index = (startIndex + i) as 0 | 1 | 2
        return (
          <Card key={index}>
            <p className="pb-1 text-[12px] font-semibold text-[#4b5162]">Testimonial {index + 1}</p>
            <div className="flex gap-3">
              <UploadTile
                label="Photo (optional)"
                imageUrl={t.photoUrl}
                onChange={(url) => onChange(index, { photoUrl: url })}
                round
              />
              <div className="flex-1">
                <TextField label="Customer Name" value={t.name} onChange={(v) => onChange(index, { name: v })} />
                <TextField label="City (optional)" value={t.city} onChange={(v) => onChange(index, { city: v })} />
              </div>
            </div>
            <TextField label="Review" value={t.quote} onChange={(v) => onChange(index, { quote: v })} multiline />
          </Card>
        )
      })}
    </div>
  )
}
