"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";

interface Listing {
  name: string;
  image: string;
  price?: string;
  price_value?: number;
  beds: string;
  baths: string;
  neighborhood: string;
  slug: string;
}

interface SchemaItemListProps {
  city?: string;
  listings: Listing[];
}

export default function SchemaItemList({
  listings,
}: SchemaItemListProps) {
  const pathname = usePathname();
  const baseUrl = "https://www.lonestarlocators.app";
  const url = `${baseUrl}${pathname}`;

  if (!listings || listings.length === 0) return null;

  const schema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    url,
    numberOfItems: listings.length,
    itemListElement: listings.map((listing, index) => ({
      "@type": "ApartmentComplex",
      position: index + 1,
      name: listing.name,
      url: `${url}/${listing.slug}`,
      image: listing.image,
      numberOfRooms: listing.beds,
      numberOfBathroomsTotal: listing.baths,
      address: {
        "@type": "PostalAddress",
        addressLocality: listing.neighborhood,
        addressRegion: "TX",
        addressCountry: "US",
      },
      offers: {
        "@type": "Offer",
        price: listing.price_value,
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
      },
    })),
  };

  return (
    <Script
      id="apartment-itemlist-schema"
      type="application/ld+json"
      strategy="afterInteractive"
    >
      {JSON.stringify(schema)}
    </Script>
  );
}
