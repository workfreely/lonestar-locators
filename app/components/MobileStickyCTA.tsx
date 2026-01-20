"use client";

import Link from "next/link";

export default function MobileStickyCTA() {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 md:hidden">
      <div className="bg-green-600 text-white px-4 py-3 shadow-lg">
        <Link
          href="/start-your-search"
          className="block text-center font-semibold text-lg"
        >
          Get My Free Apartment List
        </Link>
      </div>
    </div>
  );
}
