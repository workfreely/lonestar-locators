// Client contact email resolution + confirmation-email signature/footer. Run:
//   npx tsx scripts/notifications/clientContactEmail.test.ts
import {
  buildAgentIdentity,
  renderClientSignatureHtml,
} from "@/lib/notifications/agentSignature"
import { leadConfirmationEmail, newLeadEmail } from "@/lib/notifications/templates"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }

const base = {
  preferred_name: "Jay Morris",
  brokerage: "ReLIVe Realty",
  phone_number: "(210) 895-5766",
  profile_photo_url: "https://example.com/jay.jpg",
}

console.log("CASE A — client_contact_email null → client sees profiles.email:")
ok(
  "falls back to the account/profile email",
  buildAgentIdentity({ profile: { ...base, email: "jay.login@gmail.com", client_contact_email: null } }).email ===
    "jay.login@gmail.com",
)
ok(
  "blank string also falls back",
  buildAgentIdentity({ profile: { ...base, email: "jay.login@gmail.com", client_contact_email: "" } }).email ===
    "jay.login@gmail.com",
)

console.log("\nCASE B — client_contact_email set → client sees ONLY that email:")
ok(
  "override wins over the account email",
  buildAgentIdentity({ profile: { ...base, email: "jay.login@gmail.com", client_contact_email: "jay@reliverealty.com" } })
    .email === "jay@reliverealty.com",
)

console.log("\nResolution is exactly client_contact_email -> profiles.email (no other source):")
ok(
  "workspace email is NOT used as a fallback anymore",
  buildAgentIdentity({ profile: { ...base }, workspace: { email: "team@relive.com" } }).email === null,
)
ok(
  "nothing set → null (never fabricated)",
  buildAgentIdentity({ profile: { ...base } }).email === null,
)

console.log("\nCASE C — the client contact email is independent of login/auth:")
// buildAgentIdentity reads ONLY profile columns; it never touches Supabase auth.
// Setting a different client contact email does not change the account email.
const idC = buildAgentIdentity({ profile: { ...base, email: "jay.login@gmail.com", client_contact_email: "jay@reliverealty.com" } })
ok("client-facing email is the override", idC.email === "jay@reliverealty.com")
ok(
  "resolution never reads an auth/login field (only client_contact_email + profiles.email)",
  buildAgentIdentity({ profile: { email: "login@x", client_contact_email: "pro@y" } }).email === "pro@y",
)

console.log("\nCASE D — client-facing confirmation email: agent email shown, NO platform support address:")
const sig = buildAgentIdentity({
  profile: { ...base, email: "jay.login@gmail.com", client_contact_email: "jay@reliverealty.com" },
  workspace: { service_areas: ["san-antonio", "dallas"] },
})
const html = leadConfirmationEmail({ locatorName: sig.name, signature: sig, lead: { first_name: "Jordan", city: "Houston" } }).html
ok("shows the agent's client contact email", html.includes("jay@reliverealty.com"))
ok("does NOT show the login/account email", !html.includes("jay.login@gmail.com"))
ok("does NOT expose the Locator Beast support/admin address", !html.includes("admin@locatorbeast.com"))
ok("does NOT show the 'Need help? Reach us at' support line", !html.includes("Need help? Reach us at"))

console.log("\nInternal/admin email (new-lead notification to the agent) KEEPS the support footer:")
const ownerHtml = newLeadEmail({
  locatorName: "Jay Morris",
  leadUrl: "https://locatorbeast.com/admin/leads?id=1",
  lead: { first_name: "Jordan", city: "Houston" },
}).html
ok("internal email still shows admin@locatorbeast.com support", ownerHtml.includes("admin@locatorbeast.com"))

console.log("\nSignature block still uses the client contact email (larger image, Serving line):")
const shtml = renderClientSignatureHtml(sig, { showDisclosure: false })
ok("mailto is the client contact email", shtml.includes("mailto:jay@reliverealty.com"))
ok("larger 72px circular image", shtml.includes('width="72"') && shtml.includes("border-radius:9999px"))

console.log(`\nClient contact email unit: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
