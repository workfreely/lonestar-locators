import BlogLayout from "@/app/components/BlogLayout";
import AISchema from "@/app/components/AISchema";

const HoustonFreeApartmentLocatorPage = () => {
  const title = "Free Apartment Locator in Houston, TX";

  const keywords = [
    "free apartment locator houston",
    "houston apartment locator",
    "houston apartments help",
    "apartment locating houston tx",
  ];

  const content = (
    <>
      <p>
        Lone Star Locators offers a completely free apartment locator service in
        Houston, helping renters find verified apartments that match their
        budget, move date, and lifestyle.
      </p>

      <p>
        We work with properties across Downtown, Midtown, The Heights,
        Galleria, and the Medical Center to simplify your apartment search.
      </p>

      <h2>Why Use a Free Apartment Locator?</h2>
      <ul>
        <li>100% free service</li>
        <li>Local Houston experts</li>
        <li>Verified apartments only</li>
        <li>Help with specials and rebates</li>
      </ul>
    </>
  );

  return (
    <>
      <AISchema city="Houston" />
      <BlogLayout
        title={title}
        content={content}
        keywords={keywords}
        schemaType="Service"
        ctaType="apartment"
        address={{ addressLocality: "Houston", addressRegion: "TX" }}
      />
    </>
  );
};

export default HoustonFreeApartmentLocatorPage;
