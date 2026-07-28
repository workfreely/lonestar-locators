"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { NUMBERED_STEPS, TOTAL_STEPS, type OnboardingData } from "../_lib/types";
import Step1Welcome from "./steps/Step1Welcome";
import StepBusinessProfile from "./steps/StepBusinessProfile";
import StepBusinessGoals from "./steps/StepBusinessGoals";
import StepConnect from "./steps/StepConnect";
import Step6ImportLeads from "./steps/Step6ImportLeads";
import StepBuilding from "./steps/StepBuilding";

export default function OnboardingWizard({
  userId,
  initialStep,
  initialData,
}: {
  userId: string;
  initialStep: number;
  initialData: OnboardingData;
}) {
  const router = useRouter();
  const [step, setStep] = useState(() => Math.min(Math.max(initialStep, 1), TOTAL_STEPS));
  const [data, setData] = useState<OnboardingData>(initialData);
  const [saving, setSaving] = useState(false);

  function onChange(patch: Partial<OnboardingData>) {
    setData((d) => ({ ...d, ...patch }));
  }

  async function persist(patch: Partial<OnboardingData>, nextStep: number) {
    setSaving(true);
    await supabase
      .from("profiles")
      .update({ ...patch, onboarding_step: nextStep, updated_at: new Date().toISOString() })
      .eq("id", userId);
    setSaving(false);
  }

  async function onNext(patch: Partial<OnboardingData> = {}) {
    const merged = { ...data, ...patch };
    setData(merged);
    const nextStep = Math.min(step + 1, TOTAL_STEPS);
    setStep(nextStep);
    await persist(patch, nextStep);
  }

  function onBack() {
    const prevStep = Math.max(step - 1, 1);
    setStep(prevStep);
    supabase.from("profiles").update({ onboarding_step: prevStep }).eq("id", userId);
  }

  // Called by the Building screen once its animation completes. Marks
  // onboarding done AND turns on the demo workspace so the CRM opens
  // populated (demo fixtures render client-side — nothing is written to the
  // shared leads table).
  async function finish() {
    setSaving(true);
    await supabase
      .from("profiles")
      .update({
        ...data,
        onboarding_completed: true,
        demo_mode: true,
        onboarding_step: TOTAL_STEPS,
      })
      .eq("id", userId);
    router.push("/admin/leads");
    router.refresh();
  }

  const stepProps = { data, onChange, onNext, onBack, saving };

  // The Building screen is a full-screen takeover — no wizard chrome.
  if (step === TOTAL_STEPS) {
    return <StepBuilding onFinish={finish} />;
  }

  // Welcome (step 1) isn't numbered, so the displayed number starts at
  // Business Profile = 1. Progress fills across the five numbered steps.
  const displayedStep = step - 1;
  const progress = Math.min((displayedStep / NUMBERED_STEPS) * 100, 100);

  return (
    <div className="flex min-h-screen flex-col">
      {step > 1 && (
        <header className="border-b border-[var(--beast-border)]">
          <div className="beast-container py-6">
            <p className="text-[13px] font-medium text-[var(--beast-ink-soft)]">
              Step {displayedStep} of {NUMBERED_STEPS}
            </p>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--beast-border)]">
              <div
                className="h-full rounded-full bg-[var(--beast-blue)] transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </header>
      )}

      <main className="beast-container flex flex-1 items-center justify-center py-12">
        <div className="w-full max-w-xl">
          {step === 1 && <Step1Welcome {...stepProps} />}
          {step === 2 && <StepBusinessProfile {...stepProps} userId={userId} />}
          {step === 3 && <StepBusinessGoals {...stepProps} />}
          {step === 4 && <StepConnect {...stepProps} />}
          {step === 5 && <Step6ImportLeads {...stepProps} />}
        </div>
      </main>
    </div>
  );
}
