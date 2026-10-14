// RENTER CONFIRMATION EMAIL — hero, signature layout, and what must not move.
//
// Pure and offline. Run: `npx tsx scripts/tests/confirmationEmail.test.ts`
// Renders the template and asserts the HTML; no email is ever sent.
//
// The two risks this guards are both email-client problems rather than logic ones:
//   • a hero whose text is only legible when the background image loads — blocked images or a
//     client that cannot decode .webp would leave white text on white;
//   • a side-by-side signature built with CSS that Gmail strips, which would silently stack.

import { leadConfirmationEmail } from "@/lib/notifications/templates"

let pass = 0
let fail = 0
function ok(label: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${label}`) }
  else { fail++; console.log(`  ✗ ${label}`) }
}

const signature = {
  name: "Jay Morris", title: "Apartment Locator", brokerage: "AptAmigo Brokerage",
  phone: "(210) 895-5766", email: "agent@example.com", photoUrl: "https://example.com/p.png",
  iabsUrl: "https://example.com/iabs.pdf", servesTexas: true, serviceAreas: "San Antonio",
  website: null, logoUrl: null,
} as never

const lead = {
  first_name: "Testy", city: "San Antonio", move_date: "2026-11-01", desired_rent: "$4,000+",
  property_type: "High-Rise", notes: "I need to be near Randolph AFB",
} as never

const html = leadConfirmationEmail({ locatorName: "Jay Morris", signature, lead }).html
const body = html.slice(html.indexOf("<body"))  // excludes <title>, which legitimately repeats the greeting

// ── hero ────────────────────────────────────────────────────────────────────────────────────
console.log("\nSkyline hero")
ok("greeting renders in white", /color:#ffffff;">Hi Testy,/.test(body))
ok("greeting appears exactly once in the body", (body.match(/Hi Testy,/g) || []).length === 1)
ok("the opening line sits in the hero, above the summary", body.indexOf("Thanks for reaching out") < body.indexOf("Your search summary"))
// LEGIBILITY WITHOUT THE IMAGE: a dark bgcolor is on the cell itself, so blocked images still
// leave white-on-navy rather than white-on-white.
ok("hero cell carries a dark bgcolor fallback", /<td bgcolor="#[0-9a-fA-F]{6}" background=/.test(body))
ok("the skyline is layered over it, not relied upon", /background-image:linear-gradient\(/.test(body))
ok("city is still named in the opening line", /San Antonio/.test(body))

// ── signature ───────────────────────────────────────────────────────────────────────────────
console.log("\nAgent signature")
ok("photo cell comes BEFORE the name (left of it)", body.indexOf("padding-right:16px") < body.indexOf("Jay Morris"))
ok("photo is 88px", /width:88px;height:88px/.test(body))
// A table row is the only horizontal layout Gmail reliably honours.
ok("laid out as table cells, not floats or flex", /<td valign="top" width="88"/.test(body))
ok("no float/flex that Gmail would strip", !/float:\s*left/i.test(body) && !/display:\s*flex/i.test(body))
ok("real profile data, not hardcoded", /AptAmigo Brokerage/.test(body) && /agent@example\.com/.test(body))
ok("phone is a tel: link", /tel:2108955766/.test(body))

// ── nothing else moved ──────────────────────────────────────────────────────────────────────
console.log("\nPreserved")
ok("IABS disclosure still present", /Information About Brokerage Services form/.test(body))
ok("IABS link preserved", /https:\/\/example\.com\/iabs\.pdf/.test(body))
ok("IABS placement UNCHANGED (still above the signature)", body.indexOf("Information About Brokerage") < body.indexOf("padding-right:16px"))
ok("search summary intact", /Your search summary/.test(body) && /High-Rise/.test(body) && /\$4,000\+/.test(body))
ok("renter notes preserved verbatim", /Randolph AFB/.test(body))
ok("what-happens-next steps intact", /What happens next\?/.test(body) && /Step 1:/.test(body))
ok("screening data never shown to the renter", !/credit/i.test(body) && !/eviction/i.test(body))

// ── an agent with no photo still renders a signature ────────────────────────────────────────
console.log("\nNo photo configured")
const noPhoto = leadConfirmationEmail({
  locatorName: "Jay", signature: { ...(signature as object), photoUrl: null } as never, lead,
}).html
ok("falls back to initials, still left-aligned", /padding-right:16px/.test(noPhoto) && !/<img src="https:\/\/example\.com\/p\.png"/.test(noPhoto))

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
