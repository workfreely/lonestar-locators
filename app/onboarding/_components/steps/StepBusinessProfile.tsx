"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { HiOutlineArrowUpTray } from "react-icons/hi2";
import { supabase } from "@/lib/supabase/client";
import {
  MAX_SERVICE_AREAS,
  marketsForSlugs,
  reconcilePrimaryMarket,
  needsPrimaryMarketChoice,
  SUPPORTED_STATES,
  marketsForState,
  stateForMarkets,
  serviceAreasHelperText,
  serviceAreasCountLabel,
} from "@/lib/markets/catalog";
import { formatPhoneInput } from "@/lib/utils/formatPhone";
import { slugPreview } from "@/lib/slug/preview";
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
  // Surfaced when the photo reached storage but its URL could not be saved to the
  // profile — the upload must NOT look successful in that case (requirement C9).
  const [photoError, setPhotoError] = useState<string | null>(null);
  // The authoritative slug once ensure_workspace_slug() has run. Until then the
  // UI shows a non-binding preview.
  const [finalSlug, setFinalSlug] = useState<string | null>(null);
  // The ONE state this agent works in. Seeded from the canonical
  // profiles.license_state; for an existing account that has markets but no saved
  // state, derive it ONLY when every market maps to the same state —
  // stateForMarkets returns null for mixed or unknown data rather than guessing.
  const [licenseState, setLicenseState] = useState<string>(
    data.license_state || stateForMarkets(data.service_areas) || "",
  );
  // Service areas are the workspace's selected markets (slugs from the catalog),
  // not free text — they drive which cities the Smart Lead Form shows. The
  // canonical store is workspaces.service_areas (read/written via the RPCs), so
  // seed from there rather than keeping a second copy on the profile.
  const [selectedMarkets, setSelectedMarkets] = useState<string[]>(data.service_areas ?? []);
  // Beast Property Explorer opens here when no client is selected. Explicit —
  // never the first market ticked.
  const [primaryMarket, setPrimaryMarket] = useState<string | null>(
    reconcilePrimaryMarket(data.primary_market ?? null, data.service_areas ?? []),
  );
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

  // Every workspace must serve between 1 and MAX_SERVICE_AREAS markets. The cap
  // was already enforced by toggleMarket; the floor is enforced here so the step
  // cannot be completed with an empty selection. Do NOT lean on the Smart Form's
  // "show all markets when empty" fallback as validation — that is a display
  // default, not a rule.
  // Markets are ALWAYS scoped to the selected state — cross-state selection is
  // not possible because the other states' markets are never rendered.
  const stateMarkets = marketsForState(licenseState);
  const hasMarket = selectedMarkets.length > 0;

  function changeState(next: string) {
    setLicenseState(next);
    // Any previously chosen markets belong to the old state, so clear them
    // rather than leaving a cross-state selection behind.
    setSelectedMarkets([]);
  }
  // With 2+ markets a primary must be chosen before Continue; with exactly one
  // it is implied, so nothing extra is asked.
  const needsPrimary = needsPrimaryMarketChoice(primaryMarket, selectedMarkets);
  const canContinue =
    firstName.trim().length > 0 && lastName.trim().length > 0 && !!licenseState && hasMarket && !needsPrimary;

  function toggleMarket(slug: string) {
    setSelectedMarkets((prev) => {
      let next: string[];
      if (prev.includes(slug)) next = prev.filter((s) => s !== slug);
      else if (prev.length >= MAX_SERVICE_AREAS) next = prev;
      else next = [...prev, slug];
      // Down to one market it becomes the primary automatically — no second
      // question. Dropping the current primary clears it so the selector asks
      // again rather than quietly moving to another city.
      setPrimaryMarket((cur) => reconcilePrimaryMarket(cur, next));
      return next;
    });
  }

  async function handleFile(file: File) {
    setUploading(true);
    setPhotoError(null);
    try {
      const url = await uploadAvatar(userId, file);

      // PERSIST IMMEDIATELY. Previously the URL lived only in React state until
      // finish() wrote it — but Step 3 hands off to Google with a full-page
      // redirect (window.location.href), which unmounts the wizard and reloads
      // initialData from the still-null column. The photo was lost for every
      // agent who connected Google, which is the default path. Writing here means
      // the column is correct before any navigation can occur.
      const { error } = await supabase
        .from("profiles")
        .update({ profile_photo_url: url, updated_at: new Date().toISOString() })
        .eq("id", userId);

      if (error) {
        // Do not show a successful uploaded state when the database write failed.
        setPhotoError("We couldn't save your photo. Please try again.");
        return;
      }
      onChange({ profile_photo_url: url });
    } catch {
      setPhotoError("We couldn't upload your photo. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function handleNext() {
    const first = firstName.trim();
    const last = lastName.trim();


    // Write the selected markets to the workspace and generate the PERMANENT
    // public slug (once) — business name if provided, else the owner's name.
    // Auto-generated and never edited during onboarding. Wrapped so onboarding
    // never blocks if the migration/RPCs aren't deployed yet.
    try {
      await supabase.rpc("set_workspace_service_areas", {
        p_areas: selectedMarkets,
        p_primary: reconcilePrimaryMarket(primaryMarket, selectedMarkets),
      });
      // Reserve + finalize the permanent slug HERE — on Continue, before Step 3's
      // Google redirect can ever run. Business Name no longer participates: the
      // slug is derived from the agent's name alone. ensure_workspace_slug is
      // permanent-once and returns the ACTUAL slug, including any collision
      // suffix, which we surface rather than the optimistic preview.
      const { data: slug } = await supabase.rpc("ensure_workspace_slug", {
        p_base: `${first} ${last}`.trim(),
      });
      if (typeof slug === "string" && slug) setFinalSlug(slug);
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
      email: email.trim(),
      phone_number: phoneNumber.trim(),
      brokerage: brokerage.trim(),
      // Canonical column — becomes the agent's License State in Profile.
      license_state: licenseState,
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
            {photoError ? (
              <p role="alert" className="text-[12px] font-medium text-[#c0392b]">
                {photoError}
              </p>
            ) : (
              <p className="text-[12px] text-[var(--beast-ink-soft)]">Add a photo so clients recognize you.</p>
            )}
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
            <input type="tel" value={phoneNumber} maxLength={14} autoComplete="tel" onChange={(e) => setPhoneNumber(formatPhoneInput(e.target.value))} className={inputClass} />
          </div>
        </div>

        {/* D — Smart Form link. PREVIEW ONLY while typing: slugPreview() mirrors the
            database slugify() but writes nothing, so no keystroke reserves a slug.
            The authoritative slug is reserved once, on Continue, by
            ensure_workspace_slug() — and whatever it returns (including a collision
            suffix) replaces this preview via finalSlug. */}
        <div className="flex flex-col gap-2">
          <label className={labelClass}>Your Smart Form link</label>
          <p className="rounded-xl border border-[var(--beast-border)] bg-[#f7f8fa] px-4 py-3 text-[14px] text-[var(--beast-ink)]">
            locatorbeast.com/
            <span className="font-semibold">
              {finalSlug ?? slugPreview(firstName, lastName) ?? "your-name"}
            </span>
          </p>
          <p className="text-[12px] text-[var(--beast-ink-soft)]">
            {finalSlug ? "This is your permanent link." : "Created from your name when you continue."}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <label className={labelClass}>Brokerage</label>
          <input value={brokerage} onChange={(e) => setBrokerage(e.target.value)} className={inputClass} />
        </div>

        {/* STATE FIRST. A Locator Beast agent works in one state, so the state is
            chosen before any market and then scopes which markets exist below. */}
        <div className="flex flex-col gap-2">
          <label className={labelClass}>State</label>
          <select
            value={licenseState}
            onChange={(e) => changeState(e.target.value)}
            className={`${inputClass} cursor-pointer`}
          >
            <option value="">Select your state</option>
            {SUPPORTED_STATES.map((st) => (
              <option key={st.code} value={st.code}>
                {st.name}
              </option>
            ))}
          </select>
          <p className="text-[12px] text-[var(--beast-ink-soft)]">
            Your markets and license details follow the state you work in.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <label className={labelClass}>Service Areas</label>
          <p className="text-[12px] font-medium text-[var(--beast-ink-soft)]">
            {serviceAreasHelperText(licenseState)}
          </p>
          <p className="text-[12px] font-medium text-[var(--beast-ink-soft)]">
            {serviceAreasCountLabel(licenseState, selectedMarkets.length)}
          </p>
          {!hasMarket && (
            <p role="alert" className="text-[12px] font-medium text-[#c0392b]">
              Select at least one market.
            </p>
          )}
          {!licenseState && (
            <p className="text-[12px] font-medium text-[var(--beast-ink-soft)]">
              Select your state first to see its markets.
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            {stateMarkets.map((m) => {
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
          {/* ── Primary Market ──────────────────────────────────────────────
              Same checkbox-card design as the markets above, on purpose: it is
              the same kind of choice about the same objects, and a different
              control (radio, dropdown) would read as a different concept. Only
              the behaviour differs — single-select.

              Shown ONLY at 2+ markets. With exactly one the answer is already
              known and the save path sets it, so the agent is never asked to
              choose from a list of one. Options are the agent's own selection,
              never the full catalog. */}
          {selectedMarkets.length > 1 && (
            <div className="mt-4 border-t border-[var(--beast-border)] pt-4">
              <label className={labelClass}>Primary Market</label>
              <p className="mb-2 mt-1 text-[12px] font-medium text-[var(--beast-ink-soft)]">
                Which market do you work in most often?
              </p>
              <div className="grid grid-cols-2 gap-2">
                {marketsForSlugs(selectedMarkets).map((m) => {
                  const active = primaryMarket === m.slug;
                  return (
                    <button
                      key={m.slug}
                      type="button"
                      // Checking one unchecks the previous. Re-clicking the checked
                      // market is a no-op, not a clear: with 2+ markets a primary is
                      // required, so emptying it could only block Continue.
                      onClick={() => setPrimaryMarket(m.slug)}
                      aria-pressed={active}
                      className={`flex items-center justify-between rounded-xl border px-4 py-3 text-[14px] font-medium transition-colors ${
                        active
                          ? "border-[var(--beast-blue)] bg-[var(--beast-blue)]/5 text-[var(--beast-ink)]"
                          : "border-[var(--beast-border)] bg-white text-[var(--beast-ink)] hover:border-[#c7ccd6]"
                      }`}
                    >
                      <span>{m.name}</span>
                      <span
                        className={`flex h-5 w-5 items-center justify-center rounded-md border ${
                          active
                            ? "border-[var(--beast-blue)] bg-[var(--beast-blue)] text-white"
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
            </div>
          )}
          <p className="text-[12px] text-[var(--beast-ink-soft)]">
            These set which cities your Smart Lead Form shows. You can change them anytime in Settings.
          </p>
        </div>
      </div>

      <StepNav onBack={onBack} onNext={handleNext} nextDisabled={!canContinue} saving={saving} />
    </StepCard>
  );
}
