// /src/components/ReviewLayout.tsx
"use client";

import React, { FC, useState, useEffect } from "react";
import ShareBlock from "@/app/components/ShareBlock";
import AISchema from "./AISchema";
import "./ReviewLayout.css";

import {
 FaCheckCircle,
 FaExclamationTriangle,
 FaTimesCircle,
 FaFacebook,
 FaTwitter,
 FaLinkedin,
 FaGift,
} from "react-icons/fa";
import ContactForm from "./ContactForm";


/// 🔧 Auto-format wording (story, high-rise, bed ranges, spacing)
// ⚠️ PURE FUNCTION — NO HOOKS ALLOWED HERE
const formatText = (text: string): string => {
 if (!text) return text;


 return (
   text
     // 17 story → 17-story
     .replace(/(\d+)\s+story/gi, "$1-story")


     // high rise → high-rise
     .replace(/\bhigh rise\b/gi, "high-rise")


     // floor to ceiling → floor-to-ceiling
     .replace(/\bfloor to ceiling\b/gi, "floor-to-ceiling")


     // spa style → spa-style
     .replace(/\bspa style\b/gi, "spa-style")


     // resort style → resort-style
     .replace(/\bresort style\b/gi, "resort-style")


     // move in (adjective) → move-in
     .replace(/\bmove in\b/gi, "move-in")


     // pet friendly → pet-friendly
     .replace(/\bpet friendly\b/gi, "pet-friendly")


     // brand new → brand-new
     .replace(/\bbrand new\b/gi, "brand-new")


     // high end → high-end
     .replace(/\bhigh end\b/gi, "high-end")


     // walk in closet → walk-in closet
     .replace(/\bwalk in closet\b/gi, "walk-in closet")


     // in unit → in-unit
     .replace(/\bin unit\b/gi, "in-unit")


     // one bedroom / two bedroom → one-bedroom / two-bedroom
     .replace(/\bone bedroom\b/gi, "one-bedroom")
     .replace(/\btwo bedroom\b/gi, "two-bedroom")
     .replace(/\bthree bedroom\b/gi, "three-bedroom")


     // 1 bed / 2 bed / 3 bed
     .replace(/\b1 bed\b/gi, "1-bedroom")
     .replace(/\b2 bed\b/gi, "2-bedroom")
     .replace(/\b3 bed\b/gi, "3-bedroom")


     // River Walk capitalization
     .replace(/\briver walk\b/gi, "River Walk")


     // Downtown San Antonio capitalization
     .replace(/\bdowntown san antonio\b/gi, "Downtown San Antonio")


     // San Antonio River Walk capitalization
     .replace(/\bsan antonio river walk\b/gi, "San Antonio River Walk")


     // 1 to 3 Beds → 1–3 beds
     .replace(/(\d+)\s*to\s*(\d+)\s*beds?/gi, "$1–$2 beds")


     // remove extra spaces
     .replace(/\s{2,}/g, " ")
 );
};




const formatReviewTitle = (propertyName: string, title: string) => {
 const normalized = title.trim().toLowerCase();


 // If user already included "review", normalize it
 if (normalized.includes("review")) {
   return `${propertyName} Review — The Good, Bad & Ugly`;
 }


 // Fallback default
 return `${propertyName} Review — The Good, Bad & Ugly`;
};


interface ReviewLayoutProps {
 title: string;
 image?: string;
featureImage1?: string;
featureImage2?: string;
 good: string[];
 bad: string[];
 ugly: string[];
 propertyName: string;
 agentVideo?: string;
 keywords?: string[];
 address?: {
   streetAddress?: string;
   addressLocality?: string;
   addressRegion?: string;
   postalCode?: string;
   addressCountry?: string;
 };
 rent?: string;
 bedrooms?: string;
 neighborhood?: string;
 author?: string;
 customIntro?: string;
 customOutro?: string;
}


const ReviewLayout: FC<ReviewLayoutProps> = ({
 title,
 image,
 good,
 bad,
 ugly,
 propertyName,
 agentVideo,
featureImage1,
featureImage2,
 keywords = [],
 address,
 rent,
 bedrooms,
 neighborhood,
 author = "Jay Morris",
 customIntro, // 👈 add this line
 customOutro,
}) => {
 // ✅ AUTO-SYNC HERO IMAGE FROM SUPABASE WITH FAILSAFE


 // ✅ Default "Coming Soon" fallback for hero images
 const placeholderImage =
   "https://ukkxisleiprdpptaaxcs.supabase.co/storage/v1/object/public/property-images/san-antonio/alaro-luxury-villas/hero.webp";


 // ✅ Agent headshot used in the author box
 const placeholderAgentImage =
   "https://res.cloudinary.com/dxtiguwzm/image/upload/v1748014964/jay-morris-free-apartment-locator-san-antonio-texas_pgf7fs.png";


 const syncedHeroImage =
   image && image.trim() !== "" ? image : placeholderImage;


// 🔦 Lightbox state for review hero (NEW)
const [lightboxOpen, setLightboxOpen] = useState(false);
const [lightboxImage, setLightboxImage] = useState<string | null>(null);

// 🎥 Video tracking state
const playerRef = React.useRef<any>(null);
const [videoStarted, setVideoStarted] = useState(false);
const [videoWatched50, setVideoWatched50] = useState(false);


const openLightbox = () => setLightboxOpen(true);
const closeLightbox = () => setLightboxOpen(false);


// Close lightbox with ESC key
useEffect(() => {
 if (!lightboxOpen) return;


 const handleKeyDown = (e: KeyboardEvent) => {
   if (e.key === "Escape") closeLightbox();
 };


 window.addEventListener("keydown", handleKeyDown);
 return () => window.removeEventListener("keydown", handleKeyDown);
}, [lightboxOpen]);

// ✅ Load YouTube IFrame API (once)
useEffect(() => {
  if ((window as any).YT) return;

  const tag = document.createElement("script");
  tag.src = "https://www.youtube.com/iframe_api";
  document.body.appendChild(tag);
}, []);



 // 🟢 RENT FIX — Auto-format rent into $####+ no matter input
 const formatRent = (value?: string) => {
   if (!value) return value;


   let clean = value.toLowerCase().trim();


   clean = clean.replace(/plus/g, "+"); // "plus" → "+"
   clean = clean.replace(/\s+/g, ""); // remove spaces
   clean = clean.replace(/^\$/, ""); // strip existing $


   if (!clean.endsWith("+")) clean = clean + "+";


   return "$" + clean;
 };


 const formattedRent = formatRent(rent);


 // NEW — Always formats the title correctly
 const displayTitle = formatReviewTitle(propertyName, title);


 const cleanNeighborhood =
   neighborhood?.replace(/[-–]/g, "").trim() ||
   address?.addressLocality ||
   "Texas";


 const metaTitle = `${propertyName} Review | The Good, Bad & Ugly`;
 const metaDescription = `Read our honest review of ${propertyName} in ${cleanNeighborhood}. Discover the good, the bad, and the ugly before you lease.`;


 const schemaData = {
   "@context": "https://schema.org",
   "@type": "Review",
   reviewRating: {
     "@type": "Rating",
     ratingValue: "4.5",
     bestRating: "5",
   },
   itemReviewed: {
     "@type": "ApartmentComplex",
     name: propertyName,
     image: syncedHeroImage,


     address: {
       "@type": "PostalAddress",
       streetAddress: address?.streetAddress || "123 Main St",
       addressLocality: address?.addressLocality || "Austin",
       addressRegion: address?.addressRegion || "TX",
       postalCode: address?.postalCode || "78701",
       addressCountry: address?.addressCountry || "US",
     },
   },
   author: { "@type": "Person", name: author },
   reviewBody: `${propertyName} review – The Good, Bad & Ugly.`,
   publisher: {
     "@type": "Organization",
     name: "Lone Star Locators",
     url: "https://lonestarlocators.app",
     logo: {
       "@type": "ImageObject",
       url: "https://res.cloudinary.com/dxtiguwzm/image/upload/v1747937030/lone-star-locators-logo.png",
     },
   },
 };


 // ✅ Optional VideoObject schema for the agent review video
 const videoSchema = agentVideo
   ? {
       "@context": "https://schema.org",
       "@type": "VideoObject",
       name: `${propertyName} Review – The Good, Bad & Ugly`,
       description: `Video review of ${propertyName}. The good, the bad, and the ugly.`,
       thumbnailUrl: syncedHeroImage,


       uploadDate: new Date().toISOString(),
       contentUrl: agentVideo,
       embedUrl: agentVideo,
       publisher: {
         "@type": "Organization",
         name: "Lone Star Locators",
         logo: {
           "@type": "ImageObject",
           url: "https://res.cloudinary.com/dxtiguwzm/image/upload/v1747937030/lone-star-locators-logo.png",
         },
       },
     }
   : null;


 return (
   <div
     style={{
       maxWidth: "1200px",
       margin: "0 auto",
       padding: "2rem",
       fontFamily: "'Inter', sans-serif",
       lineHeight: "1.7",
     }}
   >


     <AISchema
       city={address?.addressLocality || "Texas"}
       listings={[
         {
           name: propertyName,
           rent: formattedRent,
           bedrooms,
           baths: bedrooms,
           address: address?.streetAddress,
           neighborhood,
           region: address?.addressRegion || "TX",
           special: "Rebate Available",
           rebate: "Up to $200 Cash Back or Free Movers!",
           propertyType: "Apartment Review",
           tags: keywords,
           video: agentVideo,
           mapEmbed: "",
         },
       ]}
     />


     {/* FLEX WRAPPER */}
     <div className="review-columns">
       {/* LEFT COLUMN */}
       <div className="review-main">
         <h1
 style={{
   fontSize: "2.5rem",
   marginTop: "-2rem",   // 🔑 KEY FIX
   marginBottom: "1rem",
   textAlign: "left",
   fontWeight: 800,
   color: "#111",
   lineHeight: 1.15,
 }}
>
 {displayTitle}
</h1>




         <img
           src={syncedHeroImage}
           alt={title || propertyName}
           onError={(e) => {
             (e.currentTarget as HTMLImageElement).src = placeholderImage;
           }}
           style={{
             width: "100%",
             height: "600px",
             objectFit: "cover",
             borderRadius: "8px",
             marginBottom: "1rem",
           }}
         />


         {address && (
           <p
             style={{
               fontSize: "1.25rem",
               color: "#222",
               fontWeight: 600,
               marginTop: "0.5rem",
               marginBottom: "1.8rem",
               lineHeight: "1.6",
             }}
           >
             {address.streetAddress}, {address.addressLocality},{" "}
             {address.addressRegion} {address.postalCode}
           </p>
         )}


         {/* INTRO */}
         <section style={{ marginBottom: "2.5rem" }}>
           {customIntro ? (
             // ✅ Use the custom intro passed from each property file
             <p
               style={{ fontSize: "1.1rem", color: "#555", lineHeight: "1.8" }}
             >
               {customIntro}
             </p>
           ) : (
             // ✅ Fallback if customIntro is not provided
             <p
               style={{ fontSize: "1.1rem", color: "#555", lineHeight: "1.8" }}
             >
               <strong>{propertyName}</strong> is located in{" "}
               {formatText(neighborhood || address?.addressLocality || "")},
               offering {formatText(bedrooms || "modern layouts")} with upscale
               finishes. Starting rents around{" "}
               <strong>{formattedRent || "market rates"}</strong>, this
               property is close to dining, nightlife, and major employers.
             </p>
           )}
         </section>


       {/* FEATURE IMAGES — clickable with captions */}
{(featureImage1 || featureImage2) && (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
      gap: "16px",
      marginBottom: "3rem",
    }}
  >
    {featureImage1 && (
      <figure style={{ margin: 0 }}>
        <img
          src={featureImage1}
          alt={`Private yard and townhome-style layout at ${propertyName}`}
          onClick={() => {
            setLightboxImage(featureImage1);
            setLightboxOpen(true);
          }}
          style={{
            width: "100%",
            height: "320px",
            objectFit: "cover",
            borderRadius: "8px",
            cursor: "zoom-in",
          }}
          loading="lazy"
        />
        <figcaption
          style={{
            marginTop: "8px",
            fontSize: "0.95rem",
            color: "#555",
            lineHeight: "1.5",
          }}
        >
          Private yards give these townhomes a single-family feel, which is rare
          for one-bedroom layouts in {neighborhood || "this area"}.
        </figcaption>
      </figure>
    )}

    {featureImage2 && (
      <figure style={{ margin: 0 }}>
        <img
          src={featureImage2}
          alt={`Attached garages and high-end finishes at ${propertyName}`}
          onClick={() => {
            setLightboxImage(featureImage2);
            setLightboxOpen(true);
          }}
          style={{
            width: "100%",
            height: "320px",
            objectFit: "cover",
            borderRadius: "8px",
            cursor: "zoom-in",
          }}
          loading="lazy"
        />
        <figcaption
          style={{
            marginTop: "8px",
            fontSize: "0.95rem",
            color: "#555",
            lineHeight: "1.5",
          }}
        >
          Attached garages and upscale finishes make this community stand out
          compared to nearby apartment options.
        </figcaption>
      </figure>
    )}
  </div>
)}


         {/* GOOD */}
         <section style={{ marginBottom: "2.5rem" }}>
           <h2
 style={{
   fontSize: "1.9rem",
   fontWeight: 800,
   marginBottom: "0.75rem",
   color: "#2e7d32",
   display: "flex",
   alignItems: "center",
   letterSpacing: "-0.3px",
 }}
>
             <FaCheckCircle style={{ marginRight: "8px" }} /> The Good
           </h2>


           <ul
             style={{
               backgroundColor: "#f0fdf4",
               border: "1px solid #bbf7d0",
               padding: "1.5rem",
               borderRadius: "10px",
               marginTop: "0.75rem",
               listStyle: "disc",
               paddingLeft: "2.2rem",
             }}
           >
             {good.map((item, i) => (
               <li
                 key={i}
                 style={{
                   marginBottom: "0.75rem",
                   fontSize: "1.1rem",
                   lineHeight: "1.8",
                 }}
               >
                 {formatText(item)}
               </li>
             ))}
           </ul>
         </section>


         {/* BAD */}
         <section style={{ marginBottom: "2.5rem" }}>
           <h2          
 style={{
   fontSize: "1.9rem",
   fontWeight: 800,
   marginBottom: "0.75rem",
   color: "#e67e22",
   display: "flex",
   alignItems: "center",
   letterSpacing: "-0.3px",
 }}
>
             <FaExclamationTriangle style={{ marginRight: "8px" }} /> The Bad
           </h2>


           <ul
             style={{
               backgroundColor: "#fff7ed",
               border: "1px solid #fed7aa",
               padding: "1.5rem",
               borderRadius: "10px",
               marginTop: "0.75rem",
               listStyle: "disc",
               paddingLeft: "2.2rem",
             }}
           >
             {bad.map((item, i) => (
               <li
                 key={i}
                 style={{
                   marginBottom: "0.75rem",
                   fontSize: "1.1rem",
                   lineHeight: "1.8",
                 }}
               >
                 {formatText(item)}
               </li>
             ))}
           </ul>
         </section>


         {/* UGLY */}
         <section style={{ marginBottom: "2.5rem" }}>
           <h2
 style={{
   fontSize: "1.9rem",
   fontWeight: 800,
   marginBottom: "0.75rem",
               color: "#c62828",
               display: "flex",
   alignItems: "center",
   letterSpacing: "-0.3px",
 }}
>
             <FaTimesCircle style={{ marginRight: "8px" }} /> The Ugly
           </h2>


           <ul
             style={{
               backgroundColor: "#fef2f2",
               border: "1px solid #fecaca",
               padding: "1.5rem",
               borderRadius: "10px",
               marginTop: "0.75rem",
               listStyle: "disc",
               paddingLeft: "2.2rem",
             }}
           >
             {ugly.map((item, i) => (
               <li
                 key={i}
                 style={{
                   marginBottom: "0.75rem",
                   fontSize: "1.1rem",
                   lineHeight: "1.8",
                 }}
               >
                 {formatText(item)}
               </li>
             ))}
           </ul>
         </section>


         {/* OUTRO */}
         <section style={{ marginTop: "2.5rem" }}>
           <h2
 style={{
   fontSize: "1.9rem",
   fontWeight: 800,
   marginBottom: "0.75rem",
   color: "#111",
   letterSpacing: "-0.3px",
 }}
>
 What I Love About {propertyName}
</h2>




           {Array.isArray(customOutro) ? (
             <div>
               {customOutro.map((paragraph, index) => (
                 <p
                   key={index}
                   style={{
                     fontSize: "1.1rem",
                     color: "#555",
                     lineHeight: "1.8",
                     marginBottom: "1.4rem",
                   }}
                 >
                   {paragraph}
                 </p>
               ))}
             </div>
           ) : (
             <p
               style={{ fontSize: "1.1rem", color: "#555", lineHeight: "1.8" }}
             >
               {customOutro}
             </p>
           )}
         </section>


        {/* FAQ SECTION — ListingLayout Style */}
<div style={{ marginTop: "3rem" }}>
 <h2
   style={{
     marginBottom: "1rem",
     fontSize: "2rem",
     fontWeight: 800,
     color: "#111",
     textAlign: "left",
   }}
 >
   Frequently Asked Questions
 </h2>




           {/* FAQ #1 – Based on a good item */}
           {good[0] && (
             <details
               style={{
                 marginBottom: "10px",
                 padding: "10px 15px",
                 border: "1px solid #ddd",
                 borderRadius: "5px",
                 backgroundColor: "#fafafa",
               }}
             >
               <summary
                 style={{
                   fontWeight: 600,
                   cursor: "pointer",
                   fontSize: "1.1rem",
                   lineHeight: "1.8",
                   color: "#333",
                 }}
               >
                 What are the best amenities at {propertyName}?
               </summary>
               <div style={{ marginTop: "8px", color: "#555" }}>
                 {formatText(good[0])}
               </div>
             </details>
           )}


           {/* FAQ #2 – Based on a bad item */}
           {bad[0] && (
             <details
               style={{
                 marginBottom: "10px",
                 padding: "10px 15px",
                 border: "1px solid #ddd",
                 borderRadius: "5px",
                 backgroundColor: "#fafafa",
               }}
             >
               <summary
                 style={{
                   fontWeight: 600,
                   cursor: "pointer",
                   fontSize: "1.1rem",
                   lineHeight: "1.8",
                   color: "#333",
                 }}
               >
                 Are there any downsides to living at {propertyName}?
               </summary>
               <div style={{ marginTop: "8px", color: "#555" }}>
                 {formatText(bad[0])}
               </div>
             </details>
           )}


           {/* FAQ #3 – Based on an ugly item */}
           {ugly[0] && (
             <details
               style={{
                 marginBottom: "10px",
                 padding: "10px 15px",
                 border: "1px solid #ddd",
                 borderRadius: "5px",
                 backgroundColor: "#fafafa",
               }}
             >
               <summary
                 style={{
                   fontWeight: 600,
                   cursor: "pointer",
                   fontSize: "1.1rem",
                   lineHeight: "1.8",
                   color: "#333",
                 }}
               >
                 What should I know before leasing at {propertyName}?
               </summary>
               <div style={{ marginTop: "8px", color: "#555" }}>
                 {formatText(ugly[0])}
               </div>
             </details>
           )}


           {/* FAQ #4 – Pricing (SEO optimized) */}
           {rent && (
             <details
               style={{
                 marginBottom: "10px",
                 padding: "10px 15px",
                 border: "1px solid #ddd",
                 borderRadius: "5px",
                 backgroundColor: "#fafafa",
               }}
             >
               <summary
                 style={{
                   fontWeight: 600,
                   cursor: "pointer",
                   fontSize: "1.1rem",
                   lineHeight: "1.8",
                   color: "#333",
                 }}
               >
                 What is the pricing at {propertyName}?
               </summary>


               <div style={{ marginTop: "8px", color: "#555" }}>
                 Pricing starts around {formattedRent}. Pricing may vary
                 depending on the floor plan, view, and current availability.
               </div>
             </details>
           )}


           {/* FAQ #5 — Required default for rebate/free movers */}
           <details
             style={{
               marginBottom: "10px",
               padding: "10px 15px",
               border: "1px solid #ddd",
               borderRadius: "5px",
               backgroundColor: "#fafafa",
             }}
           >
             <summary
               style={{
                 fontWeight: 600,
                 cursor: "pointer",
                 fontSize: "1.1rem",
                 lineHeight: "1.8",
                 color: "#333",
               }}
             >
               How do I claim my cash rebate or free movers at {propertyName}?
             </summary>


             <div style={{ marginTop: "8px", color: "#555" }}>
               List <strong>"Jay Morris with AptAmigo"</strong> on your
               application and{" "}
               <a
                 href="/report-lease"
                 target="_blank"
                 rel="noopener noreferrer"
                 style={{
                   color: "#004aad",
                   fontWeight: 600,
                   textDecoration: "underline",
                 }}
               >
                 report your lease
               </a>{" "}
               after move-in. You will qualify for up to $200 cash rebate or 2
               hours of free movers depending on the property. We will always
               confirm before you apply!
             </div>
           </details>
         </div>


         {/* AUTHOR BOX — above CTA */}
         <div
           style={{
             marginTop: "3rem",
             padding: "1.5rem",
             backgroundColor: "#fafafa",
             borderTop: "2px solid #ddd",
             borderRadius: "8px",
             display: "flex",
             alignItems: "center",
             gap: "15px",
           }}
         >
           <img
             src={placeholderAgentImage}
             alt="Jay Morris - Apartment Locator"
             style={{
               width: "70px",
               height: "70px",
               borderRadius: "50%",
               objectFit: "cover",
               border: "2px solid #ddd",
             }}
           />


           <div style={{ lineHeight: "1.6", color: "#555", fontSize: "15px" }}>
             <strong>Jay Morris</strong> is a licensed real estate agent and
             local luxury apartment locator helping clients find luxury
             apartments, second chance leasing, and the best move-in specials
             in Texas. He has helped hundreds of clients across TX get the best
             deals and move into their perfect home.
           </div>
         </div>


         {/* CTA */}
<section
  style={{
    marginTop: "3rem",
    marginBottom: "2rem",
    padding: "2rem",
    borderRadius: "10px",
    textAlign: "center",

    backgroundColor: videoWatched50 ? "#d1fae5" : "#ecf8ee",
    border: videoWatched50
      ? "2px solid #2e7d32"
      : "1px solid #cde9d6",

    transition: "all 0.4s ease",
  }}
>


           <h3
  style={{
    fontSize: "1.6rem",
    marginBottom: "1rem",
    color: "#2e7d32",
    fontWeight: 700,
  }}
>
  {videoWatched50
  ? `Want me to help you secure the best deal at ${propertyName}?`
  : `Ready to tour ${propertyName}?`}
</h3>

<p
  style={{
    fontSize: "1.1rem",
    color: "#333",
    marginBottom: "1.5rem",
    lineHeight: "1.7",
    maxWidth: "700px",
    marginInline: "auto",
  }}
>
  {videoWatched50
    ? "Since you watched the review, let’s lock in the best deal and rebate before it’s gone."
    : "I’ll help you find the best deals, cash rebates, or free movers."}
</p>


           <a
             href={`/start-your-search?property=${encodeURIComponent(
               propertyName
             )}`}
             style={{
               backgroundColor: "#2e7d32",
               color: "white",
               padding: "0.9rem 2rem",
               borderRadius: "8px",
               fontWeight: 600,
               textDecoration: "none",
               display: "inline-block",
             }}
           >
             Start Your Search
           </a>
         </section>


         {/* SOCIAL SHARE */}
  <div style={{ maxWidth: "720px", margin: "0 auto 1rem" }}>
    <ShareBlock />
  </div>

  {/* TAGS */}
  {keywords.length > 0 && (
    <div
      style={{
        padding: "15px",
        backgroundColor: "#fafafa",
        border: "1px solid #ddd",
        borderRadius: "6px",
        fontSize: "14px",
        color: "#666",
      }}
    >
      <strong>Tags:</strong> {keywords.join(", ")}
    </div>
  )}
</div>

       {/* RIGHT SIDEBAR */}
       <div
         className="review-sidebar"
         style={{
            marginTop: "0", // ✅ align with title
         }}
       >
         <div
 style={{
   backgroundColor: "#e0f7e9",
   padding: "1rem",
   borderRadius: "8px",


   // ✅ OWNED visual definition (same pattern as ContactForm)
   border: "1px solid #cde9d6",
   boxShadow: "0 2px 8px rgba(0,0,0,0.05)",


   fontWeight: "bold",
   color: "#2e7d32",
   fontSize: "1.1rem",
   marginBottom: "0.5rem",
   lineHeight: "1.6",
   display: "flex",
   alignItems: "flex-start",
   justifyContent: "center",
   gap: "0.6rem",
   textAlign: "center",
 }}
>


 <FaGift
   style={{
     marginTop: "0.2rem",
     flexShrink: 0,
     fontSize: "1.25rem",
   }}
 />
 <span>
   Get up to a <strong>$200 Cash Rebate</strong> or <br />
   <strong>2 Hours of Free Movers!</strong>
 </span>
</div>


<div style={{ marginBottom: "1.75rem" }}>
 <ContactForm mode="short" propertyName={propertyName} />
</div>




         {/* Agent Info — enhanced definition */}
         <div
           className="definition-box"
           style={{
             textAlign: "center",
             marginBottom: "1.75rem",
             marginTop: "2rem",
           }}
         >
           <img
             src="https://res.cloudinary.com/dxtiguwzm/image/upload/v1748014964/jay-morris-free-apartment-locator-san-antonio-texas_pgf7fs.png"
             alt="Jay Morris"
 style={{
   width: "95px",
   height: "95px",
   borderRadius: "50%",
   objectFit: "cover",
   border: "2px solid #f0f0f0",
   display: "block",
   margin: "0 auto 0.75rem auto",
 }}
/>


           <p
             style={{
               fontWeight: 700,
               fontSize: "1.2rem",
               marginBottom: "0.25rem",
               color: "#222",
             }}
           >
             Licensed Agent: Jay Morris
           </p>


           <p
             style={{
               fontSize: "0.95rem",
               color: "#666",
               lineHeight: "1.5",
               margin: 0,
             }}
           >
             Helping renters find the perfect home.
           </p>
         </div>
         {/* ✅ VIDEO REVIEW — YouTube Shorts (9:16) */}
{agentVideo && (
  <div
    style={{
      marginTop: "1.25rem",
      padding: "1rem",
      border: "1px solid #ddd",
      borderRadius: "10px",
      backgroundColor: "#fafafa",
      textAlign: "center",
    }}
  >
    <h3
      style={{
        fontSize: "1.15rem",
        fontWeight: 800,
        marginBottom: "0.75rem",
        color: "#111",
      }}
    >
      Video Review
    </h3>

    <div
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "9 / 16",
        borderRadius: "10px",
        overflow: "hidden",
        backgroundColor: "#000",
      }}
    >
      <div
  id="yt-player"
  style={{
    position: "absolute",
    inset: 0,
  }}
/>

    </div>

    <p
      style={{
        fontSize: "0.9rem",
        color: "#555",
        marginTop: "0.5rem",
        lineHeight: "1.5",
      }}
    >
      Video review covering the good, bad and ugly of living
      at <strong>{propertyName}</strong>.
    </p>
  </div>
)}
       </div>
     </div>
   </div>
 );
};



export default ReviewLayout;
