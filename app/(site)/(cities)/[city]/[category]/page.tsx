// app/(site)/(cities)/[city]/[category]/page.tsx

/**
 * 🚧 CATEGORY PAGE DISABLED (INTENTIONAL)
 *
 * This route is reserved for future city + category SEO pages like:
 * /san-antonio/luxury-apartments
 * /austin/penthouses
 *
 * The full implementation is preserved below and can be re-enabled
 * once categories are wired to Supabase.
 */

export default function Page() {
  return null;
}

/* =====================================================================
   🔒 FUTURE IMPLEMENTATION (DO NOT DELETE)
   =====================================================================

import CityCategoryPage from "@/app/components/CityCategoryPage";

interface PageProps {
  params: {
    city: string;
    category: string;
  };
}

export default function Page({ params }: PageProps) {
  const { city: citySlug, category } = params;

  const cityMap: Record<string, string> = {
    austin: "Austin",
    dallas: "Dallas",
    houston: "Houston",
    "san-antonio": "San Antonio",
  };

  const city = cityMap[citySlug];

  if (!city) {
    return <div>City not found</div>;
  }

  return (
    <CityCategoryPage
      city={city}
      slug={category}
      path={`/${citySlug}/${category}`}
    />
  );
}

===================================================================== */
