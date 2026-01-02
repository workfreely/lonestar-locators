import CityBlogLayout from "@/app/components/CityBlogLayout";

export default function SanAntonioBlogPage() {
  // TEMP test posts (just to confirm layout renders)
  const posts = [
    {
      title: "Affordable Apartments Near UTSA",
      slug: "affordable-apartments-near-utsa",
      imageUrl:
        "https://res.cloudinary.com/dxtiguwzm/image/upload/v1758820133/luxury-apartment-locator-list-austin-dallas-houston-san-antonio_cfbc0q.png",
      excerpt:
        "Find affordable, well-managed apartments close to UTSA with insider tips and current specials.",
    },
  ];

  return (
    <CityBlogLayout
      cityName="San Antonio"
      posts={posts}
    />
  );
}
