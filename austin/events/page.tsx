import BlogLayout from "@/app/components/BlogLayout";

export const metadata = {
  title: "Austin Events - Best Events in Austin, Texas",
  description:
    "Discover the best events in Austin including festivals, concerts, and annual celebrations like SXSW, ACL, and Trail of Lights.",
};

const AustinEventsPage = () => {
  const faqs = [
    {
      question: "What are the biggest annual events in Austin?",
      answer:
        "Austin hosts major annual events including South by Southwest, Austin City Limits Music Festival, Pecan Street Festival, Trail of Lights, and the Austin Rodeo. These events attract large crowds and offer entertainment, food, music, and activities for all ages.",
    },
    {
      question: "Are Austin events family friendly?",
      answer:
        "Many Austin events are family friendly including Trail of Lights, Pecan Street Festival, Austin Rodeo, and numerous markets, outdoor concerts, and community celebrations.",
    },
    {
      question: "Do events cause higher traffic in Austin?",
      answer:
        "During large events like SXSW and ACL, traffic can increase near Downtown Austin and Zilker Park. Planning ahead or using rideshare helps avoid delays.",
    },
    {
      question: "Where do most Austin events happen?",
      answer:
        "Most Austin events take place around Zilker Park, Downtown Austin, the Red River District, and the Congress Avenue area.",
    },
    {
      question: "When is the best time to attend events in Austin?",
      answer:
        "Spring and fall are peak seasons because of cooler weather and major festivals. Winter features holiday events and summer offers outdoor concerts and weekend activities.",
    },
  ];

  return (
    <BlogLayout
      title="Austin Events - Best Events in Austin, Texas"
      keywords={[
        "Austin events",
        "things to do in Austin",
        "Austin festivals",
        "Austin concerts",
        "Austin activities",
        "Austin neighborhoods",
      ]}
      address={{ addressLocality: "Austin", addressRegion: "TX" }}
      faqs={faqs}
      content={
        <>
          <p style={{ marginBottom: "0.5rem" }}>
            <strong>Looking for the best events happening in Austin?</strong>{" "}
            From festivals and concerts to holiday celebrations and local
            traditions, the city offers something exciting in every season.
          </p>

          <p style={{ marginBottom: "2.2rem", color: "#555" }}>
            Below are some of Austin’s most popular annual events that locals
            and newcomers look forward to each year.
          </p>

          {/* SXSW */}
          <div style={{ padding: "1.5rem 0", borderBottom: "1px solid #eee" }}>
            <h3 style={{ fontSize: "1.55rem", fontWeight: 700 }}>
              South by Southwest
            </h3>
            <p>
              <strong>📆 March — Downtown Austin</strong>
            </p>
            <p>
              SXSW blends music, film, and technology with concerts,
              conferences, and interactive showcases throughout the city.
            </p>
            <a href="https://www.sxsw.com" target="_blank" rel="noopener noreferrer">
              Official Website
            </a>
          </div>

          {/* ACL */}
          <div style={{ padding: "1.5rem 0", borderBottom: "1px solid #eee" }}>
            <h3 style={{ fontSize: "1.55rem", fontWeight: 700 }}>
              Austin City Limits Music Festival
            </h3>
            <p>
              <strong>📆 October — Zilker Park</strong>
            </p>
            <p>
              ACL features major headliners, local artists, and Austin food
              vendors across two weekends.
            </p>
            <a
              href="https://www.aclfestival.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              Official Website
            </a>
          </div>

          {/* Pecan Street */}
          <div style={{ padding: "1.5rem 0", borderBottom: "1px solid #eee" }}>
            <h3 style={{ fontSize: "1.55rem", fontWeight: 700 }}>
              Pecan Street Festival
            </h3>
            <p>
              <strong>📆 Spring & Fall — Sixth Street</strong>
            </p>
            <p>
              A historic art and craft festival with vendors, live music,
              food booths, and family-friendly activities.
            </p>
            <a
              href="https://www.pecanstreetfestival.org"
              target="_blank"
              rel="noopener noreferrer"
            >
              Official Website
            </a>
          </div>

          {/* Rodeo */}
          <div style={{ padding: "1.5rem 0", borderBottom: "1px solid #eee" }}>
            <h3 style={{ fontSize: "1.55rem", fontWeight: 700 }}>
              Austin Rodeo
            </h3>
            <p>
              <strong>📆 March — Travis County Expo Center</strong>
            </p>
            <p>
              Classic Texas rodeo competitions, concerts, and family attractions.
            </p>
            <a
              href="https://rodeoaustin.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              Official Website
            </a>
          </div>

          {/* Trail of Lights */}
          <div style={{ padding: "1.5rem 0", borderBottom: "1px solid #eee" }}>
            <h3 style={{ fontSize: "1.55rem", fontWeight: 700 }}>
              Trail of Lights
            </h3>
            <p>
              <strong>📆 December — Zilker Park</strong>
            </p>
            <p>
              A holiday tradition featuring light displays, food vendors,
              and festive entertainment for all ages.
            </p>
            <a
              href="https://austintrailoflights.org"
              target="_blank"
              rel="noopener noreferrer"
            >
              Official Website
            </a>
          </div>

          <h2 style={{ marginTop: "2rem" }}>Where Most Events Happen</h2>
          <p>
            Most events take place around Zilker Park, Downtown Austin, the
            Red River District, and Congress Avenue.
          </p>
        </>
      }
    />
  );
};

export default AustinEventsPage;
