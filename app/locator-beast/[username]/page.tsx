import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import SmartLeadForm from "@/app/smart-lead-form/_components/form/SmartLeadForm"
import { mergeSmartFormConfig } from "@/app/smart-lead-form/_lib/mergeConfig"
import type { SmartLeadFormConfig } from "@/app/smart-lead-form/_lib/types"

export const dynamic = "force-dynamic"

type PublicForm = {
  workspace_id: string
  owner_user_id: string
  agent_name: string
  brokerage_name: string | null
  photo_url: string | null
  service_areas: string[]
  form_config: unknown
  published_at: string | null
}

// Public per-agent Smart Lead Form — served at locatorbeast.com/{username}
// (rewritten to /locator-beast/{username} on the marketing host). The username
// is the workspace's public slug; everything is resolved SERVER-SIDE from public
// data only (lb_resolve_public_form) — no private data, no client trust. Real
// marketing pages (features, pricing, …) are explicit sibling routes and take
// precedence over this dynamic segment. Only PUBLISHED forms render.
export default async function PublicSmartLeadFormPage({
  params,
}: {
  params: Promise<{ username: string }>
}) {
  const { username } = await params

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("lb_resolve_public_form", { p_username: username })

  const form = (Array.isArray(data) ? data[0] : data) as PublicForm | undefined
  // Not found, or the form hasn't been published yet → 404 (no public page).
  if (error || !form || !form.published_at) {
    notFound()
  }

  // Render the agent's OWN published config, with the field toggles they chose,
  // over sane defaults. Agent identity (name/brokerage/photo) always comes from
  // the live profile so it reflects account edits rather than stale editor copy.
  const saved = mergeSmartFormConfig(form.form_config)
  const config: SmartLeadFormConfig = {
    ...saved,
    branding: {
      ...saved.branding,
      agentPhotoUrl: form.photo_url ?? saved.branding.agentPhotoUrl,
    },
    copy: {
      ...saved.copy,
      agentName: form.agent_name,
      brokerageName: form.brokerage_name ?? saved.copy.brokerageName,
    },
  }

  return (
    <SmartLeadForm
      config={config}
      serviceAreaSlugs={form.service_areas}
      submitUsername={username}
    />
  )
}
