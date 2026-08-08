import type { SmartLeadFormConfig } from "../../../_lib/types"

// Presentation-only: renders the SAME saved highlights (config.copy.highlights,
// the existing three-field array — unchanged source, values untouched) as one
// clean band, nonblank values joined by centered dots:  A · B · C.
//
// - Only nonblank saved highlights render; separators appear ONLY between two
//   visible values (the dot is drawn before every item except the first).
// - The fill/border are a SOFT tint of the active theme accent
//   (branding.buttonColor via color-mix) — never a hard-coded color. A
//   white/10 fill is the fallback if color-mix is unsupported. This is kept
//   deliberately lighter than the solid accent submit button, so the CTA stays
//   the visually strongest element.
// - flex-wrap + max-w-full + break-words let it wrap cleanly on narrow phones
//   without clipping or horizontal overflow.
export default function Highlights({ config }: { config: SmartLeadFormConfig }) {
  const items = config.copy.highlights.map((h) => (h ?? "").trim()).filter(Boolean)
  if (items.length === 0) return null

  const accent = config.branding.buttonColor

  return (
    <div className="flex justify-center">
      <span
        className="inline-flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-center text-[13px] font-semibold leading-snug text-white"
        style={{
          backgroundColor: `color-mix(in srgb, ${accent} 18%, transparent)`,
          borderColor: `color-mix(in srgb, ${accent} 34%, transparent)`,
        }}
      >
        {items.map((item, i) => (
          <span key={i} className="inline-flex items-center gap-x-2">
            {i > 0 && (
              <span aria-hidden="true" className="text-white/50">
                ·
              </span>
            )}
            <span className="break-words">{item}</span>
          </span>
        ))}
      </span>
    </div>
  )
}
