// Canonical lead classification — pure-logic unit tests (no network/DB). Run:
//   npx tsx scripts/leads/classification.test.ts
//
// Locator Beast has ONE Smart Lead Form; question configuration does not create
// a "form type". lead_type describes the CLIENT, not the form.
import { CLIENT_TYPES, isClientType, resolveClientType } from "@/lib/leads/leadClassification"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }

console.log("Smart Lead Form → renter:")
ok("explicit 'renter' → renter", resolveClientType("renter") === "renter")
ok("no client type sent → renter", resolveClientType(undefined) === "renter")
ok("null → renter", resolveClientType(null) === "renter")

console.log("\nQuestion configuration / form shape does NOT affect lead_type:")
// The old form-shape values must never leak back in as a client type — they
// normalize to renter, so how many questions a form shows changes nothing.
ok('legacy "full" → renter (form shape is not a client type)', resolveClientType("full") === "renter")
ok('legacy "short" → renter', resolveClientType("short") === "renter")
ok('legacy "long" → renter', resolveClientType("long") === "renter")
ok('garbage → renter', resolveClientType("whatever") === "renter")

console.log("\nCanonical value model (matches the DB CHECK constraint):")
ok("client types are exactly renter/buyer/seller", JSON.stringify([...CLIENT_TYPES]) === JSON.stringify(["renter", "buyer", "seller"]))
ok("renter is valid", isClientType("renter"))
ok("buyer is schema-valid (no workflow yet, but a valid client type)", isClientType("buyer") && resolveClientType("buyer") === "buyer")
ok("seller is schema-valid", isClientType("seller") && resolveClientType("seller") === "seller")
ok('"full" is NOT a valid client type (DB rejects)', !isClientType("full"))
ok('"short" is NOT a valid client type (DB rejects)', !isClientType("short"))
ok('"long" is NOT a valid client type (DB rejects)', !isClientType("long"))

console.log(`\nLead classification unit: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
