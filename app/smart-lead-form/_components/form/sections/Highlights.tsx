import { HiOutlineCheckCircle } from "react-icons/hi2"
import type { SmartLeadFormConfig } from "../../../_lib/types"

// No section wrapper of its own — this composes directly inside Hero's
// already-padded, already-centered container, right below the subheadline.
// Plain text on the dark hero background (no pill, no fill, no border) —
// the same check-circle icon for every highlight, since the text itself is
// fully customizable and shouldn't imply a specific meaning per icon.
export default function Highlights({ config }: { config: SmartLeadFormConfig }) {
  return (
    <div className="flex flex-nowrap items-center justify-center gap-0.5">
      {config.copy.highlights.map((item, i) => (
        <div key={item} className="flex shrink items-center gap-0.5">
          {i > 0 && <span className="h-3 w-px shrink-0 bg-white/25" aria-hidden="true" />}
          <span className="flex items-center gap-1 whitespace-nowrap text-[10px] font-medium text-white">
            <HiOutlineCheckCircle className="h-2.5 w-2.5 shrink-0 text-[#5b9bff]" />
            {item}
          </span>
        </div>
      ))}
    </div>
  )
}
