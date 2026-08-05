import type { Metadata } from "next";
import Link from "next/link";
import { HiOutlineEnvelope, HiOutlineBookOpen, HiOutlineChatBubbleLeftRight } from "react-icons/hi2";
import PageHero from "@/app/locator-beast/(site)/_components/PageHero";
import Reveal from "@/app/locator-beast/(site)/_components/Reveal";
import { SUPPORT_EMAIL, FAQ_URL } from "@/app/locator-beast/_lib/site";

export const metadata: Metadata = {
  title: "Support",
  description:
    "Get help with Locator Beast — email support, guides, and answers to the questions apartment locators ask most.",
  alternates: { canonical: "https://locatorbeast.com/support" },
};

const CARDS = [
  {
    icon: HiOutlineEnvelope,
    title: "Email support",
    body: `Reach the team at ${SUPPORT_EMAIL}. We typically reply within one business day.`,
    href: `mailto:${SUPPORT_EMAIL}`,
    cta: "Email us",
  },
  {
    icon: HiOutlineBookOpen,
    title: "Guides & FAQ",
    body: "Setup walkthroughs, workflow tips, and answers to the questions locators ask most.",
    href: FAQ_URL,
    cta: "Browse the FAQ →",
  },
  {
    icon: HiOutlineChatBubbleLeftRight,
    title: "Feature requests",
    body: "Tell us what would make your workflow faster — every request reaches the product team.",
    href: "/contact",
    cta: "Share an idea →",
  },
];

export default function SupportPage() {
  return (
    <>
      <PageHero
        eyebrow="Support"
        title={<>We&apos;ve got your back.</>}
        subtitle="Help when you need it — so you can stay focused on closing leases."
      />

      <section className="bg-white py-20 md:py-28">
        <div className="beast-container grid gap-6 md:grid-cols-3">
          {CARDS.map((c, i) => {
            const Icon = c.icon;
            return (
              <Reveal key={c.title} delayMs={i * 100}>
                <div className="flex h-full flex-col rounded-2xl border border-[var(--beast-border)] bg-white p-7">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--beast-blue)]/10">
                    <Icon className="h-5 w-5 text-[var(--beast-blue)]" />
                  </div>
                  <p className="mt-5 text-[16px] font-semibold text-[var(--beast-ink)]">{c.title}</p>
                  <p className="mt-2 flex-1 text-[14px] leading-relaxed text-[var(--beast-ink-soft)]">{c.body}</p>
                  <Link
                    href={c.href}
                    className="mt-4 inline-block text-[14px] font-medium text-[var(--beast-blue)] hover:text-[var(--beast-blue-bright)]"
                  >
                    {c.cta}
                  </Link>
                </div>
              </Reveal>
            );
          })}
        </div>
      </section>
    </>
  );
}
