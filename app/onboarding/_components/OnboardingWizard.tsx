"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";
import { NUMBERED_STEPS, TOTAL_STEPS, type OnboardingData } from "../_lib/types";
import { buildInitialSmartFormConfig } from "@/app/smart-lead-form/_lib/initialConfig";
import Step1Welcome from "./steps/Step1Welcome";
import StepBusinessProfile from "./steps/StepBusinessProfile";
import StepBusinessGoals from "./steps/StepBusinessGoals";
import StepConnect from "./steps/StepConnect";
import StepTools from "./steps/StepTools";
import StepBuilding from "./steps/StepBuilding";

export default function OnboardingWizard({
  userId,
  initialStep,
  initialData,
  licenseVerifiedAt,
  licenseRejectedAt,
  licenseRejectionReason,
}: {
  userId: string;
  initialStep: number;
  initialData: OnboardingData;
  /** profiles.license_verified_at — READ-ONLY here. Kept out of OnboardingData on
   *  purpose: finish() spreads that object into a profiles UPDATE, and only the
   *  owner-only RPC may ever set this column. */
  licenseVerifiedAt: string | null;
  /** profiles.license_rejected_at / license_rejection_reason — READ-ONLY for the
   *  same reason, and enforced server-side: lb_guard_verified_license raises
   *  license_rejection_readonly on any user write to either column. The trigger
   *  also CLEARS them when a corrected number is saved, so the wizard never has
   *  to. */
  licenseRejectedAt: string | null;
  licenseRejectionReason: string | null;
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
    // PASS 8: completing onboarding no longer starts a trial. trg_grant_trial_on_
    // onboarding was neutralised in the database along with trg_grant_trial_on_
    // signup, so this write stamps onboarding state only. The trial begins
    // when the platform owner verifies a real Texas licence.
    await supabase
      .from("profiles")
      .update({
        ...data,
        onboarding_completed: true,
        demo_mode: true,
        onboarding_step: TOTAL_STEPS,
      })
      .eq("id", userId);

    // Auto-create the account's always-live Smart Form from the onboarding data,
    // so the user has a professional, personalized public form the instant
    // onboarding finishes (name, brokerage, phone, photo, service areas, and a
    // default hero background from their FIRST selected market). Guarded so it
    // never overwrites an existing config, and non-fatal so a failure here can
    // never trap the user on the building screen.
    try {
      const { data: existing } = await supabase.rpc("get_smart_form");
      const existingRow = Array.isArray(existing) ? existing[0] : existing;
      if (!existingRow?.config) {
        const { data: ws } = await supabase.rpc("get_current_workspace");
        const wsRow = Array.isArray(ws) ? ws[0] : ws;
        const serviceAreas: string[] = wsRow?.service_areas ?? data.service_areas ?? [];
        const config = buildInitialSmartFormConfig({
          agentName: data.full_name || `${data.first_name} ${data.last_name}`,
          brokerageName: data.brokerage || data.business_name,
          phoneNumber: data.phone_number,
          profilePhotoUrl: data.profile_photo_url,
          serviceAreas,
        });
        await supabase.rpc("save_smart_form", { p_config: config });
      }
    } catch (err) {
      console.error("Smart Form auto-create failed:", err);
    }

    // PASS 8: onboarding no longer starts the trial. The trial begins when
    // the platform owner verifies a real Texas licence (lb_verify_license), so
    // there is nothing to grant here and the old /api/billing/start-trial call has
    // been removed rather than left as a no-op round trip.
    //
    // A finished-but-unverified user is routed to /verify-license by the Pass 7
    // licence gate, which runs BEFORE the billing gate — so arriving here without
    // a trial does not bounce them to /billing.

    // Account welcome email (fire-and-forget). No longer claims a trial has
    // started; that email now fires from the verification path.
    void fetch("/api/notifications/account-welcome", { method: "POST" }).catch(() => {});

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

      {/* items-START, not items-center. Centring split ALL the leftover height
          evenly above and below the card, so on a tall viewport the gap under
          the progress bar grew with the window — that was the dead space. The
          card now hangs from a fixed pt-8 and the slack collects at the bottom.
          pb-12 stays so the card never sits flush against the viewport edge on a
          short screen. Card size and responsive behaviour are untouched. */}
      <main className="beast-container flex flex-1 items-start justify-center pt-8 pb-12">
        {/* Business Profile is the one step with enough fields to need the extra
            column — at max-w-xl its six inputs, seven market tiles and link
            preview stack ~1000px tall and cannot fit a laptop viewport. Every
            other step keeps max-w-xl, so the wizard's proportions are unchanged
            everywhere else. */}
        <div className={`w-full ${step === 2 ? "max-w-5xl" : "max-w-xl"}`}>
          {step === 1 && <Step1Welcome {...stepProps} />}
          {step === 2 && (
            <StepBusinessProfile
              {...stepProps}
              userId={userId}
              licenseVerifiedAt={licenseVerifiedAt}
              licenseRejectedAt={licenseRejectedAt}
              licenseRejectionReason={licenseRejectionReason}
            />
          )}
          {step === 3 && <StepConnect {...stepProps} />}
          {step === 4 && <StepBusinessGoals {...stepProps} />}
          {step === 5 && <StepTools {...stepProps} />}
        </div>
      </main>
    </div>
  );
}
