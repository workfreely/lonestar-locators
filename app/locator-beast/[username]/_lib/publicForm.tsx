// The public Smart Lead Form, shared by BOTH public routes:
//   /{username}          — the base link
//   /{username}/{source}  — the clean branded source link (…/tt, …/ig, …)
//
// Extracted so the branded route RENDERS THE SAME FORM rather than redirecting to it. There is no
// intermediate page and no second request: the source segment only decides which utm_source is
// handed to the form, so the visitor experiences "tap link → form", identical to the base URL.
// Keeping one implementation also means the two routes cannot drift apart in config resolution,
// agent identity or 404 behaviour.

import { notFound } from "next/navigation"
import { buildInitialSmartFormConfig } from "@/app/smart-lead-form/_lib/initialConfig"
import { createClient } from "@/lib/supabase/server"
import SmartLeadForm from "@/app/smart-lead-form/_components/form/SmartLeadForm"
import { slugAllowedForWorkspace, SECOND_CHANCE_SLUGS } from "@/app/smart-lead-form/_lib/shareConfig"
import { mergeSmartFormConfig } from "@/app/smart-lead-form/_lib/mergeConfig"
import type { SmartLeadFormConfig } from "@/app/smart-lead-form/_lib/types"

export const CANONICAL_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL || "https://locatorbeast.com"

export type PublicForm = {
  workspace_id: string
  owner_user_id: string
  agent_name: string
  brokerage_name: string | null
  photo_url: string | null
  service_areas: string[]
  form_config: unknown
  published_at: string | null
}

/** Link-preview metadata for a public form URL. Shared so a branded link previews exactly like the
 *  base link — same title, same per-agent opengraph image. */
export async function publicFormMetadata(username: string) {
  let agentName: string | null = null
  try {
    const supabase = await createClient()
    const { data } = await supabase.rpc("lb_resolve_public_form", { p_username: username })
    const form = (Array.isArray(data) ? data[0] : data) as { agent_name?: string | null } | undefined
    agentName = form?.agent_name?.trim() || null
  } catch {
    /* preview metadata must never fail the page */
  }
  // Kept short deliberately: this is the line iMessage prints UNDER the image, where
  // it is truncated with an ellipsis rather than wrapped. "Jay Morris | Free Search"
  // is 24 characters and survives the narrowest preview width.
  const title = agentName ? `${agentName} | Free Search` : "Free Search"
  return {
    metadataBase: new URL(CANONICAL_ORIGIN),
    title,
    openGraph: { title, type: "website" as const, siteName: "Locator Beast" },
    twitter: { card: "summary_large_image" as const, title },
  }
}

/**
 * Resolve the agent and render their form. `pathUtmSource` is the attribution implied by a branded
 * URL; it is passed to the form as a FALLBACK only — a query-string utm_source still wins, so every
 * long link already in the wild behaves exactly as before.
 */
/**
 * Per-slug hero copy. Only the three lines differ; the headline is restated rather than left
 * implicit, so that if the agent later edits their own headline this variant keeps the one
 * approved for it.
 */
const SECOND_CHANCE_LINES = {
  headline: "Stop Wasting Time Searching for Apartments",
  subheadline: "Find 2nd Chance Apartments That Work for You",
  supportingLine: "Bad Credit \u2022 No Credit \u2022 Broken Lease",
}

// Built FROM the slug list rather than spelled out per slug: the primary URL and the legacy alias
// are the same page, so their copy cannot drift and a new alias cannot silently render the
// ordinary form under a second-chance link.
const SECOND_CHANCE_COPY: Record<string, typeof SECOND_CHANCE_LINES> = Object.fromEntries(
  SECOND_CHANCE_SLUGS.map((slug) => [slug, SECOND_CHANCE_LINES]),
)

export default async function PublicFormView({
  username,
  pathUtmSource,
  sourceSlug,
}: {
  username: string
  pathUtmSource?: string
  /** The public slug from the URL, when this is a /{username}/{slug} request. */
  sourceSlug?: string
}) {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("lb_resolve_public_form", { p_username: username })

  const form = (Array.isArray(data) ? data[0] : data) as PublicForm | undefined
  // Only an unknown slug (no workspace) or a resolver error 404s — never an
  // "unpublished" state, which no longer exists.
  if (error || !form) {
    notFound()
  }

  // ADMIN-ONLY SLUGS. The workspace is resolved SERVER-SIDE from the username, so another
  // subscriber substituting their own slug resolves to their own workspace and fails here.
  // 404 rather than quietly serving the ordinary form: a silent fallback would leave an
  // unauthorized link working and attributing leads to a source that is not theirs.
  if (sourceSlug && !slugAllowedForWorkspace(sourceSlug, form.workspace_id)) {
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
      // SOURCE-AWARE COPY — three lines and nothing else. Everything the agent configured
      // (highlights, reassurance, fields, testimonials, FAQs, branding) is already in `saved`
      // and untouched, so this variant cannot drift from the regular form as that config
      // changes. The guard above has already established the workspace is authorised.
      ...(sourceSlug ? SECOND_CHANCE_COPY[sourceSlug] ?? {} : {}),
    },
  }

  return (
    <SmartLeadForm
      config={config}
      serviceAreaSlugs={form.service_areas}
      submitUsername={username}
      pathUtmSource={pathUtmSource}
    />
  )
}
