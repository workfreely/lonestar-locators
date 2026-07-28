"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { HiOutlineArrowUpTray } from "react-icons/hi2";
import { supabase } from "@/lib/supabase/client";
import StepCard from "../StepCard";
import StepNav from "../StepNav";
import type { StepProps } from "../../_lib/types";

const inputClass =
  "rounded-xl border border-[var(--beast-border)] bg-white px-4 py-3 text-[14px] text-[var(--beast-ink)] outline-none transition-colors focus:border-[var(--beast-blue)]";
const labelClass = "text-[13px] font-medium text-[var(--beast-ink-soft)]";

// One folder per user keyed by auth.uid() so the branding-bucket RLS scopes
// access without a join (see the profiles onboarding migration).
async function uploadAvatar(userId: string, file: File) {
  const ext = file.name.split(".").pop() ?? "png";
  const path = `${userId}/avatar-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("branding").upload(path, file, { upsert: true });
  if (error) throw error;
  return supabase.storage.from("branding").getPublicUrl(path).data.publicUrl;
}

export default function StepBusinessProfile({
  data,
  userId,
  onChange,
  onNext,
  onBack,
  saving,
}: StepProps & { userId: string }) {
  const [firstName, setFirstName] = useState(data.first_name);
  const [lastName, setLastName] = useState(data.last_name);
  const [email, setEmail] = useState(data.email);
  const [phoneNumber, setPhoneNumber] = useState(data.phone_number);
  const [brokerage, setBrokerage] = useState(data.brokerage);
  const [serviceAreas, setServiceAreas] = useState(data.service_areas.join(", "));
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const canContinue = firstName.trim().length > 0 && lastName.trim().length > 0;

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const url = await uploadAvatar(userId, file);
      onChange({ profile_photo_url: url });
    } finally {
      setUploading(false);
    }
  }

  function handleNext() {
    const first = firstName.trim();
    const last = lastName.trim();
    onNext({
      first_name: first,
      last_name: last,
      full_name: `${first} ${last}`.trim(),
      email: email.trim(),
      phone_number: phoneNumber.trim(),
      brokerage: brokerage.trim(),
      service_areas: serviceAreas
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    });
  }

  return (
    <StepCard eyebrow="Step 1" title="Business Profile" subtitle="Just the essentials — this takes under a minute.">
      <div className="flex flex-col gap-5">
        {/* Profile photo */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-[var(--beast-border)] bg-[#f7f8fa] transition-colors hover:border-[var(--beast-blue)]"
          >
            {data.profile_photo_url ? (
              <Image src={data.profile_photo_url} alt="Profile photo" width={80} height={80} className="h-full w-full object-cover" />
            ) : (
              <HiOutlineArrowUpTray className="h-5 w-5 text-[var(--beast-ink-soft)]" />
            )}
            {uploading && <div className="absolute inset-0 animate-pulse bg-black/10" />}
          </button>
          <div>
            <p className="text-[14px] font-semibold text-[var(--beast-ink)]">Profile Photo</p>
            <p className="text-[12px] text-[var(--beast-ink-soft)]">Add a photo so clients recognize you.</p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label className={labelClass}>First Name</label>
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputClass} />
          </div>
          <div className="flex flex-col gap-2">
            <label className={labelClass}>Last Name</label>
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputClass} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label className={labelClass}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
          </div>
          <div className="flex flex-col gap-2">
            <label className={labelClass}>Phone</label>
            <input type="tel" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} className={inputClass} />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className={labelClass}>Brokerage</label>
          <input value={brokerage} onChange={(e) => setBrokerage(e.target.value)} className={inputClass} />
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
