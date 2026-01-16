// app/(site)/[city]/apartments/[slug]/page.tsx


import ListingLayout from "../../../../components/ListingLayout";
import { createClient } from "@supabase/supabase-js";


const supabase = createClient(
 process.env.NEXT_PUBLIC_SUPABASE_URL!,
 process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);


function prettyCity(slug: string) {
 const map: Record<string, string> = {
   "san-antonio": "San Antonio",
   austin: "Austin",
   dallas: "Dallas",
   houston: "Houston",
 };
 return (
   map[slug] ||
   slug.replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase())
 );
}


interface PageProps {
  params: Promise<{
    city: string;
    slug: string;
  }>;
}

export default async function ApartmentDetailPage({
  params,
}: PageProps) {
  const { city, slug } = await params;


 const tableMap: Record<string, string> = {
   "san-antonio": "san_antonio_listings",
   austin: "austin_listings",
   dallas: "dallas_listings",
   houston: "houston_listings",
 };


 const tableName = tableMap[city];


 if (!tableName) {
   return <div style={{ padding: 24 }}>City not supported.</div>;
 }


 const { data: listing, error } = await supabase
   .from(tableName)
   .select("*")
   .eq("slug", slug)
   .single();


 if (error || !listing) {
   return <div style={{ padding: 24 }}>Listing not found.</div>;
 }


 // ----- Image handling -----
 const defaultImg =
   "https://res.cloudinary.com/dxtiguwzm/image/upload/v1748277676/photos-coming-soon-lone-star-locators_be1dyx.jpg";


 let gallery: string[] = [];


 if (typeof listing.gallery_images === "string") {
   gallery = listing.gallery_images
     .split(",")
     .map((s: string) => s.trim())
     .filter(Boolean);
 } else if (Array.isArray(listing.gallery_images)) {
   gallery = listing.gallery_images.filter(Boolean);
 }


 let heroImage =
   listing.image && listing.image.length > 5 ? listing.image : defaultImg;


 if (gallery.length > 0 && heroImage === defaultImg) {
   heroImage = gallery[0];
   gallery = gallery.slice(1);
 }


 return (
   <ListingLayout
     name={listing.name}
     city={prettyCity(city)}
     city_slug={city}
     rent={listing.rent || ""}
     bedrooms={listing.beds || listing.bedrooms || ""}
     sqft={listing.sqft || ""}
     yearBuilt={listing.year_built || ""}
     yearRenovated={listing.year_renovated || ""}
     address={listing.full_address || ""}
     special={listing.special || ""}
     website={listing.website || ""}
     description={listing.description || ""}
     image={heroImage}
     gallery={gallery}
     video={listing.video_url || ""}
     map={listing.map_url || ""}
     agentVideo={listing.agent_video_url || ""}
     amenities={
       typeof listing.amenities === "string"
         ? listing.amenities.split(",").map((s: string) => s.trim())
         : listing.amenities || []
     }
     tags={
       typeof listing.tags === "string"
         ? listing.tags.split(",").map((s: string) => s.trim())
         : listing.tags || []
     }
     neighborhood={listing.neighborhood || ""}
     submarket={listing.submarket || ""}
     region={listing.region || ""}
     propertyType={listing.property_type || "Apartment"}
     review_link={listing.review_link || ""}
     faq1_q={listing.faq1_q || ""}
     faq1_a={listing.faq1_a || ""}
     faq2_q={listing.faq2_q || ""}
     faq2_a={listing.faq2_a || ""}
     faq3_q={listing.faq3_q || ""}
     faq3_a={listing.faq3_a || ""}
     faq4_q={listing.faq4_q || ""}
     faq4_a={listing.faq4_a || ""}
     faq5_q={listing.faq5_q || ""}
     faq5_a={listing.faq5_a || ""}
   />
 );
}


