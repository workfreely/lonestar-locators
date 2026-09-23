import type { CurrentProperty } from "@/types";
import {
  CURRENT_PROPERTY_KEY,
  getSessionOwner,
  writeSensitive,
} from "@/utils/sensitiveStore";
import { log } from "@/utils/log";
import { isSupportedPropertyHost, parseExternalPropertyId, stripSiteSuffix, looksLikeAddress } from "./externalPropertyUrl";
import { parseCopyEmails } from "./externalPropertyEmail";
import { parseAmenityValues, groupAmenitySections, type AmenityNode } from "./externalPropertyAmenities";
// Imported from the MODULE, not the "@bc/companion-shared" barrel: the barrel
// re-exports the whole package (zod contract schemas, bridge messages, tokens, themes),
// and pulling it into a content script ballooned content.js ~12.5 KB → 89 KB on every
// external property-site page. `budget` depends only on `specials`, so this keeps the
// injected bundle small.
import { parseMoneyRange, type MoneyRange } from "@bc/budget";

/**
 * Current Property bridge (supported external property site → panel).
 *
 * Detection is PRIMARILY URL-based and therefore stable: the external site's
 * property-detail page is `/Restricted/Locator/ViewProperty.aspx?propertyID=<id>`
 * (verified prior structure). The `propertyID` query param is the external site's
 * own page identity, used only to decide WHICH page is open — it is NEVER Locator
 * Beast's property identity, dedup key, or storage key. Name/address are read
 * read-only from the detail DOM via a resilient cascade (never fabricated).
 *
 * The external site's own Previous/Next changes the URL (sometimes to a
 * `//Restricted/…` double-slash form); the existing content-script URL watcher
 * fires on that change and parseExternalPropertyId() slash-normalizes before
 * matching, so navigation is handled by the simple known-good path — no
 * MutationObserver / MAIN-world hook needed.
 *
 * It writes chrome.storage.local["lb-current-property"] — a SEPARATE key from
 * "lb-active-client", so Current Property follows the webpage being viewed, not
 * the active CRM client. On any non-property page (results/search/other) it writes
 * null so the panel clears back to the placeholder. Nothing is persisted to
 * Supabase. Mirrors the activeClientBridge write pattern (compare-before-write).
 */



/** External property-page id from the CURRENT URL (primary signal), or null when
 *  not on a property-detail page. Independent of any visible text. View-detection
 *  only — never Locator Beast identity. */
function detectPropertyIdFromUrl(): string | null {
  return parseExternalPropertyId(location.href);
}

function clean(s: string | null | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

const NAME_HEADING_SELECTORS = ".vp-modern h1, .factsBar h1, h1, .vp-modern h2, h2";
// Confirmed stable external-site detail-page element IDs (from real inspected HTML on
// ViewProperty.aspx). These are the PRIMARY sources; the generic cascades below
// remain as resilience fallbacks.
const NAME_SELECTOR = "#ctl00_ContentPlaceHolder_PropertyHeader1_propertyNameLink";
const ADDRESS_SELECTOR = "#ctl00_ContentPlaceHolder_PropertyHeader1_address";
const SUBMARKET_SELECTOR = "#ctl00_ContentPlaceHolder_PropertyHeader1_submarket";
// Management company — confirmed the external site's detail-page element. Supplemental; read-only
// evidence consumed by Approval intelligence in the panel.
const MGMT_SELECTOR = "#ctl00_ContentPlaceHolder_mgmtCo";
// Property email — OPERATIONAL data (background-only; future Guest Card / Invoice
// recipient prefill). The value lives in a the external site's "copy email" affordance:
// <… class="email-copy" onclick="copyTextToClipboard('a@x.com,b@y.com', this)">.
// We read the addresses from that onclick (see readPropertyEmails); the visible
// ".email-text" ("2 emails") is a count and is never used.
const EMAIL_COPY_SELECTOR = ".email-copy";

/**
 * Property NAME — confirmed the external site's header link first, then a resilient cascade
 * (og:title → prominent headings → cleaned document.title). Returns "" when
 * nothing is available yet (caller retries for late DOM).
 */
function readPropertyName(): string {
  const primary = clean(document.querySelector<HTMLElement>(NAME_SELECTOR)?.textContent);
  if (primary) return primary;
  const og = clean(document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content);
  if (og) return stripSiteSuffix(og);
  for (const sel of [".vp-modern h1", ".factsBar h1", "h1", ".vp-modern h2"]) {
    const t = clean(document.querySelector<HTMLElement>(sel)?.textContent);
    if (t) return t;
  }
  return stripSiteSuffix(clean(document.title));
}

/**
 * Property ADDRESS — uses the stable DOM RELATIONSHIP the address is known to have
 * (rendered directly beneath the property-name heading on the the external site's detail page),
 * plus standard structured sources. Never fabricated: a candidate is only accepted
 * if it looks like a real street address (looksLikeAddress). Whitespace-normalized
 * only — no parsing/splitting/geocoding. Null (omitted) when nothing qualifies.
 */
function readPropertyAddress(name: string): string | null {
  // 0) Confirmed the external site's header address element (authoritative — trusted as-is,
  //    whitespace-normalized only; no looksLikeAddress gate needed here).
  const primary = clean(document.querySelector<HTMLElement>(ADDRESS_SELECTOR)?.textContent);
  if (primary) return primary;

  // 1) Standard structured sources (stable when present).
  const metaAddr = clean(document.querySelector<HTMLMetaElement>('meta[property="og:street-address"]')?.content);
  if (metaAddr && looksLikeAddress(metaAddr)) return metaAddr;
  const itemprop = clean(document.querySelector<HTMLElement>('[itemprop="address"]')?.textContent);
  if (itemprop && looksLikeAddress(itemprop)) return itemprop;

  // 2) Structural: the address is rendered directly beneath the property-name
  //    heading. Find the heading whose text IS the detected name, then scan the
  //    next few sibling elements for the first address-shaped line.
  const headings = Array.from(document.querySelectorAll<HTMLElement>(NAME_HEADING_SELECTORS));
  const nameEl = headings.find((h) => clean(h.textContent) === name) ?? null;
  if (nameEl) {
    let node: Element | null = nameEl.nextElementSibling;
    for (let i = 0; node && i < 4; i++, node = node.nextElementSibling) {
      const t = clean((node as HTMLElement).textContent);
      if (t && looksLikeAddress(t)) return t;
    }
    // Also check address-shaped lines within the heading's parent block.
    const parentText = nameEl.parentElement
      ? Array.from(nameEl.parentElement.children)
          .map((c) => clean((c as HTMLElement).textContent))
          .find((t) => looksLikeAddress(t))
      : undefined;
    if (parentText) return parentText;
  }
  return null;
}

/**
 * Property IMAGE — the primary/hero photo, from og:image only. That is the most
 * stable, property-SPECIFIC source (the page's own share image) and avoids
 * capturing logos / maps / avatars / icons from arbitrary <img> tags. Null when
 * absent → the panel shows the building placeholder.
 */
function readPropertyImageUrl(): string | null {
  const og = clean(document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content);
  return og || null;
}

/** the external site's submarket (neighborhood/area) from the confirmed header element. Null when
 *  absent. Supplemental — never blocks detection; consumed by Location Fit. */
function readPropertySubmarket(): string | null {
  const t = clean(document.querySelector<HTMLElement>(SUBMARKET_SELECTOR)?.textContent);
  return t || null;
}

/** Management company from the confirmed the external site's element. Null when absent. Supplemental
 *  — never blocks detection; read-only evidence for Approval intelligence. */
function readPropertyManagement(): string | null {
  const t = clean(document.querySelector<HTMLElement>(MGMT_SELECTOR)?.textContent);
  return t || null;
}

/**
 * Verified property EMAILS from the the external site's detail page (operational — background-only,
 * future Guest Card / Invoice recipient prefill). Read from the "copy email"
 * affordance's onclick (copyTextToClipboard('…', this)) — NOT the visible
 * ".email-text" count. Returns ALL addresses (retain every one, deduped). Scoping is
 * conservative: the ".email-copy" class may be reused, so we accept it ONLY when
 * exactly ONE such affordance exists (never blindly take the first); several → [].
 */
function readPropertyEmails(): string[] {
  const nodes = Array.from(document.querySelectorAll<HTMLElement>(EMAIL_COPY_SELECTOR)).filter((el) =>
    (el.getAttribute("onclick") ?? "").includes("copyTextToClipboard"),
  );
  if (nodes.length !== 1) return []; // 0 = none; >1 = ambiguous → don't guess
  return parseCopyEmails(nodes[0].getAttribute("onclick"));
}

/**
 * Property AMENITIES from the the external site's detail page (supplemental, read-only evidence for the
 * Amenities intelligence row). Confirmed against the LIVE DOM:
 *
 *   #ctl00_ContentPlaceHolder_AmenitiesPage            ← the whole amenities region
 *     <span id="…_Amenities_Label1" class="subtitleBlue amen-sec amen-title">Property Amenities</span>
 *     <td class="subtitleBlue2">High Value</td>        ← CATEGORY heading (never a value)
 *     <span id="…_Amenities_aHighValue">&nbsp; Doorman<br>&nbsp; Locker System<br>…</span>
 *     <span id="…_Amenities_sports">…</span>           ← more categories follow
 *     <span class="subtitleBlue amen-sec">Unit Features</span>
 *     <span id="…_Amenities_kitchen">…</span>          ← …now belonging to the unit section
 *
 * Sectioning is by DOCUMENT ORDER inside the container — a value span belongs to the
 * most recent heading above it. The container bounds the walk so unrelated page spans
 * and tables can never be captured. Category headings live in `td.subtitleBlue2` cells,
 * which are neither `.amen-sec` nor `_Amenities_` spans, so they are structurally
 * incapable of entering the value stream.
 *
 * Section titles: `.amen-sec` is the only class BOTH headings share ("Property
 * Amenities" also carries `amen-title`, "Unit Features" does not and has no id).
 */
const AMENITY_PAGE_SELECTOR = "#ctl00_ContentPlaceHolder_AmenitiesPage";
// Headings and value spans in one query so the result is in DOCUMENT ORDER. The
// "Property Amenities" heading matches both halves (it has an `_Amenities_` id AND
// `.amen-sec`), so `.amen-sec` is tested FIRST and it is classified as a heading.
const AMENITY_NODE_SELECTOR = 'span.amen-sec, span[id*="_Amenities_"]';

function readPropertyAmenities(): { community: string[]; unit: string[] } {
  // Scope to the confirmed container; fall back to the document only when the external property site renders a
  // page variant without it (the selectors are amenity-specific either way).
  const scope: ParentNode = document.querySelector(AMENITY_PAGE_SELECTOR) ?? document;
  const nodes: AmenityNode[] = Array.from(scope.querySelectorAll<HTMLElement>(AMENITY_NODE_SELECTOR)).map((el) =>
    el.classList.contains("amen-sec")
      ? { kind: "section", title: clean(el.textContent) }
      : { kind: "values", html: el.innerHTML },
  );
  return groupAmenitySections(nodes);
}

/**
 * Property SPECIALS from the the external site's detail page (supplemental, read-only). Confirmed live
 * element — the whole concessions block sits in ONE span, one offer per <br> line:
 *
 *   <span id="ctl00_ContentPlaceHolder_SpecialsBit1_specials" class="textSmall">
 *     Gift Card: $500 Gift Card ends 11/13/2026<br>
 *     App Fee Waived<br>
 *     100% off rent for 2 month(s) on a 12 mo lease<br>
 *     Other Concessions: Up to 8 Weeks Free Base Rent<br>
 *     *Minimum Term Required. Terms Apply.
 *   </span>
 *
 * We store every line VERBATIM and interpret nothing here — picking the rent concession
 * out of the gift cards / fee waivers / footnotes is the evaluator's job
 * (selectRentConcession). Undefined when the element is absent, which the panel treats
 * as UNKNOWN (row hidden) rather than "no specials".
 */
const SPECIALS_SELECTOR = "#ctl00_ContentPlaceHolder_SpecialsBit1_specials";

function readPropertySpecials(): string[] | undefined {
  const el = document.querySelector<HTMLElement>(SPECIALS_SELECTOR);
  if (!el) return undefined; // element absent → unknown, NOT "no specials"
  // Same shape as the amenity spans: <br>-separated lines. Reuse the pure parser so
  // entity decoding / whitespace handling stays identical in one place.
  return parseAmenityValues(el.innerHTML);
}

/**
 * Property RENT RANGE from the the external site's detail page (supplemental, read-only). Confirmed
 * live element — the facts bar's price chip:
 *
 *   <div class="vp-modern factsBar"> … <span class="vp-chip vp-chip-price">$925 - $1,199</span> … </div>
 *
 * Matched by the PRICE-SPECIFIC class, never by position among `.vp-chip` siblings, so
 * a reordered or added chip can never be read as the rent. Parsed into a structured
 * range at extraction time so nothing downstream re-parses display text.
 *
 * This is the PROPERTY-WIDE range, not a selected unit's rent — the evaluator is
 * deliberately conservative about what it claims from it. Null when the chip is absent
 * or carries no figure (e.g. "Call for pricing"), which reads as unknown, never as $0.
 */
const RENT_SELECTOR = ".vp-modern.factsBar .vp-chip.vp-chip-price";

function readPropertyRent(): MoneyRange | null {
  const el = document.querySelector<HTMLElement>(RENT_SELECTOR);
  return el ? parseMoneyRange(clean(el.textContent)) : null;
}

function readCurrentProperty(): CurrentProperty | null {
  const propertyId = detectPropertyIdFromUrl();
  if (!propertyId) return null; // not a property-detail page
  const propertyName = readPropertyName();
  if (!propertyName) return null; // primary identity requires the name (retry for late DOM)
  // Address + submarket + management + emails + amenities + specials + image are
  // SUPPLEMENTAL — never block detection when unavailable. propertyUrl is the raw current URL (known-good).
  return {
    propertyId,
    propertyName,
    propertyAddress: readPropertyAddress(propertyName),
    propertySubmarket: readPropertySubmarket(),
    propertyManagement: readPropertyManagement(),
    propertyEmails: readPropertyEmails(),
    propertyAmenities: readPropertyAmenities(),
    propertySpecials: readPropertySpecials(),
    propertyRent: readPropertyRent(),
    propertyUrl: location.href,
    propertyImageUrl: readPropertyImageUrl(),
  };
}

// Compare-before-write dedupe (same approach as activeClientBridge): only touch
// storage when the detected property (or the cleared state) actually changed.
let lastWritten: string | null = null;

function writeCurrentProperty(cp: CurrentProperty | null): void {
  const serialized = cp ? JSON.stringify(cp) : "null";
  if (serialized === lastWritten) return;

  // Consent-gated and owner-bound, exactly like the active client. The owner is
  // borrowed from the CRM-established session (this page never sees the signed-in
  // identity); with no owner we do not write, so a captured property can never
  // surface under a different account.
  void (async () => {
    const owner = await getSessionOwner();
    if (!owner) return;
    const ok = await writeSensitive(CURRENT_PROPERTY_KEY, owner, cp ?? null);
    if (!ok) return;
    lastWritten = serialized;
  })();
  log(
    "current-property →",
    cp
      ? `${cp.propertyName} (#${cp.propertyId}) — amenities ${cp.propertyAmenities?.community.length ?? 0}c/${cp.propertyAmenities?.unit.length ?? 0}u, specials ${cp.propertySpecials?.length ?? "none"}`
      : "cleared",
  );
}

let retryTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * True while a detail page still looks INCOMPLETE. The identity (name) can resolve
 * before the external property site has rendered the supplemental blocks, and the old retry stopped the moment
 * the name appeared — so a late-rendering Amenities/Specials block was read once, came
 * back empty, and was never re-read for that page view. Treating "identity resolved but
 * supplemental blocks still absent" as incomplete lets the SAME bounded retry pick them
 * up. `propertySpecials === undefined` means the external property site rendered no specials element at all
 * (unknown); an empty amenities pair likewise means "nothing found YET".
 */
function isIncomplete(cp: CurrentProperty | null): boolean {
  if (!cp) return true;
  const a = cp.propertyAmenities;
  const amenitiesEmpty = !a || (a.community.length === 0 && a.unit.length === 0);
  return amenitiesEmpty || cp.propertySpecials === undefined;
}

/**
 * Detect the current property and write it to storage. Called on init and on every
 * navigation (reusing the existing content-script URL watcher — no extra polling).
 * On a detail page whose name isn't rendered yet (AJAX / late hydration) it retries
 * a few times briefly, then stops.
 */
export function syncCurrentProperty(): void {
  // ONLY the external property site tabs own this key. The content script also runs on
  // the CRM tab (locatorbeast.com/admin); it must NOT write/clear here, or it would
  // clobber the property a separate the external property site tab detected. Non-the external property site tabs are a no-op.
  if (!isSupportedPropertyHost(location.host)) return;

  if (retryTimer != null) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  const onDetailPage = detectPropertyIdFromUrl() !== null;
  const cp = readCurrentProperty();
  writeCurrentProperty(cp);

  if (onDetailPage && isIncomplete(cp)) {
    let tries = 0;
    const attempt = () => {
      tries += 1;
      // Bail if we navigated away from the detail page while retrying.
      if (detectPropertyIdFromUrl() === null) return;
      const again = readCurrentProperty();
      // Write every improvement as it arrives; compare-before-write drops no-op writes.
      if (again) writeCurrentProperty(again);
      // Keep going only while something is still missing — a property that genuinely
      // has no amenities simply costs the same bounded 6 cheap reads, then stops.
      if (isIncomplete(again) && tries < 6) retryTimer = setTimeout(attempt, 300);
    };
    retryTimer = setTimeout(attempt, 300);
  }
}

/** Start on the external property site/any page: detect now + re-detect once the page finishes loading
 *  (the DOM isn't ready at document_start). Navigation updates are driven by the
 *  content-script URL watcher, which also calls syncCurrentProperty(). */
export function startCurrentPropertyBridge(): void {
  syncCurrentProperty();
  window.addEventListener("load", syncCurrentProperty);
}
