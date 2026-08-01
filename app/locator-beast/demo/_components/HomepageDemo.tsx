"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import LeadBoard from "@/components/crm/LeadBoard";
import LeadPanel from "@/components/crm/LeadPanel";
import { DEMO_LEADS, DEMO_NEXT_ACTIONS, DEMO_FAVORITES } from "@/lib/demo/demoWorkspace";
import { TRIAL_URL } from "@/app/locator-beast/_lib/site";

// The guided homepage demo: a single sample lead moving through the REAL CRM.
// Everything after "Submit Lead" is the production LeadBoard + LeadPanel fed
// with demo data — no fake components. Every demo-* lead skips all Supabase
// reads/writes (guards + demo branches), so it's fully read-only.

const HERO_ID = "demo-1"; // Maria Gonzalez — our protagonist
const COLUMNS = [
  { id: "new", title: "🟡 New" },
  { id: "contacted", title: "🔵 Contacted" },
];
const now = () => new Date().toISOString();

type Stage = "form" | "analyzing" | "board" | "panel";

export default function HomepageDemo() {
  const [stage, setStage] = useState<Stage>("form");
  const initial = useMemo(
    () => DEMO_LEADS.filter((l) => l.crm_status === "new" || l.crm_status === "contacted"),
    []
  );
  const [leads, setLeads] = useState<any[]>(initial);
  const [nextActions, setNextActions] = useState<any[]>(DEMO_NEXT_ACTIONS);
  const [selectedId, setSelectedId] = useState<string | number | null>(null);
  const [moved, setMoved] = useState(false);

  const selected = leads.find((l) => l.id === selectedId) ?? null;

  // Step 1 → Step 3: submit → "AI is analyzing…" → board.
  useEffect(() => {
    if (stage !== "analyzing") return;
    const t = setTimeout(() => setStage("board"), 1900);
    return () => clearTimeout(t);
  }, [stage]);

  // Step 4/5: detect the hero lead reaching Contacted (drag OR tap) → automation
  // injects the follow-up the workflow would create.
  useEffect(() => {
    if (moved) return;
    const hero = leads.find((l) => l.id === HERO_ID);
    if (hero?.crm_status === "contacted") {
      setMoved(true);
      // Mirror what the real workflow engine does on New → Contacted: stamp the
      // first-contact time (so "Contact Lead ✓" shows as the Last Action) and
      // queue the follow-up. Due today + high priority so it wins ranking over
      // the passive "Waiting for Response" automatic state.
      const stamp = now();
      setLeads((prev) => prev.map((l) => (l.id === HERO_ID ? { ...l, first_text_sent_at: stamp } : l)));
      setNextActions((prev) => [
        ...prev,
        {
          id: 99001,
          lead_id: HERO_ID,
          title: "Send Maria her first list",
          due_at: stamp,
          priority: "high",
          notes: "3–4 modern communities in Downtown + SoCo under $1,700.",
          completed: false,
          created_at: stamp,
        },
      ]);
    }
  }, [leads, moved]);

  // Once the automation has fired, open the real Lead Panel after a beat.
  // (Separate effect so flipping `moved` doesn't cancel the pending timeout.)
  useEffect(() => {
    if (!moved) return;
    const t = setTimeout(() => {
      setSelectedId(HERO_ID);
      setStage("panel");
    }, 1700);
    return () => clearTimeout(t);
  }, [moved]);

  function moveHeroToContacted() {
    setLeads((prev) =>
      prev.map((l) => (l.id === HERO_ID ? { ...l, crm_status: "contacted", _justDropped: true } : l))
    );
  }

  // ── Step 1 — prefilled shortened Smart Lead Form (no typing) ────────────────
  if (stage === "form") {
    return (
      <div className="mx-auto w-full max-w-lg rounded-2xl border border-white/10 bg-[#0b0f1a] p-6 sm:p-8">
        <p className="text-center text-[12px] font-semibold uppercase tracking-[0.2em] text-[var(--beast-blue-bright)]">
          A renter fills out your Smart Lead Form
        </p>
        <h3 className="mt-2 text-center text-[20px] font-semibold text-white">Find me an apartment</h3>
        <div className="mt-6 grid grid-cols-1 gap-3.5 sm:grid-cols-2">
          {[
            ["Name", "Maria Gonzalez"],
            ["Phone", "(512) 555-0142"],
            ["Bedrooms", "1 Bedroom"],
            ["Budget", "$1,500 – $1,700"],
            ["Preferred Area", "Downtown Austin"],
            ["Move Date", "This month"],
          ].map(([label, value]) => (
            <div key={label} className="flex flex-col gap-1.5">
              <span className="text-[12px] font-medium text-white/50">{label}</span>
              <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-[14px] text-white">
                {value}
              </div>
            </div>
          ))}
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-[12px] font-medium text-white/50">Notes</span>
            <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-[14px] text-white">
              Relocating to Austin for a role at Dell. First apartment on her own.
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setStage("analyzing")}
          className="mt-6 w-full rounded-full bg-[var(--beast-blue)] px-6 py-3.5 text-[15px] font-semibold text-white transition-transform duration-200 hover:scale-[1.01]"
        >
          Submit Lead
        </button>
      </div>
    );
  }

  // ── Step 3 — "AI is analyzing your client…" ────────────────────────────────
  if (stage === "analyzing") {
    return (
      <div className="flex min-h-[360px] flex-col items-center justify-center text-center">
        <span className="h-12 w-12 animate-spin rounded-full border-2 border-white/15 border-t-[var(--beast-blue)]" />
        <p className="mt-6 text-[17px] font-semibold text-white">AI is analyzing your client…</p>
        <p className="mt-1.5 max-w-sm text-[13.5px] text-white/45">
          Scoring approval odds, matching communities, and drafting the next action.
        </p>
      </div>
    );
  }

  // ── Steps 2/4/5/6 — the REAL CRM ───────────────────────────────────────────
  return (
    <ThemeProvider>
      <div className="rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-background)] p-4 text-[var(--crm-text-primary)] sm:p-5">
        {stage === "board" && (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13px] text-[var(--crm-text-secondary)]">
                {moved ? (
                  "✓ Automation triggered — opening the lead…"
                ) : (
                  <>
                    Maria just landed in <span className="font-semibold text-[var(--crm-text-primary)]">New</span>.{" "}
                    <span className="hidden sm:inline">Drag her card into </span>
                    <span className="sm:hidden">Tap to move her to </span>
                    <span className="font-semibold text-[var(--crm-text-primary)]">Contacted</span>
                    <span className="hidden sm:inline"> — or use the button.</span>
                  </>
                )}
              </p>
              {/* Drag is the primary desktop interaction; this button keeps the
                  guided demo foolproof (and is the mobile tap path). */}
              {!moved && (
                <button
                  type="button"
                  onClick={moveHeroToContacted}
                  className="crm-cta rounded-lg px-3.5 py-2 text-[13px] font-semibold text-white"
                >
                  Move Maria to Contacted →
                </button>
              )}
            </div>
            <LeadBoard
              leads={leads}
              setLeads={setLeads}
              selectedLeadId={selectedId}
              onSelectLead={(id) => {
                setSelectedId(id);
                setStage("panel");
              }}
              columns={COLUMNS}
            />
          </>
        )}

        {stage === "panel" && selected && (
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
            <div className="w-full flex-none overflow-hidden rounded-2xl bg-[var(--crm-panel)] shadow-[0_1px_2px_rgba(var(--crm-shadow-color),0.06),0_10px_28px_rgba(var(--crm-shadow-color),0.28)] lg:w-[420px]">
              <LeadPanel
                lead={selected}
                nextActions={nextActions}
                setNextActions={setNextActions}
                favorites={DEMO_FAVORITES}
                onClose={() => setStage("board")}
                onUpdateLead={(u: any) => setLeads((prev) => prev.map((l) => (l.id === u.id ? u : l)))}
              />
            </div>
            <div className="flex-1 rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-panel)] p-8 text-center">
              <p className="text-[19px] font-semibold text-[var(--crm-text-primary)]">Ready to stop losing leads?</p>
              <p className="mx-auto mt-2 max-w-sm text-[14px] text-[var(--crm-text-secondary)]">
                That entire flow — capture, automation, and AI insights — is what happens in Locator Beast every time a renter submits.
              </p>
              <Link
                href={TRIAL_URL}
                className="crm-cta mt-6 inline-block rounded-full px-8 py-3.5 text-[15px] font-semibold text-white"
              >
                Start Your Free 30-Day Trial
              </Link>
              <p className="mt-3 text-[12.5px] text-[var(--crm-text-muted)]">No credit card required.</p>
            </div>
          </div>
        )}
      </div>
    </ThemeProvider>
  );
}
