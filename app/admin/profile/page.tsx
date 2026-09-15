export const dynamic = "force-dynamic"

import ProfileClient from "@/components/crm/profile/ProfileClient"
import { DEFAULT_TIMEZONE } from "@/lib/timezone"
import { createClient } from "@/lib/supabase/server"
import { resolveAgentIdentityForOwner, iabsComplianceWarning } from "@/lib/notifications/agentSignature"

export default async function ProfilePage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let profile:
    | {
        first_name?: string | null
        last_name?: string | null
        preferred_name?: string | null
        preferred_first_name?: string | null
        preferred_last_name?: string | null
        email?: string | null
        client_contact_email?: string | null
        brokerage?: string | null
        license_number?: string | null
        license_state?: string | null
        demo_mode?: boolean | null
        license_verified_at?: string | null
        phone_number?: string | null
        profile_photo_url?: string | null
        timezone?: string | null
      }
    | null = null

  let iabsWarning: string | null = null

  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("first_name, last_name, preferred_name, preferred_first_name, preferred_last_name, email, client_contact_email, brokerage, license_number, license_state, license_verified_at, phone_number, profile_photo_url, timezone, demo_mode")
      .eq("id", user.id)
      .single()
    profile = data

    // Compliance fail-safe: a Texas agent with no IABS URL configured is warned
    // here rather than ever substituting another brokerage's form on client mail.
    const identity = await resolveAgentIdentityForOwner(supabase, user.id)
    iabsWarning = identity ? iabsComplianceWarning(identity) : null
  }

  return (
    <>
      {iabsWarning ? (
        <div
          role="alert"
          style={{
            margin: "0 auto 16px",
            maxWidth: 720,
            padding: "12px 16px",
            borderRadius: 12,
            border: "1px solid #f0c36d",
            background: "#fff8e6",
            color: "#7a5b00",
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          <strong>Action needed — Texas IABS form: </strong>
          {iabsWarning}
        </div>
      ) : null}
      <ProfileClient
      userId={user?.id ?? ""}
      initial={{
        firstName: profile?.first_name ?? "",
        lastName: profile?.last_name ?? "",
        preferredFirstName: profile?.preferred_first_name ?? "",
        preferredLastName: profile?.preferred_last_name ?? "",
        brokerage: profile?.brokerage ?? "",
        licenseNumber: profile?.license_number ?? "",
        licenseState: profile?.license_state ?? "",
        demoMode: !!profile?.demo_mode,
        licenseVerifiedAt: profile?.license_verified_at ?? null,
        phone: profile?.phone_number ?? "",
        email: profile?.email ?? user?.email ?? "",
        clientContactEmail: profile?.client_contact_email ?? "",
        photoUrl: profile?.profile_photo_url ?? null,
        timeZone: (profile?.timezone ?? "").trim() || DEFAULT_TIMEZONE,
      }}
    />
    </>
  )
}
