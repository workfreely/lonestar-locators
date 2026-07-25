import type { Metadata } from "next";
import PageHero from "../_components/PageHero";
import Reveal from "../_components/Reveal";
import { SUPPORT_EMAIL } from "../_lib/site";

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
    body: "When you connect third-party services such as Google Calendar or Google Contacts, information is shared with those services in accordance with their own privacy policies and the permissions you grant.",
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
    body: "You may access, update, or request deletion of your personal information at any time by contacting us. You may also disconnect third-party integrations from within the application.",
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
