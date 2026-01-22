"use client";


import React, { useState, useEffect } from "react";


/* 🧠 GLOBAL ANALYTICS HELPER
  - Sends events to GA4 / Meta Pixel / PostHog
  - NO-OP in dev
  - Centralized so we never duplicate logic
*/
import { track } from "@/app/lib/analytics";


const ExitIntentPopup = () => {
 const [showPopup, setShowPopup] = useState(false);
 const [emailSubmitted, setEmailSubmitted] = useState(false);
 const [userEmail, setUserEmail] = useState("");

 const pathname = typeof window !== "undefined" ? window.location.pathname : "";


 /* ===============================
  POPUP EXCLUSION RULES
  =============================== */


const EXCLUDED_PATHS = [
 "/start-your-search",
 "/buy-new-home",
 "/new-home-thank-you",
 "/report-lease",
 "/privacy",
 "/terms",
 "/disclaimer",
 "/sitemap",
 "/how-it-works",
 "/meet-your-locators",
 "/why-choose-us",
];

 useEffect(() => {
   const DEV_MODE = true; // ✅ Set false when live (bypasses cooldown logic)


   if (!DEV_MODE) {
     const hasSubmitted = localStorage.getItem("leadSubmitted") === "true";
     if (hasSubmitted) return; // 👤 Already submitted → never show again


     const lastShown = localStorage.getItem("popupLastShown");
     if (lastShown) {
       const daysSinceShown =
         (Date.now() - parseInt(lastShown, 10)) / (1000 * 60 * 60 * 24);


       // ⛔ If shown less than 30 days ago → skip
       if (daysSinceShown < 30) return;
     }
   }


   let engaged = false;


   // 👆 Detect real user engagement (prevents spammy popups)
   const markEngaged = () => {
     engaged = true;
     window.removeEventListener("scroll", markEngaged);
     window.removeEventListener("click", markEngaged);
     window.removeEventListener("touchstart", markEngaged);
   };


   window.addEventListener("scroll", markEngaged);
   window.addEventListener("click", markEngaged);
   window.addEventListener("touchstart", markEngaged);


   // 🕐 Delay popup until user has been on site for 60s
   const showDelay = 60000;


   const popupTimer = setTimeout(() => {
     if (engaged) {
       setShowPopup(true);


       /* 📊 TRACK: Popup displayed
          - Fires once per session (respecting cooldown)
          - Used to measure impressions vs submissions
       */
       track("exit_popup_shown", {
  location: pathname,
});

       // 🗓️ Save timestamp to prevent re-showing for 30 days
       localStorage.setItem("popupLastShown", Date.now().toString());
     }
   }, showDelay);


   // ✅ Cleanup listeners
   return () => {
     clearTimeout(popupTimer);
     window.removeEventListener("scroll", markEngaged);
     window.removeEventListener("click", markEngaged);
     window.removeEventListener("touchstart", markEngaged);
   };
 }, []);


 const handleClose = () => {
   setShowPopup(false);


   /* 📊 TRACK: Popup dismissed (optional but useful) */
   track("exit_popup_closed", {
     location: window.location.pathname,
   });
 };


 const handleSubmit = (e: React.FormEvent) => {
   e.preventDefault();


   const emailInput = (e.currentTarget as HTMLFormElement).querySelector(
     "input[type='email']"
   ) as HTMLInputElement;


   if (emailInput?.value) {
     localStorage.setItem("popupEmail", emailInput.value);
   }


   localStorage.setItem("leadSubmitted", "true");
   setEmailSubmitted(true);


   /* 📊 TRACK: Lead captured from popup
      - Primary conversion event
      - Wire this to GA4 / Meta / Ads
   */
   track("exit_popup_email_submitted", {
  source: "exit_popup",
  location: pathname,
});

   // 🔁 Redirect to search flow
   setTimeout(() => {
     window.location.href = `/start-your-search?ref=popup&email=${encodeURIComponent(
 emailInput?.value || ""
)}`;
   }, 2000);
 };


 if (!showPopup) return null;


 return (
   <div
     style={{
       position: "fixed",
       inset: 0,
       backgroundColor: "rgba(0,0,0,0.5)",
       display: "flex",
       justifyContent: "center",
       alignItems: "flex-start",
       zIndex: 9999,
       padding: "20px",
     }}
   >
       <div
  style={{
    animation: "fadeIn 0.6s ease",
    animationFillMode: "both",
    position: "relative",
    backgroundImage:
      "url('https://res.cloudinary.com/dxtiguwzm/image/upload/v1747937030/lone-star-locators-austin-texas-free-apartment-locating_ew5tvq.jpg')",
    backgroundSize: "cover",
    backgroundPosition: "center",
    padding: "20px",
    borderRadius: "10px",

    /* 🔑 Desktop stays 520px */
    maxWidth: "520px",

    /* 📱 Mobile fix */
    width: "100%",
    boxSizing: "border-box",

    textAlign: "center",
    boxShadow: "0 20px 40px rgba(0,0,0,0.45)",
  }}
>

       {/* ❌ Close */}
       <button
         onClick={handleClose}
         aria-label="Close popup"
         style={{
           position: "absolute",
           top: "-25px",
           right: "-25px",
           background: "transparent",
           color: "white",
           border: "none",
           fontSize: "2.8rem",
           fontWeight: 700,
           cursor: "pointer",
           marginTop: "0.75rem", // ✅ ADD THIS
         }}
       >
         ×
       </button>


       {/* Overlay */}
       <div
         style={{
           position: "absolute",
           inset: 0,
           backgroundColor: "rgba(0,0,0,0.6)",
           borderRadius: "10px",
         }}
       />


<div style={{ position: "relative", zIndex: 2 }}>
 {!emailSubmitted && (
   <>
     <h2
       style={{
         fontSize: "1.4rem",
         fontWeight: 700,
         letterSpacing: "0.5px",
         margin: "0 0 1.4rem 0",
         color: "#fff",
       }}
     >
       WANT TO PRIORITIZE YOUR SEARCH?
     </h2>


     <img
       src="https://res.cloudinary.com/dxtiguwzm/image/upload/v1758820133/luxury-apartment-locator-list-austin-dallas-houston-san-antonio_cfbc0q.png"
       alt="Exclusive Apartment List"
       style={{
         width: "100%",
         marginBottom: "1rem",
         borderRadius: "6px",
         border: "1px solid #ddd",
       }}
     />


     <p
       style={{
         fontSize: "1rem",
         marginBottom: "1.5rem",
         color: "#fff",
       }}
     >
       Enter your email — we’ll send your personalized list.
     </p>


     <form onSubmit={handleSubmit}>
       <input
         type="email"
         placeholder="Enter your email"
         value={userEmail}
         onChange={(e) => setUserEmail(e.target.value)}
         required
         style={{
           width: "100%",
           padding: "0.75rem",
           borderRadius: "6px",
           border: "1px solid #ccc",
           marginBottom: "1rem",
           fontSize: "1rem",
           fontFamily: "'Inter', sans-serif",
         }}
       />


       <button
         type="submit"
         style={{
           width: "100%",
           padding: "0.9rem",
           backgroundColor: "#2e7d32",
           color: "#fff",
           borderRadius: "6px",
           border: "none",
           fontSize: "1.05rem",
           fontWeight: 600,
           cursor: "pointer",
         }}
       >
         Get My Free List
       </button>
     </form>


     {/* ✅ Opt-out text (this was missing) */}
     <button
       onClick={handleClose}
       style={{
         marginTop: "1rem",
         background: "none",
         border: "none",
         color: "#ccc",
         cursor: "pointer",
         textDecoration: "underline",
         fontSize: "0.9rem",
       }}
     >
       No thanks, I don’t want free movers or cash rebate
     </button>
   </>
 )}


 {emailSubmitted && (
   <>
     <h2
       style={{
         fontSize: "1.5rem",
         marginBottom: "1rem",
         color: "#fff",
       }}
     >
       Almost there! Let's personalize your list…
     </h2>


     <img
       src="https://res.cloudinary.com/dxtiguwzm/image/upload/v1758820133/luxury-apartment-locator-list-austin-dallas-houston-san-antonio_cfbc0q.png"
       alt="Exclusive Luxury Apartment List"
       style={{
         width: "100%",
         marginBottom: "1rem",
         borderRadius: "6px",
         border: "1px solid #ddd",
       }}
     />


     <p
       style={{
         fontSize: "1rem",
         marginBottom: "1.5rem",
         color: "#fff",
       }}
     >
      Redirecting you to complete your search preferences…
     </p>
   </>
 )}
</div>


     </div>
{/* 🔁 REQUIRED: keyframe animation definition */}
      <style>
  {`
    @keyframes fadeIn {
      0% {
        opacity: 0;
      }
      100% {
        opacity: 1;
      }
    }
  `}
</style>


   </div>
 );
};


export default ExitIntentPopup;
