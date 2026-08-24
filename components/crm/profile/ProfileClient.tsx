"use client"

import { useEffect, useRef, useState } from "react"
import { HiOutlineCheckBadge } from "react-icons/hi2"
import PasswordSetting from "@/components/crm/profile/PasswordSetting"
import { enterDemoWorkspace, resetDemoWorkspace, exitDemoWorkspace } from "@/lib/demo/exitDemo"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase/client"
import SettingsShell, {
  SettingsCard,
  SettingsField,
  settingsInputCls,
} from "@/components/crm/settings/SettingsShell"
import {
  MAX_SERVICE_AREAS,
  marketsForState,
  marketsForSlugs,
  reconcilePrimaryMarket,
  needsPrimaryMarketChoice,
  serviceAreasHelperText,
  serviceAreasCountLabel,
  defaultThemeForMarkets,
} from "@/lib/markets/catalog"

// Shown wherever a workspace would be left serving no markets — the Service Areas
// card and the Save handler. Kept as one constant so both read identically.
const MIN_MARKETS_MESSAGE = "Select at least one market."
import TimezoneSetting from "./TimezoneSetting"
import {
  toRpcFailure,
  userMessageForServiceAreaError,
  likelyCause,
  gatherWorkspaceDiagnostics,
} from "@/lib/supabase/serviceAreasDiagnostics"

// The states Locator Beast supports, matching the DB CHECK constraint on
// profiles.license_state and lib/markets/catalog.ts. Adding a state means updating
// both — the constraint is what keeps a stale option from being saved.
const LICENSE_STATE_NAMES: Record<string, string> = {
  AZ: "Arizona",
  CO: "Colorado",
  FL: "Florida",
  GA: "Georgia",
  IL: "Illinois",
  TN: "Tennessee",
  TX: "Texas",
}


type ProfileInitial = {
  firstName: string
  lastName: string
  preferredFirstName: string
  preferredLastName: string
  brokerage: string
  licenseNumber: string
  licenseState: string
  demoMode: boolean
  licenseVerifiedAt: string | null
  phone: string
  email: string
  photoUrl: string | null
  timeZone: string
}

// Progressive US phone formatting for the input — shows "(210) 555-1234" as the
// user types and normalizes whatever is loaded from the DB to the same shape.
function formatPhoneInput(value: string): string {
  let d = value.replace(/\D/g, "")
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1) // drop a leading US "1"
  d = d.slice(0, 10)
  if (d.length < 4) return d
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

function DefaultAvatar({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8.5" r="3.75" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </svg>
  )
}

export default function ProfileClient({ userId, initial }: { userId: string; initial: ProfileInitial }) {
  const router = useRouter()

  const [firstName, setFirstName] = useState(initial.firstName)
  const [lastName, setLastName] = useState(initial.lastName)
  const [preferredFirstName, setPreferredFirstName] = useState(initial.preferredFirstName)
  const [preferredLastName, setPreferredLastName] = useState(initial.preferredLastName)
  const [brokerage, setBrokerage] = useState(initial.brokerage)
  const [licenseNumber, setLicenseNumber] = useState(initial.licenseNumber)
  const [licenseState, setLicenseState] = useState(initial.licenseState)
  // Demo workspace state. The roster is client-side fixtures, so these controls
  // only flip profiles.demo_mode — real leads are never created or removed.
  const [demoMode, setDemoMode] = useState(initial.demoMode)
  const [demoBusy, setDemoBusy] = useState(false)
  // A state change is destructive after onboarding — it clears markets and resets
  // the Smart Form's market context — so it is confirmed before being applied.
  const [pendingState, setPendingState] = useState<string | null>(null)
  const [themeStale, setThemeStale] = useState(false)
  // Verified licenses are frozen. The database enforces this (lb_guard_verified_license
  // rejects the write outright); the UI simply reflects it rather than pretending to.
  // Mutable: confirming a state change clears verification, and the UI must
  // immediately reflect that the new state needs verifying.
  const [licenseVerified, setLicenseVerified] = useState(!!initial.licenseVerifiedAt)
  const [phone, setPhone] = useState(formatPhoneInput(initial.phone))
  const [email, setEmail] = useState(initial.email)
  const [photoUrl, setPhotoUrl] = useState<string | null>(initial.photoUrl)

  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Service Areas — the workspace's selected market slugs
  // (workspaces.service_areas, the SINGLE source of truth read by the Smart
  // Lead Form). Loaded here so the one Save Changes button below persists the
  // profile fields AND the service areas together, in one action.
  const [serviceAreas, setServiceAreas] = useState<string[]>([])
  // The market Beast Property Explorer opens in when no client is selected.
  // Always one of serviceAreas; never inferred from selection order.
  const [primaryMarket, setPrimaryMarket] = useState<string | null>(null)
  // Validation is shown only AFTER a save attempt. On first load an unset
  // primary is simply a field not filled in yet, not a mistake — colouring it
  // red before the agent has done anything scolds them for the page's own
  // initial state. The requirement itself is unchanged: handleSave still
  // refuses, so the field is exactly as mandatory as it was.
  const [attemptedSave, setAttemptedSave] = useState(false)
  const [publicSlug, setPublicSlug] = useState<string | null>(null)
  const [areasLoaded, setAreasLoaded] = useState(false)

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data } = await supabase.rpc("get_current_workspace")
      if (!active) return
      const row = Array.isArray(data) ? data[0] : data
      const loadedAreas: string[] = row?.service_areas ?? []
      setServiceAreas(loadedAreas)
      // A workspace saved before Primary Market existed has none. reconcile
      // auto-selects when there is only one market and otherwise leaves it unset,
      // so the selector appears and the agent chooses instead of inheriting a guess.
      setPrimaryMarket(reconcilePrimaryMarket(row?.primary_market ?? null, loadedAreas))
      setPublicSlug(row?.slug ?? null)
      setAreasLoaded(true)
    })()
    return () => {
      active = false
    }
  }, [])

  // Markets are scoped to the licensed state, so switching state must drop any
  // markets belonging to the old one — otherwise a Texas selection would persist
  // under a Florida license and the picker could never surface it to remove.
  // Ask first. During onboarding the state is simply chosen; afterwards, changing
  // it invalidates existing markets and the Smart Form's market context, so it is
  // never applied straight from the dropdown.
  function requestLicenseStateChange(next: string) {
    if (!next || next === licenseState || !licenseState) {
      void applyLicenseStateChange(next)
      return
    }
    setPendingState(next)
  }

  async function applyLicenseStateChange(next: string) {
    // A VERIFIED user cannot clear their own licence/verification through the
    // normal profile UPDATE — lb_guard_verified_license freezes both. The
    // caller-scoped RPC performs the whole transition in one statement. Unverified
    // users keep the existing save path untouched.
    if (licenseVerified) {
      const { error } = await supabase.rpc("lb_change_license_state", { p_state: next })
      if (error) {
        setSaveError("We couldn't change your license state. Please try again.")
        return
      }
      setLicenseVerified(false)
      setLicenseNumber("")
    }

    setServiceAreas((prev) => {
      const allowed = new Set(marketsForState(next).map((m) => m.slug))
      const kept = prev.filter((slug) => allowed.has(slug))
      // Changing state replaces the whole market list, so a primary from the old
      // state is now incompatible. reconcile keeps it when it survived, auto-picks
      // when a single market remains, and otherwise clears it so the selector
      // reappears — it never silently substitutes another city.
      setPrimaryMarket((cur) => reconcilePrimaryMarket(cur, kept))
      return kept
    })
    setSaved(false)
    setSaveError(null)
    // The Smart Form's hero context is derived from the FIRST selected market. The
    // markets just cleared, so the saved theme now belongs to a state the agent no
    // longer works in — mark it stale so save() re-derives it (neutral until a new
    // market is chosen). Uses the existing theme logic; no second theme system.
    setThemeStale(true)
  }

  function toggleMarket(slugKey: string) {
    setSaved(false)
    setSaveError(null)
    setServiceAreas((prev) => {
      let next: string[]
      if (prev.includes(slugKey)) next = prev.filter((s) => s !== slugKey)
      // At the cap, adding is refused rather than silently dropping something
      // else. Deselecting is always allowed, so swapping stays one extra click.
      else if (prev.length >= MAX_SERVICE_AREAS) next = prev
      else next = [...prev, slugKey]
      // Dropping the current primary leaves it unset, which blocks Save until a
      // replacement is chosen. Down to a single market it becomes the primary
      // automatically, so the agent is never asked to pick from a list of one.
      setPrimaryMarket((cur) => reconcilePrimaryMarket(cur, next))
      return next
    })
  }

  async function handlePhotoFile(file: File) {
    if (!userId) return
    setPhotoBusy(true)
    try {
      const ext = file.name.split(".").pop() ?? "png"
      const path = `${userId}/avatar-${Date.now()}.${ext}`
      const { error } = await supabase.storage.from("branding").upload(path, file, { upsert: true })
      if (error) throw error
      const url = supabase.storage.from("branding").getPublicUrl(path).data.publicUrl
      await supabase.from("profiles").update({ profile_photo_url: url }).eq("id", userId)
      setPhotoUrl(url)
      router.refresh()
    } catch (err) {
      console.error("[profile] photo upload failed:", err)
    } finally {
      setPhotoBusy(false)
    }
  }

  async function handleRemovePhoto() {
    if (!userId) return
    setPhotoBusy(true)
    try {
      await supabase.from("profiles").update({ profile_photo_url: null }).eq("id", userId)
      setPhotoUrl(null)
      router.refresh()
    } catch (err) {
      console.error("[profile] photo remove failed:", err)
    } finally {
      setPhotoBusy(false)
    }
  }

  async function handleSave() {
    if (!userId) return
    // From here on, an unset primary IS a mistake worth flagging.
    setAttemptedSave(true)

    // Every workspace must serve between 1 and MAX_SERVICE_AREAS markets. Checked
    // BEFORE any write: handleSave persists Business Information and Service Areas
    // together, so failing late would leave the profile updated while the markets
    // were rejected. The cap is enforced by toggleServiceArea; this is the floor.
    // A primary is mandatory whenever there is a real choice to make. Blocking the
    // save is the point: the alternative is writing an arbitrary market that then
    // decides where the map opens every day.
    if (needsPrimaryMarketChoice(primaryMarket, serviceAreas)) {
      setSaved(false)
      setSaveError("Choose your Primary Market before saving.")
      return
    }
    if (serviceAreas.length === 0) {
      setSaved(false)
      setSaveError(MIN_MARKETS_MESSAGE)
      return
    }

    setSaving(true)
    setSaved(false)
    setSaveError(null)
    const first = firstName.trim()
    const last = lastName.trim()

    try {
      // One logical save: profile identity/business fields AND the workspace
      // service areas. Both are persisted before we report success, so a
      // failure in either is surfaced instead of silently masked.
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          first_name: first,
          last_name: last,
          full_name: `${first} ${last}`.trim(),
          // Structured preferred name is the source of truth. profiles.preferred_name
          // is a derived cache maintained by the lb_sync_preferred_name() trigger, so
          // it is deliberately NOT written here.
          preferred_first_name: preferredFirstName.trim() || null,
          preferred_last_name: preferredLastName.trim() || null,
          brokerage: brokerage.trim(),
          ...(licenseVerified
            ? {}
            : { license_number: licenseNumber.trim(), license_state: licenseState || null }),
          phone_number: phone.trim(),
          email: email.trim(),
        })
        .eq("id", userId)

      const {
        data: areasData,
        error: areasError,
        status: areasStatus,
        statusText: areasStatusText,
      } = await supabase.rpc("set_workspace_service_areas", {
        p_areas: serviceAreas,
        // Markets and the primary move together in one statement, so a rejected
        // primary can never leave the markets saved and the primary stale.
        p_primary: reconcilePrimaryMarket(primaryMarket, serviceAreas),
      })

      // A state change invalidated the Smart Form's market context. Re-derive the
      // hero theme from the NEW primary market with the same defaultThemeForMarkets
      // logic the form already uses; with no market yet it resolves to the neutral
      // branded fallback rather than keeping the previous state's imagery. Only the
      // heroTheme is touched — all custom Smart Form content is preserved.
      if (themeStale && !areasError) {
        try {
          const { data: form } = await supabase.rpc("get_smart_form")
          const row = Array.isArray(form) ? form[0] : form
          if (row?.config) {
            const nextTheme = defaultThemeForMarkets(serviceAreas) ?? "custom"
            await supabase.rpc("save_smart_form", {
              p_config: {
                ...row.config,
                branding: { ...(row.config.branding ?? {}), heroTheme: nextTheme },
              },
            })
          }
          setThemeStale(false)
        } catch {
          // Non-fatal: the profile save already succeeded. The theme stays stale
          // until the next save rather than blocking the user here.
        }
      }

      setSaving(false)

      if (profileError || areasError) {
        const failure = toRpcFailure(areasError, areasStatus, areasStatusText)

        // This is an EXPECTED application failure (the RPC returned an error;
        // it did not throw), so log with console.warn — NOT console.error — so
        // the full diagnostics still reach the console without tripping the
        // Next.js dev error overlay. console.error/throws are reserved for
        // genuinely unexpected conditions (see the catch below).
        if (process.env.NODE_ENV !== "production") {
          // DEV ONLY — the complete diagnostics (never shown in the UI): full
          // RPC response, the real connected Supabase project, the workspace
          // the RPC targets, membership status, and a classified cause.
          const diag = failure ? await gatherWorkspaceDiagnostics() : null
          console.warn("[profile] Service-area save failed — developer diagnostics", {
            rpc: "set_workspace_service_areas",
            likelyCause: failure ? likelyCause(failure) : "profiles UPDATE failed",
            rpcResponse: {
              data: areasData,
              message: failure?.message ?? null,
              code: failure?.code ?? null,
              details: failure?.details ?? null,
              hint: failure?.hint ?? null,
              status: failure?.status ?? null,
              statusText: failure?.statusText ?? null,
            },
            profileError: profileError ?? null,
            connectedProject: diag
              ? {
                  ref: diag.connectedRef,
                  name: diag.project?.name ?? null,
                  frozen: diag.project?.frozen ?? null,
                  matchesLocatorBeast: diag.matchesLocatorBeast,
                }
              : undefined,
            auth: diag ? { userId: diag.userId, email: diag.userEmail } : undefined,
            workspaceId: diag?.workspaceId ?? null,
            isActiveMember: diag?.isActiveMember ?? null,
            probeErrors: diag?.probeErrors ?? {},
          })
        } else {
          // PRODUCTION — a concise, non-sensitive breadcrumb for support triage.
          // No project/DB/RPC names in the payload; nothing reaches the UI.
          // console.warn (expected failure), not console.error.
          console.warn("[profile] Service-area save failed", {
            code: failure?.code ?? null,
            status: failure?.status ?? null,
          })
        }

        // UI (every environment): friendly only — no infrastructure details.
        setSaveError(
          failure
            ? userMessageForServiceAreaError(failure)
            : "Unable to save your profile changes. Please try again."
        )
        return
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      router.refresh()
    } catch (err) {
      // Unexpected throw (e.g. a network failure) — keep the stack in the dev
      // console; show the user the same clean message.
      setSaving(false)
      if (process.env.NODE_ENV !== "production") {
        console.error("[profile] Service-area save threw — developer diagnostics", {
          rpc: "set_workspace_service_areas",
          error: err,
          stack: err instanceof Error ? err.stack : undefined,
        })
      } else {
        console.error("[profile] Service-area save threw")
      }
      setSaveError(
        "Unable to save your Service Areas. Please try again. If the problem continues, contact support."
      )
    }
  }

  return (
    <SettingsShell title="Profile">
      {/* Profile Photo */}
      <SettingsCard title="Profile Photo">
        <div className="flex items-center gap-5">
          <div className="flex h-20 w-20 flex-none items-center justify-center overflow-hidden rounded-full border border-[#e5e7ee] bg-[#f4f5f8] text-[#9098a8]">
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt="Profile photo" className="h-full w-full object-cover" />
            ) : (
              <DefaultAvatar className="h-9 w-9" />
            )}
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={photoBusy}
                className="rounded-lg bg-[#2f6bff] px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#265fe0] disabled:opacity-60"
              >
                {photoBusy ? "Working…" : photoUrl ? "Replace Photo" : "Upload Photo"}
              </button>
              {photoUrl && (
                <button
                  type="button"
                  onClick={handleRemovePhoto}
                  disabled={photoBusy}
                  className="rounded-lg border border-[#e5e7ee] px-3.5 py-2 text-[13px] font-semibold text-[#4b5162] transition-colors hover:bg-[#f4f5f8] disabled:opacity-60"
                >
                  Remove
                </button>
              )}
            </div>
            <p className="text-[12px] text-[#9098a8]">Square images look best. PNG or JPG.</p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handlePhotoFile(file)
              e.target.value = ""
            }}
          />
        </div>
      </SettingsCard>

      {/* Account Information — the agent's own identity and how we reach them.
          Phone and Email moved here from Business Information: they identify the
          PERSON, not the brokerage, so they belong beside the names rather than
          beside a licence. */}
      <SettingsCard title="Account Information" description="Used for account verification.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SettingsField label="Legal First Name">
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className={settingsInputCls} />
          </SettingsField>
          <SettingsField label="Legal Last Name">
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} className={settingsInputCls} />
          </SettingsField>
        </div>
        {/* Preferred name is STRUCTURED so each part resolves independently:
            preferred first else legal first, preferred last else legal last.
            A single free-text field could not tell the welcome banner which
            token was the given name, so an agent who typed their full name got
            greeted by it. Legal first/last above stay account-identity only. */}
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SettingsField
            label="Preferred First Name"
            hint="Shown throughout Locator Beast instead of your legal name."
          >
            <input value={preferredFirstName} onChange={(e) => setPreferredFirstName(e.target.value)} placeholder="e.g. Bob" className={settingsInputCls} />
          </SettingsField>
          <SettingsField label="Preferred Last Name (optional)">
            <input value={preferredLastName} onChange={(e) => setPreferredLastName(e.target.value)} placeholder="e.g. Vale" className={settingsInputCls} />
          </SettingsField>
        </div>
        {/* Row 3 — contact details. Same two-column rhythm as the name rows, so
            the card reads as one block rather than a list with an appendix. */}
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SettingsField label="Phone Number">
            {/* No `type` attribute at all (like the other Profile fields) so it
                doesn't match the global input[type="text"|"tel"|…] rule that
                overrides font/padding — that rule targets typed inputs only,
                and the other fields are type-less. inputMode keeps the phone
                keypad on mobile. */}
            <input
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(formatPhoneInput(e.target.value))}
              placeholder="(210) 555-1234"
              className={settingsInputCls}
            />
          </SettingsField>
          <SettingsField label="Email Address">
            {/* Type-less for the same reason — inputMode keeps the email
                keyboard on mobile. */}
            <input
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={settingsInputCls}
            />
          </SettingsField>
        </div>
      </SettingsCard>

      {/* Business Information + Service Areas — one cohesive business-profile
          group (tighter spacing), saved together by the single Save Changes
          button below. */}
      <div className="space-y-4">
      <SettingsCard title="Business Information">
        {/* Two rows on desktop, driven by a 12-column track so the widths can be
            proportional rather than equal:
              row 1  Brokerage 8 · License State 4
              row 2  License Number 12
            License State holds only a two-letter code or a short select, so it
            takes the narrower column; Brokerage holds the longest free text.
            License Number keeps a row to itself because its verification notice
            sits directly underneath — sharing the row put explanatory text below
            a neighbouring field it did not belong to.
            Below `sm` the track collapses to one column and every field stacks
            exactly as before — the spans simply stop applying. SettingsField
            takes no className and is shared, so the spans live on local wrappers
            instead of changing that component for every page. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-12">
          <div className="sm:col-span-8">
          <SettingsField label="Brokerage">
            <input value={brokerage} onChange={(e) => setBrokerage(e.target.value)} className={settingsInputCls} />
          </SettingsField>
          </div>
          <div className="sm:col-span-4">
          <SettingsField label="License State">
            {licenseVerified ? (
              <input
                value={licenseState ? `${licenseState} — ${LICENSE_STATE_NAMES[licenseState] ?? ""}`.trim() : "—"}
                readOnly
                aria-readonly
                className={`${settingsInputCls} cursor-not-allowed bg-[#f4f5f8] text-[#4b5162]`}
              />
            ) : (
              <select
                value={licenseState}
                onChange={(e) => requestLicenseStateChange(e.target.value)}
                className={settingsInputCls}
              >
                <option value="">Select a state</option>
                {Object.entries(LICENSE_STATE_NAMES).map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>
            )}
          </SettingsField>
          </div>
          <div className="sm:col-span-12">
          <SettingsField
            label="License Number"
            hint={
              licenseVerified
                ? undefined
                : "Licenses are verified within 3 business days and will not be displayed publicly by Locator Beast. Once verified, your license number cannot be changed."
            }
          >
            {licenseVerified ? (
              <div className="flex items-center gap-2">
                <input
                  value={licenseNumber}
                  readOnly
                  aria-readonly
                  className={`${settingsInputCls} cursor-not-allowed bg-[#f4f5f8] text-[#4b5162]`}
                />
                <span className="inline-flex flex-none items-center gap-1 rounded-full border border-[#0f9d58]/30 bg-[#0f9d58]/10 px-2.5 py-1 text-[12px] font-semibold text-[#0f9d58]">
                  <HiOutlineCheckBadge className="h-3.5 w-3.5" />
                  Verified
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <input value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} className={settingsInputCls} />
                {licenseNumber.trim() && (
                  <span className="inline-flex flex-none items-center rounded-full border border-[#e5e7ee] bg-[#f4f5f8] px-2.5 py-1 text-[12px] font-semibold text-[#9098a8]">
                    Pending verification
                  </span>
                )}
              </div>
            )}
          </SettingsField>
          </div>
        </div>
      </SettingsCard>

      {/* Service Areas — the workspace's selected markets: the SINGLE source of
          truth the Smart Lead Form reads live. No separate save; persisted by
          the Save Changes button below alongside the business fields. */}
      <SettingsCard
        title="Service Areas"
        description={serviceAreasHelperText(licenseState)}
      >
        {areasLoaded ? (
          <>
          <p className="mb-2 text-[12px] font-medium text-[#9098a8]">
            {serviceAreasCountLabel(licenseState, serviceAreas.length)}
          </p>
          {serviceAreas.length === 0 && (
            <p role="alert" className="mb-2 text-[12px] font-semibold text-red-600">
              {MIN_MARKETS_MESSAGE}
            </p>
          )}
          {!licenseState && (
            <p className="mb-2 text-[12px] font-medium text-[#9098a8]">
              Select your License State above to see its markets.
            </p>
          )}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {marketsForState(licenseState).map((m) => {
              const active = serviceAreas.includes(m.slug)
              // Every market stays visible at the cap; only the unselected ones
              // stop responding, so a user can always deselect and swap.
              const blocked = !active && serviceAreas.length >= MAX_SERVICE_AREAS
              return (
                <button
                  key={m.slug}
                  type="button"
                  onClick={() => toggleMarket(m.slug)}
                  aria-pressed={active}
                  disabled={blocked}
                  className={`flex items-center justify-between rounded-xl border px-4 py-3 text-[14px] font-medium transition-colors ${
                    active
                      ? "border-[#2f6bff] bg-[#2f6bff]/5 text-[#111318]"
                      : blocked
                      ? "cursor-not-allowed border-[#eceef3] bg-white text-[#c7ccd6]"
                      : "border-[#e5e7ee] bg-white text-[#111318] hover:border-[#c7ccd6]"
                  }`}
                >
                  <span>
                    {m.name} <span className={blocked ? "text-[#d7dbe4]" : "text-[#9098a8]"}>· {m.state}</span>
                  </span>
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-md border ${
                      active
                        ? "border-[#2f6bff] bg-[#2f6bff] text-white"
                        : blocked
                        ? "border-[#f0f1f5] text-transparent"
                        : "border-[#e5e7ee] text-transparent"
                    }`}
                  >
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                      <path d="M2.5 6.5l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </button>
              )
            })}
          </div>

          {/* ── Primary Market ──────────────────────────────────────────────
              Same checkbox-card design as Service Areas above, deliberately —
              it is the same kind of choice about the same objects, so it should
              not read as a different control. The only difference is that it is
              single-select. It lives INSIDE the Service Areas card because a
              primary is meaningless apart from the selection it belongs to.

              Hidden entirely at one market: that market IS the primary (the save
              path auto-selects it), and offering a list of one is noise. */}
          {serviceAreas.length > 1 && (
            <div className="mt-5 border-t border-[#eceef3] pt-4">
              <p className="text-[13px] font-semibold text-[#111318]">Choose your Primary Market</p>
              <p className="mb-2 mt-0.5 text-[12px] font-medium text-[#9098a8]">
                Used as your default market when no client is selected.
              </p>
              {attemptedSave && !primaryMarket && (
                <p role="alert" className="mb-2 text-[12px] font-semibold text-red-600">
                  Choose your Primary Market.
                </p>
              )}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {marketsForSlugs(serviceAreas).map((m) => {
                  const active = primaryMarket === m.slug
                  return (
                    <button
                      key={m.slug}
                      type="button"
                      // Single-select: checking one unchecks the previous. Clicking
                      // the checked market again is a no-op rather than a clear —
                      // with 2+ markets there must always be a primary, so allowing
                      // it to be emptied would only ever block the save.
                      onClick={() => {
                        setPrimaryMarket(m.slug)
                        setSaved(false)
                        setSaveError(null)
                      }}
                      aria-pressed={active}
                      className={`flex items-center justify-between rounded-xl border px-4 py-3 text-[14px] font-medium transition-colors ${
                        active
                          ? "border-[#2f6bff] bg-[#2f6bff]/5 text-[#111318]"
                          : "border-[#e5e7ee] bg-white text-[#111318] hover:border-[#c7ccd6]"
                      }`}
                    >
                      <span>
                        {m.name} <span className="text-[#9098a8]">· {m.state}</span>
                      </span>
                      <span
                        className={`flex h-5 w-5 items-center justify-center rounded-md border ${
                          active
                            ? "border-[#2f6bff] bg-[#2f6bff] text-white"
                            : "border-[#e5e7ee] text-transparent"
                        }`}
                      >
                        <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                          <path d="M2.5 6.5l2.5 2.5 4.5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          </>
        ) : (
          <p className="text-[13px] text-[#6b7280]">Loading…</p>
        )}
      </SettingsCard>
      </div>

      {/* Time Zone — between Service Areas and Public Form URL. Reuses the shared
          TimezoneSetting control + persistence route; independent of the Save
          Changes button below (it saves through its own timezone route). */}
      <TimezoneSetting initialTimeZone={initial.timeZone} />

      {/* Account security — its own section directly after Time Zone rather than
          buried under the identity card above. Functionality unchanged. */}
      <PasswordSetting email={email} />

      {/* Demo Workspace — moved out of the Getting Started checklist, where it read
          as a required onboarding task. Reuses the existing demo module; the demo
          roster is client-side fixtures, so none of these actions can create,
          overwrite or delete a real lead. */}
      <SettingsCard
        title="Demo Workspace"
        description="Add, reset, or remove sample data without affecting your real leads."
      >
        <div className="flex flex-wrap items-center gap-2">
          {demoMode ? (
            <>
              <button
                type="button"
                disabled={demoBusy}
                onClick={async () => {
                  setDemoBusy(true)
                  await resetDemoWorkspace()
                  setDemoBusy(false)
                  router.refresh()
                }}
                className="rounded-lg border border-[#e5e7ee] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#111318] transition-colors hover:bg-[#f7f8fa] disabled:opacity-60"
              >
                {demoBusy ? "Working…" : "Reset Demo Workspace"}
              </button>
              <button
                type="button"
                disabled={demoBusy}
                onClick={async () => {
                  setDemoBusy(true)
                  await exitDemoWorkspace()
                  setDemoMode(false)
                  setDemoBusy(false)
                  router.refresh()
                }}
                className="rounded-lg border border-red-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60"
              >
                {demoBusy ? "Working…" : "Remove Demo Workspace"}
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={demoBusy}
              onClick={async () => {
                setDemoBusy(true)
                await enterDemoWorkspace()
                setDemoMode(true)
                setDemoBusy(false)
                router.refresh()
              }}
              className="rounded-lg border border-[#e5e7ee] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#111318] transition-colors hover:bg-[#f7f8fa] disabled:opacity-60"
            >
              {demoBusy ? "Working…" : "Add Demo Workspace"}
            </button>
          )}
        </div>
      </SettingsCard>

      {/* The public Smart Form URL used to be repeated here. It is edited and
          copied in the Smart Lead Form editor's Share tab, which is its home —
          duplicating it in Profile meant two places to change one thing. The
          slug, public URL and copy-link all remain there, untouched. */}

      {/* Single Save — persists Business Information + Service Areas together,
          bottom-right of the page. */}
      <div className="flex items-center justify-end gap-3 pb-2">
        {saveError && <span className="max-w-md text-right text-[12.5px] font-semibold text-red-600">{saveError}</span>}
        {saved && <span className="text-[12.5px] font-semibold text-emerald-600">✓ Saved</span>}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex-none rounded-lg bg-[#2f6bff] px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#265fe0] disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>

      {/* Confirm before applying a post-onboarding state change: it clears the
          markets from the old state and resets the Smart Form's market context. */}
      {pendingState && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="lb-state-change-title"
          className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/40 p-4"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 id="lb-state-change-title" className="text-[17px] font-semibold text-[#111318]">
              Change license state?
            </h2>
            <p className="mt-2 text-[13.5px] leading-relaxed text-[#4b5162]">
              Changing your license state will update your available markets and Smart Lead Form.
              You&rsquo;ll need to select new service areas and verify your license for the new
              state.
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingState(null)}
                className="rounded-lg border border-[#e5e7ee] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#111318] transition-colors hover:bg-[#f7f8fa]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  void applyLicenseStateChange(pendingState)
                  setPendingState(null)
                }}
                className="rounded-lg bg-[#2f6bff] px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#265fe0]"
              >
                Change State
              </button>
            </div>
          </div>
        </div>
      )}
    </SettingsShell>
  )
}
