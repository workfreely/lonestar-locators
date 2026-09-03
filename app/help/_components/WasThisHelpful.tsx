"use client"

import { useState } from "react"

// Lightweight, self-contained feedback control. Records the choice locally so the
// agent sees an acknowledgement; no backend, no tracking, no data leaves the page.
export default function WasThisHelpful() {
  const [choice, setChoice] = useState<"yes" | "no" | null>(null)

  if (choice) {
    return (
      <p className="text-[13px] text-[#6b7280]">
        Thanks for your feedback.
        {choice === "no" && " Still stuck? Open Ask Beast AI in the corner to ask your question."}
      </p>
    )
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-[13px] font-medium text-[#4b5162]">Was this helpful?</span>
      <button
        type="button"
        onClick={() => setChoice("yes")}
        className="rounded-lg border border-[#e5e7ee] bg-white px-3 py-1.5 text-[13px] font-medium text-[#111318] hover:bg-[#f4f5f8]"
      >
        Yes
      </button>
      <button
        type="button"
        onClick={() => setChoice("no")}
        className="rounded-lg border border-[#e5e7ee] bg-white px-3 py-1.5 text-[13px] font-medium text-[#111318] hover:bg-[#f4f5f8]"
      >
        No
      </button>
    </div>
  )
}
