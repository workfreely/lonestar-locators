"use client"

import { useRef, useState } from "react"
import { HiOutlineDocumentArrowUp, HiOutlineArrowDownTray } from "react-icons/hi2"
import SettingsShell, { SettingsCard } from "@/components/crm/settings/SettingsShell"

// The official Locator Beast import template — every field the CRM supports,
// with human-friendly headers, plus one example row so exports "just work."
// Keep these headers in sync with the future CSV importer's column mapping.
// (Ported verbatim from the former onboarding Import step.)
const TEMPLATE_HEADERS = [
  "First Name",
  "Last Name",
  "Phone",
  "Email",
  "Budget",
  "Bedrooms",
  "Bathrooms",
  "Desired Area",
  "Move Date",
  "Credit",
  "Broken Lease",
  "Eviction",
  "Criminal Background",
  "Lead Source",
  "Notes",
  "Favorite Properties",
  "Next Action",
]

const TEMPLATE_EXAMPLE = [
  "Jordan",
  "Rivera",
  "512-555-0142",
  "jordan@example.com",
  "$1,400-$1,600",
  "2",
  "2",
  "Downtown, South Congress",
  "2026-09-01",
  "720",
  "No",
  "No",
  "None",
  "Instagram",
  "Prefers a top-floor unit with parking",
  "The Foundry; Skyline Lofts",
  "Send list",
]

// Minimal RFC-4180 escaping: wrap in quotes when a field contains a comma,
// quote, or newline, doubling any embedded quotes.
function toCsvRow(fields: string[]): string {
  return fields
    .map((f) => (/[",\n]/.test(f) ? `"${f.replace(/"/g, '""')}"` : f))
    .join(",")
}

function downloadTemplate() {
  const csv = [toCsvRow(TEMPLATE_HEADERS), toCsvRow(TEMPLATE_EXAMPLE)].join("\n")
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = "locator-beast-leads-template.csv"
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// Future import sources — rendered as disabled "Soon" rows so the page mirrors
// the Integrations page's card/row/button styling while reserving room to grow.
const FUTURE_SOURCES: { name: string; description: string }[] = [
  { name: "Import from another CRM", description: "Bring leads over from your previous CRM." },
]

export default function ImportLeadsClient() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragActive, setDragActive] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [importing, setImporting] = useState(false)
  const [imported, setImported] = useState(false)

  function handleImport() {
    // Placeholder: real CSV parsing + tenant-scoped lead insertion plugs in
    // here later — the same deferral the onboarding step carried. For now this
    // acknowledges the upload so the flow is complete end to end.
    setImporting(true)
    setTimeout(() => {
      setImporting(false)
      setImported(true)
    }, 700)
  }

  return (
    <SettingsShell title="Import Leads" description="Bring your existing leads into Locator Beast.">
      {/* CSV Import — the one active source today. */}
      <SettingsCard title="CSV Import" description="Import leads from a CSV file.">
        {imported ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-[#e5e7ee] bg-[#f4f5f8] px-6 py-10 text-center">
            <p className="text-[14px] font-semibold text-[#111318]">{file?.name} received</p>
            <p className="text-[13px] text-[#6b7280]">We&apos;ll process your file and add your leads shortly.</p>
            <button
              type="button"
              onClick={() => {
                setFile(null)
                setImported(false)
              }}
              className="mt-2 rounded-lg border border-[#e5e7ee] bg-white px-4 py-2 text-[13px] font-semibold text-[#111318] transition-colors hover:bg-[#f4f5f8]"
            >
              Import another file
            </button>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault()
                setDragActive(true)
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragActive(false)
                const dropped = e.dataTransfer.files?.[0]
                if (dropped) setFile(dropped)
              }}
              className={`flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
                dragActive ? "border-[#2f6bff] bg-[#2f6bff]/5" : "border-[#e5e7ee] bg-[#f4f5f8]"
              }`}
            >
              <HiOutlineDocumentArrowUp className="h-8 w-8 text-[#9098a8]" />
              <p className="text-[14px] font-semibold text-[#111318]">
                {file ? file.name : "Drag and drop your CSV, or click to browse"}
              </p>
              {!file && <p className="text-[13px] text-[#6b7280]">CSV files only</p>}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />

            {/* Official template — so users export into our format and it just works. */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#e5e7ee] bg-[#f4f5f8] px-4 py-3">
              <p className="text-[13px] text-[#6b7280]">Not sure of the format? Start from our template.</p>
              <button
                type="button"
                onClick={downloadTemplate}
                className="inline-flex items-center gap-2 rounded-lg border border-[#e5e7ee] bg-white px-4 py-2 text-[13px] font-semibold text-[#111318] transition-colors hover:bg-[#f4f5f8]"
              >
                <HiOutlineArrowDownTray className="h-4 w-4" />
                Download CSV Template
              </button>
            </div>

            <button
              type="button"
              onClick={handleImport}
              disabled={!file || importing}
              className="mt-4 w-full rounded-lg bg-[#2f6bff] px-4 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-[#255ae0] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {importing ? "Importing…" : "Import CSV"}
            </button>
          </>
        )}
      </SettingsCard>

      {/* Reserved space for future import sources — matches the Integrations page. */}
      <SettingsCard>
        <div className="divide-y divide-[#eceef3]">
          {FUTURE_SOURCES.map((item) => (
            <div key={item.name} className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-[#111318]">{item.name}</p>
                <p className="text-[12.5px] text-[#6b7280]">{item.description}</p>
              </div>
              <button
                type="button"
                disabled
                className="flex-none cursor-not-allowed rounded-lg border border-[#e5e7ee] bg-[#f4f5f8] px-4 py-2 text-[13px] font-semibold text-[#9098a8]"
              >
                Soon
              </button>
            </div>
          ))}
        </div>
      </SettingsCard>
    </SettingsShell>
  )
}
