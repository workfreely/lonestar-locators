export type OnboardingData = {
  full_name: string;
  business_name: string;
  brokerage: string;
  phone_number: string;
  service_areas: string[];
  profile_photo_url: string | null;
  business_logo_url: string | null;
  brand_color: string | null;
  google_connected: boolean;
  phone_sync_connected: boolean;
  leads_import_status: "imported" | "skipped" | null;
};

export const TOTAL_STEPS = 7;

export type StepProps = {
  data: OnboardingData;
  onChange: (patch: Partial<OnboardingData>) => void;
  onNext: (patch?: Partial<OnboardingData>) => void;
  onBack: () => void;
  saving: boolean;
};
