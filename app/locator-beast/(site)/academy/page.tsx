import type { Metadata } from "next";
import PageHero from "@/app/locator-beast/(site)/_components/PageHero";
import AcademyModules from "@/app/locator-beast/(site)/academy/_components/AcademyModules";

export const metadata: Metadata = {
  title: "Beast Academy",
  description: "Learn how to build and grow a successful apartment locating business.",
  alternates: { canonical: "https://locatorbeast.com/academy" },
};

export default function BeastAcademyPage() {
  return (
    <>
      <PageHero
        title="Beast Academy"
        subtitle="Learn how to build and grow a successful apartment locating business."
      >
        {/* Supporting line for prospective/trial visitors. This is the public
            marketing page (no authenticated status), so the trial-oriented copy
            is the default; the paid-member variant applies once the Academy runs
            in an authenticated context with real subscription status. */}
        <p className="mx-auto max-w-xl text-[14px] leading-relaxed text-[var(--beast-ink-inverse-soft)]/75">
          Your free trial includes everything you need to set up Locator Beast and start managing clients. Become a
          paid member to unlock the complete Beast Academy.
        </p>
      </PageHero>
      <AcademyModules />
    </>
  );
}
