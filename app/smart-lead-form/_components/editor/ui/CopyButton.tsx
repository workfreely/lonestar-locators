"use client"

import { useState } from "react"
import { HiOutlineClipboard, HiOutlineCheck } from "react-icons/hi2"

export default function CopyButton({
  value,
  label = "Copy",
  variant = "compact",
}: {
  value: string
  label?: string
  variant?: "full" | "compact"
}) {
  const [copied, setCopied] = useState(false)

  function fallbackCopy(text: string): boolean {
    const textarea = document.createElement("textarea")
    textarea.value = text
    textarea.style.position = "fixed"
    textarea.style.opacity = "0"
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    let succeeded = false
    try {
      succeeded = document.execCommand("copy")
    } catch {
      succeeded = false
    }
    document.body.removeChild(textarea)
    return succeeded
  }

  async function handleCopy() {
    let succeeded = false
    try {
      await navigator.clipboard.writeText(value)
      succeeded = true
    } catch {
      // Permissions-restricted context (e.g. sandboxed iframe) — fall back
      // to the legacy copy mechanism rather than leaving the click inert.
      succeeded = fallbackCopy(value)
    }
    if (succeeded) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    }
  }

  if (variant === "full") {
    return (
      <button
        type="button"
        onClick={handleCopy}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-[#111318] px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#2f6bff]"
      >
        {copied ? <HiOutlineCheck className="h-4 w-4" /> : <HiOutlineClipboard className="h-4 w-4" />}
        {copied ? "Copied" : label}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="flex shrink-0 items-center gap-1.5 rounded-full border border-[#e5e7ee] px-3 py-1.5 text-[12.5px] font-semibold text-[#4b5162] transition-colors hover:bg-[#f4f5f8]"
    >
      {copied ? (
        <HiOutlineCheck className="h-3.5 w-3.5 text-[#0f9d58]" />
      ) : (
        <HiOutlineClipboard className="h-3.5 w-3.5" />
      )}
      {copied ? "Copied" : label}
    </button>
  )
}
