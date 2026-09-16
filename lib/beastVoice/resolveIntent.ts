import type { ParsedCommand, VoiceAction } from "./types"
import type { NavTarget } from "./phrases"

// Pure intent → action mapping. Given ONE ParsedCommand, produce the executor-
// facing VoiceAction. No side effects, no DOM, no context: this is a lookup, so
// it is exhaustively unit-testable and the executor stays a thin switch.
//
// It never invents an action. Every VoiceAction it emits names an EXISTING
// product behavior; the executor then invokes the exact existing handler, setter,
// or workflow-verb. Contact/select/copy/open actions that target a client carry
// only the spoken name — resolving it against the loaded leads needs the board's
// memory and therefore happens in the executor, not here.

// The approved routes (§17). Each destination enforces its own auth/gating
// server-side, exactly as the manual profile-menu links do — Voice only navigates.
const NAV_ROUTES: Record<NavTarget, { route: string; label: string }> = {
  profile: { route: "/admin/profile", label: "Profile" },
  smart_lead_form: { route: "/smart-lead-form", label: "Smart Lead Form" },
  analytics: { route: "/admin/analytics", label: "Sales Analytics" },
  sales_goals: { route: "/admin/settings", label: "Sales Goals" },
  integrations: { route: "/admin/integrations", label: "Integrations" },
  import_leads: { route: "/admin/import", label: "Import Leads" },
  billing: { route: "/admin/billing", label: "Billing" },
  help: { route: "/help", label: "Help Center" },
  social_beast: { route: "/admin/social-autopilot", label: "Social Beast" },
  referral_network: { route: "/admin/network", label: "Beast Referral Network" },
  license_verification: { route: "/admin/license-verification", label: "License Verification" },
}

export function resolveIntent(parsed: ParsedCommand): VoiceAction {
  switch (parsed.kind) {
    case "navigate": {
      const nav = NAV_ROUTES[parsed.target]
      return { kind: "navigate", route: nav.route, label: nav.label }
    }
    case "workspace":
      return { kind: "workspace", target: parsed.target }
    case "focus":
      return { kind: "focus", on: parsed.on }
    case "agenda":
      return { kind: "agenda", op: parsed.op }
    case "theme":
      return { kind: "theme", theme: parsed.theme }
    case "add_lead":
      return { kind: "add_lead" }
    case "select_client":
      return { kind: "select_client", clientName: parsed.clientName }
    case "contact_client":
      return { kind: "contact", clientName: parsed.clientName, method: parsed.method }
    case "copy":
      return { kind: "copy", field: parsed.field, target: parsed.target, clientName: parsed.clientName }
    case "crm_open":
      return { kind: "crm_open", verb: parsed.verb, clientName: parsed.clientName }
    case "edit_client":
      return { kind: "edit_client", clientName: parsed.clientName }
    case "property_action":
      return { kind: "property_action", verb: parsed.verb }
    case "market":
      return { kind: "market", spoken: parsed.spoken }
    case "unleash":
      return { kind: "unleash" }
    case "ask_beast":
      return { kind: "ask_beast" }
    case "completion":
      return { kind: "completion", target: parsed.target }
    case "stop":
      return { kind: "stop" }
    // Contextual answers and unknown are not command-mode actions — the executor
    // handles them on their own paths, so they map to nothing here.
    case "respond_call":
    case "respond_text":
    case "confirm_yes":
    case "confirm_no":
    case "cancel":
    case "unknown":
      return { kind: "unknown" }
  }
}
