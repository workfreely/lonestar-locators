import type { Metadata } from "next";
import { HiOutlineEnvelope, HiOutlineClock, HiOutlineQuestionMarkCircle } from "react-icons/hi2";
import Link from "next/link";
import PageHero from "../_components/PageHero";
import ContactForm from "../_components/ContactForm";
import Reveal from "../_components/Reveal";
import { FAQ_URL, SUPPORT_EMAIL } from "../_lib/site";

export const metadata: Metadata = {
  title: "Contact",
  description: "Questions about Locator Beast? Reach out and we'll get back to you.",
  alternates: { canonical: "https://locatorbeast.com/contact" },
};

export default function ContactPage() {
  return (
    <>
      <PageHero
        title={
          <>
            Questions?
            <br />
            We&apos;re here to help.
          </>
        }
      />

      <section className="bg-white py-20 md:py-28">
        <div className="beast-container grid gap-14 md:grid-cols-[1fr_1.2fr] md:gap-16">
          <Reveal>
            <div className="flex flex-col gap-8">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--beast-blue)]/10">
                  <HiOutlineEnvelope className="h-5 w-5 text-[var(--beast-blue)]" />
                </div>
                <div>
                  <p className="text-[15px] font-semibold text-[var(--beast-ink)]">Email us</p>
                  <p className="mt-1 text-[14px] text-[var(--beast-ink-soft)]">{SUPPORT_EMAIL}</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--beast-blue)]/10">
                  <HiOutlineClock className="h-5 w-5 text-[var(--beast-blue)]" />
                </div>
                <div>
                  <p className="text-[15px] font-semibold text-[var(--beast-ink)]">Response time</p>
                  <p className="mt-1 text-[14px] text-[var(--beast-ink-soft)]">
                    We typically respond within 1 business day.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--beast-blue)]/10">
                  <HiOutlineQuestionMarkCircle className="h-5 w-5 text-[var(--beast-blue)]" />
                </div>
                <div>
                  <p className="text-[15px] font-semibold text-[var(--beast-ink)]">Have a quick question?</p>
                  <Link
                    href={FAQ_URL}
                    className="mt-1 inline-block text-[14px] font-medium text-[var(--beast-blue)] hover:text-[var(--beast-blue-bright)]"
                  >
                    Check the FAQ →
                  </Link>
                </div>
              </div>
            </div>
          </Reveal>

          <Reveal delayMs={100}>
            <ContactForm />
          </Reveal>
        </div>
      </section>
    </>
  );
}
