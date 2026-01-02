"use client";

import NewHomeContactForm from "@/app/components/NewHomeContactForm";

export const metadata = {
  title: "Buy a New Home in Houston | New Construction & Pre-Approval Help",
  description:
    "Get pre-approved and find new construction homes in Houston, TX. Connect with a local expert and receive a personalized list of builder communities — free service.",
};

const BuyNewHomeContactHoustonPage = () => {
  return (
    <div style={{ padding: "2rem", fontFamily: "'Inter', sans-serif" }}>
      <h1
        style={{
          fontSize: "2rem",
          textAlign: "center",
          marginBottom: "1rem",
        }}
      >
        Get Pre-Approved & Find a New Home in Houston
      </h1>

      <p
        style={{
          textAlign: "center",
          maxWidth: "600px",
          margin: "0 auto 2rem",
        }}
      >
        Fill out the form below to connect with a local expert and receive a
        personalized list of new construction homes in Houston, TX.
      </p>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: "2rem",
          maxWidth: "1200px",
          margin: "0 auto",
        }}
      >
        <div style={{ flex: "1 1 420px", minWidth: "320px" }}>
          <NewHomeContactForm />
        </div>

        <div style={{ flex: "1 1 320px", minWidth: "280px" }}>
          <div
            style={{
              position: "relative",
              paddingBottom: "150%",
              height: 0,
              overflow: "hidden",
              borderRadius: "8px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            }}
          >
            <iframe
              src="https://www.youtube.com/embed/YOUR_VIDEO_ID"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              title="New Home Buying Process"
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                borderRadius: "8px",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default BuyNewHomeContactHoustonPage;
