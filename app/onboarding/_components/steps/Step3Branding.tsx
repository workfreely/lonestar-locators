"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { HiOutlineArrowUpTray } from "react-icons/hi2";
import { supabase } from "@/lib/supabase/client";
import StepCard from "../StepCard";
import StepNav from "../StepNav";
import type { StepProps } from "../../_lib/types";

async function uploadToBranding(userId: string, file: File, kind: "avatar" | "logo") {
  const ext = file.name.split(".").pop() ?? "png";
  const path = `${userId}/${kind}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("branding").upload(path, file, { upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from("branding").getPublicUrl(path);
  return data.publicUrl;
}

function UploadTile({
  label,
  imageUrl,
  onFile,
  uploading,
  round,
}: {
  label: string;
  imageUrl: string | null;
  onFile: (file: File) => void;
  uploading: boolean;
  round?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <label className="text-[13px] font-medium text-[var(--beast-ink-soft)]">{label}</label>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          const file = e.dataTransfer.files?.[0];
          if (file) onFile(file);
        }}
        className={`relative flex h-28 w-28 items-center justify-center overflow-hidden border-2 border-dashed bg-[#f7f8fa] transition-colors ${
          round ? "rounded-full" : "rounded-2xl"
        } ${dragActive ? "border-[var(--beast-blue)]" : "border-[var(--beast-border)]"}`}
      >
        {imageUrl ? (
          <Image src={imageUrl} alt={label} width={112} height={112} className="h-full w-full object-cover" />
        ) : (
          <HiOutlineArrowUpTray className="h-6 w-6 text-[var(--beast-ink-soft)]" />
        )}
        {uploading && <div className="absolute inset-0 animate-pulse bg-black/10" />}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
        }}
      />
    </div>
  );
}

export default function Step3Branding({ data, userId, onChange, onNext, onBack, saving }: StepProps & { userId: string }) {
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [brandColor, setBrandColor] = useState(data.brand_color ?? "#2f6bff");

  async function handleAvatarFile(file: File) {
    setUploadingAvatar(true);
    try {
      const url = await uploadToBranding(userId, file, "avatar");
      onChange({ profile_photo_url: url });
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleLogoFile(file: File) {
    setUploadingLogo(true);
    try {
      const url = await uploadToBranding(userId, file, "logo");
      onChange({ business_logo_url: url });
    } finally {
      setUploadingLogo(false);
    }
  }

  return (
    <StepCard eyebrow="Step 3" title="Branding" subtitle="Add your photo and logo — you can always change these later.">
      <div className="flex flex-wrap gap-6">
        <UploadTile label="Profile Photo" imageUrl={data.profile_photo_url} onFile={handleAvatarFile} uploading={uploadingAvatar} round />
        <UploadTile label="Business Logo" imageUrl={data.business_logo_url} onFile={handleLogoFile} uploading={uploadingLogo} />

        <div className="flex flex-col gap-2">
          <label className="text-[13px] font-medium text-[var(--beast-ink-soft)]">Business Color (optional)</label>
          <input
            type="color"
            value={brandColor}
            onChange={(e) => {
              setBrandColor(e.target.value);
              onChange({ brand_color: e.target.value });
            }}
            className="h-28 w-28 cursor-pointer rounded-2xl border border-[var(--beast-border)] bg-[#f7f8fa] p-2"
          />
        </div>
      </div>

      <div className="mt-8">
        <p className="text-[13px] font-medium text-[var(--beast-ink-soft)]">Live preview</p>
        <div className="mt-3 overflow-hidden rounded-2xl border border-[var(--beast-border)]">
          <div className="flex items-center gap-1.5 border-b border-[var(--beast-border)] bg-white px-4 py-3">
            <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
          </div>
          <div className="flex flex-col items-center gap-3 bg-[#f7f8fa] px-6 py-10 text-center">
            {data.business_logo_url ? (
              <Image src={data.business_logo_url} alt="Logo" width={48} height={48} className="rounded-lg object-cover" />
            ) : (
              <div className="h-12 w-12 rounded-lg" style={{ backgroundColor: brandColor }} />
            )}
            <p className="text-[18px] font-semibold text-[var(--beast-ink)]">
              {data.business_name || "Your Business Name"}
            </p>
            <span
              className="rounded-full px-4 py-2 text-[13px] font-semibold text-white"
              style={{ backgroundColor: brandColor }}
            >
              Start Your Search
            </span>
          </div>
        </div>
      </div>

      <StepNav onBack={onBack} onNext={() => onNext({ brand_color: brandColor })} saving={saving} />
    </StepCard>
  );
}
