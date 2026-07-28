export type OnboardingData = {
  // Business Profile
  first_name: string;
  last_name: string;
  full_name: string;
  business_name: string;
  email: string;
  brokerage: string;
  phone_number: string;
  service_areas: string[];
  profile_photo_url: string | null;
  business_logo_url: string | null;
  brand_color: string | null;
  // Business Goals
  monthly_commission_goal: number | null;
  avg_commission_per_lease: number | null;
  // Connections
  google_connected: boolean;
  phone_sync_connected: boolean;
  // Import
  leads_import_status: "imported" | "skipped" | null;
};

// Six internal screens: Welcome (unnumbered) → Business Profile → Business
// Goals → Connect → Import → Building. Welcome doesn't count as a numbered
// step, so the five NUMBERED steps are Business Profile (1) … Building (5).
// Displayed number = internal step − 1. Building is a full-screen finale.
export const TOTAL_STEPS = 6;
export const NUMBERED_STEPS = 5;

// Used when the user skips the Business Goals step — sensible starting values
// they can change anytime in Settings.
export const DEFAULT_MONTHLY_COMMISSION_GOAL = 15000;
export const DEFAULT_AVG_COMMISSION_PER_LEASE = 1500;

export type StepProps = {
  data: OnboardingData;
  onChange: (patch: Partial<OnboardingData>) => void;
  onNext: (patch?: Partial<OnboardingData>) => void;
  onBack: () => void;
  saving: boolean;
};
