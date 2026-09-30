// PASS 4 — licence status derivation. Pure; proves the four states and the
// precedence rule. Run: npx tsx scripts/markets/licenseStatus.test.ts
import { licenseStatus, licenseRejectionReason, isLicenseEditable, LICENSE_STATUS_LABEL } from "@/lib/license/status"
let pass = 0, fail = 0
const ok = (l: string, c: boolean) => { if (c) { pass++; console.log(`  ✓ ${l}`) } else { fail++; console.log(`  ✗ ${l}`) } }
const T = "2026-09-30T12:00:00Z"

console.log("the four states:")
ok("no licence number → unsubmitted", licenseStatus({}) === "unsubmitted")
ok("blank/whitespace number → unsubmitted", licenseStatus({ license_number: "   " }) === "unsubmitted")
ok("null profile → unsubmitted", licenseStatus(null) === "unsubmitted")
ok("number, no stamps → pending", licenseStatus({ license_number: "123456" }) === "pending")
ok("verified stamp → verified", licenseStatus({ license_number: "123456", license_verified_at: T }) === "verified")
ok("rejected stamp → rejected", licenseStatus({ license_number: "123456", license_rejected_at: T }) === "rejected")

console.log("\nprecedence (the DB CHECK makes the tie impossible; this keeps the fn total):")
ok("verified wins over rejected", licenseStatus({ license_number: "1", license_verified_at: T, license_rejected_at: T }) === "verified")
ok("a rejection with no number is still rejected", licenseStatus({ license_rejected_at: T }) === "rejected")
ok("a verification with no number is still verified", licenseStatus({ license_verified_at: T }) === "verified")

console.log("\nrejection reason is scoped to the rejected state:")
ok("shown when rejected", licenseRejectionReason({ license_number: "1", license_rejected_at: T, license_rejection_reason: "Number not found at TREC" }) === "Number not found at TREC")
ok("trimmed", licenseRejectionReason({ license_number: "1", license_rejected_at: T, license_rejection_reason: "  fix it  " }) === "fix it")
ok("null when rejected with no reason", licenseRejectionReason({ license_number: "1", license_rejected_at: T }) === null)
ok("a STALE reason is never shown once verified",
  licenseRejectionReason({ license_number: "1", license_verified_at: T, license_rejection_reason: "old reason" }) === null)
ok("never shown while pending", licenseRejectionReason({ license_number: "1", license_rejection_reason: "x" }) === null)

console.log("\neditability mirrors the DB trigger:")
ok("editable while unsubmitted / pending / rejected",
  isLicenseEditable({}) && isLicenseEditable({ license_number: "1" }) && isLicenseEditable({ license_number: "1", license_rejected_at: T }))
ok("frozen once verified", !isLicenseEditable({ license_number: "1", license_verified_at: T }))

console.log("\nlabels reuse the wording already live in Profile:")
ok("unsubmitted shows no chip", LICENSE_STATUS_LABEL.unsubmitted === null)
ok("pending / verified match the existing chips", LICENSE_STATUS_LABEL.pending === "Pending verification" && LICENSE_STATUS_LABEL.verified === "Verified")
ok("rejected reads as an action", LICENSE_STATUS_LABEL.rejected === "Needs correction")

console.log("\nno DB dependency — safe before the SQL is applied:")
ok("resolves with the rejection fields entirely ABSENT", licenseStatus({ license_number: "1", license_verified_at: T }) === "verified")
ok("a caller that never selects them can still reach pending", licenseStatus({ license_number: "1" }) === "pending")

console.log(`\nLicence status: ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
