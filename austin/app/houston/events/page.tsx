"use client";

import BlogLayout from "@/app/components/BlogLayout";

export const metadata = {
  title: "Houston Events - Best Events in Houston, Texas",
  description:
    "Discover the best events in Houston including the Houston Rodeo, Art Car Parade, Bayou City Art Festival, and more. Festivals, concerts, and family-friendly events year-round.",
};

const HoustonEventsPage = () => {
  const faqs = [
    {
      question: "What are the biggest annual events in Houston?",
      answer:
        "Houston hosts major annual events including the Houston Rodeo, Houston Art Car Parade, Bayou City Art Festival, Fourth of July Freedom Over Texas, and Lights in the Heights.",
    },
    {
      question: "Are Houston events family friendly?",
      answer:
        "Yes, many Houston events are family friendly such as the Art Car Parade, Bayou City Art Festival, Zoo Lights, and numerous outdoor activities throughout the year.",
    },
    {
      question: "Do events cause higher traffic in Houston?",
      answer:
        "Traffic increases around the Galleria, Downtown, and NRG Park during major events. Planning ahead or using rideshare helps reduce delays.",
    },
    {
      question: "Where do most Houston events happen?",
      answer:
        "Most events take place around Downtown Houston, NRG Park, the Museum District, the Galleria area, and Heights neighborhoods.",
    },
    {
      question: "When is the best time to attend events in Houston?",
      answer:
        "Spring and fall offer the most comfortable weather and many large festivals. Winter features holiday events and summer offers concerts and outdoor markets.",
    },
  ];

  return (
    <BlogLayout
      title="Houston Events - Best Events in Houston, Texas"
      publishDate={new Date().toISOString()}
      keywords={[
        "Houston events",
        "things to do in Houston",
        "Houston festivals",
        "Houston rodeo",
        "Houston concerts",
        "Houston neighborhoods",
      ]}
      address={{ addressLocality: "Houston", addressRegion: "Texas" }}
      content={
        <>
          {/* spacing helper */}
          <p style={{ display: "none" }}></p>

          {/* INTRO */}
          <p style={{ marginBottom: "0.5rem" }}>
            <strong>Looking for the best events happening in Houston?</strong>{" "}
            From concerts and food festivals to cultural celebrations and
            holiday traditions, Houston delivers something exciting every month
            of the year.
          </p>

          <p style={{ marginBottom: "2.2rem", color: "#555" }}>
            Below are some of Houston’s largest and most popular annual events
            that locals and newcomers look forward to across the city.
          </p>

          {/* EVENT 1 */}
          <div style={{ padding: ".10rem", borderBottom: "1px solid #eee" }}>
            <h3 style={{ fontSize: "1.55rem", fontWeight: 700 }}>
              Houston Livestock Show & Rodeo
            </h3>
            <p>
              <strong>📆 February to March — NRG Park</strong>
            </p>
            <p>
              The world-famous Houston Rodeo features concerts, carnival rides,
              livestock shows, competitions, and major music performers.
            </p>
            <a
              href="https://www.rodeohouston.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              Official Website
            </a>
          </div>

          {/* EVENT 2 */}
          <div style={{ padding: "1.5rem 0", borderBottom: "1px solid #eee" }}>
            <h3 style={{ fontSize: "1.55rem", fontWeight: 700 }}>
              Houston Art Car Parade
            </h3>
            <p>
              <strong>📆 April — Downtown Houston</strong>
            </p>
            <p>
              A Houston tradition showcasing hundreds of hand-decorated art cars
              in the largest event of its kind in the world.
            </p>
            <a
              href="https://www.thehoustonartcarparade.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              Official Website
            </a>
          </div>

          {/* EVENT 3 */}
          <div style={{ padding: "1.5rem 0", borderBottom: "1px solid #eee" }}>
            <h3 style={{ fontSize: "1.55rem", fontWeight: 700 }}>
              Bayou City Art Festival
            </h3>
            <p>
              <strong>📆 April & October — Memorial Park & Downtown</strong>
            </p>
            <p>
              One of the nation’s top juried fine-arts festivals featuring
              hundreds of artists, live music, and food vendors.
            </p>
            <a
              href="https://www.artcolonyassociation.org"
              target="_blank"
              rel="noopener noreferrer"
            >
              Official Website
            </a>
          </div>

          {/* EVENT 4 */}
          <div style={{ padding: "1.5rem 0", borderBottom: "1px solid #eee" }}>
            <h3 style={{ fontSize: "1.55rem", fontWeight: 700 }}>
              Freedom Over Texas (4th of July)
            </h3>
            <p>
              <strong>📆 July 4 — Eleanor Tinsley Park</strong>
            </p>
            <p>
              Houston’s largest Independence Day celebration with live music,
              food, and fireworks.
            </p>
            <a
              href="https://www.houstontx.gov/july4"
              target="_blank"
              rel="noopener noreferrer"
            >
              Official Website
            </a>
          </div>

          {/* EVENT 5 */}
          <div style={{ padding: "1.5rem 0", borderBottom: "1px solid #eee" }}>
            <h3 style={{ fontSize: "1.55rem", fontWeight: 700 }}>
              Zoo Lights at Houston Zoo
            </h3>
            <p>
              <strong>📆 November to January — Houston Zoo</strong>
            </p>
            <p>
              A holiday favorite featuring millions of lights, music, and
              seasonal activities.
            </p>
            <a
              href="https://www.houstonzoo.org"
              target="_blank"
              rel="noopener noreferrer"
            >
              Official Website
            </a>
          </div>

          {/* EVENT 6 */}
          <div style={{ padding: "1.5rem 0", borderBottom: "1px solid #eee" }}>
            <h3 style={{ fontSize: "1.55rem", fontWeight: 700 }}>
              Lights in the Heights
            </h3>
            <p>
              <strong>📆 December — Woodland Heights</strong>
            </p>
            <p>
              A beloved neighborhood tradition with festive homes, live bands,
              and outdoor celebrations.
            </p>
            <a
              href="https://lightsintheheights.org"
              target="_blank"
              rel="noopener noreferrer"
            >
              Official Website
            </a>
          </div>

          <h2 style={{ marginTop: "2rem" }}>Where Most Events Happen</h2>
          <p>
            Downtown Houston, NRG Park, the Museum District, the Galleria, and
            the Heights host many of the city’s largest events year-round.
          </p>
        </>
      }
      faqs={faqs}
    />
  );
};

export default HoustonEventsPage;
