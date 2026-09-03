import type { KnowledgeArticle } from "../schema"

export const SMART_LEAD_FORM_ARTICLES: KnowledgeArticle[] = [
  {
    id: "slf-create-and-customize-your-form",
    title: "How to create and customize your Smart Lead Form",
    categorySlug: "smart-lead-form",
    slug: "create-and-customize-your-form",
    type: "product-guide",
    shortAnswer:
      "Open Smart Lead Form from your avatar menu, customize the content to fit your business, and select Save.",
    whyItMatters:
      "Your Smart Lead Form collects the information you need before you begin a client's apartment search. This saves you time and gives your client a simple way to share their budget, move date, preferred areas, and apartment needs.",
    whatItHelpsYouDo: "Capture new clients automatically with a professional page that's ready to share.",
    whatClientSees:
      "Clients open your form and fill in their details. Your profile and contact information may appear on the published page, so review those before sharing.",
    steps: [
      "Select your avatar and choose Smart Lead Form.",
      "Customize the content so it fits your business.",
      "Review your profile and contact information, since your client may see those details.",
      "Select Save.",
    ],
    whatHappensNext: "Your changes are saved and your form stays live and ready to share.",
    commonMistakes: ["Sharing your form before checking your profile details, which then appear incomplete to clients."],
    keywords: ["smart lead form", "create form", "customize form", "lead form", "intake form"],
    altPhrasings: ["How do I create my lead form?", "How do I customize my form?", "How do I set up my intake form?"],
    relatedArticles: ["publish-your-form", "share-your-form-link", "complete-your-profile"],
    videoUrl: "/academy",
    lastReviewed: "2026-09-02",
    status: "published",
    verification: "verified",
  },
  {
    id: "slf-publish-your-form",
    title: "How to publish your Smart Lead Form",
    categorySlug: "smart-lead-form",
    slug: "publish-your-form",
    type: "product-guide",
    shortAnswer:
      "Your Smart Lead Form stays live automatically. When you select Save in the Smart Lead Form editor, your latest version is what clients see.",
    whyItMatters:
      "You don't have to publish separately — saving keeps your live form up to date, so what you see is what your clients get.",
    whatItHelpsYouDo: "Make changes with confidence, knowing your saved version is the one clients open.",
    steps: [
      "Open Smart Lead Form from your avatar menu.",
      "Make your changes.",
      "Select Save.",
    ],
    whatHappensNext: "Your saved form is immediately the live version at your form link.",
    keywords: ["publish form", "save form", "make form live", "go live", "publish"],
    altPhrasings: ["How do I publish my form?", "How do I make my form live?", "Do I need to publish after saving?"],
    relatedArticles: ["create-and-customize-your-form", "share-your-form-link"],
    lastReviewed: "2026-09-02",
    status: "published",
    verification: "verified",
  },
  {
    id: "slf-share-your-form-link",
    title: "How to share your form link",
    categorySlug: "smart-lead-form",
    slug: "share-your-form-link",
    type: "product-guide",
    shortAnswer:
      "Copy your form link from the Smart Lead Form editor and share it with clients — in a text, a social post, or your bio.",
    whyItMatters:
      "Sharing your link is how new clients reach you. Anyone who opens it can send you their search details without you doing the data entry.",
    whatItHelpsYouDo: "Bring in new leads from anywhere you share your link.",
    whatClientSees: "Clients open your published form, fill it in, and submit their details to you.",
    steps: [
      "Open Smart Lead Form from your avatar menu.",
      "Copy your form link.",
      "Share it wherever you reach clients — a text, a social post, or your profile bio.",
    ],
    whatHappensNext: "When a client submits your form, they arrive in Locator Beast as a new lead.",
    keywords: ["form link", "share form", "form url", "copy link", "share my form"],
    altPhrasings: ["Where is my form link?", "How do I share my form?", "How do clients reach my form?", "How do I get my form URL?"],
    relatedArticles: ["find-a-submitted-lead", "publish-your-form"],
    lastReviewed: "2026-09-02",
    status: "published",
    verification: "verified",
  },
  {
    id: "slf-find-a-submitted-lead",
    title: "How to find a submitted lead",
    categorySlug: "smart-lead-form",
    slug: "find-a-submitted-lead",
    type: "product-guide",
    shortAnswer:
      "When a client submits your Smart Lead Form, they appear in Leads as a new client with the details they entered.",
    whyItMatters:
      "Submissions come straight into your workspace, so you can start working a new client right away — no copying and pasting.",
    whatItHelpsYouDo: "Pick up a new client's search immediately with the info they already gave you.",
    steps: [
      "Open Leads.",
      "Look for the new client — they arrive with the details from your form.",
      "Open their profile to review what they shared and take the next step.",
    ],
    whatHappensNext: "The new client is ready to work like any other lead, with their first Next Action waiting.",
    troubleshooting: "A client says they submitted but you don't see them? See \"My Smart Lead Form submission did not appear.\"",
    keywords: ["submitted lead", "form submission", "new submission", "where do submissions go", "find lead"],
    altPhrasings: ["Where do form submissions go?", "How do I find a client who filled out my form?", "What happens when someone submits my form?"],
    relatedArticles: ["share-your-form-link", "how-to-add-a-lead"],
    lastReviewed: "2026-09-02",
    status: "published",
    verification: "verified",
  },
]
