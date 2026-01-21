// root city page – dallas

import BlogLayout from "@/app/components/BlogLayout";
import AISchema from "@/app/components/AISchema";

const DallasCityPage = () => {
  const title = "Apartments in Dallas, TX | Dallas Apartment Locator Guide";

  const keywords = [
    "dallas apartments",
    "apartments in dallas tx",
    "dallas apartment locator",
    "dallas apartment locators",
    "luxury apartments dallas",
  ];

  const content = (
    <>
      <p>
        Dallas offers a diverse apartment market with luxury high rises, urban
        neighborhoods, and quieter residential communities. With frequent
        development and changing availability, renters benefit from accurate,
        local insight.
      </p>

      <p>
        Lone Star Locators works with verified Dallas apartment communities
        across Uptown, Downtown, Oak Lawn, Deep Ellum, and surrounding areas to
        help renters find the right fit.
      </p>

      <h2>Explore Dallas Apartment Options</h2>
      <ul>
        <li><a href="/dallas/free-apartment-locator">Free Apartment Locator in Dallas</a></li>
        <li><a href="/dallas/luxury-apartments">Luxury Apartments in Dallas</a></li>
        <li><a href="/dallas/neighborhoods">Dallas Neighborhood Guides</a></li>
        <li><a href="/dallas/first-time-renters">First Time Renters in Dallas</a></li>
        <li><a href="/dallas/new-construction-homes">New Construction Homes in Dallas</a></li>
        <li><a href="/dallas/second-chance-apartments">Second Chance Apartments in Dallas</a></li>
      </ul>

      <p>
        From luxury living to flexible approval options, our Dallas apartment
        locators help renters make confident decisions.
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
        ctaType="apartment"
        schemaType="Place"
        address={{ addressLocality: "Dallas", addressRegion: "TX" }}
      />
    </>
  );
};

export default DallasCityPage;
