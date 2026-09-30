// Client-side trigger for the commute calculation.
//
// Deliberately a THIN call: every decision (is there an anchor? which pairs are
// stale? may the reason be added?) lives on the server, so there is exactly one
// implementation of the rules and the browser cannot disagree with it.
//
// WHY THIS IS NOT "CALCULATING ON EVERY RENDER". It is called on three EVENTS, never
// from a render: opening a client, saving that client's destination, and adding a
// property. The route then computes only pairs whose cache is missing or was built
// against a different anchor — so the ordinary case reaches no Google API at all and
// returns { computed: 0 }. The drive time is written once and read from the
// canonical row thereafter.

export type CommuteRow = {
  canonical_property_key: string
  reasons: string[] | null
  commute_minutes: number | null
}

/**
 * Bring this client's commute times up to date. Returns ONLY the rows that changed,
 * so the caller can merge them into its reasons map without a refetch.
 *
 * Never throws: a commute figure is an enhancement, and failing to get one must not
 * break opening a client or saving their profile.
 */
export async function ensureCommuteReasons(leadId: number | string): Promise<CommuteRow[]> {
  try {
    const res = await fetch("/api/admin/leads/commute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId }),
    })
    if (!res.ok) {
      // 404 simply means this lead isn't in the caller's workspace; anything else is
      // worth seeing in the console but is still not the user's problem.
      if (res.status !== 404) console.warn("[commute] not computed:", res.status)
      return []
    }
    const json = (await res.json()) as { rows?: CommuteRow[] }
    return Array.isArray(json.rows) ? json.rows : []
  } catch (err) {
    console.warn("[commute] request failed:", err)
    return []
  }
}
