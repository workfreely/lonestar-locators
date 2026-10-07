"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import DemoSmartLeadForm from "./DemoSmartLeadForm";
import DemoWorkflowAutomation from "./DemoWorkflowAutomation";
import DemoAIClientInsights from "./DemoAIClientInsights";
import { SAMPLE_LEAD, type DemoLead } from "@/app/locator-beast/(site)/demo/_data/demo";
import { TRIAL_URL } from "@/app/locator-beast/_lib/site";

type Step = "form" | "analyzing" | "workflow" | "insights";

const STEPS = [
  { key: "form", label: "Smart Lead Form" },
  { key: "workflow", label: "Workflow" },
  { key: "insights", label: "AI Insights" },
] as const;

function activeIndex(step: Step): number {
  if (step === "insights") return 2;
  if (step === "workflow") return 1;
  return 0; // form + analyzing
}

export default function LiveDemo() {
  const [step, setStep] = useState<Step>("form");
  const [lead, setLead] = useState<DemoLead>(SAMPLE_LEAD);

  // Demo #1 → loading → Demo #2, automatically.
  useEffect(() => {
    if (step !== "analyzing") return;
    const t = setTimeout(() => setStep("workflow"), 2200);
    return () => clearTimeout(t);
  }, [step]);

  const active = activeIndex(step);

  return (
    <div className="-mt-8 bg-[var(--beast-bg-dark)] md:-mt-12">
      <div className="beast-container max-w-3xl pb-20 pt-8 md:pb-28">
        {/* Progress stepper */}
        <div className="mx-auto mb-9 flex max-w-md items-center">
          {STEPS.map((s, i) => (
            <div key={s.key} className={`flex items-center ${i < STEPS.length - 1 ? "flex-1" : ""}`}>
              <div className="flex flex-col items-center gap-1.5">
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-semibold transition-colors ${
                    i <= active ? "bg-[var(--beast-blue)] text-white" : "border border-white/15 text-white/40"
                  }`}
                >
                  {i + 1}
                </span>
                <span className={`text-[11px] ${i <= active ? "text-white/80" : "text-white/40"}`}>{s.label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`mx-2 mb-5 h-px flex-1 transition-colors ${i < active ? "bg-[var(--beast-blue)]" : "bg-white/15"}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        {step === "form" && (
          <DemoSmartLeadForm
            onSubmit={(l) => {
              setLead(l);
              setStep("analyzing");
            }}
          />
        )}

        {step === "analyzing" && (
          <div className="flex min-h-[360px] flex-col items-center justify-center text-center">
            <span className="h-12 w-12 animate-spin rounded-full border-2 border-white/15 border-t-[var(--beast-blue)]" />
            <p className="mt-6 text-[17px] font-semibold text-white">AI is analyzing your client…</p>
            <p className="mt-1.5 max-w-sm text-[13.5px] text-white/45">
              Scoring approval odds, matching communities, and drafting the next action.
            </p>
          </div>
        )}

        {step === "workflow" && <DemoWorkflowAutomation lead={lead} onComplete={() => setStep("insights")} />}

        {step === "insights" && (
          <div className="beast-fade-up">
            <DemoAIClientInsights lead={lead} />
            <div className="mx-auto mt-9 max-w-2xl text-center">
              <p className="text-[15px] text-white/60">
                You just watched a lead go from form → automated workflow → AI insights.
              </p>
              <p className="mt-1 text-[16px] font-semibold text-white">There&apos;s a lot more inside.</p>
              <Link
                href={TRIAL_URL}
                className="mt-6 inline-block rounded-full bg-[var(--beast-blue)] px-8 py-3.5 text-[15px] font-semibold text-white transition-transform duration-200 hover:scale-[1.02]"
              >
                Start Your Free 7-Day Trial
              </Link>
              <p className="mt-3 text-[12.5px] text-white/40">No credit card required.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
