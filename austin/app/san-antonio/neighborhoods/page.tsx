import BlogLayout from "@/app/components/BlogLayout";

export const metadata = {
  title: "San Antonio Neighborhoods Map & Guide",
  description:
    "Explore San Antonio neighborhoods including Downtown, The Pearl, Stone Oak, Alamo Heights, and more. View an interactive map and find the best area for your lifestyle.",
};

const SanAntonioNeighborhoodsPage = () => {
  const title = "San Antonio Neighborhoods Map & Guide";

  const content = (
    <div>
      <p>
        San Antonio is a vibrant city steeped in history, culture, and modern
        growth. From the bustling River Walk to the peaceful, family-friendly
        suburbs, there’s a neighborhood here for every lifestyle. Use this guide
        to explore top areas and an interactive map to visualize what fits you
        best.
      </p>

      <div style={{ margin: "40px 0" }}>
        <iframe
          src="https://www.google.com/maps/d/u/0/embed?mid=1CPI42z6JgvySuzbhmAvVN7g9zPm4E4k&ehbc=2E312F&noprof=1"
          width="100%"
          height="480"
          style={{ border: 0 }}
          loading="lazy"
          title="San Antonio Neighborhood Map"
        ></iframe>
      </div>

      <h2>Popular San Antonio Neighborhoods</h2>

      <h3>Downtown / River Walk</h3>
      <p>
        At the heart of the city, Downtown is anchored by the iconic River Walk
        lined with restaurants, shops, and entertainment. Luxury lofts and new
        condo buildings pepper the skyline.
      </p>

      <h3>King William</h3>
      <p>
        Just south of downtown, King William showcases beautifully restored
        Victorian homes and a historic, artsy vibe.
      </p>

      <h3>Southtown / South Alamo Heights</h3>
      <p>
        Southtown is known for its artistic energy—murals, galleries, and
        eclectic coffee shops.
      </p>

      <h3>Stone Oak / North Central SA</h3>
      <p>
        Stone Oak is a modern, master-planned suburb with top-rated schools,
        upscale shopping, and family-friendly parks.
      </p>

      <h3>Tobin Hill / Olmos Park</h3>
      <p>
        Tobin Hill features historic homes and proximity to the Pearl District,
        while Olmos Park offers quiet, tree-lined streets.
      </p>

      <h3>The Pearl District</h3>
      <p>
        A revitalized riverfront neighborhood offering upscale apartments,
        dining, and one of the city’s best farmers markets.
      </p>

      <h3>Alamo Heights</h3>
      <p>
        A classic enclave known for its quiet streets, excellent schools, and
        charming eateries.
      </p>

      <h3>Castle Hills</h3>
      <p>
        A well-established suburb with large lots, mature trees, and
        mid-century homes.
      </p>

      <h3>Southside / Medical Center Area</h3>
      <p>
        A mix of student housing and family communities near major hospitals and
        universities.
      </p>

      <h3>Alamo Ranch / West Side</h3>
      <p>
        A fast-growing suburb offering affordable new construction and strong
        value for families.
      </p>

      <h2>How to Choose the Right San Antonio Neighborhood</h2>
      <ul style={{ listStyle: "none", paddingLeft: 0 }}>
        <li>✅ Proximity to work, school, or military bases</li>
        <li>✅ Commute routes and highway access</li>
        <li>✅ Lifestyle fit (urban vs suburban)</li>
        <li>✅ Schools, parks, and family amenities</li>
        <li>✅ Lease flexibility and budget</li>
      </ul>

      <h2>Walkable Areas in San Antonio</h2>
      <ul style={{ listStyle: "none", paddingLeft: 0 }}>
        <li>✅ Downtown / River Walk</li>
        <li>✅ King William</li>
        <li>✅ The Pearl District</li>
        <li>✅ Southtown</li>
      </ul>

      <h2>Need Help Finding Your Perfect Spot?</h2>
      <p>
        We help match renters with neighborhoods and apartments based on
        lifestyle, budget, and leasing needs — always at no cost to you.
      </p>
    </div>
  );

  const faqs = [
    {
      question: "Which San Antonio areas are best for walkability?",
      answer:
        "Downtown, King William, The Pearl, and Southtown are the most walkable neighborhoods.",
    },
    {
      question: "Are there good school districts near Stone Oak?",
      answer:
        "Yes — Stone Oak is served by North East ISD, one of the top districts in the area.",
    },
    {
      question: "Can I find second-chance apartments in San Antonio?",
      answer:
        "Yes — areas like Alamo Ranch and the Southside tend to be more flexible with approvals.",
    },
    {
      question: "Is downtown San Antonio expensive to rent?",
      answer:
        "Downtown rents are typically higher due to walkability and amenities, but suburban areas offer more affordability.",
    },
    {
      question: "Which neighborhoods are best for families?",
      answer:
        "Stone Oak, Alamo Heights, Castle Hills, and North San Antonio are popular with families.",
    },
  ];

  return <BlogLayout title={title} content={content} faqs={faqs} />;
};

export default SanAntonioNeighborhoodsPage;
