"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import LeadBoard from "@/components/crm/LeadBoard";
import LeadPanel from "@/components/crm/LeadPanel";
import Hero from "@/app/smart-lead-form/_components/form/sections/Hero";
import { DEFAULT_CONFIG } from "@/app/smart-lead-form/_lib/defaultConfig";
import type { SmartLeadFormConfig } from "@/app/smart-lead-form/_lib/types";
import { DEMO_LEADS, DEMO_NEXT_ACTIONS, DEMO_FAVORITES } from "@/lib/demo/demoWorkspace";
import { TRIAL_URL } from "@/app/locator-beast/_lib/site";

// ─────────────────────────────────────────────────────────────────────────────
// The guided /demo story. One sample lead (Maria) travels through the ACTUAL
// production surfaces: the real Smart Lead Form shell (Hero), the real
// LeadBoard, and the real LeadPanel — all fed read-only demo data that never
// touches Supabase. This file only supplies FRAMING (step headings, the
// branded form's shortened field set, board/panel proportions). It never
// changes the production components.
// ─────────────────────────────────────────────────────────────────────────────

const HERO_ID = "demo-1"; // Maria Gonzalez — the protagonist
const COLUMNS = [
  { id: "new", title: "🟡 New" },
  { id: "contacted", title: "🔵 Contacted" },
];
// Focused cast: Maria + one companion in New, one lead in Contacted.
const BOARD_LEAD_IDS = ["demo-1", "demo-2", "demo-4"];
const now = () => new Date().toISOString();

// A realistic locator's branded Smart Lead Form — the same production Hero the
// product renders, with a demo agent (Sarah Mitchell) over an Austin skyline so
// a visitor instantly pictures it as their own branded form.
const FORM_CONFIG: SmartLeadFormConfig = {
  ...DEFAULT_CONFIG,
  sections: {
    ...DEFAULT_CONFIG.sections,
    visibility: {
      ...DEFAULT_CONFIG.sections.visibility,
      headline: false, // agent branding is the header, not a marketing headline
      serviceAreas: false, // folded into the one-line subheadline instead
      phoneNumber: false,
    },
  },
  branding: {
    ...DEFAULT_CONFIG.branding,
    agentPhotoUrl: "/demo/agent-sarah.svg",
    agentPhotoSize: "large",
    profileImagePosition: "underHeadline",
    heroTheme: "custom",
    heroImageUrl: "/demo/austin-skyline.svg",
    heroOverlay: "medium",
    buttonColor: "#2f6bff",
  },
  copy: {
    ...DEFAULT_CONFIG.copy,
    subheadline: "Free, personalized apartment matches across Austin & Round Rock.",
    agentName: "Sarah Mitchell",
    agentTitle: "Austin Apartment Locator",
    brokerageName: "Mitchell Residential Group",
    highlights: ["100% Free", "Cash Rebate", "Same-Day Tours"],
    buttonText: "Submit Lead",
  },
};

type Stage = "form" | "analyzing" | "board" | "panel";

// One clean heading per stage — no step numbers, no paragraphs. The product
// tells the rest of the story.
const STAGE_HEADING: Partial<Record<Stage, string>> = {
  form: "Your lead fills out your Smart Lead Form",
  board: "Your lead is automatically added to your Lead Board",
  panel: "Everything you need to close the lease",
};

const inputClass =
  "w-full rounded-xl border border-[#e2e4ea] bg-white px-4 py-3.5 text-[15px] text-[#111318] outline-none read-only:cursor-default";
const labelClass = "text-[13px] font-medium text-[#4b5162]";

export default function HomepageDemo() {
  const [stage, setStage] = useState<Stage>("form");
  const [leads, setLeads] = useState<any[]>(() =>
    DEMO_LEADS.filter((l) => BOARD_LEAD_IDS.includes(l.id))
  );
  const [nextActions, setNextActions] = useState<any[]>(DEMO_NEXT_ACTIONS);
  const [moved, setMoved] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(false);

  const selected = leads.find((l) => l.id === HERO_ID) ?? null;
  const heading = STAGE_HEADING[stage] ?? null;

  // form → analyzing → board.
  useEffect(() => {
    if (stage !== "analyzing") return;
    const t = setTimeout(() => setStage("board"), 2100);
    return () => clearTimeout(t);
  }, [stage]);

  // The hero lead reaching Contacted (drag / tap / card click) → automation:
  // mirror what the real workflow engine does — log first contact and queue the
  // follow-up (due today + high priority so it wins the next-action ranking).
  useEffect(() => {
    if (moved) return;
    const hero = leads.find((l) => l.id === HERO_ID);
    if (hero?.crm_status === "contacted") {
      setMoved(true);
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

  // Once the automation has fired, open the Lead Panel after a beat. (Separate
  // effect so flipping `moved` doesn't cancel the pending timeout.)
  useEffect(() => {
    if (!moved) return;
    const t = setTimeout(() => setStage("panel"), 1700);
    return () => clearTimeout(t);
  }, [moved]);

  // Keep the current step in view as the story advances (never on first mount).
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [stage]);

  function moveHeroToContacted() {
    setLeads((prev) =>
      prev.map((l) => (l.id === HERO_ID ? { ...l, crm_status: "contacted", _justDropped: true } : l))
    );
  }

  return (
    <div className="w-full">
      {/* scroll anchor — sits just above the stage heading, clears the sticky nav */}
      <div ref={topRef} className="scroll-mt-24" />

      {/* ── One clean heading per stage (no numbers, no paragraphs) ────────── */}
      {heading && (
        <h2 key={`head-${stage}`} className="hp-anim mx-auto max-w-xl text-center text-[21px] font-semibold leading-tight text-white sm:text-[25px]">
          {heading}
        </h2>
      )}

      {/* ── Stage content ─────────────────────────────────────────────────── */}
      <div key={`stage-${stage}`} className="hp-anim mt-5">
        {stage === "form" && <FormStep onSubmit={() => setStage("analyzing")} />}

        {stage === "analyzing" && <AnalyzingStep />}

        {stage === "board" && (
          <ThemeProvider>
            <div className="hp-demo-board mx-auto w-full max-w-[660px]">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
                <p className="text-[13px] text-[var(--crm-text-secondary)]">
                  {moved ? (
                    <span className="font-medium text-[var(--crm-text-primary)]">✓ Automation triggered — opening Maria…</span>
                  ) : (
                    <>
                      <span className="hidden sm:inline">Drag </span>
                      <span className="sm:hidden">Tap to move </span>
                      <span className="font-semibold text-[var(--crm-text-primary)]">Maria</span> into{" "}
                      <span className="font-semibold text-[var(--crm-text-primary)]">Contacted</span>
                      <span className="hidden sm:inline"> — or use the button.</span>
                    </>
                  )}
                </p>
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
              <div className="h-[520px] overflow-hidden rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-background)] shadow-[0_1px_2px_rgba(var(--crm-shadow-color),0.06),0_18px_44px_rgba(var(--crm-shadow-color),0.28)]">
                <LeadBoard
                  leads={leads}
                  setLeads={setLeads}
                  selectedLeadId={HERO_ID}
                  onSelectLead={(id) => {
                    if (id === HERO_ID && !moved) moveHeroToContacted();
                  }}
                  columns={COLUMNS}
                />
              </div>
            </div>
          </ThemeProvider>
        )}

        {stage === "panel" && selected && (
          <ThemeProvider>
            <div className="mx-auto w-full max-w-[440px]">
              <div className="h-[600px] overflow-hidden rounded-2xl border border-[var(--crm-border)] shadow-[0_1px_2px_rgba(var(--crm-shadow-color),0.06),0_18px_44px_rgba(var(--crm-shadow-color),0.3)]">
                <LeadPanel
                  lead={selected}
                  nextActions={nextActions}
                  setNextActions={setNextActions}
                  favorites={DEMO_FAVORITES}
                  onClose={() => setStage("board")}
                  onUpdateLead={(u: any) => setLeads((prev) => prev.map((l) => (l.id === u.id ? u : l)))}
                />
              </div>

              {/* Final CTA — beneath the full panel, never beside a crop */}
              <div className="mx-auto mt-7 max-w-md text-center">
                <p className="text-[17px] font-semibold text-white">
                  From lead capture to follow-up, Locator Beast keeps every client organized.
                </p>
                <Link
                  href={TRIAL_URL}
                  className="mt-5 inline-block rounded-full bg-[var(--beast-blue)] px-8 py-3.5 text-[15px] font-semibold text-white transition-transform duration-200 hover:scale-[1.02]"
                >
                  Start Your Free 30-Day Trial
                </Link>
                <p className="mt-3 text-[12.5px] text-white/45">No credit card required.</p>
              </div>
            </div>
          </ThemeProvider>
        )}
      </div>

      {/* Demo-only framing styles. Scoped to `.hp-demo-board` / `.hp-anim`,
          so nothing here touches the production CRM. */}
      <style>{`
        @keyframes hpFade { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        .hp-anim { animation: hpFade .55s cubic-bezier(.16,1,.3,1); }
        /* Keep the two demo columns at their real CRM width and centered,
           instead of growing to fill the frame (production has 9 columns, so
           it never stretches — the demo only shows 2). */
        .hp-demo-board .kb-board { justify-content: center; }
        .hp-demo-board .kb-column { flex-grow: 0; flex-shrink: 0; }
        @media (prefers-reduced-motion: reduce) { .hp-anim { animation: none; } }
      `}</style>
    </div>
  );
}

// ── Step 1 — the branded Smart Lead Form (real Hero + shortened fields) ──────
function FormStep({ onSubmit }: { onSubmit: () => void }) {
  return (
    <div className="mx-auto max-w-lg overflow-hidden rounded-2xl border border-[#e5e7ee] bg-white shadow-[0_30px_80px_-40px_rgba(2,6,23,0.75)]">
      {/* The exact production hero: photo, name, brokerage, intro, highlights */}
      <Hero config={FORM_CONFIG} />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="flex flex-col gap-4 px-5 pb-7 pt-6 sm:px-7"
      >
        <div className="grid grid-cols-2 gap-4">
          <Field label="First Name" value="Maria" />
          <Field label="Last Name" value="Gonzalez" />
        </div>
        <Field label="Phone Number" value="(512) 555-0142" />
        <Field label="Desired Move-In Date" value="This month" />
        <Field label="City" value="Austin" />
        <div className="grid grid-cols-2 gap-4">
          <Field label="Property Type" value="Apartment" />
          <Field label="Bedrooms" value="1 Bedroom" />
        </div>
        <Field label="Desired Monthly Rent" value="$1,500 – $1,700" />

        <div className="flex flex-col gap-1.5">
          <label className={labelClass}>Anything else we should know?</label>
          <textarea
            readOnly
            rows={2}
            value="Relocating to Austin for a role at Dell. First apartment on my own."
            className={`${inputClass} resize-none`}
          />
        </div>

        <label className="mt-1 flex items-start gap-2.5 border-t border-[#eef0f4] pt-4 text-[12.5px] leading-relaxed text-[#6b7280]">
          <input type="checkbox" checked readOnly className="mt-0.5 h-4 w-4 shrink-0 rounded border-[#d0d3dc]" />
          <span>I agree to receive text messages or emails regarding my apartment search.</span>
        </label>

        <button
          type="submit"
          className="mt-2 w-full rounded-full px-6 py-4 text-[15px] font-semibold text-white transition-transform duration-300 hover:scale-[1.01]"
          style={{ backgroundColor: FORM_CONFIG.branding.buttonColor }}
        >
          Submit Lead
        </button>
      </form>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label className={labelClass}>{label}</label>
      <input readOnly value={value} className={inputClass} />
    </div>
  );
}

// ── Bridge — "Lead received, analyzing the client" ──────────────────────────
function AnalyzingStep() {
  return (
    <div className="mx-auto flex min-h-[320px] max-w-lg flex-col items-center justify-center rounded-2xl border border-white/10 bg-[#0b0f1a] px-6 text-center">
      <span className="h-11 w-11 animate-spin rounded-full border-2 border-white/15 border-t-[var(--beast-blue)]" />
      <p className="mt-6 text-[17px] font-semibold text-white">Lead received — Locator Beast is analyzing the client</p>
      <p className="mt-2 max-w-sm text-[13.5px] leading-relaxed text-white/50">
        Scoring approval odds, matching communities, and drafting the next action.
      </p>
    </div>
  );
}
