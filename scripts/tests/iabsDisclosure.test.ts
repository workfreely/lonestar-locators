// TEXAS IABS DISCLOSURE — placement and presentation in the renter confirmation email.
//
// Pure and offline. Run: `npx tsx scripts/tests/iabsDisclosure.test.ts`
// No email is sent and no lead is created.
//
// ── THE COMPLIANCE BOUNDARY THIS LOCKS DOWN ─────────────────────────────────────────────────
// 22 TAC §531.20(c) permits delivery as "a link within the body of an email, with a specific
// reference to the IABS Notice in the body of the email". §531.20(d) then forbids the link from
// sitting "in a footnote or signature block in an email", and TREC's FAQ says the same in plain
// words. For a renter confirmation email — the first substantive communication under Tex. Occ.
// Code §1101.558 — that makes POSITION a legal property of this paragraph, not a style choice.
//
// So: the box may go. The paragraph may not move below the signature or into the footer.

import { leadConfirmationEmail } from "@/lib/notifications/templates"
import { renderClientSignatureHtml, IABS_DISCLOSURE_PLAINTEXT } from "@/lib/notifications/agentSignature"

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
const body = html.slice(html.indexOf("<body"))

const iDisclosure = body.indexOf("Texas law requires all license holders")
const iLink = body.indexOf("https://example.com/iabs.pdf")
const iSignature = body.indexOf('padding-right:16px')       // the signature table's photo cell
const iFooter = body.indexOf("padding:24px 40px 32px 40px")  // the layout's footer row (holds the copyright)
const iCopyright = body.indexOf("&copy; 2026")

// ── PLACEMENT: the part that is not negotiable ──────────────────────────────────────────────
console.log("\nPlacement (22 TAC §531.20(c)-(d))")
ok("the disclosure is present at all", iDisclosure > -1)
ok("it is in the BODY, above the signature", iDisclosure > -1 && iSignature > -1 && iDisclosure < iSignature)
ok("the LINK is above the signature too, not inside it", iLink > -1 && iLink < iSignature)
// §531.20(d): not in a footnote. The layout's footer row holds the copyright line.
ok("it is NOT in the footer row", iDisclosure < iFooter)
ok("it is NOT between the signature and the copyright", !(iDisclosure > iSignature && iDisclosure < iCopyright))
ok("a specific reference to the notice accompanies the link (§531.20(c))", /Texas law requires all license holders to provide the/.test(body))
ok("the linked text names the form", />Information About Brokerage Services form<\/a>/.test(body))
ok("wording is byte-for-byte the adopted sentence", body.includes("Texas law requires all license holders to provide the") && IABS_DISCLOSURE_PLAINTEXT === "Texas law requires all license holders to provide the Information About Brokerage Services form to prospective clients.")

// ── NOT CONCEALED ───────────────────────────────────────────────────────────────────────────
console.log("\nNot removed, reduced or concealed")
ok("not inside a <details> / collapsed block", !/<details/i.test(body))
ok("not hidden", !/display:\s*none[^"]*Texas law/i.test(body) && !/Texas law[^<]*<\/[^>]+>\s*<\/div>\s*<!--\s*hidden/i.test(body))
ok("not reduced to an icon — the full sentence is present", body.includes("to prospective clients."))
ok("the link is a real anchor with an href", /<a href="https:\/\/example\.com\/iabs\.pdf"[^>]*>Information About Brokerage Services form<\/a>/.test(body))

// ── PRESENTATION: the box is gone, the prominence is not ────────────────────────────────────
console.log("\nPresentation")
const para = body.slice(body.lastIndexOf("<p", iDisclosure), body.indexOf("</p>", iDisclosure))
ok("no grey background", !/background:#f6f8fb/.test(para))
ok("no callout rounding", !/border-radius/.test(para))
ok("no box padding", !/padding:/.test(para))
ok("reads as ordinary body text, in the footer's neutral tone", /font-size:13px/.test(para) && /color:#/.test(para))
// NEVER SMALLER. A required disclosure may be made quieter, never less legible: the old callout
// was 12px, so 13px is a floor the restyle must not drop below.
ok("at least as large as the callout it replaced (12px)", (() => {
  const m = /font-size:([\d.]+)px/.exec(para)
  return !!m && parseFloat(m[1]) >= 12
})())
ok("link stays visibly a link (underlined) for accessibility", /text-decoration:underline/.test(para))

// ── SCOPE: nothing else changed ─────────────────────────────────────────────────────────────
console.log("\nScoped to the renter confirmation email")
// Every other consumer passes no style and must still get the original callout.
const otherSurface = renderClientSignatureHtml(signature, { showDisclosure: true })
ok("the default is STILL the original grey callout", /background:#f6f8fb/.test(otherSurface) && /border-radius:8px/.test(otherSurface) && /font-size:12px/.test(otherSurface))
ok("guest card / other templates are untouched by default", otherSurface.includes(IABS_DISCLOSURE_PLAINTEXT.slice(0, 40)))
// NEGATIVE CONTROL: the plain style must actually differ, or this test proves nothing.
const plain = renderClientSignatureHtml(signature, { showDisclosure: true, disclosureStyle: "plain" })
ok("plain and callout really are different renderings", plain !== otherSurface && !/background:#f6f8fb/.test(plain))
ok("a non-Texas account still renders no disclosure", !renderClientSignatureHtml(signature, { showDisclosure: false, disclosureStyle: "plain" }).includes("Texas law requires"))

// ── EVERYTHING ELSE IN THE EMAIL ────────────────────────────────────────────────────────────
console.log("\nThe rest of the email is unchanged")
ok("skyline hero intact", /<td bgcolor="#[0-9a-fA-F]{6}" background=/.test(body) && /Hi Testy,/.test(body))
ok("signature photo still 88px and left-aligned", /width:88px;height:88px/.test(body) && /<td valign="top" width="88"/.test(body))
ok("search summary intact", /Your search summary/.test(body) && /High-Rise/.test(body))
ok("what-happens-next intact", /What happens next\?/.test(body) && /Step 3:/.test(body))
ok("copyright footer intact", /&copy; 2026/.test(body) && /locatorbeast\.com/.test(body))
ok("screening data still never shown to the renter", !/credit/i.test(body) && !/eviction/i.test(body))

console.log(`\n${pass} passed, ${fail} failed\n`)
process.exit(fail === 0 ? 0 : 1)
