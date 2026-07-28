"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase/client"
import SettingsShell, {
  SettingsCard,
  SettingsField,
  settingsInputCls,
} from "@/components/crm/settings/SettingsShell"

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
  const [photoBusy, setPhotoBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

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
    const first = firstName.trim()
    const last = lastName.trim()
    await supabase
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
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    router.refresh()
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

      {/* Business Information */}
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

      <div className="flex items-center gap-3 pb-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-[#2f6bff] px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#265fe0] disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>
        {saved && <span className="text-[12.5px] font-semibold text-emerald-600">✓ Saved</span>}
      </div>
    </SettingsShell>
  )
}
