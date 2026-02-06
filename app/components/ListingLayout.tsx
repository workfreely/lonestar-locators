"use client";


import React, { FC, useState, useEffect } from "react";
import Breadcrumbs from "./Breadcrumbs";
import AISchema from "../components/AISchema";
import JayBotWidget from "./JayBotWidget";
import { FaShareAlt as ShareIcon } from "react-icons/fa";
import ShareBlock from "@/app/components/ShareBlock";
import styles from "./ListingLayout.module.css";


import {
 FaMapMarkerAlt,
 FaBed,
 FaRulerCombined,
 FaCalendarAlt,
 FaHome,
 FaDollarSign,
 FaGift,
 FaTag,
 FaVideo,
} from "react-icons/fa";


import ContactForm from "./ContactForm";


interface ListingLayoutProps {
 name: string;
 city_slug: string;
 city_name?: string;
 city?: string;
 rent: string;
 bedrooms: string;
 sqft: string;
 yearBuilt?: string;
 yearRenovated?: string;
 address: string;
 special: string;
 website: string;
 description: string;
 image?: string;
 gallery?: string[];
 video?: string;
 map?: string;
 agentVideo?: string;
 amenities?: string[];
 tags?: string[];
 neighborhood?: string;
 submarket?: string;
 region?: string;
 propertyType?: string;
 review_link?: string;


 // FAQ props
 faq1_q?: string;
 faq1_a?: string;
 faq2_q?: string;
 faq2_a?: string;
 faq3_q?: string;
 faq3_a?: string;
 faq4_q?: string;
 faq4_a?: string;
 faq5_q?: string;
 faq5_a?: string;
}


const ListingLayout: FC<ListingLayoutProps> = ({
 name,
 city,
 city_slug,
 city_name,
 rent,
 bedrooms,
 sqft,
 yearBuilt,
 yearRenovated,
 address,
 special,
 website,
 description,
 image = "https://via.placeholder.com/800x450?text=Main+Image",
 gallery = [],
 video,
 map,
 agentVideo,
 amenities = [],
 tags = [],
 neighborhood,
 submarket,
 region,
 propertyType = "Apartments",
 review_link,


 faq1_q,
 faq1_a,
 faq2_q,
 faq2_a,
 faq3_q,
 faq3_a,
 faq4_q,
 faq4_a,
 faq5_q,
 faq5_a,
}) => {

  // ==========================
  // ✅ CLIENT-SAFE CURRENT URL
  // ==========================
  const [clientUrl, setClientUrl] = useState<string | null>(null);

  useEffect(() => {
    setClientUrl(window.location.href);
  }, []);


// ========================================
// ✅ REVIEW LINK — SINGLE SOURCE OF TRUTH
// ========================================

// Supabase should provide ONLY a slug (e.g. "alaro-luxury-villas")
// This guard prevents duplicated paths if bad data ever slips in
const resolvedReviewLink =
  review_link && !review_link.startsWith("/")
    ? `/${city_slug}/apartments/reviews/${review_link}`
    : review_link || null;

    // 🚨 DEV WARNING — review_link must be a slug only
if (process.env.NODE_ENV === "development") {
  if (review_link?.includes("/")) {
    console.warn(
      "[ListingLayout] review_link should be a slug only:",
      review_link
    );
  }
}


 // IMAGE + LIGHTBOX
 const [lightboxOpen, setLightboxOpen] = useState(false);
 const [currentImage, setCurrentImage] = useState(0);

 const images = [image, ...gallery];


 const openLightbox = (index: number) => {
   setCurrentImage(index);
   setLightboxOpen(true);
 };


 const closeLightbox = () => setLightboxOpen(false);


 const nextImage = () => {
   setCurrentImage((prev) => (prev + 1) % images.length);
 };


 const prevImage = () => {
   setCurrentImage((prev) => (prev === 0 ? images.length - 1 : prev - 1));
 };


 useEffect(() => {
   const handleKeyDown = (e: KeyboardEvent) => {
     if (!lightboxOpen) return;
     if (e.key === "ArrowRight") nextImage();
     if (e.key === "ArrowLeft") prevImage();
     if (e.key === "Escape") closeLightbox();
   };
   window.addEventListener("keydown", handleKeyDown);
   return () => window.removeEventListener("keydown", handleKeyDown);
 }, [lightboxOpen, currentImage]);


 const [iframesReady, setIframesReady] = useState(false);
 useEffect(() => {
   const timer = setTimeout(() => setIframesReady(true), 500);
   return () => clearTimeout(timer);
 }, []);


 const placeholderAgentImage =
   "https://res.cloudinary.com/dxtiguwzm/image/upload/v1748014964/jay-morris-free-apartment-locator-san-antonio-texas_pgf7fs.png";


 // FAQ (custom + rebate)
 const defaultRebateFAQ = {
   question: "How do I claim my cash rebate or free movers?",
   answer: `
     <p><strong>1. Apply</strong><br>
     When applying, select Realtor/Locator and list Jay Morris with AptAmigo on your application.</p>


     <p><strong>2. Report Your Lease</strong><br>
     Once approved, <a href="/report-lease" target="_blank" rel="noopener noreferrer" style="color:#004aad; text-decoration:underline;">report your lease here</a> to claim up to $200 cash rebate or 2 hours of free movers (a $300+ value), whichever you prefer.</p>


     <p><strong>3. Confirm Your Reward</strong><br>
     When you choose your favorite properties, we’ll let you know exactly what each one qualifies for before you apply.</p>
   `,
 };


 // ==============================
// FAQ (custom + global rebate)
// ==============================


// 1️⃣ Build dynamic FAQs from Supabase
const dynamicFaqs = [
 ...(faq1_q && faq1_a ? [{ question: faq1_q, answer: faq1_a }] : []),
 ...(faq2_q && faq2_a ? [{ question: faq2_q, answer: faq2_a }] : []),
 ...(faq3_q && faq3_a ? [{ question: faq3_q, answer: faq3_a }] : []),
 ...(faq4_q && faq4_a ? [{ question: faq4_q, answer: faq4_a }] : []),
 ...(faq5_q && faq5_a ? [{ question: faq5_q, answer: faq5_a }] : []),
];


// 2️⃣ Remove any duplicate “rebate / free movers” questions
const filteredFaqs = dynamicFaqs.filter(
 (faq) =>
   !faq.question.toLowerCase().includes("cash rebate") &&
   !faq.question.toLowerCase().includes("free movers")
);


// 3️⃣ Final FAQ list (global rebate FAQ added ONCE)
const faqs = [...filteredFaqs, defaultRebateFAQ];




 const [activeIndex, setActiveIndex] = useState<number | null>(null);
 const toggleAccordion = (index: number) =>
   setActiveIndex(activeIndex === index ? null : index);


// ✅ SHARE HANDLER (CLIENT-SAFE)
const handleShare = async () => {
  if (!clientUrl) return;

  const shareTitle = name;
  const shareText = `Check out ${name} in ${city}`;

  if (navigator.share) {
    try {
      await navigator.share({
        title: shareTitle,
        text: shareText,
        url: clientUrl,
      });
    } catch (err) {
      console.log("Share cancelled", err);
    }
  } else {
    await navigator.clipboard.writeText(clientUrl);
    alert("Link copied to clipboard");

   }
 };


 return (
   <>
    <div className={styles.listingLayout}>




       {/* ✅ AI Schema */}
       <AISchema
         city={city}
         listings={[
           {
             name,
             rent,
             bedrooms,
             baths: bedrooms,
             sqft,
             yearBuilt,
             address,
             special,
             rebate: "Up to $200 Cash Back or Free Movers!",
             propertyType: "Apartment",
             tags: amenities || [],
             neighborhood,
             submarket,
             region,
             video,
             mapEmbed: map,
           },
         ]}
       />


       {/* Breadcrumbs */}
       <Breadcrumbs
         items={[
           { label: "Home", href: "/" },
          { label: city || "Apartments", href: `/apartments/${city_slug}` },


           { label: name },
         ]}
       />


       {/* ✅ MAIN TWO-COLUMN LAYOUT */}
       <div className="listing-columns">
         {/* LEFT COLUMN */}
         <div className="listing-main">
           {/* HERO IMAGE + SHARE OVERLAY */}
           <div
             className="watermark lightbox-watermark"
             style={{ position: "relative" }}
           >
             {/* ✅ NEW: wrapper takes the click (more reliable than img click) */}
  <div
    onClick={() => openLightbox(0)}
    style={{ cursor: "zoom-in" }}
  >
    <img
      src={image}
      alt={name}
      style={{
        width: "100%",
        maxWidth: "100%",
        display: "block",
        height: "560px",
        objectFit: "cover",
        borderRadius: "8px",
        marginBottom: "1rem",
      }}
    />
  </div>


             {/* ✅ SHARE BUTTON — HERO OVERLAY (TEXT) */}
{clientUrl && (
  <a
    href={`sms:&body=${encodeURIComponent(
      `Check out this apartment 👀\n\n${clientUrl}`
    )}`}
    className="hero-share-btn"
    aria-label="Text this listing"
    onClick={(e) => e.stopPropagation()}
  >
    📲 Text This Listing
  </a>
)}


           </div>

<div
  className="gallery-strip"
  style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}
>
  {gallery.slice(0, 5).map((img, i) => (
    <div
      key={i}
      className="watermark gallery-watermark"
      style={{ width: "18.9%", cursor: "zoom-in" }}
      onClick={() => openLightbox(i + 1)} // ✅ correct index
    >
      <img
        src={img}
        alt={`${name} gallery image ${i + 1}`}
        style={{
          width: "100%",
          height: "100px",
          objectFit: "cover",
          borderRadius: "6px",
          border:
            i + 1 === currentImage
              ? "2px solid #2e7d32"
              : "1px solid #ccc",
        }}
      />
    </div>
  ))}
</div>


           {/* TAGS */}
           {tags && tags.length > 0 && (
             <div
 style={{
   margin: "0.5rem 0 1rem 0", // ⬅️ increase from 0.75rem → 1rem
   display: "flex",
   gap: "0.5rem",
   flexWrap: "wrap",
 }}
>


               {tags.map((tag, index) => (
                 <span
                   key={index}
                   style={{
                     backgroundColor: "#f5f5f5",
                     padding: "6px 10px",
                     borderRadius: "4px",
                     fontSize: "0.9rem",
                     color: "#333",
                     border: "1px solid #ddd",
                   }}
                 >
                   {tag}
                 </span>
               ))}


               <span
                 style={{
                   backgroundColor: "#f5f5f5",
                   padding: "6px 10px",
                   borderRadius: "4px",
                   fontSize: "0.9rem",
                   color: "#333",
                   border: "1px solid #ddd",
                 }}
               >
                 {`${name} ${propertyType}`}
               </span>
             </div>
           )}


           {/* TITLE + ADDRESS */}
           <h1
 style={{
   fontSize: "2.5rem",
   marginBottom: "0.25rem",
   textAlign: "left",
   fontWeight: 800,
   color: "#111",
   lineHeight: 1.15,
 }}
>
 {name}
</h1>


           <p
             style={{
               fontSize: "1.2rem",
               color: "#666",
               marginTop: "-0.60rem",
               marginBottom: "1rem",
             }}
           >
             {address}
           </p>


           {/* MOVE-IN SPECIAL */}
{special && (
  <div
    style={{
      backgroundColor: "#e8f2ff",
      border: "1px solid #c7dbff",
      padding: "1rem 1.25rem",
      borderRadius: "10px",
      color: "#004aad",
      fontWeight: "700",
      fontSize: "1.05rem",
      display: "flex",
      alignItems: "flex-start", // ✅ KEY CHANGE
      gap: "0.6rem",
      marginBottom: "1.2rem",
      boxShadow: "0 3px 10px rgba(0,0,0,0.06)",
      lineHeight: "1.6",
    }}
  >
    <FaTag
      style={{
        marginTop: "0.2rem", // ✅ aligns icon with first line
        flexShrink: 0,       // ✅ prevents shifting
        fontSize: "1.2rem",
      }}
    />
    <span>
      <strong>Move-in Special:</strong> {special}
    </span>
  </div>
)}


           {/* ABOUT SECTION */}
           <div
             style={{
               backgroundColor: "#fafafa",
               padding: "1.5rem",
               borderRadius: "8px",
               marginBottom: "2rem",
             }}
           >
             <h2
 style={{
   fontSize: "1.9rem",
   fontWeight: 800,
   marginBottom: "0.75rem",
   color: "#111",
   letterSpacing: "-0.3px",
 }}
>
 About {name}
</h2>




             <p
               style={{
                 marginBottom: "2rem",
                 fontSize: "1.1rem",
                 lineHeight: "1.8",
                 whiteSpace: "pre-wrap",
               }}
             >
               {description}
             </p>


             <div
 style={{
   display: "flex",
   alignItems: "center",
   gap: "0.6rem",
   fontSize: "1.05rem",
   marginBottom: "0.8rem",
 }}
>
 <FaDollarSign style={{ flexShrink: 0 }} />
 <span>
   <strong>Starting at:</strong> {rent}
 </span>
</div>
             <div
 style={{
   display: "flex",
   alignItems: "center",
   gap: "0.6rem",
   fontSize: "1.05rem",
   marginBottom: "0.8rem",
 }}
>
 <FaBed style={{ flexShrink: 0 }} />
 <span>
   <strong>Bedrooms:</strong> {bedrooms}
 </span>
</div>


             <div
 style={{
   display: "flex",
   alignItems: "center",
   gap: "0.6rem",
   fontSize: "1.05rem",
   marginBottom: "0.8rem",
 }}
>
 <FaRulerCombined style={{ flexShrink: 0 }} />
 <span>
   <strong>Square Footage:</strong> {sqft}
 </span>
</div>




             {(yearBuilt || yearRenovated) && (
 <div
   style={{
     display: "flex",
     alignItems: "center",
     gap: "0.6rem",
     fontSize: "1.05rem",
     marginBottom: "0.8rem",
   }}
 >
   <FaCalendarAlt style={{ flexShrink: 0 }} />
   <span>
     {yearBuilt && (
       <>
         <strong>Year Built:</strong> {yearBuilt}
       </>
     )}
     {yearBuilt && yearRenovated && " · "}
     {yearRenovated && (
       <>
         <strong>Renovated:</strong> {yearRenovated}
       </>
     )}
   </span>
 </div>
)}




             <div
 style={{
   display: "flex",
   alignItems: "center",
   gap: "0.6rem",
   fontSize: "1.05rem",
   marginBottom: "0.8rem",
 }}
>
 <FaHome style={{ flexShrink: 0 }} />
 <span>
   <strong>Website:</strong>{" "}
   <a
     href={website}
     target="_blank"
     rel="noopener noreferrer"
     style={{ textDecoration: "underline" }}
   >
     {name}
   </a>
 </span>
</div>




             {/* AMENITIES */}
             {amenities.length > 0 && (
               <>
                 <h3
 style={{
   fontSize: "1.7rem",
   fontWeight: 700,
   marginTop: "3rem",
   marginBottom: "1rem",
   color: "#111",
 }}
>
 Amenities
</h3>


                 <ul
                   className="amenities-list"
                   style={{
                     fontSize: "1.1rem",
                     marginTop: "1rem",
                     lineHeight: "1.8",
                     paddingLeft: "1.2rem",
                   }}
                 >
                   {amenities.map((item, idx) => (
                     <li key={idx} style={{ marginBottom: "0.5rem" }}>
                       {item}
                     </li>
                   ))}
                 </ul>
               </>
             )}
           </div>


           {/* PROPERTY VIDEO TOUR */}
           {video && (
             <>
               <h2
                 style={{
                   marginTop: "40px",
                   display: "flex",
                   alignItems: "center",
                   fontSize: "1.5rem",
                 }}
               >
                 <FaVideo style={{ marginRight: "8px" }} />
                 Property Video Tour
               </h2>
               <div style={{ marginTop: "20px" }}>
                 <iframe
                   width="95%"
                   height="400"
                   src={video}
                   title="Property Tour"
                   frameBorder="0"
                   loading="lazy"
                   allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                   allowFullScreen
                 />
               </div>
             </>
           )}


           {/* LOCATION MAP */}
           {map && (
             <div style={{ marginTop: "40px" }}>
               <h2
                 style={{
                   display: "flex",
                   alignItems: "center",
                   fontSize: "1.75rem",
                   marginBottom: "25px",
                   fontWeight: 600,
                   color: "#1a1a1a",
                   letterSpacing: "-0.3px",
                 }}
               >
                 <FaMapMarkerAlt
                   style={{ marginRight: "10px", color: "#111" }}
                 />
                 Location
               </h2>


               <div
                 style={{
                   marginTop: "10px",
                   marginBottom: "80px",
                   borderRadius: "18px",
                   overflow: "hidden",
                   boxShadow: "0 20px 40px rgba(0,0,0,0.18)",
                   transform: "translateZ(0)",
                 }}
               >
                 <iframe
                   src={map}
                   width="100%"
                   height="420"
                   style={{
                     border: "none",
                     display: "block",
                   }}
                   allowFullScreen
                   loading="lazy"
                   referrerPolicy="no-referrer-when-downgrade"
                   title="Property Location"
                 ></iframe>
               </div>
             </div>
           )}


           {/* FAQ ACCORDION */}
           <h2
 style={{
   marginTop: "2.5rem",
   marginBottom: "1rem",
   fontSize: "2rem",
   fontWeight: 800,
   color: "#111",
   textAlign: "left",
 }}
>
 Frequently Asked Questions
</h2>


           <div style={{ borderTop: "1px solid #ddd", paddingTop: "15px" }}>
             {faqs.map((faq, index) => (
               <div key={index} style={{ marginBottom: "15px" }}>
                 <div
                   onClick={() => toggleAccordion(index)}
                   style={{
                     cursor: "pointer",
                     backgroundColor: "#f1f1f1",
                     padding: "12px 18px",
                     borderRadius: "5px",
                     fontWeight: "600",
                     color: "#004aad",
                     fontSize: "1.05rem",
                     lineHeight: "1.6",
                     fontFamily: "'Inter', sans-serif",
                   }}
                 >
                   {faq.question}
                 </div>
                 {activeIndex === index && (
                   <div
                     style={{
                       backgroundColor: "#fafafa",
                       padding: "12px 18px",
                       border: "1px solid #ddd",
                       borderTop: "none",
                       borderRadius: "0 0 5px 5px",
                       marginTop: "-5px",
                       color: "#555",
                       fontSize: "1.05rem",
                       lineHeight: "1.6",
                       fontFamily: "'Inter', sans-serif",
                     }}
                     dangerouslySetInnerHTML={{ __html: faq.answer }}
                   />
                 )}
               </div>
             ))}
           </div>


{/* GOOD / BAD / UGLY CTA LINK — styled to match Move-in Special */}
{resolvedReviewLink && (
  <div
    style={{
      backgroundColor: "#e8f2ff",
      border: "1px solid #c7dbff",
      padding: "1rem 1.25rem",
      borderRadius: "10px",
      color: "#004aad",
      fontWeight: "700",
      fontSize: "1.05rem",
      display: "block",
      marginTop: "2rem",
      marginBottom: "0.75rem",
      boxShadow: "0 3px 10px rgba(0,0,0,0.06)",
      lineHeight: "1.6",
      maxWidth: "850px",
      marginInline: "auto",
      transition: "transform 0.2s ease, box-shadow 0.2s ease",
    }}
  >
    <a
      href={resolvedReviewLink}
      target="_blank"
      rel="noopener noreferrer"
      style={{ textDecoration: "none" }}
    >

                 <h3
                   style={{
                     color: "#004aad",
                     fontSize: "2rem",
                     fontWeight: "800",
                     marginTop: "0",
                     marginBottom: "0.4rem",
                     transition: "color 0.2s ease",
                   }}
                   onMouseEnter={(e) =>
                     (e.currentTarget.style.color = "#002f75")
                   }
                   onMouseLeave={(e) =>
                     (e.currentTarget.style.color = "#004aad")
                   }
                 >
                   🌵 The Good, Bad & Ugly Review
                 </h3>
               </a>


               <h4
                 style={{
                   color: "#111",
                   fontSize: "1.4rem",
                   fontWeight: "600",
                   marginBottom: "1.2rem",
                 }}
               >
                 Want the inside scoop at {name}?
               </h4>


               <p
                 style={{
                   fontSize: "1.05rem",
                   color: "#333",
                   lineHeight: "1.7",
                   marginBottom: "0.75rem",
                 }}
               >
                 Check out our honest{" "}
                 <a
  href={resolvedReviewLink}
  target="_blank"
  rel="noopener noreferrer"
  style={{
    color: "#004aad",
    fontWeight: "600",
    textDecoration: "underline",
  }}
>
  {name} review.
</a>{" "}
                 We cover what you need to know before leasing that you won’t
                 find anywhere else. What you learn may surprise you!
               </p>
             </div>
           )}
           {/* SOCIAL SHARE */}
<div
  style={{
    maxWidth: "720px",
    margin: "3rem auto 0",
  }}
>
  <ShareBlock />
</div>

         </div>


        {/* ✅ #4 — Good / Bad / Ugly SEO Review Schema */}
{resolvedReviewLink && (
  <script type="application/ld+json">
    {JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Review",
      itemReviewed: {
        "@type": "ApartmentComplex",
        name: name,
        address: address,
       url: clientUrl || resolvedReviewLink,
      },
      author: {
        "@type": "Person",
        name: "Jay Morris",
        jobTitle: "Licensed Real Estate Agent",
        worksFor: {
          "@type": "Organization",
          name: "Lone Star Locators",
          url: "https://lonestarlocators.app",
        },
      },
      reviewBody: `An honest review of ${name} covering the good, bad, and ugly.`,
      reviewRating: {
        "@type": "Rating",
        ratingValue: "4",
        bestRating: "5",
        worstRating: "1",
      },
      publisher: {
        "@type": "Organization",
        name: "Lone Star Locators",
      },
      url: resolvedReviewLink,
    })}
  </script>
)}

         {/* RIGHT COLUMN (SIDEBAR) */}
         <div
           className="listing-sidebar"
           style={{
             flex: 1,
             alignSelf: "flex-start",
             marginTop: "-2rem", // <-- raise sidebar up
           }}
         >
           <div
 style={{
   backgroundColor: "#e0f7e9",
   padding: "1rem",
   borderRadius: "8px",
   fontWeight: "bold",
   color: "#2e7d32",
   fontSize: "1.1rem",
   marginBottom: "0.5rem",
   lineHeight: "1.6",


   /* 🔑 alignment fixes */
   display: "flex",
  alignItems: "flex-start",   // 🔑 key change
   justifyContent: "center",
   gap: "0.6rem",
   textAlign: "center",
 }}
>
<FaGift
   style={{
     marginTop: "0.2rem",      // 🔑 nudges icon to align with “Get”
     flexShrink: 0,
     fontSize: "1.25rem",
   }}
 />
 <span>
   Get up to a <strong>$200 Cash Rebate</strong> or <br />
   <strong>2 Hours of Free Movers!</strong>
 </span>
</div>






           {/* Contact Form */}
           <ContactForm mode="short" propertyName={name} />


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


   // ✅ true centering
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


 {/* ✅ Video Review CTA (Listing Sidebar) */}
{resolvedReviewLink && agentVideo && (
  <div style={{ marginTop: "2rem", textAlign: "center" }}>
    <a href={resolvedReviewLink} style={{ textDecoration: "none" }}>
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: "360px",
          margin: "0 auto",
          borderRadius: "10px",
          overflow: "hidden",
          boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          cursor: "pointer",
        }}
      >
        <img
          src={
            image ||
            "https://via.placeholder.com/800x450?text=Video+Review+Available"
          }
          alt={`${name} Video Review`}
          loading="lazy"
          style={{
            width: "100%",
            display: "block",
          }}
        />

        {/* ▶ Play Overlay */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: "64px",
              height: "64px",
              background: "#ffffff",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "26px",
              color: "#004aad",
              fontWeight: "bold",
            }}
          >
            ▶
          </div>
        </div>
      </div>

      <p
        style={{
          marginTop: "0.75rem",
          fontWeight: 700,
          color: "#004aad",
          fontSize: "0.95rem",
        }}
      >
        Watch the Video Review
      </p>
    </a>
  </div>
)}
         </div>
       </div>


       {/* LIGHTBOX */}
       {lightboxOpen && (
         <div
           onClick={closeLightbox}
           style={{
             position: "fixed",
             top: 0,
             left: 0,
             width: "100vw",
             height: "100vh",
             backgroundColor: "rgba(0, 0, 0, 0.9)",
             display: "flex",
             justifyContent: "center",
             alignItems: "center",
             zIndex: 99999,
           }}
         >
           <button
             onClick={(e) => {
               e.stopPropagation();
               closeLightbox();
             }}
             style={{
               position: "absolute",
               top: "20px",
               right: "30px",
               fontSize: "2rem",
               background: "transparent",
               border: "none",
               color: "#fff",
               cursor: "pointer",
             }}
           >
             ✖
           </button>


           <button
             onClick={(e) => {
               e.stopPropagation();
               prevImage();
             }}
             style={{
               position: "absolute",
               left: "20px",
               fontSize: "2rem",
               background: "transparent",
               border: "none",
               color: "#fff",
               cursor: "pointer",
             }}
           >
             ◀
           </button>


           <img
             src={images[currentImage]}
             alt="Lightbox"
             style={{
               maxWidth: "80%",
               maxHeight: "80%",
               borderRadius: "8px",
             }}
           />


           <button
             onClick={(e) => {
               e.stopPropagation();
               nextImage();
             }}
             style={{
               position: "absolute",
               right: "20px",
               fontSize: "2rem",
               background: "transparent",
               border: "none",
               color: "#fff",
               cursor: "pointer",
             }}
           >
             ▶
           </button>
         </div>
       )}
     </div>


     {/* Fixed JayBot */}
     <div
       style={{
         position: "fixed",
         bottom: "1rem",
         right: "1rem",
         zIndex: 99999,
       }}
     >
       <JayBotWidget delay={15000} />
     </div>
   </>
 );
};


export default ListingLayout;
