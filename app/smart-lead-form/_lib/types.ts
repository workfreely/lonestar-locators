// The Smart Lead Form's proven information hierarchy is fixed: Hero,
// Highlights, and the overlapping Agent Photo are one composed hero unit —
// always in that order, not reorderable — and the Form itself always
// anchors the page, with the consent footer always closing it. Only the
// trust/accessory sections after the form reorder, and only within their
// own zone. See AfterFormSectionId below.

import type { HeroThemeId } from "./heroThemes"

export type AfterFormSectionId = "testimonials" | "faq"

export type SmartLeadFormConfig = {
  sections: {
    afterForm: AfterFormSectionId[]
    visibility: {
      // The large hero headline. Hiding it collapses the hero upward so the
      // background image becomes the primary visual (image-focused style).
      // The footer, like Consent, is a fixed closing anchor that ALWAYS
      // renders — it has no visibility toggle.
      headline: boolean
      agentProfile: boolean
      highlights: boolean
      testimonials: boolean
      faq: boolean
      brokerageInfo: boolean
      serviceAreas: boolean
      socialLinks: boolean
      // Lives with the other Agent Information sub-toggles — phone number
      // is part of that one section, not a feature of its own.
      phoneNumber: boolean
      // Footer sub-item toggles live with the footer fields in the Content
      // tab, mirroring how brokerageInfo/serviceAreas sit next to Agent
      // Information's fields rather than in the Sections tab.
      footerBrokerageWebsite: boolean
      footerOfficePhone: boolean
      footerIabs: boolean
      footerConsumerProtectionNotice: boolean
    }
  }
  branding: {
    logoUrl: string | null
    agentPhotoUrl: string | null
    agentPhotoSize: "small" | "medium" | "large"
    // "overlapping" (default) keeps the agent photo where it's always
    // been — overlapping the hero's bottom edge, after Highlights.
    // "underHeadline" moves only the photo itself to sit directly under
    // the headline, before the subheadline; everything else (Highlights,
    // Agent Information's text, sizing) is unaffected.
    profileImagePosition: "overlapping" | "underHeadline"
    // "custom" reads heroImageUrl below; any other value is a built-in city
    // theme and reads its bundled default image instead (see heroThemes.ts).
    heroTheme: HeroThemeId
    heroImageUrl: string | null
    heroOverlay: "light" | "medium" | "dark"
    // Controls the submit button only — kept narrow and named for exactly
    // what it does, rather than a general "brand color" that touches
    // multiple elements.
    buttonColor: string
  }
  copy: {
    headline: string
    subheadline: string
    buttonText: string
    agentName: string
    agentTitle: string
    brokerageName: string
    serviceAreas: string
    socialHandle: string
    phoneNumber: string
    // Fixed at exactly 3 — the Highlights section shows a maximum of 3
    // pills, so there's no add/remove control, just three text fields.
    highlights: [string, string, string]
    // Same fixed-at-3 pattern as Highlights — no add/remove control.
    testimonials: [TestimonialItem, TestimonialItem, TestimonialItem]
    faqs: [FaqItem, FaqItem, FaqItem]
  }
  footer: {
    // Privacy Policy, Terms of Service, and "Powered by Locator Beast" are
    // platform-level and not editable here — only the locator's own
    // business details are.
    brokerageWebsiteUrl: string
    officePhone: string
    iabsUrl: string
    consumerProtectionNoticeUrl: string
  }
  consent: {
    enabled: boolean
    text: string
  }
}

export type TestimonialItem = {
  name: string
  city: string
  quote: string
  photoUrl: string | null
}

export type FaqItem = {
  question: string
  answer: string
}

export type FieldType = "text" | "tel" | "email" | "date" | "select"

export type FieldOption = { value: string; label: string }

export type FieldConfig = {
  id: string
  label: string
  type: FieldType
  autoComplete?: string
  options?: FieldOption[]
  placeholder?: string
}

// Placeholder qualification logic — illustrates the mechanism (a base
// question whose answer reveals different follow-ups) without committing to
// the real apartment-locating taxonomy yet. Swapping this table for the
// production question set later requires no editor or preview changes.
export type ConditionalRule = {
  when: (values: Record<string, string>) => boolean
  fields: FieldConfig[]
}
