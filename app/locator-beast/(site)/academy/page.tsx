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
      />
      <AcademyModules />
    </>
  );
}
