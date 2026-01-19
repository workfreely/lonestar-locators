import Link from "next/link";

export const metadata = {
  title: "Site Map | Lone Star Locators",
  description:
    "Explore every page, apartment guide, neighborhood breakdown, comparison, and blog on Lone Star Locators.",
};

const sectionStyle = {
  marginBottom: "2.75rem",
};

const headingStyle = {
  fontSize: "1.6rem",
  fontWeight: 700,
  marginBottom: "0.75rem",
  borderBottom: "2px solid #eee",
  paddingBottom: "0.4rem",
};

const listStyle = {
  listStyle: "none",
  paddingLeft: 0,
  lineHeight: "1.9",
};

export default function SiteMapPage() {
  return (
    <div
      style={{
        maxWidth: "960px",
        margin: "2.5rem auto",
        padding: "2rem",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <h1 style={{ fontSize: "2.4rem", marginBottom: "1.25rem" }}>
        Full Site Map – Lone Star Locators
      </h1>

      <p style={{ marginBottom: "2.75rem", color: "#444" }}>
        This page outlines every major section of Lone Star Locators, including
        city apartment guides, blogs, comparison reviews, and renter resources.
      </p>

      {/* ================= CORE ================= */}
      <section style={sectionStyle}>
        <h2 style={headingStyle}>Core Pages</h2>
        <ul style={listStyle}>
          <li><Link href="/">Home</Link></li>
          <li><Link href="/how-it-works">How It Works</Link></li>
          <li><Link href="/start-your-search">Start Your Search</Link></li>
          <li><Link href="/ai-apartment-locator">AI Apartment Locator</Link></li>
          <li><Link href="/why-choose-us">Why Choose Us</Link></li>
          <li><Link href="/meet-your-locators">Meet Your Locators</Link></li>
        </ul>
      </section>

      {/* ================= CITIES ================= */}
      <section style={sectionStyle}>
        <h2 style={headingStyle}>Cities We Serve</h2>
        <ul style={listStyle}>
          <li><Link href="/san-antonio">San Antonio Apartments</Link></li>
          <li><Link href="/austin">Austin Apartments</Link></li>
          <li><Link href="/dallas">Dallas Apartments</Link></li>
          <li><Link href="/houston">Houston Apartments</Link></li>
        </ul>
      </section>

      {/* ================= CITY SUBPAGES ================= */}
      <section style={sectionStyle}>
        <h2 style={headingStyle}>Apartment Guides by City</h2>
        <ul style={listStyle}>
          <li><Link href="/san-antonio/apartments">San Antonio Apartment Listings</Link></li>
          <li><Link href="/san-antonio/neighborhoods">San Antonio Neighborhoods</Link></li>
          <li><Link href="/san-antonio/luxury-apartments">San Antonio Luxury Apartments</Link></li>
          <li><Link href="/san-antonio/penthouses">San Antonio Penthouses</Link></li>
          <li><Link href="/san-antonio/second-chance-apartments">Second Chance Apartments</Link></li>
          <li><Link href="/san-antonio/townhomes">San Antonio Townhomes</Link></li>
        </ul>
      </section>

      {/* ================= BLOG HUBS ================= */}
      <section style={sectionStyle}>
        <h2 style={headingStyle}>Blog Hubs</h2>
        <ul style={listStyle}>
          <li><Link href="/blog">All Blogs</Link></li>
          <li><Link href="/san-antonio/blog">San Antonio Blog</Link></li>
          <li><Link href="/austin/blog">Austin Blog</Link></li>
          <li><Link href="/dallas/blog">Dallas Blog</Link></li>
          <li><Link href="/houston/blog">Houston Blog</Link></li>
        </ul>
      </section>

      {/* ================= COMPARISONS ================= */}
      <section style={sectionStyle}>
        <h2 style={headingStyle}>Apartment Comparison Reviews</h2>
        <ul style={listStyle}>
          <li>
            <Link href="/san-antonio/blog/300-main-vs-the-floodgate">
              300 Main vs The Floodgate
            </Link>
          </li>
          {/* Add more VS pages here as you publish them */}
        </ul>
      </section>

      {/* ================= REVIEWS ================= */}
      <section style={sectionStyle}>
        <h2 style={headingStyle}>Apartment Reviews</h2>
        <ul style={listStyle}>
          <li><Link href="/san-antonio/reviews/alaro-luxury-villas">Alaro Luxury Villas</Link></li>
          <li><Link href="/san-antonio/reviews/elmira-flats">Elmira Flats</Link></li>
          <li><Link href="/san-antonio/reviews/st-marys-flats">St. Mary’s Flats</Link></li>
        </ul>
      </section>

      {/* ================= LEGAL ================= */}
      <section style={sectionStyle}>
        <h2 style={headingStyle}>Legal & Policies</h2>
        <ul style={listStyle}>
          <li><Link href="/privacy">Privacy Policy</Link></li>
          <li><Link href="/terms">Terms & Conditions</Link></li>
          <li><Link href="/disclaimer">Disclaimer</Link></li>
        </ul>
      </section>
    </div>
  );
}
