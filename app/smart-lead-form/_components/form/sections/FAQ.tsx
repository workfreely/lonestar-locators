"use client"

import { useState } from "react"
import { HiOutlineChevronDown } from "react-icons/hi2"
import type { SmartLeadFormConfig } from "../../../_lib/types"

export default function FAQ({ config }: { config: SmartLeadFormConfig }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0)

  return (
    <section className="px-5 py-10 sm:px-8">
      <div className="mx-auto max-w-lg">
        <p className="text-center text-[13px] font-semibold uppercase tracking-[0.2em] text-[#9098a8]">
          FAQ&apos;s
        </p>
        <div className="mt-5 flex flex-col divide-y divide-[#eef0f4] border-y border-[#eef0f4]">
          {config.copy.faqs.map((item, i) => {
            const isOpen = openIndex === i
            return (
              <div key={i}>
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? null : i)}
                  className="flex w-full min-w-0 items-center justify-between gap-4 py-4 text-left"
                >
                  <span className="min-w-0 break-words text-[14px] font-semibold text-[#111318]">{item.question}</span>
                  <HiOutlineChevronDown
                    className={`h-4 w-4 shrink-0 text-[#9098a8] transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}
                  />
                </button>
                <div
                  className="grid overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
                  style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
                >
                  <div className="overflow-hidden">
                    <p className="break-words pb-4 text-[13.5px] leading-relaxed text-[#6b7280]">{item.answer}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
