import ComparisonLayout from "@/app/components/ComparisonLayout";

export default function ComparisonTestPage() {
  return (
    <ComparisonLayout
      title="7600 Broadway vs The Tobin Estate"
      subtitle="The Good, Bad & Ugly Apartment Comparison Review in San Antonio"
      cityName="San Antonio"   // ✅ ADD THIS
      left={{
        name: "7600 Broadway",
        image:
          "",
        imageCaption:
          "7600 Broadway is a luxury high-rise in Alamo Heights, offering penthouse units and walkable access to The Quarry.",
        address: "7600 Broadway, San Antonio, TX",
        rent: "$1,850+",
        bedrooms: "Studio – 2-bedroom",
        neighborhood: "Alamo Heights",
        propertyType: "High-Rise",

        tags: [
    "Luxury Apartments",
    "High-Rise Living",
    "Alamo Heights",
    "Walkable to Quarry",
  ],

        good: [
          "High-rise living with penthouse options",
          "Walkable to shopping and dining at The Quarry",
          "Luxury finishes and modern layouts",
        ],
        bad: [
          "Higher pricing compared to nearby communities",
          "Busy Broadway corridor during peak hours",
        ],
        ugly: ["Limited guest parking can be frustrating"],
        verdict:
          "Best for renters who want a polished, luxury high-rise experience in a prime Alamo Heights location.",
      }}
      right={{
        name: "The Tobin Estate",
        image:
          "",
        imageCaption:
          "The Tobin Estate focuses on townhome-style living in a quieter, more residential setting near Alamo Heights.",
        address: "Tobin Estate Dr, San Antonio, TX",
        rent: "$1,650+",
        bedrooms: "1–2 bedroom",
        neighborhood: "Alamo Heights",
        propertyType: "Townhome",
        tags: [
    "Luxury Apartments",
    "High-Rise Living",
    "Alamo Heights",
    "Walkable to Quarry",
  ],
        
        good: [
          "Townhome-style layouts with more privacy",
          "Quieter, residential feel",
          "More square footage for the price",
        ],
        bad: [
          "Less walkable than nearby high-rise options",
          "Fewer luxury amenities overall",
        ],
        ugly: ["No skyline or high-rise views"],
        verdict:
          "Ideal for renters who value space, privacy, and a calmer environment over luxury amenities.",
      }}
    />
  );
}
