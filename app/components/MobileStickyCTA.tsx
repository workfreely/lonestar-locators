"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function MobileStickyCTA() {
  const pathname = usePathname();

  // ✅ Hide on landing pages
if (
  pathname.includes("get-my-list") ||
  pathname.includes("second-chance") ||
  pathname.includes("landing") ||
  pathname.startsWith("/admin")
) {
  return null;
}
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden">
      <div className="bg-green-600 text-white px-4 py-3 shadow-lg">
        <Link
          href="/start-your-search"
          className="block text-center font-semibold text-lg"
        >
          Send My List
        </Link>
      </div>
    </div>
  );
}