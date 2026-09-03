import type { KnowledgeArticle } from "../schema"

// Getting Started — verified-first release. Written to you, in plain language,
// using the exact labels shown in Locator Beast. No internal logic exposed.

export const GETTING_STARTED_ARTICLES: KnowledgeArticle[] = [
  {
    id: "gs-what-is-locator-beast",
    title: "What is Locator Beast?",
    categorySlug: "getting-started",
    slug: "what-is-locator-beast",
    type: "product-guide",
    shortAnswer:
      "Locator Beast is your all-in-one workspace for running your apartment-locating business — it keeps your clients, their searches, and your follow-ups in one place and tells you what to do next.",
    whyItMatters:
      "Instead of juggling spreadsheets, notes, and reminders, you get one place that keeps every client organized and never lets a follow-up slip.",
    whatItHelpsYouDo:
      "Track each client from their first message to a signed lease, find and recommend properties, collect leads with your own form, and see how you're pacing toward your commission goal.",
    steps: [
      "Finish setting up your account (profile, markets, and goal).",
      "Add your first client under Leads, or share your Smart Lead Form so clients add themselves.",
      "Work your Daily Agenda each day to see who needs your attention.",
    ],
    whatHappensNext:
      "Once your clients are in Locator Beast, your Agenda shows you who to contact and Locator Beast keeps each client's next step ready for you.",
    keywords: ["what is locator beast", "overview", "getting started", "basics", "how it works"],
    altPhrasings: ["What does Locator Beast do?", "How does Locator Beast work?", "Where do I start?", "What is this app for?"],
    relatedArticles: ["complete-your-profile", "add-your-first-lead", "use-the-daily-agenda"],
    videoUrl: "/academy",
    lastReviewed: "2026-09-02",
    status: "published",
    verification: "verified",
  },
  {
    id: "gs-complete-your-profile",
    title: "How to complete your profile",
    categorySlug: "getting-started",
    slug: "complete-your-profile",
    type: "product-guide",
    shortAnswer:
      "Open your avatar menu, select Profile, fill in your name, photo, and contact details, then select Save.",
    whyItMatters:
      "Your profile is how clients know who they're working with. Keeping it accurate and complete makes your published pages look professional and trustworthy.",
    whatItHelpsYouDo:
      "Show up correctly everywhere your details appear — including your Smart Lead Form and the pages your clients open.",
    whatClientSees:
      "Your name, photo, and contact information appear on your published Smart Lead Form and other client-facing pages, so clients see a complete, professional page.",
    steps: [
      "Select your avatar in the top corner to open the menu.",
      "Select Profile.",
      "Add or update your name, photo, and contact details.",
      "Select Save.",
    ],
    whatHappensNext:
      "Your updated details immediately appear anywhere your profile is shown to clients, including your Smart Lead Form.",
    commonMistakes: ["Leaving your photo or contact info blank, which makes your client-facing pages look unfinished."],
    keywords: ["profile", "complete profile", "photo", "contact information", "name", "account setup"],
    altPhrasings: ["How do I set up my profile?", "Where do I add my photo?", "How do I change my contact info?", "How do clients see my info?"],
    relatedArticles: ["select-your-markets", "create-and-customize-your-form"],
    videoUrl: "/academy",
    lastReviewed: "2026-09-02",
    status: "published",
    verification: "verified",
  },
  {
    id: "gs-select-your-markets",
    title: "How to select your markets",
    categorySlug: "getting-started",
    slug: "select-your-markets",
    type: "product-guide",
    shortAnswer:
      "Open your avatar menu, select Profile, and choose the markets you work in. The first market you select becomes your default.",
    whyItMatters:
      "Your markets decide which areas Locator Beast focuses on for you — including where the map opens and which neighborhoods your clients can choose.",
    whatItHelpsYouDo:
      "Work in the cities you actually serve and give your clients the right list of areas to pick from.",
    steps: [
      "Select your avatar and choose Profile.",
      "Find your markets and select the ones you work in.",
      "Select Save.",
    ],
    whatHappensNext:
      "Your selected markets are used across Locator Beast, and your first (primary) market decides where your map opens by default.",
    rulesOrLimitations: ["You can work in more than one market — select all that apply."],
    keywords: ["markets", "select market", "city", "change market", "service area", "multiple markets"],
    altPhrasings: ["How do I change my market?", "Can I work in more than one city?", "Where do I set my areas?", "How do I add a market?"],
    relatedArticles: ["complete-your-profile"],
    videoUrl: "/academy",
    lastReviewed: "2026-09-02",
    status: "published",
    verification: "verified",
  },
  {
    id: "gs-add-your-first-lead",
    title: "How to add your first lead",
    categorySlug: "getting-started",
    slug: "add-your-first-lead",
    type: "product-guide",
    shortAnswer: "Open Leads, select Add Lead, enter your client's details, and select Create Lead.",
    whyItMatters:
      "Adding a lead creates a client profile so Locator Beast can track their search and keep their next step ready for you.",
    whatItHelpsYouDo: "Keep every client in one place instead of in your phone or a notebook.",
    whatClientSees: "Nothing — adding a lead is your private CRM entry, separate from a Smart Lead Form submission.",
    steps: [
      "Open Leads.",
      "Select Add Lead.",
      "Enter the client's first name, last name, and phone.",
      "Add their move details, preferred locations, and property preferences as you have them.",
      "Choose a Lead Source, then select Create Lead.",
    ],
    whatHappensNext: "Your new client appears in your workspace and in your Daily Agenda when they need attention.",
    rulesOrLimitations: ["If a matching client already exists, you'll be asked whether to update it instead of creating a duplicate."],
    keywords: ["add lead", "first lead", "create client", "new lead", "add client"],
    altPhrasings: ["How do I add a client?", "How do I create my first lead?", "Where do I enter a new client?"],
    relatedArticles: ["how-to-add-a-lead", "understanding-lead-stages", "use-the-daily-agenda"],
    videoUrl: "/academy",
    lastReviewed: "2026-09-02",
    status: "published",
    verification: "verified",
  },
  {
    id: "gs-get-help-inside-locator-beast",
    title: "How to get help inside Locator Beast",
    categorySlug: "getting-started",
    slug: "get-help-inside-locator-beast",
    type: "product-guide",
    shortAnswer:
      "Open the Help Center from your avatar menu to search guides and how-to articles, or select Ask Beast AI to ask a question in your own words.",
    whyItMatters:
      "When you're unsure how to do something, you can get a clear answer without leaving your work.",
    whatItHelpsYouDo: "Find step-by-step instructions, troubleshoot issues, and learn how features work — anytime.",
    steps: [
      "Select your avatar and choose Help Center.",
      "Search for what you need, or browse a category.",
      "If you still need help, select Ask Beast AI and ask your question.",
    ],
    whatHappensNext: "You'll get a direct answer with a link to the full guide, so you can finish the task.",
    keywords: ["help", "support", "help center", "ask beast", "how do i", "guides"],
    altPhrasings: ["Where do I get help?", "How do I find a guide?", "Is there support?", "How do I ask a question?"],
    relatedArticles: ["what-is-locator-beast"],
    lastReviewed: "2026-09-02",
    status: "published",
    verification: "verified",
  },
]
