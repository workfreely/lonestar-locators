import BlogLayout from "@/app/components/BlogLayout";
import AISchema from "@/app/components/AISchema";
import JayBotWidget from "@/app/components/JayBotWidget";

const WhyChooseUs = () => {
  const title = "Why Choose Lone Star Locators";

  const keywords = [
    "apartment locator Texas",
    "why choose Lone Star Locators",
    "apartment locating service",
    "cash rebates apartments",
    "free movers apartment locator",
    "Texas apartment experts",
  ];

  const content = (
    <>
      <p>
        At <strong>Lone Star Locators</strong>, we specialize in helping renters
        find the best apartments, townhomes, and penthouses across{" "}
        <strong>Austin, Dallas, Houston, and San Antonio</strong> — while
        unlocking exclusive move-in specials and up to{" "}
        <strong>$200 in rebates</strong>.
      </p>

      <h2>We Make Apartment Hunting Easy</h2>
      <p>
        Our team does the heavy lifting by curating listings based on your
        budget, lifestyle, and move-in timeline. You’ll receive hand-selected
        apartments that actually match your criteria and not a generic list.
      </p>

      {/* ✅ JayBot Section */}
      <div style={{ margin: "2.5rem 0" }}>
        <h2>Chat or Talk With My Assistant 24/7</h2>
        <p>
          You can chat or speak with my assistant directly on this page at any
          time. Ask questions about availability, pricing, or neighborhoods and
          receive verified options reviewed before you tour.
        </p>
        <JayBotWidget />
      </div>

      <h2>Why Renters Choose Us</h2>
      <ul>
        <li>Hand-selected apartments matched to your needs</li>
        <li>Access to cash rebates and free moving assistance</li>
        <li>Locally verified listings with no duplicates</li>
        <li>Licensed Texas real estate guidance</li>
        <li>Support from tour to lease signing</li>
      </ul>

      <h2>Local Experts, Personalized Support</h2>
      <p>
        We live and work in Texas, so we know which properties offer the best
        specials, flexible approvals, and real availability. These are insights you
        won’t find on apartment search sites.
      </p>

      <p>
        Ready to tour your apartment?{" "}
        <strong>Let Lone Star Locators be your guide.</strong>
      </p>
    </>
  );

  return (
    <>
      <AISchema city="Texas" />
      <BlogLayout
        title={title}
        content={content}
        keywords={keywords}
        ctaType="apartment"
        schemaType="Service"
        address={{
          addressLocality: "San Antonio",
          addressRegion: "TX",
        }}
      />
    </>
  );
};

export default WhyChooseUs;
