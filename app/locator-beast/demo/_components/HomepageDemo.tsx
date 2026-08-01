"use client";

import { useEffect, useRef, useState } from "react";
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
// One continuous, auto-playing story. The visitor performs a SINGLE action —
// "Submit Lead" — and then watches one lead (Maria) travel through the real
// production surfaces on its own: a branded Smart Lead Form → a processing
// sequence → the real LeadBoard (auto-moved New → Contacted) → the real
// LeadPanel (auto-toured) → the trial CTA. Everything after Submit is
// automatic, and every CRM surface is fed read-only demo data (no Supabase).
// This file only supplies framing; it never changes the production components.
// ─────────────────────────────────────────────────────────────────────────────

const HERO_ID = "demo-1"; // Maria Gonzalez — the protagonist
const COLUMNS = [
  { id: "new", title: "🟡 New" },
  { id: "contacted", title: "🔵 Contacted" },
];
const BOARD_LEAD_IDS = ["demo-1", "demo-2", "demo-4"];
const now = () => new Date().toISOString();

const PROC_STEPS = ["Lead received", "AI analyzing client", "Approval calculated", "Workflow created"];

// Auto-play timings (ms).
const T = {
  procStep: 400, // between processing checklist rows
  procToBoard: 600, // after the last checklist row → board
  boardPause: 1100, // Maria sits in New before auto-moving
  moveToPanel: 1600, // after automation fires → open panel
  panelHold: 800, // panel sits at the top before the tour scroll
  panelTour: 3800, // duration of the auto-scroll tour
};

// A realistic locator's branded Smart Lead Form — the production Hero with a
// demo agent (Sarah Mitchell) over an Austin skyline. Header kept short.
const FORM_CONFIG: SmartLeadFormConfig = {
  ...DEFAULT_CONFIG,
  sections: {
    ...DEFAULT_CONFIG.sections,
    visibility: {
      ...DEFAULT_CONFIG.sections.visibility,
      headline: false,
      serviceAreas: false,
      phoneNumber: false,
    },
  },
  branding: {
    ...DEFAULT_CONFIG.branding,
    agentPhotoUrl: "/demo/agent-sarah.svg",
    agentPhotoSize: "medium",
    profileImagePosition: "underHeadline",
    heroTheme: "custom",
    heroImageUrl: "/demo/austin-skyline.svg",
    heroOverlay: "medium",
    buttonColor: "#2f6bff",
  },
  copy: {
    ...DEFAULT_CONFIG.copy,
    subheadline: "Free, personalized apartment matches — Austin & Round Rock.",
    agentName: "Sarah Mitchell",
    agentTitle: "Austin Apartment Locator",
    brokerageName: "Mitchell Residential Group",
    highlights: ["100% Free", "Cash Rebate", "Same-Day Tours"],
    buttonText: "Submit Lead",
  },
};

type Stage = "form" | "processing" | "board" | "panel";

const STAGE_HEADING: Partial<Record<Stage, string>> = {
  form: "Your lead fills out your Smart Lead Form",
  board: "Your lead is automatically added to your Lead Board",
};

const inputClass =
  "w-full rounded-lg border border-[#e2e4ea] bg-white px-3 py-2.5 text-[13.5px] text-[#111318] outline-none read-only:cursor-default";
const labelClass = "text-[11.5px] font-medium text-[#4b5162]";

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export default function HomepageDemo() {
  const [stage, setStage] = useState<Stage>("form");
  const [procStep, setProcStep] = useState(0);
  const [leads, setLeads] = useState<any[]>(() =>
    DEMO_LEADS.filter((l) => BOARD_LEAD_IDS.includes(l.id))
  );
  const [nextActions, setNextActions] = useState<any[]>(DEMO_NEXT_ACTIONS);
  const [moved, setMoved] = useState(false);
  const [showCta, setShowCta] = useState(false);

  const topRef = useRef<HTMLDivElement>(null);
  const panelWrapRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(false);

  const selected = leads.find((l) => l.id === HERO_ID) ?? null;
  const heading = STAGE_HEADING[stage] ?? null;

  function moveHeroToContacted() {
    setLeads((prev) =>
      prev.map((l) => (l.id === HERO_ID ? { ...l, crm_status: "contacted", _justDropped: true } : l))
    );
  }

  // Step 2 — processing checklist, then auto-advance to the board.
  useEffect(() => {
    if (stage !== "processing") return;
    if (procStep >= PROC_STEPS.length) {
      const t = setTimeout(() => setStage("board"), T.procToBoard);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setProcStep((s) => s + 1), procStep === 0 ? 200 : T.procStep);
    return () => clearTimeout(t);
  }, [stage, procStep]);

  // Step 3 — the lead auto-moves New → Contacted (no drag required).
  useEffect(() => {
    if (stage !== "board" || moved) return;
    const t = setTimeout(moveHeroToContacted, T.boardPause);
    return () => clearTimeout(t);
  }, [stage, moved]);

  // Automation: the moment the lead reaches Contacted, mirror the real workflow
  // engine — flag it moved, log first contact, and queue the follow-up (due
  // today, high priority so it wins next-action ranking).
  useEffect(() => {
    if (moved) return;
    const hero = leads.find((l) => l.id === HERO_ID);
    if (hero?.crm_status !== "contacted") return;
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
  }, [moved, leads]);

  // Step 4 — once the automation has fired, auto-open the Lead Panel.
  useEffect(() => {
    if (!moved) return;
    const t = setTimeout(() => setStage("panel"), T.moveToPanel);
    return () => clearTimeout(t);
  }, [moved]);

  // Keep the active stage in view as the story auto-advances (never on mount).
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return;
    }
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [stage]);

  // Step 4 (cont.) — auto-tour the panel: hold at the top, then smoothly scroll
  // through the sections, then reveal the CTA.
  useEffect(() => {
    if (stage !== "panel") return;
    const wrap = panelWrapRef.current;
    const scroller = wrap
      ? (Array.from(wrap.querySelectorAll("*")).find((el) => {
          const s = getComputedStyle(el as Element);
          return (s.overflowY === "auto" || s.overflowY === "scroll") && el.scrollHeight - el.clientHeight > 8;
        }) as HTMLElement | undefined)
      : undefined;

    if (!scroller || prefersReducedMotion()) {
      const t = setTimeout(() => setShowCta(true), 600);
      return () => clearTimeout(t);
    }

    scroller.scrollTop = 0;
    const max = scroller.scrollHeight - scroller.clientHeight;
    let raf = 0;
    let startTs: number | null = null;

    const tick = (ts: number) => {
      if (startTs == null) startTs = ts;
      const p = Math.min(1, (ts - startTs) / T.panelTour);
      const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; // easeInOutQuad
      scroller.scrollTop = max * eased;
      if (p < 1) raf = requestAnimationFrame(tick);
      else setShowCta(true);
    };

    const hold = setTimeout(() => {
      raf = requestAnimationFrame(tick);
    }, T.panelHold);

    // Safety net: rAF is paused entirely in a backgrounded tab, so guarantee the
    // CTA still reveals via a plain timer even if the tour never animates.
    const fallback = setTimeout(() => setShowCta(true), T.panelHold + T.panelTour + 900);

    return () => {
      clearTimeout(hold);
      clearTimeout(fallback);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [stage]);

  return (
    <div className="w-full">
      {/* scroll anchor — sits just above the stage, clears the sticky nav */}
      <div ref={topRef} className="scroll-mt-24" />

      {heading && (
        <h2
          key={`head-${stage}`}
          className="hp-anim mx-auto max-w-xl text-center text-[20px] font-semibold leading-tight text-white sm:text-[24px]"
        >
          {heading}
        </h2>
      )}

      <div key={`stage-${stage}`} className={`hp-anim ${heading ? "mt-5" : "mt-0"}`}>
        {stage === "form" && (
          <FormStep
            onSubmit={() => {
              setProcStep(0);
              setStage("processing");
            }}
          />
        )}

        {stage === "processing" && <ProcessingStep active={procStep} />}

        {stage === "board" && (
          <ThemeProvider>
            <div className="hp-demo-board mx-auto w-full max-w-[660px]">
              <div className="mb-2.5 flex items-center justify-center gap-2 px-1 text-[12.5px]">
                {moved ? (
                  <span className="font-medium text-[var(--crm-text-primary)]">
                    ✓ Workflow created — Maria moved to Contacted
                  </span>
                ) : (
                  <span className="flex items-center gap-2 text-[var(--crm-text-secondary)]">
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-[var(--crm-border)] border-t-[var(--kb-accent)]" />
                    Locator Beast is organizing this lead…
                  </span>
                )}
              </div>
              <div className="h-[500px] overflow-hidden rounded-2xl border border-[var(--crm-border)] bg-[var(--crm-background)] shadow-[0_1px_2px_rgba(var(--crm-shadow-color),0.06),0_18px_44px_rgba(var(--crm-shadow-color),0.28)]">
                <LeadBoard
                  leads={leads}
                  setLeads={setLeads}
                  selectedLeadId={HERO_ID}
                  onSelectLead={() => {}}
                  columns={COLUMNS}
                />
              </div>
            </div>
          </ThemeProvider>
        )}

        {stage === "panel" && selected && (
          <ThemeProvider>
            <div className="mx-auto w-full max-w-[430px]">
              <div
                ref={panelWrapRef}
                className="h-[560px] overflow-hidden rounded-2xl border border-[var(--crm-border)] shadow-[0_1px_2px_rgba(var(--crm-shadow-color),0.06),0_18px_44px_rgba(var(--crm-shadow-color),0.3)]"
              >
                <LeadPanel
                  lead={selected}
                  nextActions={nextActions}
                  setNextActions={setNextActions}
                  favorites={DEMO_FAVORITES}
                  onClose={() => {}}
                  onUpdateLead={(u: any) => setLeads((prev) => prev.map((l) => (l.id === u.id ? u : l)))}
                />
              </div>

              <div
                className={`mx-auto mt-6 max-w-md text-center transition-all duration-700 ${
                  showCta ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"
                }`}
              >
                <p className="text-[16.5px] font-semibold text-white">
                  Everything you need to close the lease. Organized automatically.
                </p>
                <Link
                  href={TRIAL_URL}
                  className="mt-4 inline-block rounded-full bg-[var(--beast-blue)] px-8 py-3.5 text-[15px] font-semibold text-white transition-transform duration-200 hover:scale-[1.02]"
                >
                  Start Your Free 30-Day Trial
                </Link>
                <p className="mt-2.5 text-[12.5px] text-white/45">No credit card required.</p>
              </div>
            </div>
          </ThemeProvider>
        )}
      </div>

      <style>{`
        @keyframes hpFade { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        .hp-anim { animation: hpFade .6s cubic-bezier(.16,1,.3,1); }
        /* Keep the two demo columns at their real CRM width and centered, so the
           board reads as a cropped view of the actual CRM (not a stretched one). */
        .hp-demo-board .kb-board { justify-content: center; }
        .hp-demo-board .kb-column { flex-grow: 0; flex-shrink: 0; }
        @media (prefers-reduced-motion: reduce) { .hp-anim { animation: none; } }
      `}</style>
    </div>
  );
}

// ── Step 1 — the branded Smart Lead Form (real Hero + compact prefilled fields) ─
function FormStep({ onSubmit }: { onSubmit: () => void }) {
  return (
    <div className="mx-auto max-w-sm overflow-hidden rounded-2xl border border-[#e5e7ee] bg-white shadow-[0_30px_80px_-40px_rgba(2,6,23,0.75)]">
      <Hero config={FORM_CONFIG} />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="flex flex-col gap-3 px-4 pb-5 pt-5 sm:px-5"
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="First Name" value="Maria" />
          <Field label="Last Name" value="Gonzalez" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone" value="(512) 555-0142" />
          <Field label="Move-In" value="This month" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="City" value="Austin" />
          <Field label="Property Type" value="Apartment" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Bedrooms" value="1 Bedroom" />
          <Field label="Monthly Rent" value="$1,500 – $1,700" />
        </div>

        <label className="mt-0.5 flex items-start gap-2 text-[11.5px] leading-relaxed text-[#6b7280]">
          <input type="checkbox" checked readOnly className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-[#d0d3dc]" />
          <span>I agree to receive text messages or emails about my apartment search.</span>
        </label>

        <button
          type="submit"
          className="mt-1.5 w-full rounded-full px-6 py-3 text-[14.5px] font-semibold text-white transition-transform duration-300 hover:scale-[1.01]"
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
    <div className="flex min-w-0 flex-col gap-1">
      <label className={labelClass}>{label}</label>
      <input readOnly value={value} className={inputClass} />
    </div>
  );
}

// ── Step 2 — processing sequence (Locator Beast working behind the scenes) ──────
function ProcessingStep({ active }: { active: number }) {
  return (
    <div className="mx-auto max-w-sm rounded-2xl border border-white/10 bg-[#0b0f1a] px-6 py-6">
      <div className="flex flex-col gap-1">
        {PROC_STEPS.map((label, i) => {
          const done = i < active;
          const running = i === active;
          return (
            <div
              key={label}
              className={`flex items-center gap-3 py-2 transition-opacity duration-300 ${
                done || running ? "opacity-100" : "opacity-35"
              }`}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                {done ? (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#1f9d55]">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  </span>
                ) : running ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/15 border-t-[var(--beast-blue)]" />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-white/30" />
                )}
              </span>
              <span className={`text-[14px] ${done || running ? "text-white" : "text-white/45"}`}>{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
