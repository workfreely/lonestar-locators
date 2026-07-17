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
