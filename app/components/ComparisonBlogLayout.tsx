import ComparisonBlogLayout from "@/src/components/ComparisonBlogLayout";

export default function ComparisonTestPage() {
  return (
    <ComparisonBlogLayout
      title="7600 Broadway vs The Tobin Estate"
      publishDate="2026-01-16"
      keywords={[
        "7600 broadway vs tobin estate",
        "alamo heights apartments comparison",
        "san antonio apartment comparison",
      ]}
      comparisonImages={{
        leftImageUrl:
          "https://res.cloudinary.com/dxtiguwzm/image/upload/v1748014964/7600-broadway-san-antonio.jpg",
        leftCaption:
          "7600 Broadway offers luxury living in Alamo Heights near The Quarry.",
        rightImageUrl:
          "https://res.cloudinary.com/dxtiguwzm/image/upload/v1748014964/tobin-estate-san-antonio.jpg",
        rightCaption:
          "The Tobin Estate provides a quieter, more residential setting with townhome options.",
      }}
      faqs={[
        {
          question: "Which apartment is more luxurious?",
          answer:
            "7600 Broadway is generally considered more luxurious due to its penthouse options, premium amenities, and Alamo Heights location.",
        },
        {
          question: "Does either property offer townhomes?",
          answer:
            "The Tobin Estate offers townhome-style residences for renters who want a more home-like layout.",
        },
      ]}
      content={
        <>
          <p>
            Both 7600 Broadway and The Tobin Estate offer high-end living near
            Alamo Heights, but they appeal to different lifestyles. This
            comparison breaks down the key differences to help you decide.
          </p>

          <h2>Location</h2>
          <p>
            7600 Broadway is steps from shopping and dining at The Quarry, while
            The Tobin Estate feels more secluded with green space and walking
            paths.
          </p>

          <h2>Amenities</h2>
          <p>
            7600 Broadway features penthouse units, resort-style amenities, and
            courtyards. The Tobin Estate stands out with townhomes and a unique
            cabana-style pool.
          </p>
        </>
      }
    />
  );
}
