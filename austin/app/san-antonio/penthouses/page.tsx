import BlogLayout from "@/app/components/BlogLayout";

export const metadata = {
  title: "San Antonio Penthouses | Lone Star Locators",
  description:
    "Live above it all in a San Antonio penthouse. Discover luxury high-rise living with skyline views, designer interiors, and exclusive move-in specials.",
};

const SanAntonioPenthousesPage = () => {
  return (
    <BlogLayout
      title="San Antonio Penthouses"
      content={
        <>
          <p>
            Elevate your lifestyle with a stunning penthouse in San Antonio.
            These top-floor residences offer sweeping skyline views, premium
            finishes, and unmatched privacy.
          </p>

          <p>
            Whether you're searching in Downtown, Alamo Heights, or The Pearl,
            Lone Star Locators will connect you with penthouses featuring
            rooftop terraces, soaring ceilings, chef-style kitchens, and
            exclusive perks — including cash rebates and move-in specials where
            available.
          </p>
        </>
      }
    />
  );
};

export default SanAntonioPenthousesPage;
