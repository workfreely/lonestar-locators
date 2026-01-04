"use client";

import BlogLayout from "@/app/components/BlogLayout";

const DallasEventsPage = () => {
  const faqs = [
    {
      question: "What are the biggest annual events in Dallas?",
      answer:
        "Dallas hosts major annual events including the State Fair of Texas, Dallas Blooms, Deep Ellum Arts Festival, St. Patrick’s Parade, and live music series at Klyde Warren Park throughout the year.",
    },
    {
      question: "Are Dallas events family friendly?",
      answer:
        "Yes. Many events such as Dallas Blooms, the State Fair of Texas, Klyde Warren Park concerts, and Fourth of July celebrations are family friendly.",
    },
    {
      question: "Do large events impact traffic in Dallas?",
      answer:
        "Yes. Large events can increase traffic near Fair Park, downtown Dallas, Greenville Avenue, and Deep Ellum. Arriving early or using rideshare services is recommended.",
    },
    {
      question: "Where do most Dallas events take place?",
      answer:
        "Popular event hubs include Fair Park, Klyde Warren Park, Deep Ellum, the Arts District, and Greenville Avenue.",
    },
    {
      question: "What is the best time of year for events in Dallas?",
      answer:
        "Spring and fall offer the most comfortable weather and the highest concentration of festivals and outdoor events. Summer features concerts, while winter includes holiday celebrations.",
    },
  ];

  return (
    <BlogLayout
      title="Dallas Events | Best Festivals, Concerts, and Things to Do (2026)"
      content={
        <>
          <p>
            <strong>Looking for the best events happening in Dallas?</strong>{" "}
            The city hosts festivals, concerts, parades, and cultural
            celebrations throughout the year across multiple neighborhoods.
          </p>

          <p style={{ color: "#555" }}>
            Below is a curated list of Dallas’s most popular annual events,
            organized roughly by season.
          </p>

          {/* Event 1 */}
          <h3>Dallas Blooms Festival</h3>
          <p>
            <strong>February to April · Dallas Arboretum</strong>
          </p>
          <p>
            The largest floral festival in the Southwest featuring millions of
            spring blooms, themed gardens, and seasonal family activities.
          </p>
          <a
            href="https://www.dallasarboretum.org"
            target="_blank"
            rel="noopener noreferrer"
          >
            Official Website
          </a>

          {/* Event 2 */}
          <h3 style={{ marginTop: "2rem" }}>
            St. Patrick’s Parade and Festival
          </h3>
          <p>
            <strong>Mid-March · Greenville Avenue</strong>
          </p>
          <p>
            A long-running Dallas tradition featuring a parade, live
            entertainment, food vendors, and one of the city’s largest annual
            celebrations.
          </p>
          <a
            href="https://www.dallasstpatricksparade.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            Official Website
          </a>

          {/* Event 3 */}
          <h3 style={{ marginTop: "2rem" }}>
            Deep Ellum Arts Festival
          </h3>
          <p>
            <strong>Early April · Deep Ellum</strong>
          </p>
          <p>
            A multi-day celebration of local and national artists featuring live
            music, art installations, food booths, and vendor markets.
          </p>
          <a
            href="https://www.deepellumartsfestival.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            Official Website
          </a>

          {/* Event 4 */}
          <h3 style={{ marginTop: "2rem" }}>
            Dallas Arts District Block Party
          </h3>
          <p>
            <strong>Spring and Fall · Dallas Arts District</strong>
          </p>
          <p>
            A community-focused celebration with open museums, live
            performances, food trucks, and interactive art experiences.
          </p>
          <a
            href="https://www.dallasartsdistrict.org"
            target="_blank"
            rel="noopener noreferrer"
          >
            Official Website
          </a>

          {/* Event 5 */}
          <h3 style={{ marginTop: "2rem" }}>
            Klyde Warren Park Concert Series
          </h3>
          <p>
            <strong>May to September · Klyde Warren Park</strong>
          </p>
          <p>
            A free outdoor concert series in downtown Dallas featuring local and
            touring musicians throughout the summer.
          </p>
          <a
            href="https://klydewarrenpark.org"
            target="_blank"
            rel="noopener noreferrer"
          >
            Official Website
          </a>

          {/* Event 6 */}
          <h3 style={{ marginTop: "2rem" }}>
            Fourth of July Celebration at Klyde Warren Park
          </h3>
          <p>
            <strong>July 4 · Klyde Warren Park</strong>
          </p>
          <p>
            A family-friendly Independence Day celebration featuring fireworks,
            live music, food vendors, and activities for all ages.
          </p>
          <a
            href="https://klydewarrenpark.org"
            target="_blank"
            rel="noopener noreferrer"
          >
            Event Page
          </a>

          {/* Event 7 */}
          <h3 style={{ marginTop: "2rem" }}>State Fair of Texas</h3>
          <p>
            <strong>Late September to Mid-October · Fair Park</strong>
          </p>
          <p>
            One of the most iconic events in the United States featuring rides,
            classic fair food, live entertainment, livestock shows, and Big Tex.
          </p>
          <a
            href="https://bigtex.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            Official Website
          </a>

          <h2 style={{ marginTop: "3rem" }}>
            Where Most Events Take Place
          </h2>
          <p>
            The majority of Dallas events are hosted at Fair Park, Klyde Warren
            Park, Deep Ellum, the Arts District, and Greenville Avenue. These
            areas offer year-round entertainment and community gatherings.
          </p>
        </>
      }
      faqs={faqs}
    />
  );
};

export default DallasEventsPage;
