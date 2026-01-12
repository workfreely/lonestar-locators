"use client";

import Script from "next/script";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { FaMapMarkerAlt } from "react-icons/fa";
import FeaturedProperties from "./FeaturedProperties";
import TestimonialsSection from "./TestimonialsSection";
import JayBotWidget from "./JayBotWidget";

/* ✅ FIXED: Client-only animation */
const TypeAnimation = dynamic(
  () => import("react-type-animation").then((mod) => mod.TypeAnimation),
  { ssr: false }
);

export default function HomePage() {
  const router = useRouter();

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", color: "#333" }}>
      {/* ================= SEO + SCHEMA ================= */}

      <Script id="org-schema" type="application/ld+json" strategy="afterInteractive">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "Lone Star Locators",
          url: "https://www.lonestarlocators.app",
          logo:
            "https://res.cloudinary.com/dxtiguwzm/image/upload/v1747937030/lone-star-locators-logo.png",
          description:
            "Free AI-powered apartment locating service helping renters find luxury apartments, townhomes, penthouses, and second chance apartments across Texas",
          address: {
            "@type": "PostalAddress",
            addressLocality: "San Antonio",
            addressRegion: "TX",
            addressCountry: "US",
          },
          sameAs: [
            "https://www.instagram.com/realestatepro_tx",
            "https://www.facebook.com/lonestarlocators",
            "https://www.tiktok.com/@lonestarlocators",
          ],
        })}
      </Script>

      <Script id="cities-schema" type="application/ld+json" strategy="afterInteractive">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: "Texas Cities We Serve",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Austin, TX" },
            { "@type": "ListItem", position: 2, name: "Dallas, TX" },
            { "@type": "ListItem", position: 3, name: "Houston, TX" },
            { "@type": "ListItem", position: 4, name: "San Antonio, TX" },
          ],
        })}
      </Script>

      <Script id="ai-schema" type="application/ld+json" strategy="afterInteractive">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Service",
          serviceType: "AI Apartment Locator",
          provider: {
            "@type": "Organization",
            name: "Lone Star Locators",
          },
          areaServed: ["Austin TX", "Dallas TX", "Houston TX", "San Antonio TX"],
          offers: {
            "@type": "Offer",
            price: "0",
            priceCurrency: "USD",
          },
          keywords: [
            "Free Apartment Locator",
            "Texas Apartment Locator",
            "AI Apartment Search",
            "Luxury Apartments Texas",
            "Townhomes Texas",
            "Second Chance Apartments",
            "JayBot AI Apartment Assistant",
            "Lone Star Locators",
            "Jay Morris Apartment Locator",
          ],
        })}
      </Script>

      {/* ================= HERO ================= */}

      <header style={{ textAlign: "center", padding: "1.5rem 1rem" }}>
        <h1 style={{ fontSize: "3.5rem", fontWeight: 800 }}>
          Free Apartment Locator in Texas
        </h1>
        <p style={{ maxWidth: "900px", margin: "1rem auto", fontSize: "1.25rem" }}>
          We help you find, tour and lease luxury apartments, townhomes and penthouses with the best move-in specials.
          <strong> Get free movers or up to $200 cash rebate when you lease through us.</strong>
        </p>
      </header>

      {/* ================= CITY CARDS ================= */}

      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)", // ✅ FORCE 2x2
          gap: "1.5rem",
          padding: "1rem",
        }}
      >
        {/* Austin */}
        <Link href="/austin/apartments" className="city-card">
          <div style={{ position: "relative", borderRadius: "12px", overflow: "hidden" }}>
            <img
              src="https://res.cloudinary.com/dxtiguwzm/image/upload/v1747937030/lone-star-locators-austin-texas-free-apartment-locating_ew5tvq.jpg"
              alt="Austin Apartments - Free Apartment Locator in Austin TX"
              style={{ width: "100%", height: "260px", objectFit: "cover", filter: "brightness(65%)" }}
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
        <Link href="/dallas/apartments" className="city-card">
          <div style={{ position: "relative", borderRadius: "12px", overflow: "hidden" }}>
            <img
              src="https://res.cloudinary.com/dxtiguwzm/image/upload/v1747937029/lone-star-locators-dallas-texas-free-apartment-locating_cdr8z9.jpg"
              alt="Dallas Apartments - Free Apartment Locator in Dallas TX"
              style={{ width: "100%", height: "260px", objectFit: "cover", filter: "brightness(65%)" }}
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
        <Link href="/houston/apartments" className="city-card">
          <div style={{ position: "relative", borderRadius: "12px", overflow: "hidden" }}>
            <img
              src="https://res.cloudinary.com/dxtiguwzm/image/upload/v1747937029/lone-star-locators-houston-texas-free-apartment-locating_j63kfq.jpg"
              alt="Houston Apartments - Free Apartment Locator in Houston TX"
              style={{ width: "100%", height: "260px", objectFit: "cover", filter: "brightness(65%)" }}
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
        <Link href="/san-antonio/apartments" className="city-card">
          <div style={{ position: "relative", borderRadius: "12px", overflow: "hidden" }}>
            <img
              src="https://res.cloudinary.com/dxtiguwzm/image/upload/v1747937030/lone-star-locators-san-antonio-texas-free-apartment-locating_trgkaj.jpg"
              alt="San Antonio Apartments - Free Apartment Locator in San Antonio TX"
              style={{ width: "100%", height: "260px", objectFit: "cover", filter: "brightness(65%)" }}
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

      {/* ================= AI SEARCH ================= */}

      <section id="search-section" className="home-section" style={{ textAlign: "center" }}>
        <h2
  id="search-title"
  style={{
    fontSize: "3rem",
    fontWeight: 900,
    letterSpacing: "-0.02em",
    marginBottom: "0.75rem",
  }}
>
  Not Your Ordinary <span className="break" /> Apartment Search
</h2>
<p
  style={{
    maxWidth: "640px",
    margin: "0 auto 1.5rem",
    fontSize: "1.2rem",
    color: "#555",
  }}
>
  Find apartments based on how you actually want to live.
</p>



        <div
          style={{
            maxWidth: "850px",
            margin: "2rem auto",
            background: "#fff",
            padding: "1.25rem 2rem",
            borderRadius: "45px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
            fontSize: "1.8rem",
            fontWeight: 700,
          }}
        >
          <TypeAnimation
           sequence={[
            "Luxury townhome with garage in San Antonio",
  2600,
  "2 bed luxury townhome with private yard in Austin",
  2600,
  "High-rise apartment with city views in Dallas",
  2600,
  "Pet-friendly apartment with infinity pool in Houston",
  2600,
  
]}
            speed={45}
            repeat={Infinity}
            deletionSpeed={55}
          />
        </div>

        <button
          onClick={() => router.push("/start-your-search")}
          className="start-your-search-btn"
          style={{ fontSize: "1.3rem", marginTop: "1.5rem" }}
        >
          Start Your Search
        </button>
      </section>

      {/* ================= FEATURED + BOT ================= */}

      <TestimonialsSection
  testimonials={[
    {
      name: "Ashley V.",
      location: "San Antonio, TX",
      text:
        "Hi Jay, you're the best! Yes, all is coming along beautifully. I ended up switching units because the view in one of the 2/2 got me 😍",
    },
    {
      name: "Tiffany P.",
      location: "San Antonio, TX",
      text:
        "Yes sir, we just submitted our application. Thank you very much for your help, we got it approved!",
    },
    {
      name: "Jerry T.",
      location: "Austin, TX",
      text:
        "Hey, they ended up approving me with a half month deposit, which is great! I'm getting it all squared away!",
    },
    {
      name: "Eric S.",
      location: "Houston, TX",
      text:
        "Thank you bro! Appreciate you! I really prayed for this man. I was boutta be homeless. I’m feeling beyond blessed. Thanks again for pointing me in the right direction.",
    },
  ]}
/>

<FeaturedProperties />
      <JayBotWidget />
    </div>
  );
}
