"use client";

import BlogLayout from "@/app/components/BlogLayout";
import AISchema from "@/app/components/AISchema";

const HoustonEvents = () => {
  const faqs = [
    {
      question: "What are the biggest annual events in Houston?",
      answer:
        "Houston hosts major annual events including the Houston Rodeo, Houston Art Car Parade, Bayou City Art Festival, Fourth of July Freedom Over Texas, and Lights in the Heights.",
    },
    {
      question: "Are Houston events family friendly?",
      answer:
        "Yes, many Houston events are family friendly such as the Art Car Parade, Bayou City Art Festival, Zoo Lights, and outdoor festivals throughout the year.",
    },
    {
      question: "Do events cause higher traffic in Houston?",
      answer:
        "Traffic often increases around Downtown Houston, NRG Park, the Galleria area, and nearby neighborhoods during major events. Planning ahead or using rideshare services can help.",
    },
    {
      question: "Where do most Houston events take place?",
      answer:
        "Most events take place around Downtown Houston, NRG Park, the Museum District, the Galleria area, and the Heights neighborhoods.",
    },
    {
      question: "When is the best time to attend events in Houston?",
      answer:
        "Spring and fall offer the most comfortable weather and the largest festivals. Winter brings holiday events, and summer features concerts and outdoor markets.",
    },
  ];

  return (
    <>
      {/* AI discovery schema */}
      <AISchema city="Houston" />

      <BlogLayout
        title="Houston Events | Best Events in Houston Texas"
        publishDate={new Date().toISOString()}
        keywords={[
          "Houston events",
          "things to do in Houston",
          "Houston festivals",
          "Houston rodeo",
          "Houston concerts",
          "Houston neighborhoods",
        ]}
        address={{ addressLocality: "Houston", addressRegion: "TX" }}
        content={
          <>
            <p style={{ marginBottom: "0.5rem" }}>
              <strong>Looking for the best events happening in Houston?</strong>{" "}
              From concerts and food festivals to cultural celebrations and
              holiday traditions, Houston offers something exciting throughout
              the year.
            </p>

            <p style={{ marginBottom: "2.2rem", color: "#555" }}>
              Below are some of Houston’s most popular annual events that locals
              and newcomers enjoy across the city.
            </p>

            {/* EVENT 1 */}
            <div style={{ padding: "0.75rem 0", borderBottom: "1px solid #eee" }}>
              <h3 style={{ fontSize: "1.55rem", marginBottom: "0.35rem", fontWeight: 700 }}>
                Houston Livestock Show and Rodeo
              </h3>
              <p style={{ margin: "0.25rem 0" }}>
                <strong>February to March, NRG Park</strong>
              </p>
              <p style={{ margin: "0.6rem 0" }}>
                The world-famous Houston Rodeo features concerts, carnival rides,
                livestock shows, competitions, and major music performers.
              </p>
              <a href="https://www.rodeohouston.com" target="_blank" rel="noopener noreferrer">
                Official Website
              </a>
            </div>

            {/* EVENT 2 */}
            <div style={{ padding: "0.75rem 0", borderBottom: "1px solid #eee" }}>
              <h3 style={{ fontSize: "1.55rem", marginBottom: "0.35rem", fontWeight: 700 }}>
                Houston Art Car Parade
              </h3>
              <p style={{ margin: "0.25rem 0" }}>
                <strong>April, Downtown Houston</strong>
              </p>
              <p style={{ margin: "0.6rem 0" }}>
                A Houston tradition showcasing hundreds of creatively decorated
                art cars in one of the largest parades of its kind.
              </p>
              <a href="https://www.thehoustonartcarparade.com" target="_blank" rel="noopener noreferrer">
                Official Website
              </a>
            </div>

            {/* EVENT 3 */}
            <div style={{ padding: "0.75rem 0", borderBottom: "1px solid #eee" }}>
              <h3 style={{ fontSize: "1.55rem", marginBottom: "0.35rem", fontWeight: 700 }}>
                Bayou City Art Festival
              </h3>
              <p style={{ margin: "0.25rem 0" }}>
                <strong>April and October, Memorial Park and Downtown</strong>
              </p>
              <p style={{ margin: "0.6rem 0" }}>
                One of the nation’s top juried fine arts festivals featuring
                artists, live music, food trucks, and interactive experiences.
              </p>
              <a href="https://www.artcolonyassociation.org" target="_blank" rel="noopener noreferrer">
                Official Website
              </a>
            </div>

            {/* EVENT 4 */}
            <div style={{ padding: "0.75rem 0", borderBottom: "1px solid #eee" }}>
              <h3 style={{ fontSize: "1.55rem", marginBottom: "0.35rem", fontWeight: 700 }}>
                Freedom Over Texas
              </h3>
              <p style={{ margin: "0.25rem 0" }}>
                <strong>July 4, Eleanor Tinsley Park</strong>
              </p>
              <p style={{ margin: "0.6rem 0" }}>
                Houston’s largest Independence Day celebration featuring live
                music, food vendors, family activities, and fireworks.
              </p>
              <a href="https://www.houstontx.gov/july4" target="_blank" rel="noopener noreferrer">
                Official Website
              </a>
            </div>

            {/* EVENT 5 */}
           <div style={{ padding: "0.75rem 0", borderBottom: "1px solid #eee" }}>
              <h3 style={{ fontSize: "1.55rem", marginBottom: "0.35rem", fontWeight: 700 }}>
                Zoo Lights at Houston Zoo
              </h3>
              <p style={{ margin: "0.25rem 0" }}>
                <strong>November to January, Houston Zoo</strong>
              </p>
              <p style={{ margin: "0.6rem 0" }}>
                A seasonal favorite featuring millions of lights, themed
                displays, and holiday activities throughout the zoo.
              </p>
              <a href="https://www.houstonzoo.org" target="_blank" rel="noopener noreferrer">
                Official Website
              </a>
            </div>

            {/* EVENT 6 */}
            <div style={{ padding: "0.75rem 0", borderBottom: "1px solid #eee" }}>
              <h3 style={{ fontSize: "1.55rem", marginBottom: "0.35rem", fontWeight: 700 }}>
                Lights in the Heights
              </h3>
              <p style={{ margin: "0.25rem 0" }}>
                <strong>December, Woodland Heights</strong>
              </p>
              <p style={{ margin: "0.6rem 0" }}>
                A neighborhood holiday tradition with decorated homes, live
                music, and festive outdoor gatherings.
              </p>
              <a href="https://lightsintheheights.org" target="_blank" rel="noopener noreferrer">
                Official Website
              </a>
            </div>

            <h2 style={{ marginTop: "2rem" }}>Where Most Events Happen</h2>
            <p style={{ marginBottom: 0 }}>
              Many Houston events take place around Downtown, the Museum
              District, NRG Park, the Galleria area, and the Heights. These areas
              host the city’s largest festivals, parades, concerts, and holiday
              celebrations.
            </p>
          </>
        }
        faqs={faqs}
      />
    </>
  );
};

export default HoustonEvents;
