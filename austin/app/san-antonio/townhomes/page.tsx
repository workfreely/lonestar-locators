import BlogLayout from "@/app/components/BlogLayout";

export const metadata = {
  title: "San Antonio Townhomes | Lone Star Locators",
  description:
    "Explore the best townhomes for rent in San Antonio, TX. Find private garages, extra space, and move-in specials with Lone Star Locators.",
};

const SanAntonioTownhomesPage = () => {
  return (
    <BlogLayout
      title="San Antonio Townhomes"
      content={
        <>
          <p>
            Searching for townhomes in San Antonio that offer the privacy of a
            home with the convenience of apartment living? You’re in the right
            place.
          </p>

          <p>
            Many San Antonio townhomes feature private garages, fenced yards,
            and spacious multi-level layouts — perfect for working from home,
            families, or anyone who wants more room without committing to a
            single-family home.
          </p>

          <p>
            Our <strong>free apartment locating service</strong> helps you find
            the best townhome communities across San Antonio, including access
            to move-in specials, rebates, and properties not always listed
            online.
          </p>
        </>
      }
    />
  );
};

export default SanAntonioTownhomesPage;
