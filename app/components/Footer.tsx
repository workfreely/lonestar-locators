"use client";

import React from "react";
import Link from "next/link";
import {
  FaFacebookF,
  FaInstagram,
  FaYoutube,
  FaTiktok,
  FaCookieBite,
} from "react-icons/fa";

const Footer = () => {
  const linkStyle: React.CSSProperties = {
    color: "white",
    textDecoration: "none",
    marginBottom: "0.5rem",
    display: "inline-block",
  };

  const iconStyle: React.CSSProperties = {
    color: "white",
    fontSize: "1.2rem",
    marginLeft: "1rem",
    cursor: "pointer",
  };

  return (
    <footer
      style={{
        backgroundColor: "#333",
        color: "#fff",
        padding: "3rem 1rem 2rem",
        borderTop: "4px solid #4CAF50",
        fontFamily: "'Inter', sans-serif",
        position: "relative",
        zIndex: 5,
      }}
    >
      {/* ================= LINK COLUMNS ================= */}
      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          gap: "2rem",
        }}
      >
        {/* Austin */}
<FooterColumn
  title="Austin"
  links={[
    ["/austin/free-apartment-locator", "Free Apartment Locator"],
  ["/austin/apartments/reviews", "Austin Apartment Reviews"],
  ["/austin/neighborhoods", "Austin Neighborhoods"],
  ["/austin/luxury-apartments", "Austin Luxury Apartments"],
  ["/austin/events", "Austin Events"],
  ["/austin/townhomes", "Austin Townhomes"],
  ["/austin/penthouses", "Austin Penthouses"],
  ["/austin/first-time-renters", "Austin First-Time Renters"],
  ["/austin/new-construction-homes", "New Construction Homes"],
  ["/austin/second-chance-apartments", "2nd Chance Apts Austin"],
  ["/buy-new-home", "Buy New Home Austin"],
  ]}
  linkStyle={linkStyle}
/>

        {/* Dallas */}
<FooterColumn
  title="Dallas"
  links={[
    ["/dallas/free-apartment-locator", "Free Apartment Locator"],
    ["/dallas/apartments/reviews", "Dallas Apartment Reviews"],
    ["/dallas/neighborhoods", "Dallas Neighborhoods"],
    ["/dallas/luxury-apartments", "Dallas Luxury Apartments"],
    ["/dallas/events", "Dallas Events"],
    ["/dallas/townhomes", "Dallas Townhomes"],
    ["/dallas/penthouses", "Dallas Penthouses"],
    ["/dallas/first-time-renters", "Dallas First-Time Renters"],
    ["/dallas/new-construction-homes", "New Construction Homes"],
    ["/dallas/second-chance-apartments", "2nd Chance Apts Dallas"],
    ["/buy-new-home", "Buy New Home Dallas"],
  ]}
  linkStyle={linkStyle}
/>
        {/* Houston */}
<FooterColumn
  title="Houston"
  links={[
    ["/houston/free-apartment-locator", "Free Apartment Locator"],
   ["/houston/apartments/reviews", "HTX Apartment Reviews"],
    ["/houston/neighborhoods", "Houston Neighborhoods"],
    ["/houston/luxury-apartments", "Houston Luxury Apartments"],
    ["/houston/events", "Houston Events"],
    ["/houston/townhomes", "Houston Townhomes"],
    ["/houston/penthouses", "Houston Penthouses"],
    ["/houston/first-time-renters", "Houston First-Time Renters"],
    ["/houston/new-construction-homes", "New Construction Homes"],
    ["/houston/second-chance-apartments", "2nd Chance Apts Houston"],
    ["/buy-new-home", "Buy New Home Houston"],
  ]}
  linkStyle={linkStyle}
/>

        {/* San Antonio */}
<FooterColumn 
  title="San Antonio"
  links={[
    ["/san-antonio/free-apartment-locator", "Free Apartment Locator"],
    ["/san-antonio/apartments/reviews", "SATX Apartment Reviews"],
    ["/san-antonio/neighborhoods", "San Antonio Neighborhoods"],
    ["/san-antonio/luxury-apartments", "SATX Luxury Apartments"],
    ["/san-antonio/events", "San Antonio Events"],
    ["/san-antonio/townhomes", "San Antonio Townhomes"],
    ["/san-antonio/penthouses", "San Antonio Penthouses"],
    ["/san-antonio/first-time-renters", "SATX First-Time Renters"],
    ["/san-antonio/new-construction-homes", "New Construction Homes"],
    ["/san-antonio/second-chance-apartments", "2nd Chance Apts SATX"],
    ["/buy-new-home", "Buy Home San Antonio"],
  ]}
  linkStyle={linkStyle}
/>

        {/* About */}
        <FooterColumn title="About" links={[
          ["/how-it-works", "How It Works"],
          ["/start-your-search", "Start Your Search"],
          ["/report-lease", "Report Your Lease"],
          ["/meet-your-locators", "Meet Your Locators"],
          ["/ai-apartment-locator", "AI Apartment Locator"],
          ["/why-choose-us", "Why Choose Us"],
          ["/blog", "Blog"],
        ]} linkStyle={linkStyle} />
      </div>

      {/* ================= LEGAL + COOKIE ================= */}
      <div
        style={{
          borderTop: "1px solid #555",
          marginTop: "2rem",
          paddingTop: "1rem",
          textAlign: "center",
          fontSize: "0.9rem",
        }}
      >
        <Link href="/privacy" style={{ color: "#ccc", marginRight: "1rem" }}>Privacy</Link>
        <Link href="/terms" style={{ color: "#ccc", marginRight: "1rem" }}>Terms</Link>
        <Link href="/site-map" style={{ color: "#ccc", marginRight: "1rem" }}>Sitemap</Link>
        <Link href="/disclaimer" style={{ color: "#ccc" }}>Disclaimer</Link>

       {/* TREC FORMS */}
<div style={{ marginTop: "0.75rem" }}>
  <a
    href="https://res.cloudinary.com/dxtiguwzm/image/upload/v1749825086/IABS_Form_z9eluj.png"
    target="_blank"
    rel="noopener noreferrer"
    style={{ color: "#ccc", marginRight: "1rem" }}
  >
    TREC Information About Brokerage Services
  </a>

  <a
    href="https://res.cloudinary.com/dxtiguwzm/image/upload/v1749825071/CPN_Form_1-5_0_jzmj2h.png"
    target="_blank"
    rel="noopener noreferrer"
    style={{ color: "#ccc" }}
  >
    TREC Consumer Protection Notice
  </a>
</div>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: "0.5rem",
            marginTop: "1rem",
            color: "#aaa",
          }}
        >
          <FaCookieBite />
          <span>
            This site uses cookies. See our{" "}
            <Link href="/privacy" style={{ color: "#ccc" }}>Privacy Policy</Link>.
          </span>
        </div>
      </div>

      {/* ================= LOGOS + SOCIAL ================= */}
      <div style={{ marginTop: "2rem", textAlign: "center" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: "2rem",
            flexWrap: "wrap",
          }}
        >
          <img src="https://res.cloudinary.com/dxtiguwzm/image/upload/v1748218746/Lone_Star_Locators_Equal_Housing_Logo_h4dmr4.png" alt="Equal Housing" style={{ height: 50 }} />
          <img src="https://res.cloudinary.com/dxtiguwzm/image/upload/v1748223464/lone-star-locators-white-logo-footer_dyrwka.png" alt="Lone Star Locators" style={{ height: 30 }} />
          <img src="https://res.cloudinary.com/dxtiguwzm/image/upload/v1749327322/new-logo-white_cuz8jv.png" alt="AptAmigo" style={{ height: 30 }} />

          <div style={{ display: "flex" }}>
            <FaYoutube style={iconStyle} />
            <FaInstagram style={iconStyle} />
            <FaFacebookF style={iconStyle} />
            <FaTiktok style={iconStyle} />
          </div>
        </div>
      </div>

      <p style={{ textAlign: "center", marginTop: "1rem", fontSize: "0.85rem", color: "#aaa" }}>
        © {new Date().getFullYear()} Lone Star Locators™. All Rights Reserved. Powered by AptAmigo Brokerage. 
      </p>
    </footer>
  );
};

export default Footer;

/* ---------- helper ---------- */
const FooterColumn = ({
  title,
  links,
  linkStyle,
}: {
  title: string;
  links: [string, string][];
  linkStyle: React.CSSProperties;
}) => (
  <div style={{ flex: "1 1 180px" }}>
    <h4 style={{ marginBottom: "1rem" }}>{title}</h4>
    <ul style={{ listStyle: "none", padding: 0 }}>
      {links.map(([href, label]) => (
        <li key={href}>
          <Link href={href} style={linkStyle}>{label}</Link>
        </li>
      ))}
    </ul>
  </div>
);
