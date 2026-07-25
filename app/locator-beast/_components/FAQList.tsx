"use client";

import { useState } from "react";
import { HiOutlineChevronDown } from "react-icons/hi2";

export type FAQItem = { question: string; answer: string };

export default function FAQList({ items, id }: { items: FAQItem[]; id?: string }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div id={id} className="flex flex-col divide-y divide-[var(--beast-border)] border-y border-[var(--beast-border)]">
      {items.map((item, i) => {
        const isOpen = openIndex === i;
        return (
          <div key={item.question}>
            <button
              type="button"
              onClick={() => setOpenIndex(isOpen ? null : i)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-6 py-6 text-left"
            >
              <span className="text-[16px] font-semibold text-[var(--beast-ink)]">{item.question}</span>
              <HiOutlineChevronDown
                className={`h-5 w-5 shrink-0 text-[var(--beast-ink-soft)] transition-transform duration-300 ${
                  isOpen ? "rotate-180" : ""
                }`}
              />
            </button>
            <div
              className="grid overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
              style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
            >
              <div className="overflow-hidden">
                <p className="pb-6 text-[15px] leading-relaxed text-[var(--beast-ink-soft)]">
                  {item.answer}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
