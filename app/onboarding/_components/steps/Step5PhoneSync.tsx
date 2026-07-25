"use client";

import { useState } from "react";
import { HiOutlineChatBubbleLeftRight, HiOutlineSparkles, HiOutlineInboxStack } from "react-icons/hi2";
import StepCard from "../StepCard";
import StepNav from "../StepNav";
import type { StepProps } from "../../_lib/types";

const BENEFITS = [
  { icon: HiOutlineChatBubbleLeftRight, text: "Faster texting from your own number" },
  { icon: HiOutlineSparkles, text: "AI conversation summaries" },
  { icon: HiOutlineInboxStack, text: "Everything stays organized in one place" },
];

export default function Step5PhoneSync({ data, onChange, onNext, onBack, saving }: StepProps) {
  const [connecting, setConnecting] = useState(false);

  function handleConnect() {
    // Placeholder: real carrier/phone-provider wiring plugs in here later
    // without changing this UI.
    setConnecting(true);
    setTimeout(() => {
      onChange({ phone_sync_connected: true });
      setConnecting(false);
    }, 900);
  }

  return (
    <StepCard eyebrow="Step 5" title="Phone Sync" subtitle="Work from your own phone number.">
      <div className="flex flex-col gap-4">
        {BENEFITS.map((benefit) => (
          <div key={benefit.text} className="flex items-center gap-4 rounded-xl border border-[var(--beast-border)] bg-[#f7f8fa] px-4 py-3.5">
            <benefit.icon className="h-5 w-5 shrink-0 text-[var(--beast-blue)]" />
            <span className="text-[14px] font-medium text-[var(--beast-ink)]">{benefit.text}</span>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={handleConnect}
        disabled={connecting || data.phone_sync_connected}
        className="mt-6 w-full rounded-full border border-[var(--beast-border)] bg-white px-6 py-3.5 text-[14px] font-semibold text-[var(--beast-ink)] transition-colors hover:bg-[#f7f8fa] disabled:opacity-70"
      >
        {data.phone_sync_connected ? "Phone Connected" : connecting ? "Connecting…" : "Connect Your Phone"}
      </button>

      <StepNav onBack={onBack} onNext={() => onNext()} nextLabel={data.phone_sync_connected ? "Continue" : "Skip for now"} saving={saving} />
    </StepCard>
  );
}
