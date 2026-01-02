// app/lib/blogContent.ts
import React from "react";

export interface BlogContent {
  title: string;
  publishDate?: string;
  keywords?: string[];
  content: React.ReactNode;
}

export const blogContentByCity: Record<
  string,
  Record<string, BlogContent>
> = {
  dallas: {
    "best-luxury-apartments-dallas": {
      title: "Best Luxury Apartments in Dallas",
      publishDate: "2025-01-10",
      keywords: ["Dallas Luxury Apartments", "High-Rise Dallas", "Uptown"],
      content: (
        <>
          <p>
            Dallas offers some of the most impressive luxury apartments in
            Texas, from Uptown high-rises to Victory Park towers.
          </p>

          <h2>Top Luxury Neighborhoods</h2>
          <ul>
            <li>Uptown Dallas</li>
            <li>Victory Park</li>
            <li>Design District</li>
          </ul>

          <p>
            Working with a local apartment locator can unlock move-in specials,
            rebates, and off-market availability.
          </p>
        </>
      ),
    },
  },

  "san-antonio": {
    "best-luxury-apartments-san-antonio": {
      title: "Best Luxury Apartments in San Antonio",
      publishDate: "2025-01-15",
      keywords: ["San Antonio Luxury Apartments", "Stone Oak", "Downtown"],
      content: (
        <>
          <p>
            San Antonio luxury apartments combine resort-style amenities with
            Hill Country views and modern interiors.
          </p>
        </>
      ),
    },

    "affordable-apartment-locators-san-antonio": {
      title: "Affordable Apartment Locators San Antonio (2025)",
      publishDate: "2025-07-06",
      keywords: [
        "affordable apartments San Antonio",
        "cheap apartment locators San Antonio",
        "San Antonio apartment help",
      ],
      content: (
        <>
          <p>
            Looking for <strong>Affordable Apartment Locators in San Antonio</strong>?
            You’re in the right place.
          </p>

          <p>
            We help renters find safe, well-managed, budget-friendly apartments
            across San Antonio — without the stress.
          </p>

          <h2>Who We Help</h2>
          <ul>
            <li>First-time renters</li>
            <li>Budget-conscious renters</li>
            <li>Second-chance renters</li>
            <li>Families and professionals</li>
          </ul>

          <p>
            Our service is 100% free and customized to your needs.
          </p>
        </>
      ),
    },
  },
};
