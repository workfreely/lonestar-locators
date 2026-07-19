export function getNextAction(lead: any) {
  const stage = lead.crm_status
  const fu = lead.follow_up_count || 0

  // =====================================================
  // 🟡 NEW LEAD
  // =====================================================
  if (stage === "new") return "Contact Lead"

  // =====================================================
  // 🔵 CONTACTED (NO FOLLOW UPS YET)
  // =====================================================
  if (stage === "contacted") return "Qualify Lead"

  // =====================================================
  // 🟣 SEARCHING
  // =====================================================
  if (stage === "searching") return "Build List"

  // =====================================================
// 🟢 LIST SENT → FOLLOW-UP SEQUENCE STARTS HERE
// =====================================================
if (stage === "list_sent") {
  if (fu === 0) return "FU1"
  if (fu === 1) return "FU2"
  if (fu === 2) return "FU3"
  return "Final FU"
}

  // =====================================================
  // 🟠 TOUR FLOW
  // =====================================================
  if (stage === "ready_to_tour") return "Setup Tour"
  if (stage === "done_touring") return "Tour Follow-Up"

  // =====================================================
  // ⚫ APPLIED
  // =====================================================
  if (stage === "applied") return "Check App"

  // =====================================================
  // 🏁 CLOSED
  // =====================================================
  if (stage === "closed") return "Request Referral"

  return "Next Action"
}