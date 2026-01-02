// app/lib/blogPosts.ts

export interface BlogPost {
  title: string;
  excerpt: string;
  imageUrl: string;
  postUrl: string;
  tags?: string[];
  date?: string;
}

export const blogPostsByCity: Record<string, BlogPost[]> = {
  "san-antonio": [
    {
      title: "Best Luxury Apartments in San Antonio",
      excerpt:
        "Tour the best luxury apartments in San Antonio with resort-style amenities and prime locations.",
      imageUrl:
        "https://res.cloudinary.com/dxtiguwzm/image/upload/v1747937030/lone-star-locators-san-antonio-texas-free-apartment-locating_trgkaj.jpg",
      postUrl: "/san-antonio/blog/best-luxury-apartments-san-antonio",
      tags: ["San Antonio", "Luxury", "Apartments"],
    },
    {
      title: "Second Chance Apartments in San Antonio",
      excerpt:
        "Find apartments in San Antonio that approve renters with broken leases or credit challenges.",
      imageUrl:
        "https://res.cloudinary.com/dxtiguwzm/image/upload/v1747937030/lone-star-locators-san-antonio-texas-free-apartment-locating_trgkaj.jpg",
      postUrl: "/san-antonio/blog/second-chance-apartments-san-antonio",
      tags: ["San Antonio", "Second Chance", "Apartments"],
    },
  ],
  

  austin: [
    {
      title: "Best Luxury Apartments in Austin",
      excerpt:
        "Explore Austin’s top luxury apartments near downtown, The Domain, and Zilker.",
      imageUrl:
        "https://res.cloudinary.com/dxtiguwzm/image/upload/v1747937030/lone-star-locators-austin-texas-free-apartment-locating_ew5tvq.jpg",
      postUrl: "/austin/blog/best-luxury-apartments-austin",
      tags: ["Austin", "Luxury", "Apartments"],
    },
  ],

  dallas: [
    {
      title: "Best Luxury Apartments in Dallas",
      excerpt:
        "Discover Dallas luxury apartments with skyline views and resort-style amenities.",
      imageUrl:
        "https://res.cloudinary.com/dxtiguwzm/image/upload/v1747937029/lone-star-locators-dallas-texas-free-apartment-locating_cdr8z9.jpg",
      postUrl: "/dallas/blog/best-luxury-apartments-dallas",
      tags: ["Dallas", "Luxury", "Apartments"],
    },
  ],

  houston: [
    {
      title: "Best Luxury Apartments in Houston",
      excerpt:
        "Tour Houston’s most luxurious apartments near Downtown, Midtown, and The Heights.",
      imageUrl:
        "https://res.cloudinary.com/dxtiguwzm/image/upload/v1747937029/lone-star-locators-houston-texas-free-apartment-locating_j63kfq.jpg",
      postUrl: "/houston/blog/best-luxury-apartments-houston",
      tags: ["Houston", "Luxury", "Apartments"],
    },
  ],
};
