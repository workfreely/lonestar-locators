"use client";

import { useRef, useState } from "react";
import { HiOutlineDocumentArrowUp, HiOutlineArrowDownTray } from "react-icons/hi2";
import StepCard from "../StepCard";
import type { StepProps } from "../../_lib/types";

// The official Locator Beast import template — every field the CRM supports,
// with human-friendly headers, plus one example row so exports "just work."
// Keep these headers in sync with the future CSV importer's column mapping.
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
];

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
];

// Minimal RFC-4180 escaping: wrap in quotes when a field contains a comma,
// quote, or newline, doubling any embedded quotes.
function toCsvRow(fields: string[]): string {
  return fields
    .map((f) => (/[",\n]/.test(f) ? `"${f.replace(/"/g, '""')}"` : f))
    .join(",");
}

function downloadTemplate() {
  const csv = [toCsvRow(TEMPLATE_HEADERS), toCsvRow(TEMPLATE_EXAMPLE)].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "locator-beast-leads-template.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function Step6ImportLeads({ onNext, onBack, saving }: StepProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);

  function handleImport() {
    // Placeholder: real CSV parsing + tenant-scoped lead insertion plugs in
    // here later. For now this just records that the user chose to import.
    setImporting(true);
    setTimeout(() => {
      onNext({ leads_import_status: "imported" });
    }, 700);
  }

  function handleStartFresh() {
    onNext({ leads_import_status: "skipped" });
  }

  return (
    <StepCard eyebrow="Step 4" title="Import Leads" subtitle="Bring your existing leads over, or start with a clean slate.">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          const dropped = e.dataTransfer.files?.[0];
          if (dropped) setFile(dropped);
        }}
        className={`flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
          dragActive ? "border-[var(--beast-blue)] bg-[var(--beast-blue)]/5" : "border-[var(--beast-border)] bg-[#f7f8fa]"
        }`}
      >
        <HiOutlineDocumentArrowUp className="h-8 w-8 text-[var(--beast-ink-soft)]" />
        <p className="text-[14px] font-semibold text-[var(--beast-ink)]">
          {file ? file.name : "Drag and drop your CSV, or click to browse"}
        </p>
        {!file && <p className="text-[13px] text-[var(--beast-ink-soft)]">CSV files only</p>}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />

      {/* Official template — so users export into our format and it just works. */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--beast-border)] bg-white px-4 py-3">
        <p className="text-[13px] text-[var(--beast-ink-soft)]">
          Not sure of the format? Start from our template.
        </p>
        <button
          type="button"
          onClick={downloadTemplate}
          className="inline-flex items-center gap-2 rounded-full border border-[var(--beast-border)] bg-white px-4 py-2 text-[13px] font-semibold text-[var(--beast-ink)] transition-colors hover:bg-[#f7f8fa]"
        >
          <HiOutlineArrowDownTray className="h-4 w-4" />
          Download CSV Template
        </button>
      </div>

      {/* Back · Import CSV (secondary) · Start Fresh (primary) — most new users
          won't have data to import, so Start Fresh is the primary action. */}
      <div className="mt-9 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-full border border-[var(--beast-border)] px-6 py-3.5 text-[15px] font-semibold text-[var(--beast-ink)] transition-colors hover:bg-[#f7f8fa]"
        >
          Back
        </button>
        <button
          type="button"
          onClick={handleImport}
          disabled={!file || importing || saving}
          className="flex-1 rounded-full border border-[var(--beast-border)] bg-white px-6 py-3.5 text-[15px] font-semibold text-[var(--beast-ink)] transition-colors hover:bg-[#f7f8fa] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {importing ? "Importing…" : "Import CSV"}
        </button>
        <button
          type="button"
          onClick={handleStartFresh}
          disabled={saving}
          className="flex-1 rounded-full bg-[var(--beast-ink)] px-6 py-3.5 text-[15px] font-semibold text-white transition-transform duration-300 hover:scale-[1.01] hover:bg-[var(--beast-blue)] disabled:opacity-60"
        >
          Start Fresh
        </button>
      </div>
    </StepCard>
  );
}
