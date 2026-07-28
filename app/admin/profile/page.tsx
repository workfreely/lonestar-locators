export const dynamic = "force-dynamic"

import ProfileClient from "@/components/crm/profile/ProfileClient"
import { createClient } from "@/lib/supabase/server"

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
        email?: string | null
        brokerage?: string | null
        license_number?: string | null
        phone_number?: string | null
        profile_photo_url?: string | null
      }
    | null = null

  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("first_name, last_name, preferred_name, email, brokerage, license_number, phone_number, profile_photo_url")
      .eq("id", user.id)
      .single()
    profile = data
  }

  return (
    <ProfileClient
      userId={user?.id ?? ""}
      initial={{
        firstName: profile?.first_name ?? "",
        lastName: profile?.last_name ?? "",
        preferredName: profile?.preferred_name ?? "",
        brokerage: profile?.brokerage ?? "",
        licenseNumber: profile?.license_number ?? "",
        phone: profile?.phone_number ?? "",
        email: profile?.email ?? user?.email ?? "",
        photoUrl: profile?.profile_photo_url ?? null,
      }}
    />
  )
}
