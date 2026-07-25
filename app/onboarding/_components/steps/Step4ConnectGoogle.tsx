"use client";

import { useState } from "react";
import { HiOutlineCalendarDays, HiOutlineIdentification } from "react-icons/hi2";
import { GoogleIcon } from "@/app/(auth)/_components/GoogleButton";
import StepCard from "../StepCard";
import StepNav from "../StepNav";
import type { StepProps } from "../../_lib/types";

const BENEFITS = [
  { icon: HiOutlineCalendarDays, text: "Tours and follow-ups sync straight to your calendar" },
  { icon: HiOutlineIdentification, text: "New clients are added to your contacts automatically" },
];

export default function Step4ConnectGoogle({ data, onChange, onNext, onBack, saving }: StepProps) {
  const [connecting, setConnecting] = useState(false);

  function handleConnect() {
    // Placeholder: real OAuth token exchange + per-user storage plugs in
    // here later without changing this UI.
    setConnecting(true);
    setTimeout(() => {
      onChange({ google_connected: true });
      setConnecting(false);
    }, 900);
  }

  return (
    <StepCard
      eyebrow="Step 4"
      title="Connect Google"
      subtitle="Locator Beast automatically creates contacts and syncs appointments for you."
    >
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
        disabled={connecting || data.google_connected}
        className="mt-6 flex w-full items-center justify-center gap-3 rounded-full border border-[var(--beast-border)] bg-white px-6 py-3.5 text-[14px] font-semibold text-[var(--beast-ink)] transition-colors hover:bg-[#f7f8fa] disabled:opacity-70"
      >
        <GoogleIcon />
        {data.google_connected ? "Google Connected" : connecting ? "Connecting…" : "Connect Google Calendar & Contacts"}
      </button>

      <StepNav onBack={onBack} onNext={() => onNext()} nextLabel={data.google_connected ? "Continue" : "Skip for now"} saving={saving} />
    </StepCard>
  );
}
