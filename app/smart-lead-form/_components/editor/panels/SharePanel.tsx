"use client"

import { useEffect, useState } from "react"
import QRCode from "qrcode"
import type { IconType } from "react-icons"
import { FaInstagram, FaFacebook, FaTiktok, FaYoutube, FaGoogle, FaEnvelope } from "react-icons/fa6"
import CopyButton from "../ui/CopyButton"
import { PUBLIC_PAGE_URL, PUBLIC_PAGE_PATH, SHARE_PLATFORMS, buildShareUrl } from "../../../_lib/shareConfig"

const PLATFORM_ICONS: Record<string, IconType> = {
  instagram: FaInstagram,
  facebook: FaFacebook,
  tiktok: FaTiktok,
  youtube: FaYoutube,
  google: FaGoogle,
  email: FaEnvelope,
}

const PLATFORM_COLORS: Record<string, string> = {
  instagram: "#E1306C",
  facebook: "#1877F2",
  tiktok: "#111318",
  youtube: "#FF0000",
  google: "#4285F4",
  email: "#6b7280",
}

export default function SharePanel() {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    QRCode.toDataURL(PUBLIC_PAGE_URL, {
      width: 320,
      margin: 1,
      color: { dark: "#111318", light: "#ffffff" },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url)
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  function downloadQr() {
    if (!qrDataUrl) return
    const link = document.createElement("a")
    link.href = qrDataUrl
    link.download = "smart-lead-form-qr-code.png"
    link.click()
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#9098a8]">Your Public Page</p>
        <div className="rounded-xl border border-[#e5e7ee] bg-[#f9fafb] px-3.5 py-3">
          <span className="block truncate text-[13.5px] font-medium text-[#111318]">{PUBLIC_PAGE_PATH}</span>
        </div>
        <div className="mt-2.5">
          <CopyButton value={PUBLIC_PAGE_URL} label="Copy Link" variant="full" />
        </div>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#9098a8]">Share To</p>
        <div className="flex flex-col gap-2">
          {SHARE_PLATFORMS.map((platform) => {
            const Icon = PLATFORM_ICONS[platform.id]
            const color = PLATFORM_COLORS[platform.id]
            return (
              <div
                key={platform.id}
                className="flex items-center gap-3 rounded-xl border border-[#e5e7ee] bg-white px-3 py-2.5"
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `${color}1a` }}
                >
                  <Icon className="h-4 w-4" style={{ color }} />
                </span>
                <span className="flex-1 text-[13.5px] font-medium text-[#111318]">{platform.label}</span>
                <CopyButton value={buildShareUrl(platform.utmSource)} label="Copy" />
              </div>
            )
          })}
        </div>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#9098a8]">Landing Page</p>
        <div className="flex items-center gap-3 rounded-xl border border-[#e5e7ee] bg-[#f9fafb] px-3.5 py-3">
          <span className="flex-1 text-[13.5px] font-medium text-[#111318]">View your live landing page</span>
          <a
            href={PUBLIC_PAGE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-full border border-[#e5e7ee] bg-white px-4 py-2 text-[13px] font-semibold text-[#111318] transition-colors hover:bg-[#f4f5f8]"
          >
            Open
          </a>
        </div>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#9098a8]">QR Code</p>
        <div className="flex flex-col items-center gap-3 rounded-xl border border-[#e5e7ee] bg-[#f9fafb] p-5">
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qrDataUrl} alt="QR code linking to your public page" className="h-36 w-36 rounded-lg" />
          ) : (
            <div className="h-36 w-36 animate-pulse rounded-lg bg-[#e5e7ee]" />
          )}
          <button
            type="button"
            onClick={downloadQr}
            disabled={!qrDataUrl}
            className="w-full rounded-full border border-[#e5e7ee] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#111318] transition-colors hover:bg-[#f4f5f8] disabled:opacity-50"
          >
            Download QR Code
          </button>
        </div>
      </div>
    </div>
  )
}
