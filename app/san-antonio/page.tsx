import BlogLayout from "@/app/components/BlogLayout";
import AISchema from "@/app/components/AISchema";

const SanAntonioCityPage = () => {
  const title = "Apartments in San Antonio, TX | San Antonio Apartment Locator Guide";

  const keywords = [
    "san antonio apartments",
    "apartments in san antonio tx",
    "san antonio apartment locator",
    "san antonio apartment locators",
    "luxury apartments san antonio",
  ];

  const content = (
    <>
      <p>
        San Antonio offers a wide range of apartment options, from downtown and
        The Pearl to suburban communities in Stone Oak and Alamo Ranch. Pricing
        and availability can vary significantly by area.
      </p>

      <p>
        Lone Star Locators works with verified San Antonio apartment communities
        to help renters find accurate availability and avoid outdated listings.
      </p>

      <h2>Explore San Antonio Apartment Options</h2>
      <ul>
        <li><a href="/san-antonio/free-apartment-locator">Free Apartment Locator in San Antonio</a></li>
        <li><a href="/san-antonio/luxury-apartments">Luxury Apartments in San Antonio</a></li>
        <li><a href="/san-antonio/neighborhoods">San Antonio Neighborhood Guides</a></li>
        <li><a href="/san-antonio/first-time-renters">First Time Renters in San Antonio</a></li>
        <li><a href="/san-antonio/new-construction-homes">New Construction Homes in San Antonio</a></li>
        <li><a href="/san-antonio/second-chance-apartments">Second Chance Apartments in San Antonio</a></li>
      </ul>

      <p>
        Our San Antonio apartment locators help renters rent smarter and with
        confidence.
      </p>
    </>
  );

  return (
    <>
      <AISchema city="San Antonio" />
      <BlogLayout
        title={title}
        content={content}
        keywords={keywords}
        ctaType="apartment"
        schemaType="Place"
        address={{ addressLocality: "San Antonio", addressRegion: "TX" }}
      />
    </>
  );
};

export default SanAntonioCityPage;
