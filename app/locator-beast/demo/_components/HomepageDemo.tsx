"use client";

import { Fragment, useEffect, useRef, useState } from "react";
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
// The three stages of a lead — Capture → Automate → Close — shown SIDE BY SIDE
// as connected previews so the whole workflow is visible at a glance. The
// visitor clicks "Submit Lead" once; focus then slides across on its own: the
// active stage grows and lights up while the others shrink to previews. Each
// preview is the REAL production surface (Smart Lead Form, LeadBoard, LeadPanel)
// on read-only demo data — no Supabase. Framing only; the CRM is untouched.
// ─────────────────────────────────────────────────────────────────────────────

const HERO_ID = "demo-1"; // Maria Gonzalez — the protagonist
const COLUMNS = [
  { id: "new", title: "🟡 New" },
  { id: "contacted", title: "🔵 Contacted" },
];
const BOARD_LEAD_IDS = ["demo-1", "demo-2", "demo-4"];
const now = () => new Date().toISOString();

const PROC_STEPS = ["Lead received", "AI analyzing", "Creating workflow"];

// The three stages, each with its natural preview width (the component renders
// at this width, then the frame zooms it down to DISPLAY_W).
const DISPLAY_W = 320;
const STAGES = [
  { n: 1, key: "form", title: "Capture the Lead", sub: "Smart Lead Form", natW: 384, frameH: 496 as number | null, activeScale: 1.08 },
  { n: 2, key: "board", title: "Automate the Workflow", sub: "Lead Board + AI", natW: 500, frameH: 470, activeScale: 1.2 },
  { n: 3, key: "panel", title: "Close the Deal", sub: "Everything in one place", natW: 360, frameH: 470, activeScale: 1.08 },
] as const;

const T = {
  procStep: 520,
  procToBoard: 500,
  boardPause: 850,
  moveToPanel: 850,
  panelHold: 650,
  panelTour: 3400,
};

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
    agentPhotoSize: "small",
    profileImagePosition: "underHeadline",
    heroTheme: "custom",
    heroImageUrl: "/demo/austin-skyline.svg",
    heroOverlay: "medium",
    buttonColor: "#2f6bff",
  },
  copy: {
    ...DEFAULT_CONFIG.copy,
    subheadline: "",
    agentName: "Sarah Mitchell",
    agentTitle: "Dallas Apartment Locator",
    brokerageName: "Mitchell Residential Group",
    highlights: ["100% Free", "Cash Rebate", "Free Movers"],
    buttonText: "Submit Lead",
  },
};

type Stage = "form" | "board" | "panel";

const inputClass =
  "w-full rounded-lg border border-[#e2e4ea] bg-white px-3 py-2.5 text-[13.5px] text-[#111318] outline-none read-only:cursor-default";
const labelClass = "text-[11.5px] font-medium text-[#4b5162]";

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export default function HomepageDemo() {
  const [stage, setStage] = useState<Stage>("form");
  const [procStep, setProcStep] = useState(0);
  const [procRunning, setProcRunning] = useState(false);
  const [leads, setLeads] = useState<any[]>(() =>
    DEMO_LEADS.filter((l) => BOARD_LEAD_IDS.includes(l.id))
  );
  const [nextActions, setNextActions] = useState<any[]>(DEMO_NEXT_ACTIONS);
  const [moved, setMoved] = useState(false);
  const [showCta, setShowCta] = useState(false);
  // Which stage the premium glow sits on — a hovered stage wins, otherwise it
  // tracks the active step automatically. UI-only; never touches the workflow.
  const [hoveredStage, setHoveredStage] = useState<number | null>(null);

  const panelWrapRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  const selected = leads.find((l) => l.id === HERO_ID) ?? null;
  const activeStage = stage === "form" ? 1 : stage === "board" ? 2 : 3;
  // The glow follows the hovered stage when present, otherwise the active step.
  const glowStage = hoveredStage ?? activeStage;

  function moveHeroToContacted() {
    setLeads((prev) =>
      prev.map((l) => (l.id === HERO_ID ? { ...l, crm_status: "contacted", _justDropped: true } : l))
    );
  }

  function startDemo() {
    setStage("board");
    setProcStep(0);
    setProcRunning(true);
  }

  // Manual replay only — the demo never auto-loops; it rests on the final state.
  function replayDemo() {
    setLeads(DEMO_LEADS.filter((l) => BOARD_LEAD_IDS.includes(l.id)));
    setNextActions(DEMO_NEXT_ACTIONS);
    setMoved(false);
    setShowCta(false);
    setProcStep(0);
    setProcRunning(false);
    setStage("form");
  }

  // Processing overlay on the board while the workflow is "created".
  useEffect(() => {
    if (stage !== "board" || !procRunning) return;
    if (procStep >= PROC_STEPS.length) {
      const t = setTimeout(() => setProcRunning(false), T.procToBoard);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setProcStep((s) => s + 1), procStep === 0 ? 300 : T.procStep);
    return () => clearTimeout(t);
  }, [stage, procRunning, procStep]);

  // After processing, the lead auto-moves New → Contacted.
  useEffect(() => {
    if (stage !== "board" || procRunning || moved) return;
    const t = setTimeout(moveHeroToContacted, T.boardPause);
    return () => clearTimeout(t);
  }, [stage, procRunning, moved]);

  // Automation: on reaching Contacted, log first contact + queue the follow-up.
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
        title: "Build List",
        due_at: stamp,
        priority: "high",
        notes: "3–4 modern high-rises in Downtown Dallas under $2,700.",
        completed: false,
        created_at: stamp,
      },
    ]);
  }, [moved, leads]);

  // Once automation fires, focus slides to the Lead Panel.
  useEffect(() => {
    if (!moved) return;
    const t = setTimeout(() => setStage("panel"), T.moveToPanel);
    return () => clearTimeout(t);
  }, [moved]);

  // On small screens the three stages stack, so bring the active one into view.
  useEffect(() => {
    if (typeof window === "undefined" || window.innerWidth >= 1024) return;
    const el = rowRef.current?.querySelector(`[data-stage="${activeStage}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeStage]);

  // The demo must NEVER launch phone / text / messaging apps. Neutralize any
  // tel:/sms: window.open for the life of the demo (belt-and-suspenders on top
  // of the click blocking below). LeadPanel itself is untouched.
  useEffect(() => {
    const orig = window.open;
    window.open = function (url?: string | URL, ...rest: any[]) {
      if (typeof url === "string" && /^(tel:|sms:)/i.test(url)) return null;
      return (orig as any).call(window, url, ...rest);
    } as typeof window.open;
    return () => {
      window.open = orig;
    };
  }, []);

  // Panel demo touch-ups: label the Call/Text buttons with a hover tooltip and
  // hide the Quick Actions section (demo only — the real CRM keeps it).
  useEffect(() => {
    const wrap = panelWrapRef.current;
    if (!wrap) return;
    Array.from(wrap.querySelectorAll("button"))
      .filter((b) => /Call Client|Text Client/.test(b.textContent || ""))
      .forEach((b) => {
        b.setAttribute("title", "Available after signup");
        (b as HTMLElement).style.cursor = "default";
      });
    const quickHead = Array.from(wrap.querySelectorAll("p")).find((p) => p.textContent?.trim() === "Quick Actions");
    const card = quickHead?.parentElement?.parentElement; // header <p> → header row → SectionCard root
    if (card) (card as HTMLElement).style.display = "none";
  }, [selected]);

  // Auto-tour the Lead Panel once it's the focus, then reveal the CTA.
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
      const t = setTimeout(() => setShowCta(true), 700);
      return () => clearTimeout(t);
    }

    scroller.scrollTop = 0;
    const max = scroller.scrollHeight - scroller.clientHeight;
    let raf = 0;
    let startTs: number | null = null;
    const tick = (ts: number) => {
      if (startTs == null) startTs = ts;
      const p = Math.min(1, (ts - startTs) / T.panelTour);
      const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      scroller.scrollTop = max * eased;
      if (p < 1) raf = requestAnimationFrame(tick);
      else setShowCta(true);
    };
    const hold = setTimeout(() => (raf = requestAnimationFrame(tick)), T.panelHold);
    const fallback = setTimeout(() => setShowCta(true), T.panelHold + T.panelTour + 900);
    return () => {
      clearTimeout(hold);
      clearTimeout(fallback);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [stage]);

  return (
    <div className="w-full">
      <div
        ref={rowRef}
        className="flex flex-col items-center gap-6 lg:flex-row lg:items-start lg:justify-center lg:gap-2"
      >
        {STAGES.map((s, i) => {
          const isActive = activeStage === s.n;
          const isDone = activeStage > s.n;
          return (
            <Fragment key={s.key}>
              <div
                data-stage={s.n}
                onMouseEnter={() => setHoveredStage(s.n)}
                onMouseLeave={() => setHoveredStage(null)}
                className="flex flex-none flex-col items-center transition-all duration-500"
                style={{
                  transform: isActive ? `scale(${s.activeScale})` : "scale(0.8)",
                  opacity: isActive ? 1 : 0.48,
                  transformOrigin: "top center",
                }}
              >
                <StepHead n={s.n} active={isActive} done={isDone} title={s.title} sub={s.sub} />

                <PreviewFrame natW={s.natW} frameH={s.frameH} active={isActive} glow={glowStage === s.n}>
                  {s.key === "form" && <FormPreview onSubmit={startDemo} />}
                  {s.key === "board" && (
                    <BoardPreview
                      leads={leads}
                      setLeads={setLeads}
                      procRunning={procRunning}
                      procStep={procStep}
                      moved={moved}
                      aiBadge={moved && stage === "board"}
                    />
                  )}
                  {s.key === "panel" && selected && (
                    <ThemeProvider>
                      {/* Explicit natural height (frameH / zoom) so LeadPanel's
                          h-full resolves and its body can scroll for the tour. */}
                      <div
                        ref={panelWrapRef}
                        style={{ height: Math.round((s.frameH ?? 380) / (DISPLAY_W / s.natW)) }}
                        onClickCapture={(e) => {
                          const btn = (e.target as HTMLElement).closest("button");
                          if (!btn) return;
                          const t = btn.textContent || "";
                          // Call/Text look real but do nothing in the demo.
                          if (/Call Client|Text Client/.test(t)) {
                            e.preventDefault();
                            e.stopPropagation();
                          } else if (/^Build List/.test(t.trim())) {
                            // Don't open Messages — mark the task completed in place,
                            // exactly like a finished workflow action.
                            e.preventDefault();
                            e.stopPropagation();
                            setNextActions((prev) => prev.map((a) => (a.id === 99001 ? { ...a, completed: true } : a)));
                          }
                        }}
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
                    </ThemeProvider>
                  )}
                </PreviewFrame>
              </div>

              {i < STAGES.length - 1 && <Arrow active={activeStage > s.n} />}
            </Fragment>
          );
        })}
      </div>

      {/* Final CTA — fades in once the panel has finished presenting itself. */}
      <div
        className={`mx-auto mt-8 max-w-md text-center transition-all duration-700 ${
          showCta ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"
        }`}
      >
        <p className="text-[16px] font-semibold text-white">Everything you need to close the lease.</p>
        <Link
          href={TRIAL_URL}
          className="mt-3 inline-block rounded-full bg-[var(--beast-blue)] px-8 py-3 text-[15px] font-semibold text-white transition-transform duration-200 hover:scale-[1.02]"
        >
          Start Your Free 30-Day Trial
        </Link>
        <p className="mt-2 text-[12.5px] text-white/45">No credit card required.</p>
        <button
          type="button"
          onClick={replayDemo}
          className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-white/55 transition-colors hover:text-white"
        >
          <span aria-hidden>↻</span> Replay Demo
        </button>
      </div>

      <style>{`
        @keyframes hpPulse {
          0% { box-shadow: 0 0 0 0 rgba(47,107,255,.5); }
          70% { box-shadow: 0 0 0 8px rgba(47,107,255,0); }
          100% { box-shadow: 0 0 0 0 rgba(47,107,255,0); }
        }
        .hp-step-glow { animation: hpPulse 1.9s ease-out infinite; }
        .hp-demo-board .kb-board { justify-content: center; }
        .hp-demo-board .kb-column { flex-grow: 0; flex-shrink: 0; }

        /* AI badge pop as the lead lands in Contacted */
        @keyframes hpBadgePop { 0% { opacity: 0; transform: translateY(-6px) scale(.9); } 100% { opacity: 1; transform: none; } }
        .hp-ai-badge { animation: hpBadgePop .28s cubic-bezier(.16,1,.3,1); }

        /* Highlight the lead card the moment it moves into Contacted */
        @keyframes hpCardPop {
          0% { box-shadow: 0 0 0 0 rgba(47,107,255,0); }
          25% { box-shadow: 0 0 0 3px rgba(47,107,255,.85), 0 0 22px 4px rgba(47,107,255,.6); }
          100% { box-shadow: 0 0 0 0 rgba(47,107,255,0); }
        }
        .hp-moved .kb-card.kb-card--selected { animation: hpCardPop 1.6s ease-out 2; }

        /* Premium animated blue glow — on the active step during playback and on
           whichever stage is hovered afterward (driven by hp-glow-on). */
        @keyframes hpFormGlow {
          0%, 100% { box-shadow: 0 0 0 1px rgba(47,107,255,.45), 0 0 22px 2px rgba(47,107,255,.28); }
          50% { box-shadow: 0 0 0 1px rgba(47,107,255,.65), 0 0 34px 6px rgba(47,107,255,.42); }
        }
        .hp-glow-frame { transition: box-shadow .5s ease; }
        .hp-glow-frame.hp-glow-on { animation: hpFormGlow 2.4s ease-in-out infinite; }

        @media (prefers-reduced-motion: reduce) {
          .hp-step-glow, .hp-ai-badge, .hp-glow-frame.hp-glow-on, .hp-moved .kb-card.kb-card--selected { animation: none; }
        }
        /* Reduced motion still gets a steady (non-pulsing) glow on the active/hovered stage. */
        @media (prefers-reduced-motion: reduce) {
          .hp-glow-frame.hp-glow-on { box-shadow: 0 0 0 1px rgba(47,107,255,.6), 0 0 30px 4px rgba(47,107,255,.4); }
        }
      `}</style>
    </div>
  );
}

// ── Step header (number circle + value-oriented label) ──────────────────────
function StepHead({ n, active, done, title, sub }: { n: number; active: boolean; done: boolean; title: string; sub: string }) {
  return (
    <div className="flex flex-col items-center text-center">
      <span
        className={`flex h-8 w-8 items-center justify-center rounded-full border text-[13px] font-semibold transition-all duration-500 ${
          active
            ? "hp-step-glow border-transparent bg-[var(--beast-blue)] text-white"
            : done
            ? "border-transparent bg-[var(--beast-blue)] text-white"
            : "border-white/25 text-white/50"
        }`}
      >
        {done ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        ) : (
          n
        )}
      </span>
      <span className={`mt-2 text-[13px] font-semibold leading-tight text-white`}>{title}</span>
      <span className="mt-0.5 text-[11px] leading-tight text-white/55">{sub}</span>
    </div>
  );
}

// ── Connector arrow between stages (desktop only) ───────────────────────────
function Arrow({ active }: { active: boolean }) {
  return (
    <div className="hidden self-center pt-6 lg:block">
      <svg width="34" height="16" viewBox="0 0 34 16" fill="none" className="transition-colors duration-500">
        <path
          d="M2 8h27m0 0-6-5m6 5-6 5"
          stroke={active ? "var(--beast-blue)" : "rgba(255,255,255,0.2)"}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

// ── Preview frame: renders a component at natW, zoomed to DISPLAY_W ──────────
function PreviewFrame({
  natW,
  frameH,
  active,
  glow,
  children,
}: {
  natW: number;
  frameH: number | null;
  active: boolean;
  glow?: boolean;
  children: React.ReactNode;
}) {
  const zoom = DISPLAY_W / natW;
  return (
    <div
      className={`hp-glow-frame mt-4 overflow-hidden rounded-2xl border bg-[#0b0f1a] transition-all duration-500 ${
        glow ? "hp-glow-on" : ""
      } ${
        active
          ? "border-[var(--beast-blue)]/60"
          : "border-white/10 shadow-[0_16px_40px_-24px_rgba(0,0,0,0.7)]"
      }`}
      style={{ width: DISPLAY_W, height: frameH ?? undefined }}
    >
      <div style={{ width: natW, zoom }}>{children}</div>
    </div>
  );
}

// ── Board preview: the real LeadBoard + a processing overlay ─────────────────
function BoardPreview({
  leads,
  setLeads,
  procRunning,
  procStep,
  moved,
  aiBadge,
}: {
  leads: any[];
  setLeads: React.Dispatch<React.SetStateAction<any[]>>;
  procRunning: boolean;
  procStep: number;
  moved: boolean;
  aiBadge: boolean;
}) {
  return (
    <ThemeProvider>
      <div className={`hp-demo-board relative h-[734px] bg-[var(--crm-background)] ${moved ? "hp-moved" : ""}`}>
        {/* Brief "AI did the work" badge as the lead lands in Contacted. */}
        {aiBadge && (
          <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center">
            <span className="hp-ai-badge inline-flex items-center gap-1.5 rounded-full bg-[var(--beast-blue)] px-3.5 py-1.5 text-[15px] font-semibold text-white shadow-[0_8px_24px_rgba(47,107,255,0.5)]">
              <span aria-hidden>✓</span> AI organized your lead
            </span>
          </div>
        )}
        <LeadBoard
          leads={leads}
          setLeads={setLeads}
          selectedLeadId={HERO_ID}
          onSelectLead={() => {}}
          columns={COLUMNS}
        />
        {procRunning && (
          <div className="absolute inset-0 flex items-center justify-center bg-[var(--crm-background)]/85 backdrop-blur-[1px]">
            <div className="w-[240px] rounded-xl border border-white/10 bg-[#0b0f1a] px-5 py-4">
              {PROC_STEPS.map((label, i) => {
                const done = i < procStep;
                const running = i === procStep;
                return (
                  <div key={label} className={`flex items-center gap-2.5 py-1.5 ${done || running ? "opacity-100" : "opacity-35"}`}>
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                      {done ? (
                        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#1f9d55]">
                          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                        </span>
                      ) : running ? (
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/15 border-t-[var(--beast-blue)]" />
                      ) : (
                        <span className="h-1 w-1 rounded-full bg-white/30" />
                      )}
                    </span>
                    <span className={`text-[12.5px] ${done || running ? "text-white" : "text-white/45"}`}>{label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </ThemeProvider>
  );
}

// ── Form preview: the branded Smart Lead Form (real Hero + compact fields) ───
function FormPreview({ onSubmit }: { onSubmit: () => void }) {
  return (
    <div className="bg-white">
      <Hero config={FORM_CONFIG} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="flex flex-col gap-2.5 px-4 pb-4 pt-4"
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="First Name" value="Maria" />
          <Field label="Last Name" value="Gonzalez" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone" value="(214) 000-0000" />
          <Field label="City" value="Dallas" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Property Type" value="High-rise" />
          <Field label="Monthly Rent" value="$2,500 – $2,700" />
        </div>
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
