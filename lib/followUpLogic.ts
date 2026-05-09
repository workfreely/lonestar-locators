export function getFollowUpSuggestion(lead: any) {
  const now = new Date()
  const last = new Date(lead.last_contacted_at || lead.created_at)

  const diffHours = (now.getTime() - last.getTime()) / (1000 * 60 * 60)

  if (lead.crm_status === 'new') {
    return "Text #1 – New Lead Intro"
  }

  if (lead.crm_status === 'list_sent') {
    if (diffHours < 24) return null
    if (diffHours < 48) return "Follow-Up #1 – Push Tour"
    if (diffHours < 72) return "Follow-Up #2 – Refine"
    return "Follow-Up #3 – Re-Engagement"
  }

  if (lead.crm_status === 'touring') {
    return "Tour Confirmation"
  }

  if (lead.crm_status === 'toured') {
    return "Did you have a favorite?"
  }

  return null
}

export function isFollowUpDue(lead: any) {
  if (!lead.next_follow_up) return false
  return new Date(lead.next_follow_up) <= new Date()
}