import BlogLayout from "@/app/components/BlogLayout";
import AISchema from "@/app/components/AISchema";
import JayBotWidget from "@/app/components/JayBotWidget";

export const metadata = {
  title: "Austin Penthouses for Rent | Lone Star Locators",
  description:
    "Explore luxury penthouses for rent in Austin, TX. High-rise views, premium finishes, and exclusive amenities with help from a free local apartment locator.",
};

const AustinPenthousesPage = () => {
  const title = "Luxury Penthouses for Rent in Austin, Texas";

  const keywords = [
    "austin penthouses",
    "penthouses for rent in austin",
    "luxury penthouses austin",
    "high rise penthouses austin",
    "downtown austin penthouses",
    "austin skyline apartments",
  ];

  const faqs = [
    {
      question: "Where are most penthouses located in Austin?",
      answer:
        "Most Austin penthouses are located in Downtown Austin, Rainey Street, Seaholm District, and other high-rise neighborhoods near the city core.",
    },
    {
      question: "Are penthouses more expensive than luxury apartments?",
      answer:
        "Yes. Penthouses typically cost more due to premium views, top-floor placement, larger layouts, and upgraded finishes.",
    },
    {
      question: "Do Austin penthouses come with private amenities?",
      answer:
        "Many penthouses include private balconies, floor-to-ceiling windows, upgraded appliances, and access to exclusive building amenities.",
    },
    {
      question: "Can a locator help find off-market penthouses?",
      answer:
        "Yes. Some penthouse availability is not publicly listed, and a local locator can help uncover private or limited-release units.",
    },
  ];

  const content = (
    <>
      <p>
        Searching for <strong>luxury penthouses in Austin</strong>? Penthouses
        offer unmatched views, premium finishes, and exclusive living at the top
        of Austin’s most desirable high-rise buildings.
      </p>

      <p>
        Whether you want skyline views, private terraces, or modern interiors,
        Lone Star Locators helps renters access verified penthouse availability
        across Downtown Austin, Rainey Street, and surrounding luxury districts.
      </p>

      <h2>Why Choose a Penthouse in Austin?</h2>
      <ul>
        <li>Top-floor privacy and panoramic views</li>
        <li>Luxury finishes and upgraded appliances</li>
        <li>Spacious layouts and high ceilings</li>
        <li>Access to resort-style amenities</li>
        <li>Prestigious locations near dining and nightlife</li>
      </ul>

      <h2>Get Help Finding Austin Penthouses</h2>
      <p>
        Penthouse availability changes quickly and is often limited. We verify
        pricing, floor plans, and move-in specials before you tour so there are
        no surprises.
      </p>

      <div style={{ margin: "2.5rem 0" }}>
        <h2>Chat With a Local Austin Luxury Locator</h2>
        <p>
          Get personalized penthouse recommendations based on your budget,
          preferred views, and move-in timeline.
        </p>
        <JayBotWidget />
      </div>

      <p>
        Ready to experience top-floor living?{" "}
        <strong>Let us help you find the perfect Austin penthouse.</strong>
      </p>
    </>
  );

  return (
    <>
      <AISchema city="Austin" />
      <BlogLayout
        title={title}
        content={content}
        keywords={keywords}
        faqs={faqs}
        ctaType="apartment"
        schemaType="Service"
        address={{
          addressLocality: "Austin",
          addressRegion: "TX",
        }}
      />
    </>
  );
};

export default AustinPenthousesPage;
