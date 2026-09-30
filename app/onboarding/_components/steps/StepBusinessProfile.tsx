"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { HiOutlineArrowUpTray } from "react-icons/hi2";
import { supabase } from "@/lib/supabase/client";
import {
  MAX_SERVICE_AREAS,
  launchMarketsForSlugs,
  reconcilePrimaryMarket,
  needsPrimaryMarketChoice,
  LAUNCH_SUPPORTED_STATES,
  launchMarketsForState,
  stateForMarkets,
  serviceAreasHelperText,
} from "@/lib/markets/catalog";
// Aliased: the component receives a `licenseRejectionReason` PROP, which would
// otherwise shadow the derivation helper of the same name.
import {
  licenseStatus,
  LICENSE_STATUS_LABEL,
  licenseRejectionReason as rejectionReasonFor,
} from "@/lib/license/status";
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
  licenseVerifiedAt,
  licenseRejectedAt,
  licenseRejectionReason,
}: StepProps & {
  userId: string;
  licenseVerifiedAt: string | null;
  licenseRejectedAt: string | null;
  licenseRejectionReason: string | null;
}) {
  const [firstName, setFirstName] = useState(data.first_name);
  const [lastName, setLastName] = useState(data.last_name);
  const [email, setEmail] = useState(data.email);
  const [phoneNumber, setPhoneNumber] = useState(data.phone_number);
  const [brokerage, setBrokerage] = useState(data.brokerage);
  // Texas licence. Pre-populated from the canonical profiles.license_number, so an
  // agent who already supplied it (or who returns to this step) never retypes it.
  const [licenseNumber, setLicenseNumber] = useState(data.license_number);
  // Verification is owner-granted and DB-protected; this screen only reflects it.
  const licenseVerified = !!licenseVerifiedAt;
  // ONE derivation, shared with Profile and the owner panel (lib/license/status.ts),
  // so the three surfaces can never disagree about what a row means.
  //
  // The rejection is dropped from the input once the agent edits the number, because
  // lb_guard_verified_license clears those columns the moment a corrected number is
  // saved. Showing "Pending verification" mid-correction is therefore not optimism —
  // it is the state the write is guaranteed to land in.
  const licenseCorrected = licenseNumber.trim() !== data.license_number.trim();
  const licenseFields = {
    license_number: licenseNumber,
    license_verified_at: licenseVerifiedAt,
    license_rejected_at: licenseCorrected ? null : licenseRejectedAt,
    license_rejection_reason: licenseCorrected ? null : licenseRejectionReason,
  };
  const licenseStatusValue = licenseStatus(licenseFields);
  const licenseLabel = LICENSE_STATUS_LABEL[licenseStatusValue];
  const licenseReason = rejectionReasonFor(licenseFields);
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
  const stateMarkets = launchMarketsForState(licenseState);
  const hasMarket = selectedMarkets.length > 0;
  // Set the first time Continue is pressed. The market requirement itself is
  // unchanged — this only decides WHEN the agent is told about it, so an
  // untouched form does not open with a red error already on screen.
  const [attemptedNext, setAttemptedNext] = useState(false);

  function changeState(next: string) {
    setLicenseState(next);
    // Any previously chosen markets belong to the old state, so clear them
    // rather than leaving a cross-state selection behind.
    setSelectedMarkets([]);
  }
  // With 2+ markets a primary must be chosen before Continue; with exactly one
  // it is implied, so nothing extra is asked.
  const needsPrimary = needsPrimaryMarketChoice(primaryMarket, selectedMarkets);
  // Continue stays pressable when the ONLY thing missing is a market, so
  // handleNext can surface "Select at least 1 market". A disabled button cannot
  // emit a click, so including hasMarket here would make the message
  // unreachable. The market rule is enforced in handleNext, which refuses to
  // advance without one — so the requirement is unchanged, only its reporting.
  const canAttempt =
    firstName.trim().length > 0 && lastName.trim().length > 0 && !!licenseState && !needsPrimary;

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
    setAttemptedNext(true);
    // Same requirement as before; it is now reported instead of silently
    // blocking. Nothing below runs, so no workspace write or slug reservation
    // happens on an incomplete step.
    if (!hasMarket) return;

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
      // Canonical column — the SAME field Profile edits and the owner reviews. Sent
      // only while unverified: once verified the DB trigger freezes it, so writing
      // it back would be pointless at best and a rejected UPDATE at worst.
      ...(licenseVerified ? {} : { license_number: licenseNumber.trim() }),
    });
  }

  return (
    <StepCard eyebrow="Step 1" title="Business Profile" tightTop>
      {/* Two columns on desktop, one concern each: the AGENT on the left
          (photo, name, contact, and the Smart Form link derived from that name)
          and the BUSINESS on the right (brokerage, state, and the markets that
          state scopes). Equal columns, because Brokerage/State moved right —
          the old 1.12/0.88 split favoured the identity column back when it also
          carried them. Stacked single-column below lg, where the vertical
          divider disappears and the groups simply follow each other.

          Nothing about which fields exist, what they write, the state-first
          ordering, or any validation changes — only where they sit. */}
      <div className="grid grid-cols-1 gap-x-8 gap-y-6 lg:grid-cols-2">
{/* ── Profile ─────────────────────────────────────────────────────── */}
        {/* Photo ABOVE the fields rather than beside them. Sharing the row made
            the identity column two columns wide for one 80px control, which
            fought the paired rows below it for alignment. Stacked, the column
            has a single left edge and the rows read as one ladder. The circle
            is 64px (was 80px) so moving it above costs almost no height. */}
        <div className="flex flex-col gap-4">
          {/* The circle, its caption and the hidden input are ONE centred unit:
              w-fit shrinks the block to the circle, and items-center centres the
              caption directly beneath it. Left-aligned on desktop, centred on
              mobile — the block itself stays internally aligned either way. */}
          <div className="flex w-fit flex-col items-center gap-1.5 self-center sm:self-start">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-dashed border-[var(--beast-border)] bg-[#f7f8fa] transition-colors hover:border-[var(--beast-blue)]"
            >
              {data.profile_photo_url ? (
                <Image src={data.profile_photo_url} alt="Profile photo" width={64} height={64} className="h-full w-full object-cover" />
              ) : (
                <HiOutlineArrowUpTray className="h-5 w-5 text-[var(--beast-ink-soft)]" />
              )}
              {uploading && <div className="absolute inset-0 animate-pulse bg-black/10" />}
            </button>
            {/* Caption centred under the circle. The error can be longer than the
                circle, so it gets its own width and stays centred on that. */}
            {photoError ? (
              <p role="alert" className="w-[120px] text-center text-[11px] font-medium leading-tight text-[#c0392b]">
                {photoError}
              </p>
            ) : (
              <p className="text-center text-[11px] text-[var(--beast-ink-soft)]">Photo</p>
            )}
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

          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <label className={labelClass}>First Name</label>
                <input value={firstName} autoComplete="given-name" onChange={(e) => setFirstName(e.target.value)} className={inputClass} />
              </div>
              <div className="flex flex-col gap-2">
                <label className={labelClass}>Last Name</label>
                <input value={lastName} autoComplete="family-name" onChange={(e) => setLastName(e.target.value)} className={inputClass} />
              </div>
            </div>


            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <label className={labelClass}>Email</label>
                <input type="email" value={email} autoComplete="email" onChange={(e) => setEmail(e.target.value)} className={inputClass} />
              </div>
              <div className="flex flex-col gap-2">
                <label className={labelClass}>Phone</label>
                <input type="tel" value={phoneNumber} maxLength={14} autoComplete="tel" onChange={(e) => setPhoneNumber(formatPhoneInput(e.target.value))} className={inputClass} />
              </div>
            </div>

            {/* Your Smart Form link closes the AGENT column: it is derived from
                the First/Last name directly above it, so it now sits with the
                identity it comes from rather than under the market grid.

                PREVIEW ONLY while typing: slugPreview() mirrors the database
                slugify() but writes nothing, so no keystroke reserves a slug.
                The authoritative slug is reserved once, on Continue, by
                ensure_workspace_slug() — whatever it returns (including a
                collision suffix) replaces this preview via finalSlug. */}
            <div className="flex flex-col gap-2 border-t border-[var(--beast-border)] pt-5">
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

          </div>
        </div>

            <div className="flex flex-col gap-6 lg:border-l lg:border-[var(--beast-border)] lg:pl-8">

          {/* Brokerage and State open the BUSINESS column. State still comes
              before any market and scopes which markets exist below it — that
              ordering is now literal: the select sits directly above the market
              grid it governs, instead of in the other column. */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label className={labelClass}>Brokerage</label>
              <input value={brokerage} autoComplete="organization" onChange={(e) => setBrokerage(e.target.value)} className={inputClass} />
            </div>

            <div className="flex flex-col gap-2">
              <label className={labelClass}>State</label>
              {/* NO autoComplete="address-level1" here, deliberately. Three reasons:
                  this select writes profiles.license_state, which is LICENSE data
                  and out of scope for autofill; the browser would source
                  address-level1 from the user's postal address, which need not be
                  the state they are licensed in; and changeState() clears every
                  selected market, so a late autofill would silently wipe the market
                  selection made below. Autofilling the four plain identity fields
                  above carries none of those risks. */}
              <select
                value={licenseState}
                onChange={(e) => changeState(e.target.value)}
                className={`${inputClass} cursor-pointer`}
              >
                <option value="">Select your state</option>
                {LAUNCH_SUPPORTED_STATES.map((st) => (
                  <option key={st.code} value={st.code}>
                    {st.name}
                  </option>
                ))}
              </select>
            </div>
            </div>

          {/* ── Texas licence ────────────────────────────────────────────────
              Sits in the existing seam between State and Markets, because it
              belongs to the same decision: the state governs the licence, and the
              licence governs the markets below. Reuses labelClass / inputClass and
              the Profile page's Pending/Verified chip treatment — no new visual
              language, no new card, no new step. */}
          <div className="flex flex-col gap-2">
            <label className={labelClass}>Texas Real Estate License Number</label>
            <div className="flex items-center gap-2">
              <input
                value={licenseNumber}
                onChange={(e) => setLicenseNumber(e.target.value)}
                readOnly={licenseVerified}
                aria-readonly={licenseVerified || undefined}
                autoComplete="off"
                className={`${inputClass}${licenseVerified ? " cursor-not-allowed opacity-70" : ""}`}
              />
              {/* Verified keeps its green treatment. Pending and Needs correction
                  share the screen's existing muted chip — a rejection is a normal
                  step in review, not an error state, so it gets no red. */}
              {licenseStatusValue === "verified" ? (
                <span className="inline-flex flex-none items-center gap-1 rounded-full border border-[#0f9d58]/30 bg-[#0f9d58]/10 px-2.5 py-1 text-[12px] font-semibold text-[#0f9d58]">
                  {licenseLabel}
                </span>
              ) : licenseLabel ? (
                <span className="inline-flex flex-none items-center rounded-full border border-[var(--beast-border)] px-2.5 py-1 text-[12px] font-semibold text-[var(--beast-ink-soft)]">
                  {licenseLabel}
                </span>
              ) : null}
            </div>
            {/* The owner's reason, in the same muted helper style as the notice it
                replaces — the agent needs to know what to fix, not two paragraphs. */}
            {licenseReason && (
              <p className="text-[12px] font-medium text-[var(--beast-ink-soft)]">{licenseReason}</p>
            )}
            {!licenseVerified && !licenseReason && (
              <p className="text-[12px] font-medium text-[var(--beast-ink-soft)]">
                Licenses are verified within 3 business days and will not be displayed publicly by Locator Beast. Once verified, your license number cannot be changed.
              </p>
            )}
          </div>


{/* ── Markets ─────────────────────────────────────────────────────────
            The "Service Areas" heading, the running "n of 5 selected" counter and
            the always-on "select at least one" warning were three lines of chrome
            stacked above a grid that already shows its own state. One line of
            guidance remains, and the error appears only once the agent has
            actually tried to continue without a market (see `attemptedNext`).
            The rule border is what separates this from the Profile group. */}
        <div className="flex flex-col gap-2.5">
          <p className="text-[12px] font-medium text-[var(--beast-ink-soft)]">
            {licenseState ? serviceAreasHelperText(licenseState) : "Select your state first to see its markets."}
          </p>
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
                  className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-[13.5px] font-medium leading-tight transition-colors ${
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
                {launchMarketsForSlugs(selectedMarkets).map((m) => {
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
                      className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-[13.5px] font-medium leading-tight transition-colors ${
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
          {attemptedNext && !hasMarket && (
            <p role="alert" className="text-[12px] font-medium text-[#c0392b]">
              Select at least 1 market.
            </p>
          )}
        </div>

        </div>
      </div>

      <StepNav onBack={onBack} onNext={handleNext} nextDisabled={!canAttempt} saving={saving} />
    </StepCard>
  );
}
