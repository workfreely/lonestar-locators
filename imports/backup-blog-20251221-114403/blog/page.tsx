// app/blog/page.tsx
"use client";

import Link from "next/link";
import { FaMapMarkerAlt } from "react-icons/fa";

export default function BlogHomePage() {
  return (
    <div
      style={{
        maxWidth: "1200px",
        margin: "0 auto",
        padding: "3rem 1rem",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {/* Page Title — upper left for consistency */}
      <h1
        style={{
          fontSize: "2.5rem",
          fontWeight: 800,
          marginBottom: "2rem",
          color: "#111",
        }}
      >
        Blog
      </h1>

      {/* ================= CITY CARDS (HOMEPAGE MATCH) ================= */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: "1.5rem",
        }}
      >
        {/* Austin */}
        <Link href="/austin/blog">
          <div style={{ position: "relative", borderRadius: "12px", overflow: "hidden" }}>
            <img
              src="https://res.cloudinary.com/dxtiguwzm/image/upload/v1747937030/lone-star-locators-austin-texas-free-apartment-locating_ew5tvq.jpg"
              alt="Austin Apartment Blog"
              style={{
                width: "100%",
                height: "260px",
                objectFit: "cover",
                filter: "brightness(65%)",
              }}
            />
            <h2
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontSize: "2rem",
                fontWeight: 800,
                gap: "8px",
              }}
            >
              <FaMapMarkerAlt /> Austin
            </h2>
          </div>
        </Link>

        {/* Dallas */}
        <Link href="/dallas/blog">
          <div style={{ position: "relative", borderRadius: "12px", overflow: "hidden" }}>
            <img
              src="https://res.cloudinary.com/dxtiguwzm/image/upload/v1747937029/lone-star-locators-dallas-texas-free-apartment-locating_cdr8z9.jpg"
              alt="Dallas Apartment Blog"
              style={{
                width: "100%",
                height: "260px",
                objectFit: "cover",
                filter: "brightness(65%)",
              }}
            />
            <h2
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontSize: "2rem",
                fontWeight: 800,
                gap: "8px",
              }}
            >
              <FaMapMarkerAlt /> Dallas
            </h2>
          </div>
        </Link>

        {/* Houston */}
        <Link href="/houston/blog">
          <div style={{ position: "relative", borderRadius: "12px", overflow: "hidden" }}>
            <img
              src="https://res.cloudinary.com/dxtiguwzm/image/upload/v1747937029/lone-star-locators-houston-texas-free-apartment-locating_j63kfq.jpg"
              alt="Houston Apartment Blog"
              style={{
                width: "100%",
                height: "260px",
                objectFit: "cover",
                filter: "brightness(65%)",
              }}
            />
            <h2
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontSize: "2rem",
                fontWeight: 800,
                gap: "8px",
              }}
            >
              <FaMapMarkerAlt /> Houston
            </h2>
          </div>
        </Link>

        {/* San Antonio */}
        <Link href="/san-antonio/blog">
          <div style={{ position: "relative", borderRadius: "12px", overflow: "hidden" }}>
            <img
              src="https://res.cloudinary.com/dxtiguwzm/image/upload/v1747937030/lone-star-locators-san-antonio-texas-free-apartment-locating_trgkaj.jpg"
              alt="San Antonio Apartment Blog"
              style={{
                width: "100%",
                height: "260px",
                objectFit: "cover",
                filter: "brightness(65%)",
              }}
            />
            <h2
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                fontSize: "2rem",
                fontWeight: 800,
                gap: "8px",
              }}
            >
              <FaMapMarkerAlt /> San Antonio
            </h2>
          </div>
        </Link>
      </div>
    </div>
  );
}
