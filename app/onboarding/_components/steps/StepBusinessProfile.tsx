"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { HiOutlineArrowUpTray } from "react-icons/hi2";
import { supabase } from "@/lib/supabase/client";
import { MARKET_OPTIONS, MAX_SERVICE_AREAS } from "@/lib/markets/catalog";
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
  const [businessName, setBusinessName] = useState(data.business_name);
  const [brokerage, setBrokerage] = useState(data.brokerage);
  // Service areas are the workspace's selected markets (slugs from the catalog),
  // not free text — they drive which cities the Smart Lead Form shows. The
  // canonical store is workspaces.service_areas (read/written via the RPCs), so
  // seed from there rather than keeping a second copy on the profile.
  const [selectedMarkets, setSelectedMarkets] = useState<string[]>(data.service_areas ?? []);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: ws } = await supabase.rpc("get_current_workspace");
      if (!active) return;
      const row = Array.isArray(ws) ? ws[0] : ws;
      if (row?.service_areas?.length) setSelectedMarkets(row.service_areas);
    })();
    return () => {
      active = false;
    };
  }, []);

  const canContinue = firstName.trim().length > 0 && lastName.trim().length > 0;

  function toggleMarket(slug: string) {
    setSelectedMarkets((prev) => {
      if (prev.includes(slug)) return prev.filter((s) => s !== slug);
      if (prev.length >= MAX_SERVICE_AREAS) return prev;
      return [...prev, slug];
    });
  }

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const url = await uploadAvatar(userId, file);
      onChange({ profile_photo_url: url });
    } finally {
      setUploading(false);
    }
  }

  async function handleNext() {
    const first = firstName.trim();
    const last = lastName.trim();

    const business = businessName.trim();

    // Write the selected markets to the workspace and generate the PERMANENT
    // public slug (once) — business name if provided, else the owner's name.
    // Auto-generated and never edited during onboarding. Wrapped so onboarding
    // never blocks if the migration/RPCs aren't deployed yet.
    try {
      await supabase.rpc("set_workspace_service_areas", { p_areas: selectedMarkets });
      const slugBase = business || `${first} ${last}`.trim();
      await supabase.rpc("ensure_workspace_slug", { p_base: slugBase });
    } catch (err) {
      console.error("Workspace service-area / slug setup failed:", err);
    }

    // Note: service_areas is intentionally NOT written to the profile here — the
    // single source of truth is workspaces.service_areas (set via the RPC
    // above). Keeping a second copy on the profile is what let Profile and the
    // Smart Lead Form drift out of sync.
    onNext({
      first_name: first,
      last_name: last,
      full_name: `${first} ${last}`.trim(),
      business_name: business,
      email: email.trim(),
      phone_number: phoneNumber.trim(),
      brokerage: brokerage.trim(),
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
          <label className={labelClass}>Business Name <span className="text-[var(--beast-ink-soft)]">(optional)</span></label>
          <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="e.g. Lone Star Locators" className={inputClass} />
          <p className="text-[12px] text-[var(--beast-ink-soft)]">Used for your public form link. Leave blank to use your name.</p>
        </div>

        <div className="flex flex-col gap-2">
          <label className={labelClass}>Brokerage</label>
          <input value={brokerage} onChange={(e) => setBrokerage(e.target.value)} className={inputClass} />
        </div>

        <div className="flex flex-col gap-2">
          <label className={labelClass}>Service Areas</label>
          <p className="text-[12px] font-medium text-[var(--beast-ink-soft)]">
            {selectedMarkets.length} of {MAX_SERVICE_AREAS} selected
          </p>
          <div className="grid grid-cols-2 gap-2">
            {MARKET_OPTIONS.map((m) => {
              const active = selectedMarkets.includes(m.slug);
              const blocked = !active && selectedMarkets.length >= MAX_SERVICE_AREAS;
              return (
                <button
                  key={m.slug}
                  type="button"
                  onClick={() => toggleMarket(m.slug)}
                  aria-pressed={active}
                  disabled={blocked}
                  className={`flex items-center justify-between rounded-xl border px-4 py-3 text-[14px] font-medium transition-colors ${
                    active
                      ? "border-[var(--beast-blue)] bg-[var(--beast-blue)]/5 text-[var(--beast-ink)]"
                      : blocked
                      ? "cursor-not-allowed border-[#eceef3] bg-white text-[#c7ccd6]"
                      : "border-[var(--beast-border)] bg-white text-[var(--beast-ink)] hover:border-[#c7ccd6]"
                  }`}
                >
                  <span>{m.name}</span>
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-md border ${
                      active
                        ? "border-[var(--beast-blue)] bg-[var(--beast-blue)] text-white"
                        : blocked
                        ? "border-[#f0f1f5] text-transparent"
                        : "border-[var(--beast-border)] text-transparent"
                    }`}
                  >
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                      <path d="M2.5 6.5l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-[12px] text-[var(--beast-ink-soft)]">
            These set which cities your Smart Lead Form shows. You can change them anytime in Settings.
          </p>
        </div>
      </div>

      <StepNav onBack={onBack} onNext={handleNext} nextDisabled={!canContinue} saving={saving} />
    </StepCard>
  );
}
