"use client";

import React, { useState, useEffect } from "react";
import { track } from "@/app/lib/analytics";

const ExitIntentPopup = () => {
  const [showPopup, setShowPopup] = useState(false);
  const [emailSubmitted, setEmailSubmitted] = useState(false);
  const [userEmail, setUserEmail] = useState("");

  const pathname =
    typeof window !== "undefined" ? window.location.pathname : "";

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

  // 🔒 Skip popup on excluded routes
  if (
    EXCLUDED_PATHS.some(path =>
      window.location.pathname.startsWith(path)
    )
  ) {
    return;
  }

  const DEV_MODE = true;

    if (!DEV_MODE) {
      const hasSubmitted = localStorage.getItem("leadSubmitted") === "true";
      if (hasSubmitted) return;

      const lastShown = localStorage.getItem("popupLastShown");
      if (lastShown) {
        const daysSinceShown =
          (Date.now() - parseInt(lastShown, 10)) /
          (1000 * 60 * 60 * 24);
        if (daysSinceShown < 30) return;
      }
    }

    let engaged = false;

    const markEngaged = () => {
      engaged = true;
      window.removeEventListener("scroll", markEngaged);
      window.removeEventListener("click", markEngaged);
      window.removeEventListener("touchstart", markEngaged);
    };

    window.addEventListener("scroll", markEngaged);
    window.addEventListener("click", markEngaged);
    window.addEventListener("touchstart", markEngaged);

    const popupTimer = setTimeout(() => {
      if (engaged) {
        setShowPopup(true);

        track("exit_popup_shown", { location: pathname });
        localStorage.setItem("popupLastShown", Date.now().toString());
      }
    }, 60000);

    return () => {
      clearTimeout(popupTimer);
      window.removeEventListener("scroll", markEngaged);
      window.removeEventListener("click", markEngaged);
      window.removeEventListener("touchstart", markEngaged);
    };
  }, []);

  const handleClose = () => {
    setShowPopup(false);
    track("exit_popup_closed", { location: pathname });
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

    track("exit_popup_email_submitted", {
      source: "exit_popup",
      location: pathname,
    });

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
          position: "relative",
          backgroundImage:
            "url('https://res.cloudinary.com/dxtiguwzm/image/upload/v1747937030/lone-star-locators-austin-texas-free-apartment-locating_ew5tvq.jpg')",
          backgroundSize: "cover",
          backgroundPosition: "center",
          padding: "20px",
          borderRadius: "10px",
          maxWidth: "520px",
          width: "90%",
          boxSizing: "border-box",
          textAlign: "center",
          boxShadow: "0 20px 40px rgba(0,0,0,0.45)",
        }}
      >
        {/* Close */}
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
              {/* TITLE */}
             <div
  style={{
    display: "flex",
    justifyContent: "center",
    width: "100%",
  }}
>
  <h2
    style={{
      fontSize: "1.4rem",
      fontWeight: 700,
      letterSpacing: "0.5px",
      margin: "0 0 1.4rem 0",
      color: "#fff",
      lineHeight: 1.2,
      textAlign: "center",
    }}
  >
    <span className="popup-title-desktop">
      WANT TO PRIORITIZE YOUR SEARCH?
    </span>

    <span className="popup-title-mobile">
      WANT TO PRIORITIZE
      <br />
      YOUR SEARCH?
    </span>
  </h2>
</div>

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
                <span className="popup-copy-desktop">
                  Enter your email. We’ll send your personalized list.
                </span>
                <span className="popup-copy-mobile">
                  Enter your email to get your free list.
                </span>
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
                  Get My Free Apartment List
                </button>
              </form>

              <button
                onClick={handleClose}
                style={{
                  marginTop: "1rem",
                  background: "none",
                  border: "none",
                  color: "#ccc",
                  cursor: "pointer",
                  textDecoration: "underline",
                  fontSize: "0.85rem",
                }}
              >
                <span className="popup-copy-desktop">
                  No thanks, I don’t want free movers or a cash rebate
                </span>
                <span className="popup-copy-mobile">
                  No thanks, I’ll pass on free movers or cashback
                </span>
              </button>
            </>
          )}

          {emailSubmitted && (
            <>
              <h2
                style={{
                  fontSize: "1.4rem",
                  color: "#fff",
                  marginBottom: "1rem",
                }}
              >
                Almost there! Let’s personalize your list…
              </h2>
            </>
          )}
        </div>

        {/* CSS */}
<style>
{`
  .popup-title-mobile,
  .popup-copy-mobile {
    display: none;
  }

  .popup-title-desktop,
  .popup-copy-desktop {
    display: inline;
  }

  @media (max-width: 768px) {
    .popup-title-desktop,
    .popup-copy-desktop {
      display: none;
    }

    .popup-title-mobile,
    .popup-copy-mobile {
      display: inline;
    }
  }
`}
</style>
      </div>
    </div>
  );
};

export default ExitIntentPopup;
