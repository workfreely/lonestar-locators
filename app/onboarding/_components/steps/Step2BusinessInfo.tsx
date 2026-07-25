"use client";

import { useState } from "react";
import StepCard from "../StepCard";
import StepNav from "../StepNav";
import type { StepProps } from "../../_lib/types";

const inputClass =
  "rounded-xl border border-[var(--beast-border)] bg-white px-4 py-3 text-[14px] text-[var(--beast-ink)] outline-none transition-colors focus:border-[var(--beast-blue)]";
const labelClass = "text-[13px] font-medium text-[var(--beast-ink-soft)]";

export default function Step2BusinessInfo({ data, onNext, onBack, saving }: StepProps) {
  const [fullName, setFullName] = useState(data.full_name);
  const [businessName, setBusinessName] = useState(data.business_name);
  const [brokerage, setBrokerage] = useState(data.brokerage);
  const [phoneNumber, setPhoneNumber] = useState(data.phone_number);
  const [serviceAreas, setServiceAreas] = useState(data.service_areas.join(", "));

  const canContinue = fullName.trim().length > 0 && businessName.trim().length > 0;

  function handleNext() {
    onNext({
      full_name: fullName.trim(),
      business_name: businessName.trim(),
      brokerage: brokerage.trim(),
      phone_number: phoneNumber.trim(),
      service_areas: serviceAreas
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    });
  }

  return (
    <StepCard eyebrow="Step 2" title="Business Information" subtitle="Tell us a bit about your business.">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label className={labelClass}>Full Name</label>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass} />
          </div>
          <div className="flex flex-col gap-2">
            <label className={labelClass}>Business Name</label>
            <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} className={inputClass} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label className={labelClass}>Brokerage</label>
            <input value={brokerage} onChange={(e) => setBrokerage(e.target.value)} className={inputClass} />
          </div>
          <div className="flex flex-col gap-2">
            <label className={labelClass}>Phone Number</label>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className={labelClass}>Service Areas</label>
          <input
            value={serviceAreas}
            onChange={(e) => setServiceAreas(e.target.value)}
            placeholder="Austin, San Antonio, Dallas"
            className={inputClass}
          />
          <p className="text-[12px] text-[var(--beast-ink-soft)]">Separate multiple areas with commas.</p>
        </div>
      </div>

      <StepNav onBack={onBack} onNext={handleNext} nextDisabled={!canContinue} saving={saving} />
    </StepCard>
  );
}
