"use client"

import { useState } from "react"
import { HiOutlineClipboard, HiOutlineCheck } from "react-icons/hi2"

// Shared clipboard control. Promoted out of the Smart Lead Form editor so the Profile
// Smart Form URL can reuse the SAME treatment (and the same execCommand fallback for
// permission-restricted contexts) instead of hand-rolling a tenth implementation.
export default function CopyButton({
  value,
  label = "Copy",
  variant = "compact",
  tone = "light",
}: {
  value: string
  label?: string
  variant?: "full" | "compact"
  /** The compact button's palette. "light" is the white Smart Lead Form editor
   *  (the default, so every existing caller is unchanged); "dark" uses the CRM
   *  tokens for the dark shell, where the light hexes would read as low-contrast
   *  text and flash a white hover. Same markup, same clipboard behavior. */
  tone?: "light" | "dark"
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

  const compactCls =
    tone === "dark"
      ? "border-[var(--crm-border)] text-[var(--crm-text-secondary)] hover:bg-[var(--crm-card)] hover:text-[var(--crm-text-primary)]"
      : "border-[#e5e7ee] text-[#4b5162] hover:bg-[#f4f5f8]"

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${compactCls}`}
    >
      {copied ? (
        <HiOutlineCheck className={`h-3.5 w-3.5 ${tone === "dark" ? "text-emerald-400" : "text-[#0f9d58]"}`} />
      ) : (
        <HiOutlineClipboard className="h-3.5 w-3.5" />
      )}
      {copied ? "Copied" : label}
    </button>
  )
}
