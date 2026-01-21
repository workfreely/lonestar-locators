import BlogLayout from "@/app/components/BlogLayout";
import AISchema from "@/app/components/AISchema";

const AustinCityPage = () => {
  const title = "Apartments in Austin, TX | Austin Apartment Locator Guide";

  const keywords = [
    "austin apartments",
    "apartments in austin tx",
    "austin apartment locator",
    "austin apartment locators",
    "luxury apartments austin",
  ];

  const content = (
    <>
      <p>
        Austin is one of the fastest growing cities in Texas, offering a wide
        range of apartment options across downtown, South Congress, East Austin,
        North Austin, and surrounding areas. Renters moving to Austin often face
        fast changing availability and pricing, which makes local guidance
        valuable.
      </p>

      <p>
        Lone Star Locators helps renters navigate Austin’s apartment market by
        providing verified availability, neighborhood insight, and personalized
        recommendations based on budget and lifestyle.
      </p>

      <h2>Explore Austin Apartment Options</h2>
      <ul>
        <li><a href="/austin/free-apartment-locator">Free Apartment Locator in Austin</a></li>
        <li><a href="/austin/luxury-apartments">Luxury Apartments in Austin</a></li>
        <li><a href="/austin/neighborhoods">Austin Neighborhood Guides</a></li>
        <li><a href="/austin/first-time-renters">First Time Renters in Austin</a></li>
        <li><a href="/austin/new-construction-homes">New Construction Homes in Austin</a></li>
        <li><a href="/austin/second-chance-apartments">Second Chance Apartments in Austin</a></li>
      </ul>

      <p>
        Whether you are relocating, upgrading, or renting for the first time,
        our Austin apartment experts help simplify the process so you can rent
        with confidence.
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
        ctaType="apartment"
        schemaType="Place"
        address={{ addressLocality: "Austin", addressRegion: "TX" }}
      />
    </>
  );
};

export default AustinCityPage;
