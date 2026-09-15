// Shared, reusable compliance + signature component for every PROSPECTIVE-CLIENT-
// facing Locator Beast deliverable (renter confirmation email, guest card email +
// PDF, and any future renter-facing template). Built ONCE here and consumed by
// each surface so the Texas IABS disclosure and the agent signature can never
// drift between templates.
//
// Two rendering targets share one resolved identity + one Texas/IABS decision:
//   • renderClientSignatureHtml()  → HTML emails
//   • buildClientSignatureText()   → plain-text (guest-card mailto body) + a data
//                                     source the jsPDF guest card draws from
//
// Nothing here is hard-coded to any single agent/brokerage: every value is
// resolved from the correct workspace owner's profile + workspace + Smart Lead
// Form config. The IABS URL reuses the existing per-workspace setting
// (smart_form_config.footer.iabsUrl) — no new/duplicate field.

import type { SupabaseClient } from "@supabase/supabase-js"
import { marketsForSlugs, serviceAreasLabel, getMarketByName } from "@/lib/markets/catalog"
import { BRAND } from "./branding"
import { esc } from "./layout"
import { displayFullName } from "@bc/companion-shared"

// The exact TREC-required disclosure sentence. The form name is a link when an
// IABS URL is configured; otherwise it stays plain text (never a substituted URL).
export const IABS_DISCLOSURE_PREFIX = "Texas law requires all license holders to provide the "
export const IABS_FORM_LABEL = "Information About Brokerage Services form"
export const IABS_DISCLOSURE_SUFFIX = " to prospective clients."
export const IABS_DISCLOSURE_PLAINTEXT =
  IABS_DISCLOSURE_PREFIX + IABS_FORM_LABEL + IABS_DISCLOSURE_SUFFIX

// Title shown when the agent hasn't set one on their Smart Lead Form.
export const DEFAULT_AGENT_TITLE = "Apartment Locator"

export type ResolvedAgentIdentity = {
  name: string | null
  title: string // never blank — defaults to DEFAULT_AGENT_TITLE
  brokerage: string | null
  serviceAreas: string | null
  phone: string | null
  email: string | null
  website: string | null // normalized to include a protocol
  photoUrl: string | null
  logoUrl: string | null // brokerage logo — only when configured
  iabsUrl: string | null // normalized to include a protocol
  /** The agent's own coverage includes a Texas market. */
  servesTexas: boolean
}

// ── Pure builder (no I/O) — normalizes raw fields into an identity ────────────
// Kept pure so it is trivially testable and usable from fixtures/previews.
export type RawIdentityInput = {
  profile?: {
    preferred_name?: string | null
    preferred_first_name?: string | null
    preferred_last_name?: string | null
    first_name?: string | null
    last_name?: string | null
    full_name?: string | null
    brokerage?: string | null
    business_name?: string | null
    phone_number?: string | null
    /** Locator Beast account/login email — NOT client-facing on its own. */
    email?: string | null
    /** Dedicated client-facing contact email (preferred for lead-facing surfaces). */
    client_contact_email?: string | null
    profile_photo_url?: string | null
    business_logo_url?: string | null
  } | null
  workspace?: {
    name?: string | null
    website?: string | null
    logo_url?: string | null
    phone?: string | null
    email?: string | null
    service_areas?: string[] | null
    smart_form_config?: unknown
  } | null
  /** Optional pre-parsed config (tests/previews); otherwise read from workspace. */
  config?: SmartFormConfigSlice | null
}

type SmartFormConfigSlice = {
  copy?: { agentTitle?: string | null; brokerageName?: string | null; serviceAreas?: string | null; phoneNumber?: string | null } | null
  branding?: { agentPhotoUrl?: string | null; logoUrl?: string | null } | null
  footer?: { iabsUrl?: string | null; brokerageWebsiteUrl?: string | null } | null
}

const clean = (v: string | null | undefined): string | null => {
  const t = (v ?? "").trim()
  return t.length ? t : null
}

// Prepend https:// when a URL is missing a scheme, so links open correctly.
const withProtocol = (v: string | null | undefined): string | null => {
  const t = clean(v)
  if (!t) return null
  return /^https?:\/\//i.test(t) ? t : `https://${t}`
}

export function buildAgentIdentity(input: RawIdentityInput): ResolvedAgentIdentity {
  const p = input.profile ?? {}
  const w = input.workspace ?? {}
  const cfg: SmartFormConfigSlice =
    input.config ?? ((w.smart_form_config as SmartFormConfigSlice | undefined) ?? {})

  // Shared display rule — preferred first/last resolved independently over the
  // legal name. `preferred_name` remains the fallback for legacy rows whose
  // free-text value could not be split safely.
  const structured = clean(
    displayFullName({
      preferredFirst: p.preferred_first_name,
      preferredLast: p.preferred_last_name,
      legalFirst: p.first_name,
      legalLast: p.last_name,
    }),
  )
  const legalFull = clean([p.first_name, p.last_name].filter(Boolean).join(" ")) ?? clean(p.full_name)
  const name = structured ?? clean(p.preferred_name) ?? legalFull

  const slugs = w.service_areas ?? null
  const areaLabelFromSlugs = clean(serviceAreasLabel(slugs))
  const servesTexas = marketsForSlugs(slugs).some((m) => m.state === "TX")

  return {
    name,
    title: clean(cfg.copy?.agentTitle) ?? DEFAULT_AGENT_TITLE,
    brokerage:
      clean(p.brokerage) ?? clean(p.business_name) ?? clean(w.name) ?? clean(cfg.copy?.brokerageName),
    serviceAreas: areaLabelFromSlugs ?? clean(cfg.copy?.serviceAreas),
    phone: clean(p.phone_number) ?? clean(w.phone) ?? clean(cfg.copy?.phoneNumber),
    // One email for most agents: the account/profile email is the client-facing
    // email by default. The optional Client Contact Email is an override only, so
    // resolution is simply client_contact_email -> profiles.email. (The account
    // email is profiles.email; changing the client contact email never touches
    // authentication, which lives in Supabase auth, not this column.)
    email: clean(p.client_contact_email) ?? clean(p.email),
    website: withProtocol(w.website) ?? withProtocol(cfg.footer?.brokerageWebsiteUrl),
    // Single source of truth — the agent photo is ALWAYS the live profile photo.
    // No Smart-Form-config fallback (that separate field is not maintained).
    photoUrl: clean(p.profile_photo_url),
    logoUrl: clean(p.business_logo_url) ?? clean(w.logo_url) ?? clean(cfg.branding?.logoUrl),
    iabsUrl: withProtocol(cfg.footer?.iabsUrl),
    servesTexas,
  }
}

// ── DB resolver ──────────────────────────────────────────────────────────────
// Resolves the identity for a specific workspace OWNER (renter email = the
// attributed owner; guest card = the signed-in locator). Uses whatever client is
// passed (service-role admin on the server intake path, or the request-scoped
// client for the logged-in locator). Returns null only if the profile is absent.
export async function resolveAgentIdentityForOwner(
  supabase: SupabaseClient,
  ownerId: string,
): Promise<ResolvedAgentIdentity | null> {
  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "preferred_name, preferred_first_name, preferred_last_name, first_name, last_name, full_name, brokerage, business_name, phone_number, email, client_contact_email, profile_photo_url, business_logo_url",
    )
    .eq("id", ownerId)
    .maybeSingle()
  if (!profile) return null

  // The owner's workspace carries service areas, website, logo, and the Smart
  // Lead Form config (which holds the IABS URL + agent title).
  const { data: member } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", ownerId)
    .limit(1)
    .maybeSingle()

  let workspace: RawIdentityInput["workspace"] = null
  if (member?.workspace_id) {
    const { data: ws } = await supabase
      .from("workspaces")
      .select("name, website, logo_url, phone, email, service_areas, smart_form_config")
      .eq("id", member.workspace_id)
      .maybeSingle()
    workspace = ws ?? null
  }

  return buildAgentIdentity({ profile, workspace })
}

// ── Texas / IABS decisioning ─────────────────────────────────────────────────

/** Whether a lead's stored city maps to a Texas market (leads store no state). */
export function leadCityIsTexas(city: string | null | undefined): boolean {
  const c = clean(city)
  return c ? getMarketByName(c)?.state === "TX" : false
}

export type IabsDecision = {
  /** Render the disclosure at all. */
  show: boolean
  /** True when the disclosure is legally expected but no IABS URL is configured. */
  missingUrl: boolean
}

// Show the disclosure when there is a Texas context (the lead's market is TX or
// the agent serves a TX market) OR the agent has explicitly configured an IABS
// URL. Never show a Texas-specific disclosure for a purely non-Texas account.
export function decideIabs(
  identity: ResolvedAgentIdentity,
  opts: { leadCity?: string | null } = {},
): IabsDecision {
  const texasContext = identity.servesTexas || leadCityIsTexas(opts.leadCity)
  const hasUrl = !!identity.iabsUrl
  const show = texasContext || hasUrl
  return { show, missingUrl: texasContext && !hasUrl }
}

/**
 * Agent-facing compliance warning for Settings/Profile: returns a message when a
 * Texas agent has no IABS URL configured (never substitute another brokerage's
 * form). Returns null when compliant or not a Texas context.
 */
export function iabsComplianceWarning(identity: ResolvedAgentIdentity): string | null {
  if (identity.servesTexas && !identity.iabsUrl) {
    return "You operate in a Texas market but haven't set your Information About Brokerage Services (IABS) URL. Texas law requires it on client-facing emails and guest cards. Add your brokerage's IABS document link in your Smart Lead Form settings so it appears on outgoing client materials."
  }
  return null
}

// ── Renderers ────────────────────────────────────────────────────────────────

function initials(name: string | null): string {
  if (!name) return "•"
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const chars = (parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")
  return chars.toUpperCase() || "•"
}

// Plain-text disclosure line (guest-card body). The URL is appended in
// parentheses only when configured — no fabricated/substituted link.
export function buildIabsDisclosureText(identity: ResolvedAgentIdentity): string {
  return identity.iabsUrl
    ? `${IABS_DISCLOSURE_PLAINTEXT} (${identity.iabsUrl})`
    : IABS_DISCLOSURE_PLAINTEXT
}

/**
 * Plain-text disclosure + signature for the guest-card email body. `showDisclosure`
 * comes from decideIabs(). Omits every missing optional line; never prints blanks.
 */
export function buildClientSignatureText(
  identity: ResolvedAgentIdentity,
  opts: { showDisclosure: boolean },
): string {
  const lines: string[] = []
  if (opts.showDisclosure) {
    lines.push(buildIabsDisclosureText(identity), "")
  }
  lines.push("──────────────────────────────", "")
  if (identity.name) lines.push(identity.name)
  lines.push(identity.title)
  if (identity.brokerage) lines.push(identity.brokerage)
  if (identity.serviceAreas) lines.push(`Serving ${identity.serviceAreas}`)
  if (identity.phone) lines.push(identity.phone)
  if (identity.email) lines.push(identity.email)
  if (identity.website) lines.push(identity.website)
  return lines.join("\n")
}

/**
 * HTML disclosure + signature block for emails. `showDisclosure` from decideIabs().
 * Fallbacks: no photo → initials avatar; no logo/website/service areas → omitted.
 * The IABS form name is a real link only when a URL is configured; otherwise it
 * renders as plain text (fail-safe — never another brokerage's form).
 */
export function renderClientSignatureHtml(
  identity: ResolvedAgentIdentity,
  opts: { showDisclosure: boolean },
): string {
  const formName = identity.iabsUrl
    ? `<a href="${identity.iabsUrl}" target="_blank" rel="noopener noreferrer" style="color:${BRAND.blue};text-decoration:underline;">${IABS_FORM_LABEL}</a>`
    : IABS_FORM_LABEL

  const disclosure = opts.showDisclosure
    ? `<p style="margin:0 0 18px 0;padding:12px 14px;background:#f6f8fb;border-radius:8px;font-size:12px;line-height:1.5;color:${BRAND.inkSoft};">${esc(
        IABS_DISCLOSURE_PREFIX,
      )}${formName}${esc(IABS_DISCLOSURE_SUFFIX)}</p>`
    : ""

  // Larger, prominent profile image on TOP (circular, no distortion). 72px reads
  // as a real headshot rather than a tiny avatar, and stays mobile-safe.
  const avatarSize = 72
  const avatar = identity.photoUrl
    ? `<img src="${identity.photoUrl}" width="${avatarSize}" height="${avatarSize}" alt="" style="display:block;width:${avatarSize}px;height:${avatarSize}px;border-radius:9999px;object-fit:cover;border:0;" />`
    : `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${avatarSize}" height="${avatarSize}" style="width:${avatarSize}px;height:${avatarSize}px;"><tr><td align="center" valign="middle" bgcolor="${BRAND.ink}" style="width:${avatarSize}px;height:${avatarSize}px;border-radius:9999px;background:${BRAND.ink};color:#ffffff;font-size:26px;font-weight:700;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">${esc(
        initials(identity.name),
      )}</td></tr></table>`

  // Identity block — name / title / brokerage stacked tightly as one unit.
  const identityLines: string[] = []
  if (identity.name)
    identityLines.push(
      `<div style="font-size:18px;font-weight:700;color:${BRAND.ink};line-height:1.35;">${esc(identity.name)}</div>`,
    )
  identityLines.push(`<div style="font-size:14.5px;line-height:1.55;color:${BRAND.inkSoft};">${esc(identity.title)}</div>`)
  if (identity.brokerage)
    identityLines.push(`<div style="font-size:14.5px;line-height:1.55;color:${BRAND.inkSoft};">${esc(identity.brokerage)}</div>`)

  // Serving line — sits BELOW the identity block, separated, so it never
  // competes with the name/brokerage/contact.
  const serving = identity.serviceAreas
    ? `<div style="font-size:13.5px;line-height:1.55;color:${BRAND.inkSoft};padding-top:12px;">Serving: ${esc(
        identity.serviceAreas,
      )}</div>`
    : ""

  // Contact — phone and email each on their OWN line (client contact email).
  const contactLines: string[] = []
  if (identity.phone)
    contactLines.push(
      `<div style="font-size:14.5px;line-height:1.7;"><a href="tel:${esc(
        identity.phone.replace(/[^\d+]/g, ""),
      )}" style="color:${BRAND.inkSoft};text-decoration:none;">${esc(identity.phone)}</a></div>`,
    )
  if (identity.email)
    contactLines.push(
      `<div style="font-size:14.5px;line-height:1.7;"><a href="mailto:${esc(identity.email)}" style="color:${BRAND.blue};text-decoration:none;">${esc(
        identity.email,
      )}</a></div>`,
    )
  if (identity.website)
    contactLines.push(
      `<div style="font-size:14.5px;line-height:1.7;"><a href="${identity.website}" target="_blank" rel="noopener noreferrer" style="color:${BRAND.blue};text-decoration:none;">${esc(
        identity.website.replace(/^https?:\/\//i, ""),
      )}</a></div>`,
    )
  const contact = contactLines.length ? `<div style="padding-top:12px;">${contactLines.join("")}</div>` : ""

  const logo = identity.logoUrl
    ? `<div style="padding-top:14px;"><img src="${identity.logoUrl}" alt="" height="28" style="display:block;height:28px;width:auto;max-width:180px;border:0;" /></div>`
    : ""

  return `${disclosure}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 4px 0;">
  <tr><td style="padding-bottom:14px;">${avatar}</td></tr>
  <tr><td>${identityLines.join("")}${serving}${contact}${logo}</td></tr>
</table>`
}
