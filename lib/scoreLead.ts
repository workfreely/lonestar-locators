export function scoreProperty(lead: any, property: any) {
  let score = 0

  const credit = Number(lead.credit_score || 0)
  const minCredit = Number(property.credit_min || 0)

  // CREDIT
  if (minCredit > 0) {
    if (credit >= minCredit) score += 35
    else if (credit >= minCredit - 40) score += 15
    else score -= 30
  }

  // BROKEN LEASE
  if (lead.broken_lease) {
    score += property.broken_lease_ok ? 20 : -40
  }

  // EVICTION
  if (lead.eviction) {
    score += property.eviction_ok ? 20 : -50
  }

  // FELONY
  if (lead.felony) {
    score += property.felony_ok ? 10 : -30
  }

  // MISDEMEANOR
  if (lead.misdemeanor) {
    score += property.misdemeanor_ok ? 5 : -15
  }

  // SECTION 8
  if (lead.section8) {
    score += property.section8_ok ? 25 : -35
  }

  // GUARANTOR
  if (lead.needs_guarantor) {
    score += property.guarantor_accepted ? 10 : -10
  }

  return score
}