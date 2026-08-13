export function getNextAction(lead: any) {
  const stage = lead.crm_status
  const fu = lead.follow_up_count || 0

  // =====================================================
  // 🟡 NEW LEAD
  // =====================================================
  if (stage === "new") return "Contact Lead"

  // =====================================================
  // 🔵 CONTACTED — next canonical step is building the client's list
  // (Phase 3 Slice A: replaced the passive "Waiting for Response" with the
  // active "Build List"; the Workflow Engine creates the matching build_list row).
  // =====================================================
  if (stage === "contacted") return "Build List"

  // =====================================================
  // 🟣 SEARCHING
  // =====================================================
  // Build List belongs to Contacted now (Phase 3); the Searching stage's action
  // is Send List (matches getStageWorkflowAction("searching") = send_list).
  if (stage === "searching") return "Send List"

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
  // After closing, the required next step is collecting the lease + invoice
  // info needed to get paid — NOT a referral (referrals are optional and not
  // part of the workflow). Short "Invoice Details" label for the Kanban card;
  // the workflow action itself is "Get Invoice Details" (see workflowEngine).
  if (stage === "closed") return "Invoice Details"

  return "Next Action"
}