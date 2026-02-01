
import { FaTag } from "react-icons/fa";
import Link from "next/link";
import { trackEvent } from "@/app/utils/trackEvent";


interface ListingCardProps {
  listing: {
    name: string;
    slug: string;
    city_slug?: string;
    href?: string;
    submarket?: string;
    neighborhood?: string;
    region?: string;
    image?: string;
    price?: string;
    priceValue?: number;
    beds?: string;
    baths?: string;
    propertyType?: string;
    tags?: string | string[];
    special?: string;
    rebate?: string;
  };
  defaultImage: string;
  citySlug?: string; // ✅ optional
}


const ListingCard: React.FC<ListingCardProps> = ({
  listing,
  defaultImage,
  citySlug,
}) => {

  const resolvedCitySlug =
  listing.city_slug ||
  listing.region?.toLowerCase().trim().replace(/\s+/g, "-") ||
  listing.neighborhood?.toLowerCase().trim().replace(/\s+/g, "-") ||
  citySlug; // 👈 GUARANTEED

  // 🔍 DEV SAFETY CHECK — warns if listing data is incomplete
  if (!resolvedCitySlug) {
    console.warn("Listing missing city info:", listing);
  }
  
 return (
<Link
  href={
    listing.href ??
    `/${resolvedCitySlug}/apartments/${listing.slug}`
  }
  className="listing-card-link"
  onClick={() => {
    trackEvent("listing_card_click", {
      property: listing.name,
      city: resolvedCitySlug,
      neighborhood: listing.neighborhood || listing.submarket,
      price: listing.price,
      source: "listing_card",
    });
  }}
>

     <div
       className="card"
       style={{
         paddingBottom: "0.75rem",
         borderRadius: "10px",
         overflow: "hidden",
         backgroundColor: "#fff",
         boxShadow: "0 2px 8px rgba(0, 0, 0, 0.06)",
         transition: "transform 0.25s ease, box-shadow 0.25s ease",
       }}
       onMouseEnter={(e) => {
         e.currentTarget.style.transform = "scale(1.03)";
         e.currentTarget.style.boxShadow = "0 6px 14px rgba(0, 0, 0, 0.12)";
       }}
       onMouseLeave={(e) => {
         e.currentTarget.style.transform = "scale(1)";
         e.currentTarget.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.06)";
       }}
     >
      <img
  src={
    listing.image && listing.image.trim() !== ""
      ? listing.image
      : defaultImage
  }
  alt={listing.name}
  loading="lazy"
  className="listing-image"
  onError={(e) => {
    e.currentTarget.onerror = null;
    e.currentTarget.src = defaultImage;
  }}
  style={{
    width: "100%",
    height: "260px",

    // ✅ SHOW FULL IMAGE (no cropping)
    objectFit: "contain",

    // ✅ Makes the empty space look intentional
    backgroundColor: "#f4f4f4",

    borderTopLeftRadius: "10px",
    borderTopRightRadius: "10px",
  }}
/>



       <div className="card-body" style={{ padding: "1rem 1.25rem" }}>
         {/* ✅ Property name */}
         <h3
           style={{
             fontSize: "1.25rem",
             fontWeight: 600,
             margin: "0 0 0.5rem",
             color: "#222",
             lineHeight: 1.3,
           }}
         >
           {listing.name}
         </h3>


         {/* ✅ “Starting at” line */}
         <p
           style={{
             fontSize: "1rem",
             color: "#333",
             margin: "0 0 0.25rem",
             lineHeight: 1.4,
           }}
         >
           Starting at{" "}
           <strong>{listing.price || "Contact for pricing"}</strong>
         </p>


         {/* ✅ Beds/Baths */}
         {(listing.beds || listing.baths) && (
           <p
             style={{
               margin: "0.1rem 0",
               fontSize: "0.95rem",
               color: "#666",
             }}
           >
             Beds: {listing.beds} &nbsp; Baths: {listing.baths}
           </p>
         )}


         {/* ✅ Location label - uses submarket if no neighborhood */}
         {(listing.neighborhood || listing.submarket) && (
           <p
             style={{
               margin: "0.2rem 0",
               fontSize: "0.95rem",
               color: "#555",
               fontWeight: 400,
               lineHeight: "1.4",
             }}
           >
             {listing.neighborhood
               ? `Neighborhood: ${listing.neighborhood}`
               : `Submarket: ${listing.submarket}`}
           </p>
         )}


         {/* ✅ Safe Tags (handles string OR array) */}
         {(() => {
           const rawTags = listing.tags;


           // Normalize tags into an array
           const tags = Array.isArray(rawTags)
  ? rawTags
  : typeof rawTags === "string"
  ? rawTags.split(",").map((t: string) => t.trim())
  : [];


           if (tags.length === 0) return null;


           return (
             <div
               style={{
                 marginTop: "0.5rem",
                 marginBottom: "0.6rem",
                 display: "flex",
                 flexWrap: "wrap",
                 gap: "0.4rem",
               }}
             >
               {tags.slice(0, 3).map((tag: string, i: number) => (
  <span
    key={i}
    className="tag"
    style={{
      backgroundColor: "#f5f5f5",
      color: "#555",
      fontSize: "0.8rem",
      padding: "0.25rem 0.5rem",
      borderRadius: "4px",
    }}
  >
                   {tag}
                 </span>
               ))}
             </div>
           );
         })()}


         {/* Move-in special */}
         {listing.special && listing.special.trim() !== "" && (
           <div
             className="special-line"
             style={{
               marginTop: "0.6rem",
               backgroundColor: "#e8f2ff",
               border: "1px solid #c7dbff",
               color: "#004aad",
               fontWeight: 700,
               fontSize: "0.9rem",
               padding: "0.6rem 0.75rem",
               borderRadius: "8px",
               display: "flex",
               alignItems: "center",
               justifyContent: "center",
               gap: "6px",
               textAlign: "center",
               minHeight: "40px",
               boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
               lineHeight: "1.4",
             }}
             title={listing.special}
           >
             <FaTag style={{ color: "#004aad", flexShrink: 0 }} />
             <span
               style={{
                 overflow: "hidden",
                 textOverflow: "ellipsis",
                 whiteSpace: "nowrap",
                 maxWidth: "90%",
                 display: "inline-block",
               }}
             >
               <strong>Move-in Special:</strong> {listing.special}
             </span>
           </div>
         )}
       </div>
     </div>
  </Link>
 );
};


export default ListingCard;
