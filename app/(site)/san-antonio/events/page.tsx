"use client";

import BlogLayout from "@/app/components/BlogLayout";
import AISchema from "@/app/components/AISchema";

const SanAntonioEvents = () => {
  const faqs = [
    {
      question: "What are the biggest annual events in San Antonio?",
      answer:
        "Major annual events include Fiesta San Antonio, the Stock Show and Rodeo, holiday lights on the River Walk, King William Fair, and numerous cultural festivals throughout the year.",
    },
    {
      question: "Are there free events in San Antonio?",
      answer:
        "Yes, many events are free including the River Walk holiday lights, art walks, Market Square celebrations, and cultural community festivals.",
    },
    {
      question: "Does San Antonio have family friendly events?",
      answer:
        "Yes, many events are designed for families including the Stock Show and Rodeo, holiday parades, Market Square festivals, and seasonal concerts and exhibits.",
    },
    {
      question: "Does traffic increase during major events?",
      answer:
        "Traffic can increase near the River Walk, downtown, and major venues during large events. Arriving early or using rideshare can help avoid delays.",
    },
    {
      question: "When is the best time for events in San Antonio?",
      answer:
        "Spring for Fiesta and King William Fair, fall for outdoor festivals, winter for holiday events, and summer for concerts and river activities.",
    },
  ];

  return (
    <>
      {/* City-level AI & entity schema */}
      <AISchema city="San Antonio" />

      <BlogLayout
        title="San Antonio Events - Best Events in San Antonio, Texas"
        keywords={[
          "San Antonio events",
          "things to do in San Antonio",
          "San Antonio festivals",
          "San Antonio concerts",
          "San Antonio activities",
          "San Antonio family events",
        ]}
        address={{ addressLocality: "San Antonio", addressRegion: "TX" }}
        content={
          <>
            {/* Intro */}
            <p style={{ marginBottom: "0.5rem" }}>
              <strong>
                Looking for the best events happening in San Antonio?
              </strong>{" "}
              The Alamo City hosts festivals, concerts, parades, cultural
              celebrations, and family events all year long.
            </p>

            <p style={{ marginBottom: "1.6rem", color: "#555" }}>
              Here is a chronological guide to the most popular annual events in
              San Antonio.
            </p>

            {/* JANUARY */}
            <div style={{ padding: "0.6rem 0", borderBottom: "1px solid #eee" }}>
              <h3
                style={{
                  fontSize: "1.55rem",
                  marginBottom: "0.3rem",
                  fontWeight: 700,
                }}
              >
                New Year Eve Downtown Celebration
              </h3>
              <p style={{ margin: "0.2rem 0" }}>
                <strong>📆 January One — Downtown and River Walk</strong>
              </p>
              <p style={{ margin: "0.45rem 0" }}>
                The city rings in the new year with outdoor concerts, food
                vendors, family activities, and a large fireworks show over
                downtown.
              </p>
              <a
                href="https://visitsanantonio.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                Official Visitors Info
              </a>
            </div>

            {/* FEB–MAR */}
            <div style={{ padding: "0.9rem 0", borderBottom: "1px solid #eee" }}>
              <h3
                style={{
                  fontSize: "1.55rem",
                  marginBottom: "0.3rem",
                  fontWeight: 700,
                }}
              >
                San Antonio Stock Show and Rodeo
              </h3>
              <p style={{ margin: "0.2rem 0" }}>
                <strong>
                  📆 February through March — Frost Bank Center
                </strong>
              </p>
              <p style={{ margin: "0.45rem 0" }}>
                One of the top rodeos in Texas with concerts, livestock shows,
                carnival rides, shopping, and daily family activities.
              </p>
              <a
                href="https://www.sarodeo.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                Official Website
              </a>
            </div>

            {/* MARCH */}
            <div style={{ padding: "0.9rem 0", borderBottom: "1px solid #eee" }}>
              <h3
                style={{
                  fontSize: "1.55rem",
                  marginBottom: "0.3rem",
                  fontWeight: 700,
                }}
              >
                Contemporary Art Month (CAM)
              </h3>
              <p style={{ margin: "0.2rem 0" }}>
                <strong>📆 March — Citywide</strong>
              </p>
              <p style={{ margin: "0.45rem 0" }}>
                A citywide celebration of contemporary art featuring exhibits,
                performances, installations, and artist showcases.
              </p>
              <a
                href="https://contemporaryartmonth.org"
                target="_blank"
                rel="noopener noreferrer"
              >
                Official Website
              </a>
            </div>

            {/* ST PATRICK’S */}
            <div style={{ padding: "0.9rem 0", borderBottom: "1px solid #eee" }}>
              <h3
                style={{
                  fontSize: "1.55rem",
                  marginBottom: "0.3rem",
                  fontWeight: 700,
                }}
              >
                St Patrick’s River Parade and Festival
              </h3>
              <p style={{ margin: "0.2rem 0" }}>
                <strong>📆 Mid March — River Walk</strong>
              </p>
              <p style={{ margin: "0.45rem 0" }}>
                The River Walk turns green with live music, food vendors, festive
                floats, and river celebrations.
              </p>
              <a
                href="https://www.thesanantonioriverwalk.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                River Walk Info
              </a>
            </div>

            {/* FIESTA */}
            <div style={{ padding: "0.9rem 0", borderBottom: "1px solid #eee" }}>
              <h3
                style={{
                  fontSize: "1.55rem",
                  marginBottom: "0.3rem",
                  fontWeight: 700,
                }}
              >
                Fiesta San Antonio
              </h3>
              <p style={{ margin: "0.2rem 0" }}>
                <strong>📆 Mid to Late April — Citywide</strong>
              </p>
              <p style={{ margin: "0.45rem 0" }}>
                A historic multi week celebration with parades, concerts, food,
                and cultural events attracting millions.
              </p>
              <a
                href="https://fiestasanantonio.org"
                target="_blank"
                rel="noopener noreferrer"
              >
                Official Website
              </a>
            </div>

            {/* KING WILLIAM */}
            <div style={{ padding: "0.9rem 0", borderBottom: "1px solid #eee" }}>
              <h3
                style={{
                  fontSize: "1.55rem",
                  marginBottom: "0.3rem",
                  fontWeight: 700,
                }}
              >
                King William Fair
              </h3>
              <p style={{ margin: "0.2rem 0" }}>
                <strong>📆 Late April — King William District</strong>
              </p>
              <p style={{ margin: "0.45rem 0" }}>
                Art vendors, food booths, live music, and family fun in one of
                San Antonio’s oldest neighborhoods.
              </p>
              <a
                href="https://kingwilliamfair.org"
                target="_blank"
                rel="noopener noreferrer"
              >
                Official Website
              </a>
            </div>

            {/* WHERE EVENTS HAPPEN */}
            <h2 style={{ marginTop: "2rem" }}>Where Most Events Happen</h2>
            <p style={{ marginBottom: 0 }}>
              Most events take place around the River Walk, downtown, Market
              Square, Hemisfair, Civic Park, and the King William District.
            </p>
          </>
        }
        faqs={faqs}
      />
    </>
  );
};

export default SanAntonioEvents;
