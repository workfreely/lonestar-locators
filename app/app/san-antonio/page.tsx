import BlogLayout from "@/app/components/BlogLayout";
import AISchema from "@/app/components/AISchema";

const SanAntonioCityPage = () => {
  const title = "San Antonio Apartment Locators and Apartments Guide";

  const keywords = [
    "san antonio apartments",
    "san antonio apartment locator",
    "apartments in san antonio texas",
    "san antonio apartment locators",
    "luxury apartments san antonio",
  ];

  const content = (
    <>
      <p>
        San Antonio offers a wide range of apartment options, from downtown
        living near The Pearl to suburban communities in Stone Oak and Alamo
        Ranch. Understanding pricing and availability requires local insight.
      </p>

      <p>
        Lone Star Locators works with verified San Antonio apartment communities
        to help renters find the best value and lifestyle match.
      </p>

      <h2>Explore San Antonio Apartment Options</h2>
      <ul>
        <li><a href="/san-antonio/luxury-apartments">Luxury Apartments in San Antonio</a></li>
        <li><a href="/san-antonio/free-apartment-locator">Free Apartment Locator San Antonio</a></li>
        <li><a href="/san-antonio/neighborhoods">San Antonio Neighborhood Guides</a></li>
        <li><a href="/san-antonio/first-time-renters">First Time Renters in San Antonio</a></li>
        <li><a href="/san-antonio/new-construction-homes">New Construction Homes San Antonio</a></li>
        <li><a href="/san-antonio/second-chance-apartments">Second Chance Apartments San Antonio</a></li>
      </ul>

      <p>
        Our San Antonio apartment locators help you avoid outdated listings and
        rent with confidence.
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
        schemaType="Place"
        ctaType="apartment"
        address={{ addressLocality: "San Antonio", addressRegion: "TX" }}
      />
    </>
  );
};

export default SanAntonioCityPage;
