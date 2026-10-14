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
    // DEFAULTS FOR A FORM NOBODY HAS CONFIGURED YET.
    //
    // These three were medium / underHeadline / medium and are now large /
    // overlapping / dark — the combination already proven on a live locator form
    // rather than a guess. They apply ONLY where a value has never been saved:
    // mergeSmartFormConfig layers a saved config OVER this object, so an agent who
    // chose their own photo size, position or overlay keeps it untouched. Verified
    // against production before the change: every saved config carries all three
    // keys explicitly, so none of them inherits anything from here.
    //
    // Overlapping also brings the reassurance line with it — AgentProfile (which
    // renders the green pill) is only mounted in the overlapping layout, and Under
    // Headline never showed it. So this ADDS that line to new forms; it does not
    // move, restyle or remove it anywhere.
    agentPhotoSize: "large",
    profileImagePosition: "overlapping",
    // "custom" + a null image is the neutral dark hero, and it stays the fallback
    // for a workspace with no market: buildInitialSmartFormConfig only writes
    // heroTheme when defaultThemeForMarkets resolves one, so an unknown market
    // keeps this dark background rather than borrowing another city's skyline.
    heroTheme: "custom",
    heroImageUrl: null,
    heroOverlay: "dark",
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
    formReassurance: "Takes less than a minute to complete",
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
  // "" so resolveThankYouMedia applies the legacy rule: an agent who configured a video before
  // this control existed keeps it; everyone else gets testimonials, the intended default.
  thankYouMedia: "",
  thankYouVideoUrl: "",
  thankYouApplyInstructions: "",
  thankYouIncentive: "",
  thankYouShowReward: "",
  thankYouRewardTitle: "",
  thankYouIntro: "",
  thankYouStep2Title: "",
  thankYouStep2Body: "",
  thankYouStep3Title: "",
  thankYouStep3Body: "",
  thankYouStep4Title: "",
}
