import BlogLayout from "@/app/components/BlogLayout";

export const metadata = {
  title: "Dallas Neighborhoods Map & Guide",
  description:
    "Explore Dallas neighborhoods with an interactive map and in-depth guides to Downtown, East Dallas, South Congress, The Domain, Zilker, and more.",
};

const DallasNeighborhoodsPage = () => {
  const content = (
    <div>
      <p>
        Dallas is one of the most diverse and rapidly growing cities in Texas.
        Whether you’re relocating for work, school, or just a change of scenery,
        knowing which neighborhood fits your lifestyle is key. In this guide, we
        break down Dallas’s top neighborhoods and embed a custom interactive map
        to help you visualize each area.
      </p>

      <div style={{ margin: "40px 0" }}>
        <iframe
          src="https://www.google.com/maps/d/u/0/embed?mid=1lZDH2sWuzNjSbmHTO0znwdeQGMa1aBI&ehbc=2E312F&noprof=1"
          width="100%"
          height="480"
          style={{ border: 0 }}
          loading="lazy"
        ></iframe>
      </div>

      <h2>Popular Dallas Neighborhoods</h2>

      <h3>Downtown Dallas</h3>
      <p>
        Downtown Dallas is the heart of the city, offering high-rise living,
        luxury apartments, rooftop pools, nightlife, and immediate access to
        Lady Bird Lake and the hike-and-bike trail.
      </p>

      <h3>South Congress (SoCo)</h3>
      <p>
        Known for vintage shops, trendy restaurants, and walkability, SoCo is
        ideal for creatives, couples, and anyone who loves Dallas’s culture.
      </p>

      <h3>East Dallas</h3>
      <p>
        East Dallas blends historic roots with modern growth, featuring
        breweries, murals, nightlife, and a strong creative scene.
      </p>

      <h3>Mueller</h3>
      <p>
        A master-planned community offering parks, trails, a farmers market,
        and family-friendly living just northeast of downtown.
      </p>

      <h3>The Domain / North Dallas</h3>
      <p>
        A live-work-play district with luxury apartments, shopping, dining, and
        proximity to major tech employers.
      </p>

      <h3>Zilker</h3>
      <p>
        Home to Barton Springs Pool and Zilker Park, this area offers outdoor
        recreation and quick access to festivals like ACL.
      </p>

      <h3>Westlake</h3>
      <p>
        A prestigious area with top-rated schools, large homes, and scenic Hill
        Country views just west of downtown.
      </p>

      <h3>Barton Creek</h3>
      <p>
        Luxury living near golf courses, nature trails, and Barton Creek
        Greenbelt with easy city access.
      </p>

      <h3>North Loop</h3>
      <p>
        A retro, creative neighborhood with dive bars, vintage shops, and more
        affordable rents than downtown.
      </p>

      <h3>Riverside</h3>
      <p>
        Affordable apartments along Lady Bird Lake popular with UT students and
        renters who want downtown proximity.
      </p>
    </div>
  );

  const faqs = [
    {
      question: "What are the best neighborhoods in Dallas for young adults?",
      answer:
        "Popular areas include Downtown, East Dallas, and South Congress for walkability, nightlife, and modern apartments.",
    },
    {
      question: "What neighborhoods in Dallas are close to the Riverwalk?",
      answer:
        "Downtown Dallas borders Lady Bird Lake and features a scenic hike-and-bike trail similar to a riverwalk.",
    },
    {
      question: "Are there affordable neighborhoods near downtown Dallas?",
      answer:
        "Yes — Riverside and parts of East Dallas offer more affordable rent while staying close to downtown.",
    },
    {
      question: "What Dallas neighborhoods should I avoid?",
      answer:
        "Every area has pros and cons, but parts of Rundberg and far southeast Dallas may have higher crime rates. Always check local crime maps.",
    },
    {
      question: "Where can I find luxury apartments in Dallas?",
      answer:
        "Luxury apartments are common in Downtown, The Domain, Barton Creek, and Westlake.",
    },
  ];

  return (
    <BlogLayout
      title="Dallas Neighborhoods Map & Guide"
      content={content}
      faqs={faqs}
    />
  );
};

export default DallasNeighborhoodsPage;
