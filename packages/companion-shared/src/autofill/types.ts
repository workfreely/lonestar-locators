// Schedule Tour autofill — shared contract between the CRM/Companion (which
// assemble the values) and the injected page filler (which writes them into a
// tour/contact form). The filler itself is a SELF-CONTAINED function (no imports)
// so chrome.scripting.executeScript can serialize it; these types only describe
// its argument and result for the callers that pass/consume them.

/** The client's contact data — fills the PROSPECT fields (name/email/phone/etc.). */
export type AutofillClient = {
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  /** ISO "YYYY-MM-DD" preferred; passed straight to date inputs. */
  moveDate?: string | null;
  /** Free text like "2", "studio", "2 bed" — matched to a bedrooms select/option. */
  bedrooms?: string | null;
};

/** The locator's own contact data — fills the MESSAGE/COMMENTS field only, never
 *  the client contact fields. */
export type AutofillLocator = {
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  email?: string | null;
  title?: string | null;
  brokerage?: string | null;
};

export type AutofillPayload = {
  client: AutofillClient;
  locator?: AutofillLocator | null;
  /** Optional pre-composed message; when omitted the filler composes one from the
   *  locator identity. */
  message?: string | null;
  /** When true, detect and report but write nothing (used for probing). */
  dryRun?: boolean;
};

/** Canonical fields the filler tries, in a fixed order. */
export type AutofillFieldKey =
  | "firstName" | "lastName" | "email" | "phone" | "moveDate" | "bedrooms" | "message";

export type AutofillFieldAction =
  | "filled" | "would-fill" | "not-found" | "no-value"
  | "low-confidence" | "skip-user-value" | "select-no-match";

export type AutofillFieldReport = {
  field: AutofillFieldKey;
  action: AutofillFieldAction;
  /** Short element descriptor, e.g. "input[name=first_name]". */
  el?: string;
  /** Detection confidence score (higher = stronger signal match). */
  score?: number;
  /** Which detection strategies matched, e.g. "autocomplete+name+placeholder". */
  strategy?: string;
};

export type AutofillResult = {
  origin: string;
  url: string;
  /** Count of fields actually written (0 in dryRun). */
  filled: number;
  /** Count of fields we had a value for and tried to place. */
  attempted: number;
  frames: { total: number; crossOriginBlocked: number };
  report: AutofillFieldReport[];
  /** Visible tour-open actions found on the page (e.g. "Open Scheduler", "Book a
   *  Tour") — used to guide the locator when nothing was fillable yet: open the
   *  scheduler / pick a slot, then Autofill again. */
  tourTriggers?: string[];
};
