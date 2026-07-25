"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { TOTAL_STEPS, type OnboardingData } from "../_lib/types";
import Step1Welcome from "./steps/Step1Welcome";
import Step2BusinessInfo from "./steps/Step2BusinessInfo";
import Step3Branding from "./steps/Step3Branding";
import Step4ConnectGoogle from "./steps/Step4ConnectGoogle";
import Step5PhoneSync from "./steps/Step5PhoneSync";
import Step6ImportLeads from "./steps/Step6ImportLeads";
import Step7Success from "./steps/Step7Success";

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

  async function finish() {
    setSaving(true);
    await supabase
      .from("profiles")
      .update({ ...data, onboarding_completed: true, onboarding_step: TOTAL_STEPS })
      .eq("id", userId);
    router.push("/admin/leads");
    router.refresh();
  }

  const progress = (step / TOTAL_STEPS) * 100;
  const stepProps = { data, onChange, onNext, onBack, saving };

  return (
    <div className="flex min-h-screen flex-col">
      {step > 1 && (
        <header className="border-b border-[var(--beast-border)]">
          <div className="beast-container py-6">
            <p className="text-[13px] font-medium text-[var(--beast-ink-soft)]">
              Step {step} of {TOTAL_STEPS}
            </p>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[var(--beast-border)]">
              <div
                className="h-full rounded-full bg-[var(--beast-blue)] transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </header>
      )}

      <main className="beast-container flex flex-1 items-center justify-center py-12">
        <div className="w-full max-w-xl">
          {step === 1 && <Step1Welcome {...stepProps} />}
          {step === 2 && <Step2BusinessInfo {...stepProps} />}
          {step === 3 && <Step3Branding {...stepProps} userId={userId} />}
          {step === 4 && <Step4ConnectGoogle {...stepProps} />}
          {step === 5 && <Step5PhoneSync {...stepProps} />}
          {step === 6 && <Step6ImportLeads {...stepProps} />}
          {step === 7 && <Step7Success onFinish={finish} saving={saving} />}
        </div>
      </main>
    </div>
  );
}
