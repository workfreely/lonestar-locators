// Official state license-lookup destinations.
//
// Every URL below was opened and confirmed to be the issuing agency's own public
// licensee search — government/agency domains only, no third-party lookup sites, and
// none behind a login. Worth knowing why that mattered: search engines confidently
// recommend verify.sos.ga.gov for Georgia, but that portal covers only Cemeteries,
// Charities and Securities. Georgia real estate is regulated by GREC, a separate body,
// whose public search lives at the URL below.
//
// If a state reorganizes its site, fix the URL here — this is the only place they live.

export type SupportedState = "AZ" | "CO" | "FL" | "GA" | "IL" | "TN" | "TX"

export const SUPPORTED_LICENSE_STATES: SupportedState[] = ["AZ", "CO", "FL", "GA", "IL", "TN", "TX"]

export const STATE_NAMES: Record<SupportedState, string> = {
  AZ: "Arizona",
  CO: "Colorado",
  FL: "Florida",
  GA: "Georgia",
  IL: "Illinois",
  TN: "Tennessee",
  TX: "Texas",
}

/** Agency that actually issues the license — shown so the owner knows where they land. */
export const STATE_AGENCIES: Record<SupportedState, string> = {
  AZ: "Arizona Department of Real Estate",
  CO: "Colorado Division of Real Estate",
  FL: "Florida DBPR",
  GA: "Georgia Real Estate Commission",
  IL: "Illinois IDFPR",
  TN: "Tennessee Dept. of Commerce & Insurance",
  TX: "Texas Real Estate Commission",
}

export const STATE_LOOKUP_URLS: Record<SupportedState, string> = {
  // ADRE Public Database — "Search for a salesperson or broker".
  AZ: "https://services.azre.gov/publicdatabase/",
  // eLicense Online, Division of Real Estate (/dre/) — Licensee Search.
  CO: "https://apps2.colorado.gov/dre/licensing/lookup/licenselookup.aspx",
  // DBPR Licensing Portal — Licensee Search Options.
  FL: "https://www.myfloridalicense.com/wl11.asp?mode=0&SID=",
  // GREC public search — "Find a Real Estate Agent". NOT verify.sos.ga.gov (see above).
  GA: "https://ata.grec.state.ga.us/Account/Search",
  // IDFPR's own .gov entry point, which links to the Real Estate License Look Up.
  // Preferred over the vendor-hosted lookup domain so the link stays on illinois.gov.
  IL: "https://idfpr.illinois.gov/checklicense.html",
  // Official vanity domain; redirects to the Commerce & Insurance verify app.
  TN: "https://verify.tn.gov/",
  // TREC License Holder Search.
  TX: "https://www.trec.texas.gov/apps/license-holder-search/",
}

export function isSupportedState(value: unknown): value is SupportedState {
  return typeof value === "string" && (SUPPORTED_LICENSE_STATES as string[]).includes(value)
}
