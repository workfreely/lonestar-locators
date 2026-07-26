"use client"

import { useRef, useState } from "react"
import { HiOutlineArrowUpTray, HiOutlineXMark } from "react-icons/hi2"

export default function UploadTile({
  label,
  imageUrl,
  onChange,
  round,
  wide,
}: {
  label: string
  imageUrl: string | null
  onChange: (url: string | null) => void
  round?: boolean
  wide?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragActive, setDragActive] = useState(false)

  function handleFile(file: File) {
    const url = URL.createObjectURL(file)
    onChange(url)
  }

  return (
    <div className="flex flex-col items-center gap-1.5 py-2 text-center">
      <label className="text-[12px] font-semibold text-[#6b7280]">{label}</label>
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragActive(true)
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragActive(false)
          const file = e.dataTransfer.files?.[0]
          if (file) handleFile(file)
        }}
        className={`relative flex items-center justify-center overflow-hidden border-2 border-dashed bg-[#f9fafb] transition-colors ${
          round ? "h-16 w-16 rounded-full" : wide ? "h-24 w-full rounded-xl" : "h-16 w-16 rounded-xl"
        } ${dragActive ? "border-[#2f6bff]" : "border-[#e5e7ee]"}`}
      >
        {imageUrl ? (
          <img src={imageUrl} alt={label} className="h-full w-full object-cover" />
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex h-full w-full items-center justify-center text-[#9098a8] hover:text-[#4b5162]"
          >
            <HiOutlineArrowUpTray className="h-4 w-4" />
          </button>
        )}

        {imageUrl && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
            aria-label="Remove"
          >
            <HiOutlineXMark className="h-3 w-3" />
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="text-[12px] font-semibold text-[#2f6bff] hover:text-[#5b8bff]"
      >
        {imageUrl ? "Replace" : "Upload"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
        }}
      />
    </div>
  )
}
