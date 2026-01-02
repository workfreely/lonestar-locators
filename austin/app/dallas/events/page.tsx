import BlogLayout from "@/app/components/BlogLayout";

export const metadata = {
  title: "Dallas Events - Best Events in Dallas, Texas",
  description:
    "Discover the best events in Dallas including festivals, concerts, parades, and seasonal celebrations happening throughout the year.",
};

const DallasEventsPage = () => {
  const faqs = [
    {
      question: "What are the biggest annual events in Dallas?",
      answer:
        "Dallas hosts major events including the State Fair of Texas, Dallas Blooms, Deep Ellum Arts Festival, St. Patrick’s Parade, and summer concerts at Klyde Warren Park.",
    },
    {
      question: "Are most Dallas events family friendly?",
      answer:
        "Many Dallas events are family friendly including the State Fair of Texas, Dallas Blooms, Klyde Warren Park concerts, and Fourth of July celebrations.",
    },
    {
      question: "Do large events affect Dallas traffic?",
      answer:
        "Yes. Events like the State Fair and St. Patrick’s Parade can increase traffic near Fair Park, Greenville Avenue, and downtown Dallas.",
    },
    {
      question: "Where do most Dallas events take place?",
      answer:
        "Popular event hubs include Fair Park, Deep Ellum, Klyde Warren Park, the Arts District, and Greenville Avenue.",
    },
    {
      question: "When is the best time to attend events in Dallas?",
      answer:
        "Spring and fall offer the best weather and host Dallas’s largest festivals. Summer brings outdoor concerts and winter offers holiday events.",
    },
  ];

  return (
    <BlogLayout
      title="Dallas Events - Best Events in Dallas, Texas"
      keywords={[
        "Dallas events",
        "things to do in Dallas",
        "Dallas festivals",
        "Dallas concerts",
        "Dallas activities",
        "Dallas neighborhoods",
      ]}
      address={{ addressLocality: "Dallas", addressRegion: "TX" }}
      faqs={faqs}
      content={
        <>
          <p style={{ marginBottom: "0.5rem" }}>
            <strong>Looking for the best events happening in Dallas?</strong>{" "}
            The city comes alive with festivals, concerts, parades, and cultural
            celebrations all year long.
          </p>

          <p style={{ marginBottom: "2.2rem", color: "#555" }}>
            Below are Dallas’s most popular annual events in the order they
            occur throughout the year.
          </p>

          <div style={{ borderBottom: "1px solid #eee", paddingBottom: "1.5rem" }}>
            <h3>Dallas Blooms Festival</h3>
            <p><strong>📆 February–April — Dallas Arboretum</strong></p>
            <p>
              The largest floral festival in the Southwest featuring millions of
              blooms and family-friendly activities.
            </p>
            <a href="https://www.dallasarboretum.org" target="_blank">
              Official Website
            </a>
          </div>

          <div style={{ padding: "1.5rem 0", borderBottom: "1px solid #eee" }}>
            <h3>St. Patrick’s Parade & Festival</h3>
            <p><strong>📆 March — Greenville Avenue</strong></p>
            <p>
              One of Dallas’s biggest annual celebrations with a massive parade,
              live entertainment, and food.
            </p>
            <a href="https://www.dallasstpatricksparade.com" target="_blank">
              Official Website
            </a>
          </div>

          <div style={{ padding: "1.5rem 0", borderBottom: "1px solid #eee" }}>
            <h3>Deep Ellum Arts Festival</h3>
            <p><strong>📆 April — Deep Ellum</strong></p>
            <p>
              A major celebration of Dallas art, music, and culture featuring
              live performances and local vendors.
            </p>
            <a href="https://www.deepellumartsfestival.com" target="_blank">
              Official Website
            </a>
          </div>

          <div style={{ padding: "1.5rem 0", borderBottom: "1px solid #eee" }}>
            <h3>Arts District Block Party</h3>
            <p><strong>📆 Spring & Fall — Arts District</strong></p>
            <p>
              A cultural celebration with open museums, live performances, and
              food trucks.
            </p>
            <a href="https://www.dallasartsdistrict.org" target="_blank">
              Official Website
            </a>
          </div>

          <div style={{ padding: "1.5rem 0", borderBottom: "1px solid #eee" }}>
            <h3>Klyde Warren Park Concert Series</h3>
            <p><strong>📆 May–September — Klyde Warren Park</strong></p>
            <p>
              A free outdoor concert series in the heart of downtown Dallas.
            </p>
            <a href="https://klydewarrenpark.org" target="_blank">
              Official Website
            </a>
          </div>

          <div style={{ padding: "1.5rem 0", borderBottom: "1px solid #eee" }}>
            <h3>State Fair of Texas</h3>
            <p><strong>📆 September–October — Fair Park</strong></p>
            <p>
              One of the most iconic fairs in the country featuring rides,
              parades, food, and Big Tex.
            </p>
            <a href="https://bigtex.com" target="_blank">
              Official Website
            </a>
          </div>

          <h2 style={{ marginTop: "2rem" }}>Where Most Events Happen</h2>
          <p>
            Major event hubs include Fair Park, Deep Ellum, Klyde Warren Park,
            the Arts District, and Greenville Avenue.
          </p>
        </>
      }
    />
  );
};

export default DallasEventsPage;
