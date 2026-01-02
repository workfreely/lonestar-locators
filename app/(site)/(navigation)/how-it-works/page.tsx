import type { Metadata } from "next";
import HowItWorks from "@/app/components/HowItWorks";

export const metadata: Metadata = {
  title: "How It Works | Free Apartment Locating | Lone Star Locators",
  description:
    "Learn how Lone Star Locators helps you find apartments for free and earn cash rebates or free movers.",
};

export default function Page() {
  return <HowItWorks />;
}
