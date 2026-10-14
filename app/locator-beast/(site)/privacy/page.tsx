import type { Metadata } from "next";
import PageHero from "@/app/locator-beast/(site)/_components/PageHero";
import Reveal from "@/app/locator-beast/(site)/_components/Reveal";
import { SUPPORT_EMAIL } from "@/app/locator-beast/_lib/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Locator Beast collects, uses, and protects your information.",
  alternates: { canonical: "https://locatorbeast.com/privacy" },
  robots: { index: false, follow: true },
};

const SECTIONS = [
  {
    heading: "Introduction",
    body: "This Privacy Policy explains how Locator Beast (“we,” “us,” or “our”) collects, uses, and protects information when you use our desktop application and website. By using Locator Beast, you agree to the practices described here.",
  },
  {
    heading: "Information We Collect",
    body: "We collect information you provide directly, such as your name, email address, phone number, and billing details when you create an account. We also collect information generated through your use of the product, including client and lead data you enter, and data from integrations you connect, such as Google Contacts and Google Calendar.",
  },
  {
    heading: "How We Use Your Information",
    body: "We use the information we collect to provide and improve Locator Beast, process payments, communicate with you about your account, provide customer support, and maintain the security of our systems.",
  },
  {
    heading: "Information Sharing",
    body: "We do not sell your personal information. We share information only with service providers who help us operate Locator Beast (such as payment processors and hosting providers), or when required by law.",
  },
  {
    heading: "Third-Party Integrations",
    body: "When you connect third-party services, information is shared with those services in accordance with their own privacy policies and the permissions you grant. Our Google Calendar and Google Contacts integration is described in detail in the two sections below.",
  },
  {
    heading: "Google Calendar and Google Contacts",
    body:
      "Connecting your Google account is optional, and it is separate from signing in with Google \u2014 signing in uses only your name and email address and grants no access to your calendar or contacts. " +
      "CONTACTS: with your permission, Locator Beast creates a Google contact in your account for each new lead you receive. To avoid creating a duplicate, it searches your Google Contacts by phone number, which reads the names, phone numbers and identifiers of the contacts that match; only the identifier of the matching contact is used, and the rest is discarded immediately and never stored. When a lead\u2019s stage changes, we update the notes field of the matching contact \u2014 including a contact you created yourself, if it matches the lead\u2019s phone number. We change no other field, and we never delete a contact. " +
      "CALENDAR: we create and update events on your primary calendar for your own follow-up deadlines. We update only events we created, identified by an event id we stored when creating them, and we never delete an event. " +
      "WHAT WE DO WITH IT: information read from your Google account is used only for the purposes above. It is not sent to any AI model, is not used for advertising, and we do not sell it. The contacts and calendar events themselves live in your Google account, not ours; what we store is the lead record you already entered, plus the identifiers linking it to the contact and event we created.",
  },
  {
    heading: "Your Google Authorization",
    body:
      "Your Google authorization is held as a refresh token stored in our database. It is readable only by the Locator Beast server \u2014 no browser, and no other agent, can read it. " +
      "You can disconnect at any time from the Integrations page. Disconnecting asks Google to revoke the authorization and removes the stored token, so Locator Beast stops creating or updating contacts and events for you immediately. If we cannot confirm that Google revoked the authorization, we tell you so rather than reporting success, and you can remove it yourself at https://myaccount.google.com/permissions. " +
      "Disconnecting does not sign you out of Locator Beast and does not affect signing in with Google. Contacts and calendar events already created remain in your Google account and are yours to keep, edit, or delete; your leads and their history in Locator Beast are unaffected. You can reconnect at any time. " +
      "Deleting your Locator Beast account revokes this authorization and deletes the stored token automatically.",
  },
  {
    heading: "Google API Services User Data Policy",
    body: "Locator Beast\u2019s use of information received from Google APIs adheres to the Google API Services User Data Policy, including its Limited Use requirements.",
  },
  {
    heading: "Data Security",
    body: "We use industry-standard technical and organizational measures to protect your information against unauthorized access, alteration, disclosure, or destruction.",
  },
  {
    heading: "Data Retention",
    body: "We retain your information for as long as your account is active or as needed to provide the service, comply with legal obligations, resolve disputes, and enforce our agreements.",
  },
  {
    heading: "Your Rights and Choices",
    body: "You may access, update, or request deletion of your personal information at any time by contacting us, and you may delete your account from your account settings. You may disconnect your Google Calendar and Google Contacts authorization at any time from the Integrations page, or directly from your Google Account\u2019s permissions page.",
  },
  {
    heading: "Beast Companion Browser Extension",
    body:
      "Beast Companion is an optional Chrome extension that displays your authorized Locator Beast client information while you research apartments on supported apartment-research websites. " +
      "DATA IT HANDLES: client contact details (name and phone), rental criteria (budget, bedrooms, move date, desired areas), and screening information you have recorded in Locator Beast \u2014 including income, credit score and credit history, broken-lease and eviction information, and criminal-background information. It also reads publicly displayed details of the apartment property page you are currently viewing on a supported site, such as the property name, address, image, and amenities. " +
      "PURPOSE: this information is displayed to you, the signed-in locator, so you can match a property against your client's criteria without switching windows. It is used for no other purpose. " +
      "LOCAL STORAGE AND RETENTION: the extension stores this information only on your own device, only for the current browsing session. It is bound to your signed-in Locator Beast account and workspace, expires within 12 hours, is erased when you sign out of Locator Beast, and is discarded entirely when you close your browser. It is never written to your device’s permanent storage by the extension. " +
      "CLEARING AND DELETION: your stored extension data is erased automatically when you sign out of Locator Beast and when you close your browser, and it expires on its own within 12 hours. You can clear it at any time by signing out of Locator Beast, and you can withdraw your consent by removing Beast Companion from your browser, which stops the extension from storing anything further until you install it and accept again. " +
      "SUPPORTED-SITE PAGE ACCESS: the extension only runs on supported apartment-research websites and on the authenticated Locator Beast application. It does not run on, read, or record any other website you visit, and it does not build a browsing history. " +
      "NETWORK ACTIVITY: Beast Companion does not make its own external network requests. Information displayed in the panel stays in your browser. When you intentionally perform a CRM action, such as updating a recommendation or workflow, the open Locator Beast application may securely save that action to your Locator Beast account over an encrypted connection \u2014 the same way it would if you performed that action in the Locator Beast tab directly. The extension itself transmits nothing. " +
      "NO SALE, NO ADVERTISING: your information is never sold, never shared with third parties, and never used for advertising, tracking, analytics, or creditworthiness decisions. The extension contains no analytics or tracking code. " +
      "WEB BROWSING ACTIVITY: the extension processes the address of the supported apartment-research page you are currently viewing. It operates only on supported apartment-research websites, uses the property page currently being viewed solely for the user-visible property workflow, does not create or retain a browsing-history profile, is not used for analytics, advertising, or tracking, and discards the page context when the tab closes. " +
      "YOUR RESPONSIBILITIES: the client information Beast Companion displays \u2014 including rental, financial, and background-screening details \u2014 belongs to your clients and is subject to your own legal and professional obligations. You are responsible for handling client screening information in accordance with your brokerage\u2019s obligations and applicable law, including obtaining any consents your clients are owed, limiting who can see your screen while the panel is open, and using the information only for the purpose for which it was collected. " +
      "LIMITED USE: Beast Companion\u2019s use of information received from Google APIs and from your Locator Beast account adheres to the Chrome Web Store User Data Policy, including its Limited Use requirements. " +
      "SECURITY PROTECTIONS: client information is never placed into the web page you are viewing, so other websites and their scripts cannot read it. Messages the extension accepts are restricted to the exact Locator Beast origin, validated against a strict schema, and bound to your account. The extension contains no remote or dynamically loaded code. " +
      `CONTACT: for questions about Beast Companion or to request deletion of information, contact us at ${SUPPORT_EMAIL}.`,
  },
  {
    heading: "Children's Privacy",
    body: "Locator Beast is intended for business use by apartment locating professionals and is not directed to individuals under the age of 18.",
  },
  {
    heading: "Changes to This Policy",
    body: "We may update this Privacy Policy from time to time. We will notify you of material changes by posting the updated policy with a new effective date.",
  },
  {
    heading: "Contact Us",
    body: `If you have questions about this Privacy Policy, contact us at ${SUPPORT_EMAIL}.`,
  },
];

export default function PrivacyPage() {
  return (
    <>
      <PageHero title="Privacy Policy" subtitle="Last updated: July 2026" />

      <section className="bg-white py-20 md:py-28">
        <div className="beast-container max-w-3xl">
          <Reveal>
            <p className="text-[15px] leading-relaxed text-[var(--beast-ink-soft)]">
              This is a general placeholder privacy policy for Locator Beast and does not
              constitute legal advice. Replace this content with a policy reviewed by legal
              counsel before launch.
            </p>
          </Reveal>

          <div className="mt-12 flex flex-col gap-10">
            {SECTIONS.map((section, i) => (
              <Reveal key={section.heading} delayMs={(i % 4) * 60}>
                <div>
                  <h2 className="text-[19px] font-semibold text-[var(--beast-ink)]">{section.heading}</h2>
                  <p className="mt-3 text-[15px] leading-relaxed text-[var(--beast-ink-soft)]">
                    {section.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
