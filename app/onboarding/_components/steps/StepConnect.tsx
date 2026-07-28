"use client";

import { useState } from "react";
import {
  HiOutlineCalendarDays,
  HiOutlineIdentification,
  HiOutlineDevicePhoneMobile,
  HiOutlineCheck,
} from "react-icons/hi2";
import StepCard from "../StepCard";
import StepNav from "../StepNav";
import type { StepProps } from "../../_lib/types";

export default function StepConnect({ data, onChange, onNext, onBack, saving }: StepProps) {
  // Which connection (if any) is mid-connect, for the button spinner.
  const [connecting, setConnecting] = useState<"google" | "phone" | null>(null);

  // Placeholder connects — real OAuth / phone-provider wiring plugs in here
  // later without changing this UI. Google Calendar + Contacts share one flag.
  function connect(kind: "google" | "phone") {
    setConnecting(kind);
    setTimeout(() => {
      onChange(kind === "google" ? { google_connected: true } : { phone_sync_connected: true });
      setConnecting(null);
    }, 800);
  }

  const connections = [
    {
      key: "google" as const,
      icon: HiOutlineIdentification,
      title: "Google Contacts",
      benefit: "Automatically keeps your client information synchronized.",
      connected: data.google_connected,
    },
    {
      key: "google" as const,
      icon: HiOutlineCalendarDays,
      title: "Google Calendar",
      benefit: "Automatically creates tours and reminders.",
      connected: data.google_connected,
    },
    {
      key: "phone" as const,
      icon: HiOutlineDevicePhoneMobile,
      title: "Phone Sync",
      benefit: "See client communication in one place.",
      connected: data.phone_sync_connected,
    },
  ];

  const allConnected = data.google_connected && data.phone_sync_connected;

  return (
    <StepCard
      eyebrow="Step 3"
      title="Let's connect your business"
      subtitle="These power the automation behind the scenes — connect now or skip and do it later."
    >
      <div className="flex flex-col gap-3">
        {connections.map((c, i) => (
          <div
            key={c.title}
            className="flex items-center gap-4 rounded-xl border border-[var(--beast-border)] bg-[#f7f8fa] px-4 py-3.5"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white">
              <c.icon className="h-5 w-5 text-[var(--beast-blue)]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-[var(--beast-ink)]">{c.title}</p>
              <p className="text-[13px] leading-snug text-[var(--beast-ink-soft)]">{c.benefit}</p>
            </div>
            {c.connected ? (
              <span className="beast-pop flex shrink-0 items-center gap-1.5 rounded-full bg-[#16a34a]/10 px-3 py-1.5 text-[12.5px] font-semibold text-[#16a34a]">
                <HiOutlineCheck className="h-4 w-4" strokeWidth={3} /> Connected
              </span>
            ) : (
              <button
                type="button"
                onClick={() => connect(c.key)}
                disabled={connecting !== null}
                className="shrink-0 rounded-full border border-[var(--beast-border)] bg-white px-4 py-2 text-[12.5px] font-semibold text-[var(--beast-ink)] transition-colors hover:bg-[#f7f8fa] disabled:opacity-60"
              >
                {connecting === c.key ? "Connecting…" : "Connect"}
              </button>
            )}
          </div>
        ))}
      </div>

      <StepNav
        onBack={onBack}
        onNext={() => onNext()}
        nextLabel={allConnected ? "Continue" : "Skip for now"}
        saving={saving}
      />
    </StepCard>
  );
}
