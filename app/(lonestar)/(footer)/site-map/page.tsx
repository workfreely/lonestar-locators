import Link from "next/link";

export const metadata = {
  title: "Site Map | Lone Star Locators – Free Apartment Locator in Texas",
  description:
    "Explore Lone Star Locators’ full site map. Find free apartment locator services, luxury apartments, second chance leasing options, apartment reviews, and renter resources across Texas.",
};

const sectionStyle = {
  marginBottom: "3rem",
};

const headingStyle = {
  fontSize: "1.75rem",
  fontWeight: 800,
  marginBottom: "1rem",
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
        padding: "1rem 1.5rem 3rem",
        fontFamily: "'Inter', system-ui, sans-serif",
        maxWidth: "1100px",
        margin: "0 auto",
      }}
    >
      {/* ================= HEADER ================= */}
      <h1
        style={{
          fontSize: "clamp(2.6rem, 6vw, 3.4rem)",
          fontWeight: 900,
          textAlign: "center",
          marginBottom: "1rem",
          color: "#111",
          lineHeight: 1.15,
        }}
      >
        Lone Star Locators Site Map
      </h1>

      <p
        style={{
          maxWidth: "900px",
          margin: "0 auto 3rem",
          fontSize: "1.15rem",
          lineHeight: 1.65,
          color: "#444",
        }}
      >
        Use this site map to explore our{" "}
        <strong>free apartment locator services</strong>, city apartment guides,
        luxury listings, second chance leasing options, apartment reviews, and
        comparison articles across Texas. Lone Star Locators helps renters{" "}
        <strong>find the right apartment faster</strong> with expert guidance at
        no cost.
      </p>

      {/* ================= CORE ================= */}
      <section style={sectionStyle}>
        <h2 style={headingStyle}>Core Apartment Locator Pages</h2>
        <ul style={listStyle}>
          <li><Link href="/">Home</Link></li>
          <li><Link href="/how-it-works">How It Works</Link></li>
          <li><Link href="/start-your-search">Start Your Free Apartment Search</Link></li>
          <li><Link href="/ai-apartment-locator">AI Apartment Locator</Link></li>
          <li><Link href="/why-choose-us">Why Choose Lone Star Locators</Link></li>
          <li><Link href="/meet-your-locators">Meet Your Apartment Locator</Link></li>
        </ul>
      </section>

      {/* ================= CITIES ================= */}
      <section style={sectionStyle}>
        <h2 style={headingStyle}>Cities We Serve in Texas</h2>
        <ul style={listStyle}>
          <li><Link href="/san-antonio">San Antonio Apartments</Link></li>
          <li><Link href="/austin">Austin Apartments</Link></li>
          <li><Link href="/dallas">Dallas Apartments</Link></li>
          <li><Link href="/houston">Houston Apartments</Link></li>
        </ul>
      </section>

      {/* ================= CITY GUIDES ================= */}
      <section style={sectionStyle}>
        <h2 style={headingStyle}>Apartment Guides & Leasing Options</h2>
        <ul style={listStyle}>
          <li><Link href="/san-antonio/apartments">San Antonio Apartment Listings</Link></li>
          <li><Link href="/san-antonio/luxury-apartments">Luxury Apartments</Link></li>
          <li><Link href="/san-antonio/penthouses">Penthouses</Link></li>
          <li><Link href="/san-antonio/townhomes">Townhomes</Link></li>
          <li><Link href="/san-antonio/second-chance-apartments">Second Chance Apartments</Link></li>
          <li><Link href="/san-antonio/neighborhoods">Neighborhood Guides</Link></li>
          <li><Link href="/san-antonio/new-construction-homes">New Construction Homes</Link></li>
        </ul>
      </section>

      {/* ================= BLOG HUBS ================= */}
      <section style={sectionStyle}>
        <h2 style={headingStyle}>Apartment Locator Blogs & Guides</h2>
        <ul style={listStyle}>
          <li><Link href="/blog">All Apartment Locator Blogs</Link></li>
          <li><Link href="/san-antonio/blog">San Antonio Apartment Blog</Link></li>
          <li><Link href="/austin/blog">Austin Apartment Blog</Link></li>
          <li><Link href="/dallas/blog">Dallas Apartment Blog</Link></li>
          <li><Link href="/houston/blog">Houston Apartment Blog</Link></li>
        </ul>
      </section>

      {/* ================= COMPARISONS ================= */}
      <section style={sectionStyle}>
        <h2 style={headingStyle}>Apartment Comparison Reviews</h2>
        <p style={{ marginBottom: "1rem", color: "#555" }}>
          Compare apartments side-by-side to see pricing, layouts, locations,
          and approval requirements before you tour.
        </p>
        <ul style={listStyle}>
          <li>
            <Link href="/san-antonio/blog/300-main-vs-the-floodgate">
              300 Main vs The Floodgate
            </Link>
          </li>
          <li>
            <Link href="/san-antonio/blog/elmira-flats-vs-st-marys-flats">
              Elmira Flats vs St. Mary’s Flats
            </Link>
          </li>
        </ul>
      </section>

      {/* ================= REVIEWS ================= */}
      <section style={sectionStyle}>
        <h2 style={headingStyle}>Apartment Reviews</h2>
        <ul style={listStyle}>
          <li><Link href="/san-antonio/apartments/reviews/alaro-luxury-villas">Alaro Luxury Villas Review</Link></li>
          <li><Link href="/san-antonio/apartments/reviews/elmira-flats">Elmira Flats Review</Link></li>
          <li><Link href="/san-antonio/apartments/reviews/st-marys-flats">St. Mary’s Flats Review</Link></li>
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

      {/* ================= FAQ SCHEMA ================= */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            "mainEntity": [
              {
                "@type": "Question",
                "name": "What is the Lone Star Locators site map?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text":
                    "The Lone Star Locators site map helps renters explore our free apartment locator services, second chance leasing options, luxury apartments, reviews, comparisons, and renter guides across Texas."
                }
              },
              {
                "@type": "Question",
                "name": "Why doesn’t the site map list every apartment review and comparison?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text":
                    "To keep the site easy to use, we link to blog hubs and review sections instead of listing every article. All reviews and comparison pages are fully indexed through our XML sitemap and internal links."
                }
              },
              {
                "@type": "Question",
                "name": "Is Lone Star Locators a free apartment locator?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text":
                    "Yes. Lone Star Locators is completely free for renters. Apartment communities compensate licensed apartment locators, so there is no cost to you."
                }
              },
              {
                "@type": "Question",
                "name": "Do you help with second chance or bad credit apartments?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text":
                    "Yes. We specialize in second chance leasing, broken leases, low credit situations, and flexible approval apartments across San Antonio and Texas."
                }
              },
              {
                "@type": "Question",
                "name": "How do I get a personalized apartment list?",
                "acceptedAnswer": {
                  "@type": "Answer",
                  "text":
                    "Visit the Start Your Search page to request a free, personalized apartment list tailored to your budget, location, and approval needs."
                }
              }
            ]
          }),
        }}
      />
    </div>
  );
}
