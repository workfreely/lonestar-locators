"use client";

import { usePathname } from "next/navigation";
import ExitIntentPopup from "./ExitIntentPopup";

export default function ClientPopups() {
  const pathname = usePathname();

  // ⛔ Pages where popup should NEVER appear
  const excludedPaths = [
    "/startyoursearch",
    "/report-lease",
    "/thank-you",
  ];

  // Block popup on excluded pages
  if (excludedPaths.some((path) => pathname.startsWith(path))) {
    return null;
  }

  // ✅ Show popup everywhere else (home, listings, reviews, blogs)
  return <ExitIntentPopup />;
}
