import type { Metadata } from "next";
import PageHero from "../_components/PageHero";
import Reveal from "../_components/Reveal";
import { SUPPORT_EMAIL } from "../_lib/site";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that govern your use of Locator Beast.",
  alternates: { canonical: "https://locatorbeast.com/terms" },
  robots: { index: false, follow: true },
};

const SECTIONS = [
  {
    heading: "Acceptance of Terms",
    body: "By accessing or using Locator Beast, you agree to be bound by these Terms of Service. If you do not agree to these terms, do not use the service.",
  },
  {
    heading: "Description of Service",
    body: "Locator Beast is a desktop application that provides CRM, workflow automation, and related tools built for apartment locating businesses.",
  },
  {
    heading: "Account Registration",
    body: "You must provide accurate and complete information when creating an account, and you are responsible for maintaining the confidentiality of your login credentials.",
  },
  {
    heading: "Free Trial",
    body: "New accounts receive a 30-day free trial. No credit card is required to begin a trial. At the end of the trial, continued use of the service requires an active paid subscription.",
  },
  {
    heading: "Subscription and Billing",
    body: "Locator Beast is billed monthly at the then-current subscription price. Subscriptions renew automatically until canceled. You may cancel at any time, and cancellation takes effect at the end of the current billing period.",
  },
  {
    heading: "Acceptable Use",
    body: "You agree not to use Locator Beast for any unlawful purpose, to misuse client data, or to attempt to disrupt or compromise the security of the service.",
  },
  {
    heading: "Your Data",
    body: "You retain ownership of the client and lead data you enter into Locator Beast. We access your data only as necessary to provide and support the service.",
  },
  {
    heading: "Intellectual Property",
    body: "Locator Beast and all associated software, branding, and content are the property of Locator Beast and its licensors. These Terms do not grant you any rights to our trademarks or branding.",
  },
  {
    heading: "Termination",
    body: "We may suspend or terminate your access to Locator Beast if you violate these Terms. You may stop using the service and cancel your subscription at any time.",
  },
  {
    heading: "Disclaimers and Limitation of Liability",
    body: "Locator Beast is provided “as is” without warranties of any kind. To the maximum extent permitted by law, Locator Beast will not be liable for indirect, incidental, or consequential damages arising from your use of the service.",
  },
  {
    heading: "Changes to These Terms",
    body: "We may update these Terms from time to time. Continued use of Locator Beast after changes take effect constitutes acceptance of the updated Terms.",
  },
  {
    heading: "Governing Law",
    body: "These Terms are governed by the laws of the State of Texas, without regard to its conflict of law principles.",
  },
  {
    heading: "Contact Us",
    body: `If you have questions about these Terms, contact us at ${SUPPORT_EMAIL}.`,
  },
];

export default function TermsPage() {
  return (
    <>
      <PageHero title="Terms of Service" subtitle="Last updated: July 2026" />

      <section className="bg-white py-20 md:py-28">
        <div className="beast-container max-w-3xl">
          <Reveal>
            <p className="text-[15px] leading-relaxed text-[var(--beast-ink-soft)]">
              This is a general placeholder Terms of Service for Locator Beast and does not
              constitute legal advice. Replace this content with terms reviewed by legal counsel
              before launch.
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
