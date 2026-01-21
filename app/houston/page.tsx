// root city page – houston
export const dynamic = "force-dynamic";

import BlogLayout from "@/app/components/BlogLayout";
import AISchema from "@/app/components/AISchema";

const HoustonCityPage = () => {
  const title = "Apartments in Houston, TX | Houston Apartment Locator Guide";

  const keywords = [
    "houston apartments",
    "apartments in houston tx",
    "houston apartment locator",
    "houston apartment locators",
    "luxury apartments houston",
  ];

  const content = (
    <>
      <p>
        Houston is one of the largest rental markets in the country, offering
        apartments near major employment centers, medical districts, and
        suburban communities. Understanding availability and pricing requires
        local market knowledge.
      </p>

      <p>
        Lone Star Locators helps renters find verified apartments across
        Downtown, Midtown, The Heights, Galleria, Medical Center, and surrounding
        Houston neighborhoods.
      </p>

      <h2>Explore Houston Apartment Options</h2>
      <ul>
        <li>
          <a href="/houston/free-apartment-locator">
            Free Apartment Locator in Houston
          </a>
        </li>
        <li>
          <a href="/houston/luxury-apartments">
            Luxury Apartments in Houston
          </a>
        </li>
        <li>
          <a href="/houston/neighborhoods">
            Houston Neighborhood Guides
          </a>
        </li>
        <li>
          <a href="/houston/first-time-renters">
            First Time Renters in Houston
          </a>
        </li>
        <li>
          <a href="/houston/new-construction-homes">
            New Construction Homes in Houston
          </a>
        </li>
        <li>
          <a href="/houston/second-chance-apartments">
            Second Chance Apartments in Houston
          </a>
        </li>
      </ul>

      <p>
        Our Houston apartment locators simplify the search so you can rent with
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
        ctaType="apartment"
        schemaType="Place"
        address={{ addressLocality: "Houston", addressRegion: "TX" }}
      />
    </>
  );
};

export default HoustonCityPage;
