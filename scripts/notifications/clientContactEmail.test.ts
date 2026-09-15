// Client contact email resolution + confirmation-email signature block. Run:
//   npx tsx scripts/notifications/clientContactEmail.test.ts
import {
  buildAgentIdentity,
  renderClientSignatureHtml,
  buildClientSignatureText,
} from "@/lib/notifications/agentSignature"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }

const base = {
  preferred_name: "Jay Morris",
  brokerage: "ReLIVe Realty",
  phone_number: "(210) 895-5766",
  profile_photo_url: "https://example.com/jay.jpg",
}

console.log("Email source resolution (client contact email is preferred):")
ok(
  "client_contact_email set → shown to leads (not the login email)",
  buildAgentIdentity({ profile: { ...base, email: "jay.login@account.com", client_contact_email: "jay@relive.com" } }).email ===
    "jay@relive.com",
)
ok(
  "client_contact_email blank → falls back to profiles.email (existing behavior)",
  buildAgentIdentity({ profile: { ...base, email: "jay.login@account.com", client_contact_email: "" } }).email ===
    "jay.login@account.com",
)
ok(
  "no client_contact_email + no profiles.email → workspace email",
  buildAgentIdentity({ profile: { ...base }, workspace: { email: "team@relive.com" } }).email === "team@relive.com",
)
ok(
  "none configured → null (nothing fabricated)",
  buildAgentIdentity({ profile: { ...base } }).email === null,
)

console.log("\nConfirmation-email signature block (reorganized + larger image):")
const id = buildAgentIdentity({
  profile: { ...base, client_contact_email: "jay@relive.com" },
  workspace: { service_areas: ["san-antonio", "dallas", "austin", "houston", "fort-worth"] },
})
const html = renderClientSignatureHtml(id, { showDisclosure: false })
ok("larger profile image (72px, not the old 56px)", html.includes('width="72"') && html.includes("72px") && !html.includes('width="56"'))
ok("image is circular + undistorted", html.includes("border-radius:9999px") && html.includes("object-fit:cover"))
ok('serving markets sit on a separate "Serving:" line', html.includes("Serving:"))
ok("client contact email is the mailto shown", html.includes("mailto:jay@relive.com"))
ok("phone is a tel: link", html.includes("tel:2108955766"))
ok(
  "phone and email are on their OWN lines (separate blocks, no inline • join)",
  !html.includes("&nbsp;•&nbsp;"),
)

console.log("\nGuest-card plain-text signature uses the same client contact email:")
const text = buildClientSignatureText(id, { showDisclosure: false })
ok("plain-text signature includes client contact email", text.includes("jay@relive.com"))
ok("plain-text signature shows 'Serving' line", text.includes("Serving"))

console.log(`\nClient contact email unit: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
