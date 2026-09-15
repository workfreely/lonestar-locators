// Meta asset discovery + deterministic auto-match. The parse/match functions are PURE (no network)
// so they are unit-tested directly. discoverAssets() is the thin network layer that fetches the raw
// Graph payloads and hands them to the pure parser.
import { graphGet } from "@/lib/meta/client"

// ── Normalized asset shapes (only ids + friendly names; no tokens leak into these) ──
export type MetaPage = { id: string; name: string; instagramId: string | null; instagramUsername: string | null; token?: string }
export type MetaAdAccount = { id: string; name: string }
export type MetaBusiness = { id: string; name: string }
export type MetaAssets = { businesses: MetaBusiness[]; pages: MetaPage[]; adAccounts: MetaAdAccount[] }

// Raw Graph edge shapes (subset we read).
type RawPage = { id: string; name?: string; access_token?: string; instagram_business_account?: { id?: string; username?: string } }
type RawAdAccount = { id?: string; account_id?: string; name?: string }
type RawBusiness = { id: string; name?: string }
type Edge<T> = { data?: T[] }

/** PURE: normalize the three raw Graph edges into MetaAssets. */
export function parseAssets(raw: { businesses?: Edge<RawBusiness>; pages?: Edge<RawPage>; adaccounts?: Edge<RawAdAccount> }): MetaAssets {
  const businesses: MetaBusiness[] = (raw.businesses?.data ?? []).map((b) => ({ id: b.id, name: b.name || b.id }))
  const pages: MetaPage[] = (raw.pages?.data ?? []).map((p) => ({
    id: p.id,
    name: p.name || p.id,
    instagramId: p.instagram_business_account?.id ?? null,
    instagramUsername: p.instagram_business_account?.username ?? null,
    token: p.access_token,
  }))
  const adAccounts: MetaAdAccount[] = (raw.adaccounts?.data ?? [])
    .map((a) => ({ id: a.id || (a.account_id ? `act_${a.account_id}` : ""), name: a.name || a.id || "" }))
    .filter((a) => a.id)
  return { businesses, pages, adAccounts }
}

export type ChosenAssets = { business: MetaBusiness | null; page: MetaPage | null; adAccount: MetaAdAccount | null }
export type MatchResult =
  | { status: "auto"; chosen: ChosenAssets }
  | { status: "ambiguous"; options: MetaAssets }
  | { status: "missing"; reason: "no_ad_account" | "no_page" }

/** PURE, DETERMINISTIC: decide whether we can auto-connect or must ask.
 *  - 0 ad accounts → missing:no_ad_account
 *  - 0 pages       → missing:no_page (Lead Ads / IG ads require a Page)
 *  - exactly 1 page AND exactly 1 ad account → auto (IG taken from that page)
 *  - otherwise → ambiguous (return the options for a minimal picker)
 *  Never silently picks among multiple equally-valid assets. */
export function autoMatch(assets: MetaAssets): MatchResult {
  if (assets.adAccounts.length === 0) return { status: "missing", reason: "no_ad_account" }
  if (assets.pages.length === 0) return { status: "missing", reason: "no_page" }
  if (assets.pages.length === 1 && assets.adAccounts.length === 1) {
    const page = assets.pages[0]
    return {
      status: "auto",
      chosen: {
        business: assets.businesses.length === 1 ? assets.businesses[0] : null,
        page,
        adAccount: assets.adAccounts[0],
      },
    }
  }
  return { status: "ambiguous", options: assets }
}

/** Strip tokens before persisting discovered options into the pending row / sending to the browser. */
export function publicAssets(assets: MetaAssets): MetaAssets {
  return {
    businesses: assets.businesses,
    pages: assets.pages.map(({ token: _t, ...p }) => p),
    adAccounts: assets.adAccounts,
  }
}

/** Network: fetch the user's Businesses, Pages (+ linked IG), and Ad Accounts in parallel. */
export async function discoverAssets(userToken: string): Promise<MetaAssets> {
  const [businesses, pages, adaccounts] = await Promise.all([
    graphGet<Edge<RawBusiness>>("me/businesses", userToken, "id,name").catch(() => ({ data: [] })),
    graphGet<Edge<RawPage>>("me/accounts", userToken, "id,name,access_token,instagram_business_account{id,username}"),
    graphGet<Edge<RawAdAccount>>("me/adaccounts", userToken, "id,account_id,name"),
  ])
  return parseAssets({ businesses, pages, adaccounts })
}
