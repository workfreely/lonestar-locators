"use client";

import { useState } from "react";
import {
  HiOutlineCalendarDays,
  HiOutlineIdentification,
  HiOutlineCheck,
} from "react-icons/hi2";
import StepCard from "../StepCard";
import StepNav from "../StepNav";
import type { StepProps } from "../../_lib/types";

export default function StepConnect({ data, onNext, onBack, saving }: StepProps) {
  // Which connection (if any) is mid-connect, for the button spinner.
  const [connecting, setConnecting] = useState<"google" | null>(null);

  // Google is a real OAuth redirect: a single consent grants both Calendar and
  // Contacts, so either Google card sends the user to /api/google/auth. On
  // return, /onboarding reloads with google_connected reflecting the stored token,
  // so both cards show "Connected". (Beast Sync is introduced honestly on the next
  // step — it is NOT faked here as a "Phone Sync" connection.)
  function connect(kind: "google") {
    if (kind === "google") {
      setConnecting("google");
      window.location.href = "/api/google/auth?next=/onboarding";
    }
  }

  const connections = [
    {
      key: "google" as const,
      icon: HiOutlineIdentification,
      title: "Google Contacts",
      benefit: "Automatically keeps your client information synchronized.",
      connected: data.google_connected,
      recommended: true,
    },
    {
      key: "google" as const,
      icon: HiOutlineCalendarDays,
      title: "Google Calendar",
      benefit: "Automatically creates tours and reminders.",
      connected: data.google_connected,
      recommended: true,
    },
  ];

  const allConnected = data.google_connected;

  return (
    <StepCard
      eyebrow="Step 2"
      title="Let's connect your business"
      subtitle="These power the automation behind the scenes."
    >
      <div className="flex flex-col gap-2.5">
        {connections.map((c, i) => (
          <div
            key={c.title}
            className="flex items-center gap-4 rounded-xl border border-[var(--beast-border)] bg-[#f7f8fa] px-4 py-3.5"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white">
              <c.icon className="h-5 w-5 text-[var(--beast-blue)]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-[14px] font-semibold text-[var(--beast-ink)]">{c.title}</p>
                {c.recommended && !c.connected && (
                  <span className="rounded-full bg-[var(--beast-blue)]/10 px-2 py-0.5 text-[11px] font-semibold text-[var(--beast-blue)]">
                    Recommended
                  </span>
                )}
              </div>
              <p className="text-[13px] leading-snug text-[var(--beast-ink-soft)]">{c.benefit}</p>
            </div>
            {/* Status only. A single Google consent grants Contacts AND Calendar
                together, so a per-card Connect button implied two separate
                grants that do not exist — the one shared action sits below. */}
            {c.connected ? (
              <span className="beast-pop flex shrink-0 items-center gap-1.5 rounded-full bg-[#16a34a]/10 px-3 py-1.5 text-[12.5px] font-semibold text-[#16a34a]">
                <HiOutlineCheck className="h-4 w-4" strokeWidth={3} /> Connected
              </span>
            ) : (
              // Deliberately a STATUS chip, not a button: the single Connect
              // action below grants both cards at once, so anything clickable
              // here would again imply two separate grants. It exists to keep
              // the row's right edge occupied in both states.
              <span className="flex shrink-0 items-center rounded-full border border-[var(--beast-border)] bg-white px-3 py-1 text-[12px] font-medium text-[var(--beast-ink-soft)]">
                Not connected
              </span>
            )}
          </div>
        ))}
      </div>

      {/* ONE shared action for both cards. Same handler, same endpoint, same
          scopes — nothing about the OAuth flow changes. */}
      {!allConnected && (
        <button
          type="button"
          onClick={() => connect("google")}
          disabled={connecting !== null}
          className="mt-4 w-full rounded-full bg-[var(--beast-ink)] px-7 py-3 text-[14px] font-semibold text-white transition-colors duration-200 hover:bg-[var(--beast-blue)] disabled:opacity-60"
        >
          {connecting === "google" ? "Connecting…" : "Connect Google"}
        </button>
      )}

      {/* When Google is already connected, Continue IS the main action and keeps
          the primary treatment. When it is not, Connect Google above owns that
          weight and this drops to a ghost so the screen has exactly one primary. */}
      <StepNav
        onBack={onBack}
        onNext={() => onNext()}
        nextLabel={allConnected ? "Continue" : "Skip for now"}
        nextVariant={allConnected ? "primary" : "ghost"}
        spacing={allConnected ? "default" : "tight"}
        saving={saving}
      />
    </StepCard>
  );
}
