import BlogLayout from "@/app/components/BlogLayout";

export const metadata = {
  title: "San Antonio Events | Best Events in San Antonio, Texas",
  description:
    "Discover the best events in San Antonio including Fiesta, the Stock Show & Rodeo, River Walk celebrations, concerts, festivals, and family-friendly activities year-round.",
};

const SanAntonioEventsPage = () => {
  const faqs = [
    {
      question: "What are the biggest annual events in San Antonio?",
      answer:
        "Major annual events include Fiesta San Antonio, the Stock Show and Rodeo, holiday lights on the River Walk, King William Fair, and numerous cultural festivals throughout the year.",
    },
    {
      question: "Are there free events in San Antonio?",
      answer:
        "Yes, many events are free including the River Walk holiday lights, art walks, Market Square celebrations, and cultural community festivals.",
    },
    {
      question: "Does San Antonio have family friendly events?",
      answer:
        "Yes, many events are designed for families including the Stock Show and Rodeo, holiday parades, Market Square festivals, and seasonal concerts and exhibits.",
    },
    {
      question: "Does traffic increase during major events?",
      answer:
        "Traffic can increase near the River Walk, downtown, and major venues during large events. Arriving early or using rideshare can help avoid delays.",
    },
    {
      question: "When is the best time for events in San Antonio?",
      answer:
        "Spring for Fiesta and King William Fair, fall for outdoor festivals, winter for holiday events, and summer for concerts and river activities.",
    },
  ];

  return (
    <BlogLayout
      title="San Antonio Events - Best Events in San Antonio, Texas"
      content={
        <>
          {/* Intro */}
          <p style={{ marginBottom: "0.5rem" }}>
            <strong>
              Looking for the best events happening in San Antonio?
            </strong>{" "}
            The Alamo City hosts festivals, concerts, parades, cultural
            celebrations, and family events all year long.
          </p>

          <p style={{ marginBottom: "2.2rem", color: "#555" }}>
            Here is a chronological guide to the most popular annual events in
            San Antonio.
          </p>

          {/* EVENTS — content unchanged */}
          {/* (everything below stays exactly as you wrote it) */}

          {/* JANUARY */}
          <div style={{ padding: ".1rem 0", borderBottom: "1px solid #eee" }}>
            <h3 style={{ fontSize: "1.55rem", marginBottom: "0.35rem", fontWeight: 700 }}>
              New Year Eve Downtown Celebration
            </h3>
            <p><strong>📆 January One Downtown and River Walk</strong></p>
            <p>
              The city rings in the new year with outdoor concerts, food vendors,
              family activities, and a large fireworks show over downtown.
            </p>
            <a href="https://visitsanantonio.com" target="_blank" rel="noopener noreferrer">
              Official Visitors Info
            </a>
          </div>

          {/* ... REST OF YOUR EVENTS UNCHANGED ... */}

          <h2 style={{ marginTop: "2rem" }}>Where Most Events Happen</h2>
          <p>
            Most events take place around the River Walk, downtown, Market
            Square, Hemisfair, Civic Park, King William District, and major
            venues throughout the city.
          </p>
        </>
      }
      faqs={faqs}
    />
  );
};

export default SanAntonioEventsPage;
