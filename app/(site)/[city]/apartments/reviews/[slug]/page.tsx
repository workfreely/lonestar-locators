"use client";


import ReviewLayout from "@/app/components/ReviewLayout";


export default async function ReviewPage({
  params,
}: {
  params: Promise<{ city: string; slug: string }>;
}) {
  const { slug } = await params;

 // TEMP: hardcoded review for testing layout
 // Later we will swap this for a lookup by slug

 if (slug !== "alaro-luxury-villas") {
  return (
    <div style={{ padding: "2rem" }}>
      <h1>Review not found</h1>
    </div>
  );
}


 return (
   <ReviewLayout
     title="Alaro Luxury Villas Review — The Good, Bad & Ugly"
     propertyName="Alaro Luxury Villas"
     image="https://res.cloudinary.com/dxtiguwzm/image/upload/v1748014964/alaro-luxury-villas-townhomes-san-antonio.jpg"
     featureImage1="https://images.unsplash.com/photo-1502673530728-f79b4cab31b1?w=1200&auto=format&fit=crop"
     featureImage2="https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=1200&auto=format&fit=crop"
 
     
     customIntro="Alaro Luxury Villas blends townhome-style living with upscale finishes and private yards. It is located in Northwest San Antonio close to shopping, dining, and major commuter routes. The one and two bedroom layouts feel more like private homes since you do not have neighbors above or below."
     
     good={[
       "Townhome-style layouts with no upstairs or downstairs neighbors",
       "Attached garages or private driveways in select homes",
       "Modern finishes with charcoal or walnut cabinets",
       "One of the bougiest pet spas in the city",
     ]}
     bad={[
       "Some floor plans are income restricted",
       "Leasing incentives may require longer lease terms",
     ]}
     ugly={[
       "Some homes share one side wall",
       "Private yards are concrete, not grass",
     ]}
     customOutro="What I love about Alaro Luxury Villas is the upscale feel at an attainable price. The charcoal cabinetry is my personal favorite, and it is rare to find one-bedroom townhomes with private yards in this price range."
     keywords={[
       "Alaro Luxury Villas Review",
       "Luxury Townhomes San Antonio",
       "San Antonio Apartment Reviews",
     ]}
     neighborhood="Northwest San Antonio"
     address={{
       streetAddress: "7310 Culebra Commons",
       addressLocality: "San Antonio",
       addressRegion: "TX",
       postalCode: "78250",
       addressCountry: "US",
     }}
     rent="$1,349+"
     bedrooms="1–3 Bed Townhomes"
     agentVideo="https://www.youtube.com/embed/ysz5S6PUM-U"
   />
 );
}
