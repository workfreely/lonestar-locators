/**
 * Shared internal contracts.
 *
 * Native hybrid model, OPEN-ONLY: the launcher (content script) asks the
 * BACKGROUND to OPEN the global native side panel for its window. Chrome requires
 * open() to originate from a user gesture, so the launcher forwards the click
 * synchronously. There is no programmatic close and no open/closed state — the
 * native X is the sole close control (matches Apollo's native-panel usage).
 */

/** Which browser edge the native side panel is docked to (Chrome 140+ getLayout). */
export type PanelSide = "left" | "right";

/** Which supported site a page belongs to. */
export type SiteId = "external-property-site" | "locator-beast" | "unknown";

/** Lightweight page context reported by the content script (no client data). */
export type PageContext = {
  site: SiteId;
  host: string;
  /** pathname + search + hash — enough to identify the section, no PII scraped. */
  path: string;
  url: string;
};

/**
 * The property page the locator is CURRENTLY viewing (the external property site
 * detail page). This is page context, NOT a saved Favorite/Recommendation and NOT
 * tied to the active client — it follows the webpage, not the CRM selection. Never
 * persisted to Supabase. `propertyId` is the external site's stable `propertyID` (primary
 * identity); `name`/`address` are read-only from the detail page.
 */
export type CurrentProperty = {
  /** the external property site's stable propertyID (external property identity). */
  propertyId: string;
  /** Field names deliberately mirror FavoriteDTO/RecommendationDTO so a detected
   *  Current Property is directly compatible when it later becomes a saved
   *  Recommendation/Favorite (no remapping). Name/id/url are the primary identity;
   *  address/image are supplemental and may be null without failing detection. */
  propertyName: string;
  propertyAddress?: string | null;
  /** Google Places star rating (0.0–5.0), carried from the CRM Map via the
   *  map→Companion bridge (Google Places data). Supplemental; ABSENT for
   *  external-site-detected properties and never fabricated. The card shows it only when
   *  present and omits it entirely when null. Display-only. */
  googleRating?: number | null;
  /** the external site submarket (neighborhood/area label) from the property header — the most
   *  reliable structured location signal on the detail page. Supplemental; null
   *  when absent. Used by Location Fit alongside the address. */
  propertySubmarket?: string | null;
  /** Management company from the the external site detail page — read-only evidence for Approval
   *  intelligence. Supplemental; null when absent. Never a guarantee of approval. */
  propertyManagement?: string | null;
  /** Verified property EMAILS from the the external site detail page — OPERATIONAL data (not
   *  intelligence): retained at capture so later workflows can prefill the Guest
   *  Card and Invoice recipients without the agent returning to the external site to copy them.
   *  the external site may supply MULTIPLE addresses and we retain ALL of them (never rank, select
   *  a primary, or discard) — one may be stale and we can't know which is current.
   *  `[]` when none/unavailable; never guessed/fabricated. Supplemental (never blocks
   *  detection). No invoice/guest-card automation is built on it yet. */
  propertyEmails?: string[];
  /** the external site amenity text, captured verbatim and de-duplicated, kept in the external site's own two
   *  sections: "Property Amenities" → community, "Unit Features" → unit. Missing
   *  section → []. Supplemental read-only evidence for the Amenities row; nothing is
   *  inferred and the two lists are never flattened together. */
  propertyAmenities?: { community: string[]; unit: string[] };
  /** the external site's specials/concessions block, one VERBATIM line per offer (gift cards, fee
   *  waivers, rent concessions and footnotes all mixed together — interpretation happens
   *  in the evaluator, never here). Undefined when the external site renders no specials element at
   *  all, which means UNKNOWN — distinct from a present block stating no concession. */
  propertySpecials?: string[];
  /** the external site's property-wide rent RANGE from the facts-bar price chip, parsed at extraction
   *  ("$925 - $1,199" → { min: 925, max: 1199 }). Not a selected unit's rent. Null when
   *  the chip is absent or carries no figure — unknown, never $0. */
  propertyRent?: { min: number; max: number } | null;
  /** The canonical property URL. the external site's ViewProperty.aspx?propertyID=... for a
   *  detected property; the Google Maps place URL for one picked on the map. */
  propertyUrl: string;
  propertyImageUrl?: string | null;
  /** The property's REAL website (property_catalog.website_url), when known. The ONLY
   *  URL Current Property's name/thumbnail may open — never propertyUrl (which is the
   *  Google Maps place link for a map-picked property). Absent → non-clickable name. */
  websiteUrl?: string | null;

  // ── Geographic / provenance metadata ──────────────────────────────────────
  // Added for Beast Property Explorer, which knows a property's real coordinates
  // at selection time. Every field is OPTIONAL so a external-site-detected property — which
  // exposes none of them — remains valid and unchanged; absent means unknown.
  //
  // These live on the SHARED type rather than in a map-specific property model:
  // a property picked on the map must be the same kind of thing as one detected
  // on the external site, or the Recommendation/Favorite workflow would need a second path.

  /** Real latitude, or null/absent when unknown. NEVER estimated or derived. */
  lat?: number | null;
  /** Real longitude, or null/absent when unknown. NEVER estimated or derived. */
  lng?: number | null;
  /** Provider's stable place identity (Google Place ID) when the source has one. */
  placeId?: string | null;
  /** Which provider this came from. Absent on external-site-detected properties, which
   *  predate the field and are implicitly the external property site. */
  source?: "google_places" | "external_property_platform";
  /** Catalog slug for the market the property was found in, when known. */
  marketSlug?: string | null;
};

/** Content → Background: open the global native side panel for the sender's window. */
export type OpenPanelMessage = { type: "OPEN_PANEL" };

/** Content → Background: which side is the panel on? Response: { side: PanelSide }. */
export type GetPanelSideMessage = { type: "GET_PANEL_SIDE" };

/** Content → Background: report the current page context (URL/site/section). */
export type ReportContextMessage = { type: "REPORT_CONTEXT"; context: PageContext };

/**
 * Content → Background: the sender IS the CRM tab that just supplied the Companion
 * active client. The background stamps sender.tab.id/windowId into storage so
 * "← Back to CRM" can return to the EXACT originating tab (not a URL-pattern guess).
 */
export type ReportCrmTabMessage = { type: "REPORT_CRM_TAB" };

/** Erase every sensitive record. Sent by the panel's Clear stored data control
 *  and by consent revocation. Carries no data. */
export type ClearSensitiveMessage = { type: "CLEAR_SENSITIVE" };

/**
 * REPLAY HANDSHAKE. Panel → Background: the side panel just mounted (consent is
 * granted, since it renders behind ConsentGate) and asks the CRM to republish its
 * current synchronized state. Background → Content (the CRM tab): relay the request
 * into the page, where DashboardClient re-publishes active-client + Current Property
 * through the existing bridge. Carries no data.
 */
export type RequestCurrentStateMessage = { type: "REQUEST_CURRENT_STATE" };

export type RuntimeMessage =
  | OpenPanelMessage
  | GetPanelSideMessage
  | ReportContextMessage
  | ReportCrmTabMessage
  | ClearSensitiveMessage
  | RequestCurrentStateMessage;
