// Canonical lead classification — pure-logic unit tests (no network/DB). Run:
//   npx tsx scripts/leads/classification.test.ts
import {
  CLIENT_TYPES,
  isClientType,
  resolveLeadClassification,
  shouldInferMarketFromLandingPage,
} from "@/lib/leads/leadClassification"

let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }

console.log("Writer — Smart Lead Form (full):")
const smart = resolveLeadClassification("full", "renter")
ok("Smart Lead Form → lead_type=renter", smart.lead_type === "renter")
ok("Smart Lead Form → form_variant=full", smart.form_variant === "full")

console.log("\nWriter — legacy short form:")
const short = resolveLeadClassification("short", "renter")
ok("short form → lead_type=renter", short.lead_type === "renter")
ok("short form → form_variant=short", short.form_variant === "short")

console.log("\nWriter — normalizes legacy/garbage lead_type off the form-shape dimension:")
ok('sent "full" (legacy form-shape value) → renter/full', JSON.stringify(resolveLeadClassification("full", "full")) === JSON.stringify({ lead_type: "renter", form_variant: "full" }))
ok('sent "short" (legacy form-shape value) → renter/short', JSON.stringify(resolveLeadClassification("short", "short")) === JSON.stringify({ lead_type: "renter", form_variant: "short" }))
ok("sent undefined → renter", resolveLeadClassification("full", undefined).lead_type === "renter")
ok("sent null → renter", resolveLeadClassification("full", null).lead_type === "renter")
ok('sent "garbage" → renter', resolveLeadClassification("full", "garbage").lead_type === "renter")

console.log("\nWriter — canonical client types pass through:")
ok("buyer is kept", resolveLeadClassification("full", "buyer").lead_type === "buyer")
ok("seller is kept", resolveLeadClassification("full", "seller").lead_type === "seller")

console.log("\nCanonical value model (matches the DB CHECK constraint):")
ok("renter/buyer/seller are the only client types", JSON.stringify([...CLIENT_TYPES]) === JSON.stringify(["renter", "buyer", "seller"]))
ok("renter/buyer/seller are all valid client types", isClientType("renter") && isClientType("buyer") && isClientType("seller"))
ok('"full" is NOT a valid client type (DB would reject)', !isClientType("full"))
ok('"short" is NOT a valid client type (DB would reject)', !isClientType("short"))

console.log("\nShort-form market inference — now gated on form_variant, behavior preserved:")
ok("short + no city → infer", shouldInferMarketFromLandingPage({ form_variant: "short", city: "" }))
ok("short + null city → infer", shouldInferMarketFromLandingPage({ form_variant: "short", city: null }))
ok("short + has city → do NOT infer", !shouldInferMarketFromLandingPage({ form_variant: "short", city: "San Antonio" }))
ok("full + no city → do NOT infer (full always collects city)", !shouldInferMarketFromLandingPage({ form_variant: "full", city: "" }))
ok("legacy renter row with null form_variant → do NOT infer (was never short)", !shouldInferMarketFromLandingPage({ form_variant: null, city: null }))

console.log(`\nLead classification unit: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
