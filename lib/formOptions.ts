// ─── Shared form option constants ────────────────────────────────────────────
// Used by LeadFields.tsx (CRM Add Lead modal) and the public intake forms.
// Keep values in sync with LandingForm.tsx and ContactForm.tsx.

export const CITIES = ["San Antonio", "Austin", "Dallas", "Houston"] as const

export const PROPERTY_TYPES = [
  "Studio",
  "Apartment",
  "High-Rise",
  "Townhome",
  "Rental Home",
  "Penthouse",
  "Loft",
  "Open to All",
] as const

export const BED_OPTIONS = [
  { value: "1",  label: "1 Bedroom"  },
  { value: "2",  label: "2 Bedrooms" },
  { value: "3+", label: "3+ Bedrooms" },
] as const

export const CREDIT_HISTORY_OPTIONS = [
  { value: "Clean",        label: "No Broken Lease or Eviction" },
  { value: "Broken Lease", label: "Broken Lease" },
  { value: "Eviction",     label: "Eviction" },
] as const

/** Age buckets reused for broken lease, eviction, felony, and misdemeanor */
export const HISTORY_AGE_OPTIONS = [
  "Less than 1 year",
  "1 year",
  "2 years",
  "3 years",
  "5 years",
  "7+ years",
] as const

/** Balance buckets reused for broken lease and eviction */
export const BALANCE_OPTIONS = [
  "Less than $500",
  "$500-$1,000",
  "$1,000-$2,000",
  "$2,000-$5,000",
  "$5,000+",
] as const

export const CRIMINAL_BACKGROUND_OPTIONS = [
  { value: "None",        label: "No Criminal Background" },
  { value: "Misdemeanor", label: "Misdemeanor"            },
  { value: "Felony",      label: "Felony"                 },
] as const

export const RENT_RANGE_OPTIONS = [
  "$900–$1,000",
  "$1,000–$1,100",
  "$1,100–$1,200",
  "$1,200–$1,300",
  "$1,300–$1,400",
  "$1,400–$1,500",
  "$1,500–$1,600",
  "$1,600–$1,700",
  "$1,700–$1,800",
  "$1,800–$1,900",
  "$1,900–$2,000",
  "$2,000–$2,100",
  "$2,100–$2,200",
  "$2,200–$2,300",
  "$2,300–$2,400",
  "$2,400–$2,500",
  "$2,500–$3,000",
  "$3,000–$4,000",
  "$4,000+",
] as const

export const CRIMINAL_CHARGE_OPTIONS = [
  "DWI",
  "Drug Related",
  "Assault",
  "Theft / Fraud",
  "Sex Offense",
  "Other",
] as const

/** Monthly household income brackets — moved here from the public Smart Lead Form
 *  so the CRM Add Lead form and the public form share ONE list (values verbatim). */
export const INCOME_OPTIONS = [
  "Under $2,500 / month",
  "$2,500 – $4,000 / month",
  "$4,000 – $6,000 / month",
  "$6,000 – $8,000 / month",
  "$8,000 – $10,000 / month",
  "$10,000+ / month",
] as const

/** Bathroom options — same values the public form's inline baths select uses. */
export const BATH_OPTIONS = [
  { value: "1",  label: "1 Bathroom"  },
  { value: "2",  label: "2 Bathrooms" },
  { value: "3+", label: "3+ Bathrooms" },
] as const

/** The COMBINED cap across Preferred Neighborhoods + Nearby Areas — max this many
 *  TOTAL selections (not per section). Shared with the public Smart Lead Form so the
 *  rule has ONE definition.
 *
 *  Consumers should import from lib/leads/areaLimit instead, which owns the counting
 *  and the save/refuse verdict (including how legacy over-cap leads reduce). This
 *  stays the single numeric source so the two existing picker imports keep working. */
export const MAX_LOCATIONS = 2
