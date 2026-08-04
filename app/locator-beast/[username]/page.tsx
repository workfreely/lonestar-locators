import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import SmartLeadForm from "@/app/smart-lead-form/_components/form/SmartLeadForm"
import { DEFAULT_CONFIG } from "@/app/smart-lead-form/_lib/defaultConfig"
import type { SmartLeadFormConfig } from "@/app/smart-lead-form/_lib/types"

export const dynamic = "force-dynamic"

type PublicForm = {
  workspace_id: string
  owner_user_id: string
  agent_name: string
  brokerage_name: string | null
  photo_url: string | null
  service_areas: string[]
}

// Public per-agent Smart Lead Form — served at locatorbeast.com/{username}
// (rewritten to /locator-beast/{username} on the marketing host). The username
// is the workspace's public slug; everything shown is resolved SERVER-SIDE from
// public branding only (lb_resolve_public_form) — no private data, no client
// trust. Real marketing pages (features, pricing, …) are explicit sibling
// routes and take precedence over this dynamic segment.
export default async function PublicSmartLeadFormPage({
  params,
}: {
  params: Promise<{ username: string }>
}) {
  const { username } = await params

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("lb_resolve_public_form", { p_username: username })

  const form = (Array.isArray(data) ? data[0] : data) as PublicForm | undefined
  if (error || !form) {
    notFound()
  }

  // Build the render config from the shared default + the agent's real branding.
  // Testimonials are hidden (the default set is placeholder copy — never show
  // fabricated social proof on a real agent's page); the FAQ is generic/accurate.
  const config: SmartLeadFormConfig = {
    ...DEFAULT_CONFIG,
    sections: {
      ...DEFAULT_CONFIG.sections,
      visibility: {
        ...DEFAULT_CONFIG.sections.visibility,
        testimonials: false,
      },
    },
    branding: {
      ...DEFAULT_CONFIG.branding,
      agentPhotoUrl: form.photo_url ?? DEFAULT_CONFIG.branding.agentPhotoUrl,
    },
    copy: {
      ...DEFAULT_CONFIG.copy,
      agentName: form.agent_name,
      brokerageName: form.brokerage_name ?? DEFAULT_CONFIG.copy.brokerageName,
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
