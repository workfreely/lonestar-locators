import BlogLayout from "@/app/components/BlogLayout";
import AISchema from "@/app/components/AISchema";

const HoustonCityPage = () => {
  const title = "Houston Apartment Locators and Apartments Guide";

  const keywords = [
    "houston apartments",
    "houston apartment locator",
    "apartments in houston texas",
    "houston apartment locators",
    "luxury apartments houston",
  ];

  const content = (
    <>
      <p>
        Houston is one of the largest rental markets in the country, offering
        everything from downtown high rises to suburban communities near major
        employment centers. Navigating this market alone can be challenging.
      </p>

      <p>
        Lone Star Locators helps renters find verified apartments across
        Houston including Downtown, The Heights, Midtown, Galleria, and Medical
        Center areas.
      </p>

      <h2>Explore Houston Apartment Options</h2>
      <ul>
        <li><a href="/houston/luxury-apartments">Luxury Apartments in Houston</a></li>
        <li><a href="/houston/free-apartment-locator">Free Apartment Locator Houston</a></li>
        <li><a href="/houston/neighborhoods">Houston Neighborhood Guides</a></li>
        <li><a href="/houston/first-time-renters">First Time Renters in Houston</a></li>
        <li><a href="/houston/new-construction-homes">New Construction Homes Houston</a></li>
        <li><a href="/houston/second-chance-apartments">Second Chance Apartments Houston</a></li>
      </ul>

      <p>
        Our Houston apartment experts simplify the search so you can rent with
        confidence.
      </p>
    </>
  );

  return (
    <>
      <AISchema city="Houston" />
      <BlogLayout
        title={title}
        content={content}
        keywords={keywords}
        schemaType="Place"
        ctaType="apartment"
        address={{ addressLocality: "Houston", addressRegion: "TX" }}
      />
    </>
  );
};

export default HoustonCityPage;
