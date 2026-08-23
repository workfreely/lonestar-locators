/**
 * One-time backfill: give every existing workspace a personalized Smart Form
 * config where it currently has none.
 *
 * Safety guarantees:
 *   • Only touches rows where smart_form_config IS NULL (never overwrites an
 *     existing form — enforced both in the SELECT and again in the UPDATE .is()).
 *   • Uses the workspace/profile data already on file; every field falls back to
 *     the DEFAULT_CONFIG value when the source data is missing.
 *   • Default hero background comes from the FIRST selected market via the exact
 *     same defaultThemeForMarkets() the app uses — no duplicated mapping.
 *
 * Run:  node --env-file=.env.local --import tsx ./scripts/backfill-smart-forms.ts
 *       (add --commit to actually write; default is a dry run)
 */
import { createClient } from "@supabase/supabase-js"
import { buildInitialSmartFormConfig } from "@/app/smart-lead-form/_lib/initialConfig"
import { defaultThemeForMarkets } from "@/lib/markets/catalog"
import { displayFullName } from "@bc/companion-shared"

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !SERVICE_ROLE) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}
const COMMIT = process.argv.includes("--commit")

const db = createClient(URL, SERVICE_ROLE, { auth: { persistSession: false } })

type Profile = {
  preferred_name: string | null
  preferred_first_name: string | null
  preferred_last_name: string | null
  first_name: string | null
  last_name: string | null
  brokerage: string | null
  business_name: string | null
  phone_number: string | null
  profile_photo_url: string | null
}

const trimmed = (v: string | null | undefined) => {
  const t = (v ?? "").trim()
  return t.length ? t : undefined
}

async function main() {
  const { data: workspaces, error } = await db
    .from("workspaces")
    .select("id, slug, service_areas, created_by, smart_form_config")
    .is("smart_form_config", null)
  if (error) throw error

  console.log(`\n${COMMIT ? "COMMIT" : "DRY RUN"} — ${workspaces?.length ?? 0} null-config workspace(s)\n`)

  for (const ws of workspaces ?? []) {
    const { data: p } = await db
      .from("profiles")
      .select("preferred_name, preferred_first_name, preferred_last_name, first_name, last_name, brokerage, business_name, phone_number, profile_photo_url")
      .eq("id", ws.created_by)
      .maybeSingle<Profile>()

    const serviceAreas: string[] = Array.isArray(ws.service_areas) ? ws.service_areas : []

    const agentName =
      trimmed(
        displayFullName({
          preferredFirst: p?.preferred_first_name,
          preferredLast: p?.preferred_last_name,
          legalFirst: p?.first_name,
          legalLast: p?.last_name,
        }),
      ) ?? trimmed(p?.preferred_name)
    const brokerageName = trimmed(p?.brokerage) ?? trimmed(p?.business_name)
    const phone = trimmed(p?.phone_number)

    // Same builder onboarding uses — full config personalized over DEFAULT_CONFIG.
    const full = buildInitialSmartFormConfig({
      agentName,
      brokerageName,
      phoneNumber: phone,
      profilePhotoUrl: trimmed(p?.profile_photo_url),
      serviceAreas,
    })

    const heroTheme = defaultThemeForMarkets(serviceAreas) ?? undefined
    console.log(`• ${ws.slug ?? "(no slug)"}  name=${agentName ?? "—"}  brokerage=${brokerageName ?? "—"}  phone=${phone ?? "—"}  markets=[${serviceAreas.join(", ")}]  heroBackground=${heroTheme ?? "custom(default)"}`)

    if (COMMIT) {
      const { error: uerr, count } = await db
        .from("workspaces")
        .update({ smart_form_config: full }, { count: "exact" })
        .eq("id", ws.id)
        .is("smart_form_config", null) // guard: never overwrite an existing config
      if (uerr) console.error(`   ✗ update failed: ${uerr.message}`)
      else console.log(`   ✓ updated (${count} row)`)
    }
  }

  console.log(`\n${COMMIT ? "Backfill complete." : "Dry run only — re-run with --commit to write."}\n`)
}

main().catch((e) => {
  console.error("Backfill failed:", e)
  process.exit(1)
})
