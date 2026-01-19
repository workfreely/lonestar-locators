"use client";

import React, { Suspense } from "react";
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
    <Suspense fallback={null}>
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
              <h3 style={{ fontSize: "1.55rem", fontWeight: 700 }}>
                New Year Eve Downtown Celebration
              </h3>
              <p>
                <strong>📆 January One — Downtown and River Walk</strong>
              </p>
              <p>
                Outdoor concerts, food vendors, family activities, and fireworks
                over downtown.
              </p>
            </div>

            {/* FEB–MAR */}
            <div style={{ padding: "0.9rem 0", borderBottom: "1px solid #eee" }}>
              <h3 style={{ fontSize: "1.55rem", fontWeight: 700 }}>
                San Antonio Stock Show and Rodeo
              </h3>
              <p>
                <strong>
                  📆 February through March — Frost Bank Center
                </strong>
              </p>
              <p>
                Concerts, livestock shows, carnival rides, shopping, and family
                activities.
              </p>
            </div>

            {/* FIESTA */}
            <div style={{ padding: "0.9rem 0", borderBottom: "1px solid #eee" }}>
              <h3 style={{ fontSize: "1.55rem", fontWeight: 700 }}>
                Fiesta San Antonio
              </h3>
              <p>
                <strong>📆 Mid to Late April — Citywide</strong>
              </p>
              <p>
                A historic multi-week celebration with parades, concerts, and
                cultural events.
              </p>
            </div>

            <h2 style={{ marginTop: "2rem" }}>Where Most Events Happen</h2>
            <p>
              Most events take place around the River Walk, downtown, Market
              Square, Hemisfair, Civic Park, and the King William District.
            </p>
          </>
        }
        faqs={faqs}
      />
    </Suspense>
  );
};

export default SanAntonioEvents;
