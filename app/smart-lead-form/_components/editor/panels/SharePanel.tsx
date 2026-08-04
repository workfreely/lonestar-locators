"use client"

import { useEffect, useState } from "react"
import QRCode from "qrcode"
import type { IconType } from "react-icons"
import { FaInstagram, FaFacebook, FaTiktok, FaYoutube, FaGoogle, FaEnvelope } from "react-icons/fa6"
import CopyButton from "../ui/CopyButton"
import Card from "../ui/Card"
import {
  FALLBACK_USERNAME,
  SHARE_PLATFORMS,
  buildShareUrl,
  publicPagePath,
  publicPageUrl,
} from "../../../_lib/shareConfig"

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

export default function SharePanel({ slug }: { slug: string | null }) {
  const username = slug ?? FALLBACK_USERNAME
  const pagePath = publicPagePath(username) // locatorbeast.com/jay-morris
  const pageUrl = publicPageUrl(username) // https://locatorbeast.com/jay-morris

  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    QRCode.toDataURL(pageUrl, {
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
  }, [pageUrl])

  function downloadQr() {
    if (!qrDataUrl) return
    const link = document.createElement("a")
    link.href = qrDataUrl
    link.download = "smart-lead-form-qr-code.png"
    link.click()
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Preview → Copy Link → Share, top to bottom. */}
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#9098a8]">Preview</p>
        <a
          href={`/${username}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full rounded-full bg-[#2f6bff] px-8 py-3 text-center text-[14px] font-semibold text-white transition-transform duration-200 hover:scale-[1.01]"
        >
          Preview Smart Form
        </a>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#9098a8]">Your Public Page</p>
        <Card className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-[#111318]">{pagePath}</span>
          <CopyButton value={pageUrl} label="Copy" />
        </Card>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#9098a8]">Share To</p>
        <div className="flex flex-col gap-2">
          {SHARE_PLATFORMS.map((platform) => {
            const Icon = PLATFORM_ICONS[platform.id]
            const color = PLATFORM_COLORS[platform.id]
            return (
              <Card key={platform.id} className="flex items-center gap-3">
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `${color}1a` }}
                >
                  <Icon className="h-4 w-4" style={{ color }} />
                </span>
                <span className="min-w-0 flex-1 text-[13.5px] font-medium text-[#111318]">{platform.label}</span>
                <CopyButton value={buildShareUrl(username, platform.utmSource)} label="Copy" />
              </Card>
            )
          })}
        </div>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-[#9098a8]">QR Code</p>
        <Card className="flex flex-col items-center gap-3">
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
        </Card>
      </div>
    </div>
  )
}
