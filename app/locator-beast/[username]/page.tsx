import { notFound } from "next/navigation"
import { buildInitialSmartFormConfig } from "@/app/smart-lead-form/_lib/initialConfig"
import { createClient } from "@/lib/supabase/server"
import SmartLeadForm from "@/app/smart-lead-form/_components/form/SmartLeadForm"
import { mergeSmartFormConfig } from "@/app/smart-lead-form/_lib/mergeConfig"
import type { SmartLeadFormConfig } from "@/app/smart-lead-form/_lib/types"

export const dynamic = "force-dynamic"

const CANONICAL_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL || "https://locatorbeast.com"

// Minimal, image-first link preview. The visual is the per-agent opengraph-image.tsx
// (Next wires og:image + twitter:image from it automatically, as an absolute URL via
// metadataBase). Title is locator-specific; NO description (summary_large_image renders
// image-first, and long marketing copy is intentionally avoided).
export async function generateMetadata({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  let agentName: string | null = null
  try {
    const supabase = await createClient()
    const { data } = await supabase.rpc("lb_resolve_public_form", { p_username: username })
    const form = (Array.isArray(data) ? data[0] : data) as { agent_name?: string | null } | undefined
    agentName = form?.agent_name?.trim() || null
  } catch {
    /* preview metadata must never fail the page */
  }
  const title = agentName ? `${agentName} | Free Apartment Search` : "Free Apartment Search"
  return {
    metadataBase: new URL(CANONICAL_ORIGIN),
    title,
    openGraph: { title, type: "website" as const, siteName: "Locator Beast" },
    twitter: { card: "summary_large_image" as const, title },
  }
}

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
// precedence over this dynamic segment.
//
// Every account has ONE always-live Smart Form: there is no draft/published
// split. The form renders whenever the slug resolves to a workspace — it renders
// the latest SAVED config (merged over defaults), so `published_at` is NOT a
// gate. Only an unknown/invalid slug (no row) or an RPC error 404s.
export default async function PublicSmartLeadFormPage({
  params,
}: {
  params: Promise<{ username: string }>
}) {
  const { username } = await params

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("lb_resolve_public_form", { p_username: username })

  const form = (Array.isArray(data) ? data[0] : data) as PublicForm | undefined
  // Only an unknown slug (no workspace) or a resolver error 404s — never an
  // "unpublished" state, which no longer exists.
  if (error || !form) {
    notFound()
  }

  // Render the agent's OWN published config, with the field toggles they chose,
  // over sane defaults. Agent identity (name/brokerage/photo) always comes from
  // the live profile so it reflects account edits rather than stale editor copy.
  // A workspace with NO saved config must not fall through to DEFAULT_CONFIG on a
  // PUBLIC page: those defaults carry the three sample testimonials attributed to
  // named people in Austin, Dallas and Houston, plus the sample headline and
  // phone. On a real agent's live form they read as genuine reviews. Build the
  // same starting config the creation path produces instead — headline and
  // testimonials off, identity from this agent's own record.
  const saved = form.form_config
    ? mergeSmartFormConfig(form.form_config)
    : buildInitialSmartFormConfig({
        agentName: form.agent_name,
        brokerageName: form.brokerage_name,
        serviceAreas: form.service_areas,
      })
  const config: SmartLeadFormConfig = {
    ...saved,
    branding: {
      ...saved.branding,
      // Single source of truth: the agent photo is ALWAYS the live profile photo
      // (profiles.profile_photo_url, returned as form.photo_url). We do NOT fall
      // back to a stale config snapshot — when the profile has no photo, the form
      // shows the initials fallback.
      agentPhotoUrl: form.photo_url,
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
