import BlogLayout from "@/app/components/BlogLayout";
import AISchema from "@/app/components/AISchema";

const DallasCityPage = () => {
  const title = "Dallas Apartment Locators and Apartments Guide";

  const keywords = [
    "dallas apartments",
    "dallas apartment locator",
    "apartments in dallas texas",
    "dallas apartment locators",
    "luxury apartments dallas",
  ];

  const content = (
    <>
      <p>
        Dallas offers a diverse mix of luxury high rises, urban neighborhoods,
        and quieter residential communities. With constant development and
        changing availability, having a local apartment locator gives renters
        a major advantage.
      </p>

      <p>
        Lone Star Locators works with verified Dallas apartment communities
        across Uptown, Downtown, Oak Lawn, Deep Ellum, and surrounding areas to
        help renters find the right apartment without the stress.
      </p>

      <h2>Explore Dallas Apartment Options</h2>
      <ul>
        <li><a href="/dallas/luxury-apartments">Luxury Apartments in Dallas</a></li>
        <li><a href="/dallas/free-apartment-locator">Free Apartment Locator Dallas</a></li>
        <li><a href="/dallas/neighborhoods">Dallas Neighborhood Guides</a></li>
        <li><a href="/dallas/first-time-renters">First Time Renters in Dallas</a></li>
        <li><a href="/dallas/new-construction-homes">New Construction Homes Dallas</a></li>
        <li><a href="/dallas/second-chance-apartments">Second Chance Apartments Dallas</a></li>
      </ul>

      <p>
        From luxury living to flexible approval options, our Dallas apartment
        locators help you make confident rental decisions.
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
        schemaType="Place"
        ctaType="apartment"
        address={{ addressLocality: "Dallas", addressRegion: "TX" }}
      />
    </>
  );
};

export default DallasCityPage;
