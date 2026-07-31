"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase/client"
import SettingsShell, {
  SettingsCard,
  SettingsField,
  settingsInputCls,
} from "@/components/crm/settings/SettingsShell"
import { MARKET_OPTIONS } from "@/lib/markets/catalog"
import {
  toRpcFailure,
  userMessageForServiceAreaError,
  likelyCause,
  gatherWorkspaceDiagnostics,
} from "@/lib/supabase/serviceAreasDiagnostics"

type ProfileInitial = {
  firstName: string
  lastName: string
  preferredName: string
  brokerage: string
  licenseNumber: string
  phone: string
  email: string
  photoUrl: string | null
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
  const [preferredName, setPreferredName] = useState(initial.preferredName)
  const [brokerage, setBrokerage] = useState(initial.brokerage)
  const [licenseNumber, setLicenseNumber] = useState(initial.licenseNumber)
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
  const [publicSlug, setPublicSlug] = useState<string | null>(null)
  const [areasLoaded, setAreasLoaded] = useState(false)

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data } = await supabase.rpc("get_current_workspace")
      if (!active) return
      const row = Array.isArray(data) ? data[0] : data
      setServiceAreas(row?.service_areas ?? [])
      setPublicSlug(row?.slug ?? null)
      setAreasLoaded(true)
    })()
    return () => {
      active = false
    }
  }, [])

  function toggleMarket(slugKey: string) {
    setSaved(false)
    setSaveError(null)
    setServiceAreas((prev) =>
      prev.includes(slugKey) ? prev.filter((s) => s !== slugKey) : [...prev, slugKey]
    )
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
          preferred_name: preferredName.trim(),
          brokerage: brokerage.trim(),
          license_number: licenseNumber.trim(),
          phone_number: phone.trim(),
          email: email.trim(),
        })
        .eq("id", userId)

      const {
        data: areasData,
        error: areasError,
        status: areasStatus,
        statusText: areasStatusText,
      } = await supabase.rpc("set_workspace_service_areas", { p_areas: serviceAreas })

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
    <SettingsShell
      title="Profile"
      description="Your identity and business details. These appear on guest cards, email & SMS templates, and throughout the CRM."
    >
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

      {/* Legal Information */}
      <SettingsCard title="Legal Information" description="Used for account verification and identity purposes.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SettingsField label="Legal First Name">
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className={settingsInputCls} />
          </SettingsField>
          <SettingsField label="Legal Last Name">
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} className={settingsInputCls} />
          </SettingsField>
        </div>
        <div className="mt-4">
          <SettingsField
            label="Preferred Name"
            hint="This is the name shown throughout Locator Beast — on guest cards, email & SMS templates, AI messages, and your dashboard."
          >
            <input value={preferredName} onChange={(e) => setPreferredName(e.target.value)} placeholder="e.g. Bob" className={settingsInputCls} />
          </SettingsField>
        </div>
      </SettingsCard>

      {/* Business Information + Service Areas — one cohesive business-profile
          group (tighter spacing), saved together by the single Save Changes
          button below. */}
      <div className="space-y-4">
      <SettingsCard
        title="Business Information"
        description="Used throughout the CRM for generated documents, email templates, guest cards, and communications."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SettingsField label="Brokerage">
            <input value={brokerage} onChange={(e) => setBrokerage(e.target.value)} className={settingsInputCls} />
          </SettingsField>
          <SettingsField label="License Number">
            <input value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} className={settingsInputCls} />
          </SettingsField>
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

      {/* Service Areas — the workspace's selected markets: the SINGLE source of
          truth the Smart Lead Form reads live. No separate save; persisted by
          the Save Changes button below alongside the business fields. */}
      <SettingsCard
        title="Service Areas"
        description="Choose the markets you serve. Your Smart Lead Form shows only these cities and their neighborhoods — changes apply instantly."
      >
        {areasLoaded ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {MARKET_OPTIONS.map((m) => {
              const active = serviceAreas.includes(m.slug)
              return (
                <button
                  key={m.slug}
                  type="button"
                  onClick={() => toggleMarket(m.slug)}
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
                      active ? "border-[#2f6bff] bg-[#2f6bff] text-white" : "border-[#e5e7ee] text-transparent"
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
        ) : (
          <p className="text-[13px] text-[#6b7280]">Loading…</p>
        )}
      </SettingsCard>
      </div>

      {publicSlug && (
        <SettingsCard
          title="Public form URL"
          description="Your permanent Smart Lead Form link. It never changes when you update service areas."
        >
          <p className="rounded-lg border border-[#e5e7ee] bg-[#f4f5f8] px-4 py-2.5 font-mono text-[13px] text-[#111318]">
            locatorbeast.com/{publicSlug}
          </p>
        </SettingsCard>
      )}

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
    </SettingsShell>
  )
}
