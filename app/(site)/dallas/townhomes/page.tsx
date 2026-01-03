import BlogLayout from "@/app/components/BlogLayout";
import AISchema from "@/app/components/AISchema";
import JayBotWidget from "@/app/components/JayBotWidget";

export const metadata = {
  title: "Dallas Townhomes for Rent | Lone Star Locators",
  description:
    "Browse townhomes for rent in Dallas, TX. Compare layouts, pricing, and availability with help from a free local apartment locator.",
};

const DallasTownhomesPage = () => {
  const title = "Townhomes for Rent in Dallas, Texas";

  const keywords = [
    "Dallas townhomes",
    "townhomes for rent in Dallas",
    "Dallas townhome rentals",
    "Dallas townhomes near downtown",
    "new townhomes in Dallas",
    "pet friendly townhomes Dallas",
  ];

  const faqs = [
    {
      question: "Are townhomes in Dallas more expensive than apartments?",
      answer:
        "Townhomes in Dallas can cost more than standard apartments, but they often include more space, private entrances, garages, and fewer shared walls.",
    },
    {
      question: "Where are most townhomes located in Dallas?",
      answer:
        "Many townhomes are located in North Dallas, South Dallas, East Dallas, and suburban areas where communities allow more space and parking.",
    },
    {
      question: "Do townhomes allow pets?",
      answer:
        "Most Dallas townhome communities are pet friendly, but breed restrictions, pet rent, and deposits can vary by property.",
    },
    {
      question: "Can a locator help find townhomes in Dallas?",
      answer:
        "Yes. A local apartment locator can help you find townhomes that are not always listed on major apartment websites.",
    },
  ];

  const content = (
    <>
      <p>
        Looking for <strong>townhomes for rent in Dallas</strong>? Townhomes offer
        more privacy, extra space, and a home-like feel compared to traditional
        apartments. Lone Star Locators helps renters find verified townhome
        communities across Dallas at no cost.
      </p>

      <p>
        Dallas townhomes are popular for renters who want multiple floors,
        attached garages, private yards, or fewer shared walls. These properties
        are ideal for families, remote workers, and renters upgrading from
        apartment living.
      </p>

      <h2>Why Rent a Townhome in Dallas?</h2>
      <ul>
        <li>More space than standard apartments</li>
        <li>Private entrances and garages</li>
        <li>Pet-friendly layouts with yards</li>
        <li>Quieter living with fewer neighbors</li>
        <li>Modern finishes and multi-level designs</li>
      </ul>

      <h2>Get Help Finding Dallas Townhomes</h2>
      <p>
        Not all townhomes are listed online. We work directly with communities
        and property managers to verify availability, pricing, and move-in
        specials before you tour.
      </p>

      <div style={{ margin: "2.5rem 0" }}>
        <h2>Chat With a Local Dallas Locator</h2>
        <p>
          Get personalized townhome recommendations based on your budget,
          location, and move-in timeline.
        </p>
        <JayBotWidget />
      </div>

      <p>
        Ready to explore townhomes in Dallas?{" "}
        <strong>Let us help you find the right fit.</strong>
      </p>
    </>
  );

  return (
    <>
      <AISchema city="Dallas" />
      <BlogLayout
        title={title}
        content={content}
        keywords={keywords}
        faqs={faqs}
        ctaType="apartment"
        schemaType="Service"
        address={{
          addressLocality: "Dallas",
          addressRegion: "TX",
        }}
      />
    </>
  );
};

export default DallasTownhomesPage;