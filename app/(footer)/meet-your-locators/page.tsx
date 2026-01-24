import TestimonialsSection from "@/app/components/TestimonialsSection";

export const metadata = {
  title:
    "Meet Jay Morris | Licensed Apartment Locator & Real Estate Agent in San Antonio, Austin, Dallas & Houston | Lone Star Locators",
  description:
    "Meet Jay Morris — your licensed apartment locator and real estate agent serving San Antonio, Austin, Dallas & Houston. Helping renters find luxury apartments, townhomes, penthouses & second chance apartments with specials and rebates.",
  alternates: {
    canonical: "https://www.lonestarlocators.app/meet-your-locators",
  },
};

export default function MeetYourLocatorsPage() {
  return (
    <main
      style={{
        maxWidth: "1200px",
        margin: "0 auto",
        padding: "3rem 1.5rem",
        fontFamily: "'Inter', sans-serif",
        color: "#333",
        lineHeight: "1.7",
      }}
    >
      {/* ================= HEADER ================= */}
      <div style={{ marginBottom: "2.5rem" }}>
        <h1
          style={{
            fontSize: "2.5rem",
            fontWeight: 800,
            margin: 0,
            textAlign: "center",
          }}
        >
          Meet Your Locator
        </h1>
      </div>

      {/* ================= BIO SECTION ================= */}
      <section
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "2.5rem",
          alignItems: "flex-start",
          marginBottom: "3rem",
        }}
      >
        {/* Photo */}
        <div
          style={{
            flex: "0 0 220px",
            textAlign: "center",
            margin: "0 auto",
          }}
        >
          <img
            src="https://res.cloudinary.com/dxtiguwzm/image/upload/v1748014964/jay-morris-free-apartment-locator-san-antonio-texas_pgf7fs.png"
            alt="Jay Morris, Licensed Apartment Locator and Real Estate Agent in Texas"
            style={{
              borderRadius: "100%",
              width: "180px",
              height: "180px",
              objectFit: "cover",
              boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            }}
          />
        </div>

        {/* Bio Text */}
        <div style={{ flex: 1, minWidth: "300px", fontSize: "1.1rem" }}>
          <h2
            style={{
              fontSize: "1.9rem",
              fontWeight: 700,
              marginBottom: "1rem",
              color: "#111",
              textAlign: "left",
            }}
          >
            Jay Morris | Licensed Agent & Apartment Locator
          </h2>

          <p style={{ marginBottom: "1.25rem" }}>
            <strong>
              Hey, I’m Jay! Your licensed real estate agent and free apartment
              locator serving San Antonio, Austin, Dallas and Houston.
            </strong>{" "}
            I’ve helped hundreds of renters secure luxury studios, apartments,
            townhomes and penthouses — including second-chance apartments with
            move-in specials.
          </p>

          <p style={{ marginBottom: "1.25rem" }}>
            <strong>This is NOT your ordinary apartment search.</strong> I work
            directly with communities and unlock deals before they hit the
            market. Whether you’re looking for a downtown high-rise, suburban
            townhome, or flexible second-chance options, I’ll match you with the
            best communities for your lifestyle.
          </p>

          <p style={{ marginBottom: 0 }}>
            <strong>My service is 100% free.</strong> Get the best move-in
            specials, free movers, and cash rebates you won’t find online.
          </p>
        </div>
      </section>

      {/* ================= CTA ================= */}
      <div style={{ textAlign: "center", marginBottom: "3rem" }}>
        <a href="/start-your-search" className="start-your-search-btn">
          Start Your Free Apartment Search
        </a>
      </div>

      {/* ================= INSTAGRAM ================= */}
      <section style={{ textAlign: "center", margin: "3rem 0" }}>
        <h2
          style={{
            fontSize: "1.6rem",
            fontWeight: 800,
            marginBottom: "0.75rem",
          }}
        >
          Follow Me on Instagram
        </h2>

        <a
          href="https://instagram.com/LoneStarLocators"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-block",
            marginBottom: "2rem",
            fontWeight: 700,
            color: "#004aad",
            fontSize: "1.4rem",
            textDecoration: "none",
          }}
        >
          @LoneStarLocators
        </a>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "1.5rem",
            maxWidth: "1100px",
            margin: "0 auto",
          }}
        >
          {[
            {
              url: "https://www.instagram.com/reel/DGwXTOER4wK/",
              img: "https://res.cloudinary.com/dxtiguwzm/image/upload/v1765038608/penthouse-jay-morris-apartment-locator_xyjmuy.png",
            },
            {
              url: "https://www.instagram.com/reel/DCko_ZxxMIb/",
              img: "https://res.cloudinary.com/dxtiguwzm/image/upload/v1765038608/townhomes-for-rent-jay-morris-apartment-locator_i6g3wb.png",
            },
            {
              url: "https://www.instagram.com/reel/DCSiC4nRSMf/",
              img: "https://res.cloudinary.com/dxtiguwzm/image/upload/v1765038608/luxury-penthouse-san-antonio-jay-morris-apartment-locator_gltlsf.png",
            },
            {
              url: "https://www.instagram.com/reel/DOIFAmBDSlp/",
              img: "https://res.cloudinary.com/dxtiguwzm/image/upload/v1765341498/san-antonio-townhomes-apartment-locator_a5tkbd.png",
            },
          ].map((post, i) => (
            <a
              key={i}
              href={post.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              <img
                src={post.img}
                alt={`Instagram reel ${i + 1}`}
                style={{
                  width: "100%",
                  height: "340px",
                  objectFit: "cover",
                  borderRadius: "14px",
                  boxShadow: "0 6px 16px rgba(0,0,0,0.12)",
                }}
              />
            </a>
          ))}
        </div>
      </section>

      {/* ================= TESTIMONIALS ================= */}
      <TestimonialsSection
        title="What Clients Are Saying"
        testimonials={[
          {
            name: "Haley T.",
            location: "San Antonio, TX",
            text:
              "Jay, I just want to tell you that we moved in today — the movers were absolutely wonderful. Thank you so much!",
          },
          {
            name: "Angelica M.",
            location: "San Antonio, TX",
            text:
              "I was really stressed relocating, but I trusted Jay and everything worked out perfectly. So grateful.",
          },
          {
            name: "Crystal R.",
            location: "San Antonio, TX",
            text: "Yes, it got approved! Thank you again. God bless you.",
          },
        ]}
      />
    </main>
  );
}
