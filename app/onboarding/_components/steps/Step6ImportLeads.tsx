"use client";

import { useRef, useState } from "react";
import { HiOutlineDocumentArrowUp } from "react-icons/hi2";
import StepCard from "../StepCard";
import type { StepProps } from "../../_lib/types";

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
    <StepCard eyebrow="Step 6" title="Import Leads" subtitle="Bring your existing leads over, or start with a clean slate.">
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
          onClick={handleStartFresh}
          disabled={saving}
          className="flex-1 rounded-full border border-[var(--beast-border)] px-6 py-3.5 text-[15px] font-semibold text-[var(--beast-ink)] transition-colors hover:bg-[#f7f8fa]"
        >
          Start Fresh
        </button>
        <button
          type="button"
          onClick={handleImport}
          disabled={!file || importing || saving}
          className="flex-1 rounded-full bg-[var(--beast-ink)] px-6 py-3.5 text-[15px] font-semibold text-white transition-transform duration-300 hover:scale-[1.01] hover:bg-[var(--beast-blue)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {importing ? "Importing…" : "Import CSV"}
        </button>
      </div>
    </StepCard>
  );
}
