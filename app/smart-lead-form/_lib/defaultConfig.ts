import type { SmartLeadFormConfig } from "./types"

export const DEFAULT_CONFIG: SmartLeadFormConfig = {
  sections: {
    afterForm: ["testimonials", "faq"],
    visibility: {
      headline: true,
      agentProfile: true,
      highlights: true,
      testimonials: true,
      faq: true,
      // Minimal, conversion-focused hero by default. Brokerage + phone are OFF
      // for new forms (still toggle-able by the agent, and shown in footer/IABS/
      // emails/guest cards/CRM/profile). serviceAreas stays on.
      brokerageInfo: false,
      serviceAreas: true,
      socialLinks: false,
      phoneNumber: false,
      footerBrokerageWebsite: false,
      footerOfficePhone: false,
      footerIabs: true,
      footerConsumerProtectionNotice: true,
    },
  },
  branding: {
    logoUrl: null,
    agentPhotoUrl: null,
    agentPhotoSize: "medium",
    profileImagePosition: "underHeadline",
    heroTheme: "custom",
    heroImageUrl: null,
    heroOverlay: "medium",
    buttonColor: "#2f6bff",
  },
  copy: {
    headline: "Stop Wasting Time Searching for Apartments",
    // Short promise by default (no long descriptive paragraph). The agent can
    // replace this with longer copy in the editor if they choose.
    subheadline: "Get Your Free Custom Apartment List",
    buttonText: "Get My Apartment List",
    agentName: "Jordan Blake",
    agentTitle: "Licensed Apartment Locator",
    brokerageName: "Placeholder Realty Group",
    serviceAreas: "Austin, Dallas, Houston",
    socialHandle: "@jordanfindsapartments",
    phoneNumber: "(210) 555-1234",
    highlights: ["Free Service", "Cash Rebate", "Free Movers"],
    testimonials: [
      { name: "Sarah M.", city: "Austin, TX", quote: "Found us the perfect place in two days. Completely free and so easy.", photoUrl: null },
      { name: "Marcus T.", city: "Dallas, TX", quote: "I didn't think a free service could be this good. Highly recommend.", photoUrl: null },
      { name: "Priya R.", city: "Houston, TX", quote: "Saved me hours of searching. They knew exactly what I needed.", photoUrl: null },
    ],
    faqs: [
      {
        question: "Is this service really free?",
        answer:
          "Yes! I'm partnered with apartment communities, and they pay my brokerage for helping you find a place, so there's never a cost to you.",
      },
      { question: "When will I get my list?", answer: "Most clients receive their personalized list within 24 hours." },
      {
        question: "Do I have to work with you exclusively?",
        answer: "Yes. We're only allowed to work with one agent at a time so there's no confusion about who represents you.",
      },
    ],
  },
  footer: {
    brokerageWebsiteUrl: "",
    officePhone: "",
    iabsUrl: "",
    consumerProtectionNoticeUrl: "",
    // Reusable additional legal/disclosure links (title + url). Empty by default;
    // persisted in the JSON config (no schema change). Incomplete rows are skipped
    // when rendering the public footer.
    customDisclosures: [],
  },
  consent: {
    enabled: true,
    text: "I agree to receive text messages or emails regarding my apartment search.",
  },
  fields: {
    moveDate: true,
    location: true,
    propertyDetails: true,
    mustHaveAmenities: true,
    desiredRent: true,
    income: true,
    creditScore: true,
    rentalBackground: true,
    criminalBackground: true,
    notes: true,
  },
}
