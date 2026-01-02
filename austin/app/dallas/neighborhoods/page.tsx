import BlogLayout from "@/app/components/BlogLayout";

export const metadata = {
  title: "Dallas Neighborhoods Map & Guide",
  description:
    "Explore Dallas neighborhoods with our interactive map and local guide. Learn which areas are best for walkability, luxury apartments, young professionals, and second-chance renters.",
};

const DallasNeighborhoodsPage = () => {
  const content = (
    <div>
      <p>
        Dallas is one of the fastest-growing and most diverse cities in Texas.
        Whether you’re relocating for work, school, or lifestyle, choosing the
        right neighborhood makes all the difference. In this guide, we break
        down some of the most popular areas to live in Dallas — from trendy
        urban hubs to quieter, family-friendly communities.
      </p>

      <div style={{ margin: "40px 0" }}>
        <iframe
          src="https://www.google.com/maps/d/u/0/embed?mid=13KxFQkK1dejphGwtbAtwdWxqd7GJTbo&ehbc=2E312F&noprof=1"
          width="100%"
          height="480"
          style={{ border: 0 }}
          loading="lazy"
          title="Dallas Neighborhood Map"
        />
      </div>

      <h2>Popular Dallas Neighborhoods</h2>

      <h3>Uptown</h3>
      <p>
        Uptown is one of Dallas’s most walkable and vibrant neighborhoods with
        upscale apartments, nightlife, and direct access to the Katy Trail.
      </p>

      <h3>Bishop Arts District</h3>
      <p>
        Located in North Oak Cliff, Bishop Arts offers a creative, artsy vibe
        with local shops, coffee houses, and murals.
      </p>

      <h3>Knox-Henderson</h3>
      <p>
        Stylish boutiques, nightlife, and luxury apartments just north of
        Uptown make Knox-Henderson a popular choice.
      </p>

      <h3>Deep Ellum</h3>
      <p>
        A creative hub known for live music, street art, and late-night eats —
        ideal for renters who enjoy an energetic atmosphere.
      </p>

      <h3>Downtown Dallas</h3>
      <p>
        Downtown offers modern lofts, skyline views, and walkability with a
        high-energy urban feel.
      </p>

      <h3>Oak Lawn</h3>
      <p>
        A centrally located and inclusive neighborhood offering nightlife,
        parks, and convenient access throughout Dallas.
      </p>

      <h3>Victory Park</h3>
      <p>
        Upscale living near the American Airlines Center with luxury towers and
        skyline views.
      </p>

      <h3>Design District</h3>
      <p>
        Industrial-style lofts, galleries, and creative spaces attract
        professionals seeking something unique.
      </p>

      <h3>Lower Greenville</h3>
      <p>
        Known for food, bars, and a relaxed social scene without downtown noise.
      </p>

      <h3>Trinity Groves</h3>
      <p>
        An up-and-coming area west of downtown with newer developments and
        strong value.
      </p>

      <h2>How to Choose the Right Dallas Neighborhood</h2>
      <ul style={{ listStyle: "none", paddingLeft: 0 }}>
        <li>✅ Commute time</li>
        <li>✅ Walkability</li>
        <li>✅ Pet-friendly access</li>
        <li>✅ Rental budget</li>
        <li>✅ Lifestyle preferences</li>
        <li>✅ Credit flexibility</li>
      </ul>

      <h2>Walkable Neighborhoods</h2>
      <ul style={{ listStyle: "none", paddingLeft: 0 }}>
        <li>✅ Uptown</li>
        <li>✅ Knox-Henderson</li>
        <li>✅ Bishop Arts</li>
        <li>✅ Deep Ellum</li>
        <li>✅ Downtown Dallas</li>
      </ul>

      <h2>Second-Chance Friendly Areas</h2>
      <p>
        Oak Cliff, East Dallas, and parts of North Dallas often have more
        flexible leasing requirements for renters with credit challenges.
      </p>

      <h2>Need Help Choosing?</h2>
      <p>
        If you’re unsure where to start, we can help match you with Dallas
        apartments based on your lifestyle, budget, and approval needs — 100%
        free.
      </p>
    </div>
  );

  const faqs = [
    {
      question: "What’s the most walkable neighborhood in Dallas?",
      answer:
        "Uptown is considered the most walkable neighborhood in Dallas, with easy access to restaurants, bars, parks, and trails.",
    },
    {
      question: "Where can I find second-chance apartments in Dallas?",
      answer:
        "Second-chance leasing is more common in East Dallas, Oak Cliff, and parts of North Dallas.",
    },
    {
      question: "Best neighborhoods for young professionals?",
      answer:
        "Uptown, Knox-Henderson, and Deep Ellum are top choices for young professionals.",
    },
    {
      question: "What’s a quieter area near downtown?",
      answer:
        "Lower Greenville and the Design District offer quieter living while staying close to downtown.",
    },
    {
      question: "Are there pet-friendly apartments in Dallas?",
      answer:
        "Yes — many modern communities include dog parks, pet washing stations, and walkable paths.",
    },
  ];

  return <BlogLayout title="Dallas Neighborhoods Map & Guide" content={content} faqs={faqs} />;
};

export default DallasNeighborhoodsPage;
